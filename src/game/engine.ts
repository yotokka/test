import { CATEGORY_RU, CLASS_BY_ID, KIND_RU, isAircraft } from './classes';
import { approach, clamp, DEG, hypot2, r3, turnToward } from './dmath';
import { fingerprint, nextRandom, normalizeSeed } from './rng';
import type {
  AirCategory,
  Command,
  CommandBody,
  Condition,
  Decision,
  Ent,
  EpisodeSetup,
  EventKind,
  GameClass,
  GameEvent,
  GameState,
  PairRelation,
  Provenance,
  Track,
  Vec,
} from './types';
import { windAt } from './weatherEffects';

/*
 * Игровой движок воздушного эпизода.
 *
 * — Фиксированный шаг setup.dt (по умолчанию 0,5 с игрового времени). Частота кадров и скорость показа
 *   на расчёт не влияют: интерфейс лишь решает, сколько шагов выполнить до следующего кадра.
 * — Все случайные события берутся из одного генератора в фиксированном порядке (объекты — в порядке
 *   создания), поэтому одинаковые начальное состояние, зерно, настройки и команды дают одинаковый журнал.
 * — Команда применяется ровно один раз: на первом шаге, время которого не меньше её отметки.
 * — Каждая запись журнала хранит ссылки на записи-причины: из них строится цепочка «Почему?».
 */

export const ENGINE_VERSION = 'air-2.0.0';
export const DEFAULT_DT = 0.5;
const SENSOR_EVERY_S = 2;
const TRAIL_EVERY_S = 2;
const TRAIL_MAX = 120;
const TRACK_TIMEOUT_S = 12;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
const NEUTRAL: PairRelation = { status: 'neutral', jointDefense: false };
export function relationOf(setup: EpisodeSetup, a: string, b: string): PairRelation {
  return setup.relations[pairKey(a, b)] ?? NEUTRAL;
}

const cls = (setup: EpisodeSetup, id: string): GameClass => setup.classes[id] ?? CLASS_BY_ID[id];
const sideName = (setup: EpisodeSetup, id: string | null) => (id === null ? 'не участник сценария' : setup.sides.find((s) => s.id === id)?.name ?? id);
const isUnknownSide = (setup: EpisodeSetup, id: string) => !!setup.sides.find((s) => s.id === id && s.unknown);
const dist = (a: Vec, b: Vec) => hypot2(a.x - b.x, a.y - b.y);
const f2 = (v: number) => v.toFixed(2);
const km = (v: number) => `${Math.round(v)} км`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function motionScale(setup: EpisodeSetup) {
  return setup.motionPreset === 'smooth' ? 0.7 : setup.motionPreset === 'agile' ? 1.3 : 1;
}
function stockScale(setup: EpisodeSetup, base: number) {
  if (setup.resources === 'scarce') return Math.max(1, Math.ceil(base * 0.5));
  if (setup.resources === 'ample') return Math.ceil(base * 1.5);
  return base;
}
const INTERACTION = {
  standard: { verifyS: 30, permMin: 20, permSpread: 40, grantP: 0.8 },
  cautious: { verifyS: 60, permMin: 40, permSpread: 60, grantP: 0.65 },
  permissive: { verifyS: 15, permMin: 10, permSpread: 20, grantP: 0.9 },
} as const;
const AMBIGUITY: Record<AirCategory, number> = { aircraft: 0.3, uav: 0.35, cruise: 0.3, ballistic: 0.15, missile: 0.5 };

/* ———————————————— Журнал ———————————————— */

function addLog(
  s: GameState,
  kind: EventKind,
  e: Omit<GameEvent, 'seq' | 't' | 'kind' | 'prov' | 'causes' | 'detail'> & { prov?: Provenance; causes?: number[]; detail?: 1 | 2 | 3 },
): number {
  const seq = s.log.length + 1;
  s.log.push({ seq, t: s.t, kind, prov: e.prov ?? 'model', causes: (e.causes ?? []).filter((c) => c > 0), detail: e.detail ?? 2, ...stripMeta(e) });
  return seq;
}
function stripMeta<T extends { prov?: unknown; causes?: unknown; detail?: unknown }>(e: T) {
  const { prov: _p, causes: _c, detail: _d, ...rest } = e;
  return rest;
}

/** Жребий. Уровень случайности меняет не последовательность чисел, а то, как вероятность сравнивается с числом. */
function roll(s: GameState, setup: EpisodeSetup, p0: number) {
  const [r, next] = nextRandom(s.rng);
  s.rng = next;
  const target = p0 >= 0.5 ? 1 : 0;
  const p = setup.randomness === 'none' ? target : setup.randomness === 'low' ? p0 + (target - p0) * 0.5 : p0;
  return { p, r, ok: r < p };
}
const rollText = (x: { p: number; r: number }) => `игровая вероятность ${f2(x.p)}, выпало ${f2(x.r)}`;

function noteOnce(tr: { noted: string[] }, key: string) {
  if (tr.noted.includes(key)) return false;
  tr.noted.push(key);
  return true;
}

/* ———————————————— Создание ———————————————— */

function newEnt(setup: EpisodeSetup, o: {
  id: string; classId: string; side: string; label: string; x: number; y: number; alt: number; parentId: string | null;
  route?: Ent['route']; mission?: Ent['mission']; holdS?: number; payload?: Ent['payload']; payloadOwners?: (string | null)[];
  speedFactor?: number; stock?: number; destinationOwner?: string | null; aim?: Vec | null; startS?: number; heading?: [number, number];
}): Ent {
  const c = cls(setup, o.classId);
  const baseStock = c.weapon ? c.weapon.stock : 0;
  return {
    id: o.id,
    classId: o.classId,
    side: o.side,
    label: o.label,
    kind: c.kind,
    parentId: o.parentId,
    x: o.x,
    y: o.y,
    alt: o.alt,
    spd: 0,
    hx: o.heading?.[0] ?? 0,
    hy: o.heading?.[1] ?? 1,
    gvx: 0,
    gvy: 0,
    phase: 'pending',
    outcome: 'none',
    route: o.route ?? [],
    wp: 0,
    mission: o.mission ?? 'none',
    holdLeft: o.holdS ?? 600,
    fuel: c.enduranceS ?? 0,
    home: { x: o.x, y: o.y },
    speedFactor: clamp(o.speedFactor ?? 1, 0.5, 1.2),
    targetAlt: null,
    startS: o.startS ?? 0,
    prepLeft: c.prepS ?? 0,
    payload: (o.payload ?? []).map((p) => ({ ...p, aim: { ...p.aim } })),
    payloadOwners: o.payloadOwners ?? [],
    stock: o.stock !== undefined ? Math.max(0, Math.floor(o.stock)) : stockScale(setup, baseStock),
    cooldownUntil: 0,
    weaponsFree: true,
    targetId: null,
    flightS: 0,
    destinationOwner: o.destinationOwner ?? null,
    aim: o.aim ?? null,
    from: null,
    progress: 0,
    trail: [],
    causeSeq: 0,
    outcomeSeq: 0,
    orbitSign: 1,
    orbitC: null,
    resume: false,
    noted: [],
  };
}

export function createState(setup: EpisodeSetup): GameState {
  const s: GameState = { step: 0, t: 0, rng: normalizeSeed(setup.seed), ents: [], tracks: [], log: [], finished: false, finishReason: '', cmdIdx: 0, nextNo: 1, pending: [] };
  for (const o of setup.objects) {
    const e = newEnt(setup, { ...o, x: o.pos.x, y: o.pos.y, alt: o.alt ?? 0, parentId: null });
    s.ents.push(e);
  }
  addLog(s, 'system', {
    title: 'Эпизод подготовлен',
    reason: `Зерно генератора ${normalizeSeed(setup.seed)}, шаг модели ${setup.dt} с, продолжительность ${Math.round(setup.durationS / 60)} мин. Одинаковые начальное состояние, зерно, настройки и команды всегда дают одинаковый журнал.`,
    conditions: [
      { label: 'Осведомлённость', value: setup.awareness === 'full' ? 'полная видимость (игровое допущение)' : 'ограниченная: только обнаруженное датчиками' },
      { label: 'Управление', value: setup.control === 'auto' ? 'автоматическое' : 'ручное (П-14)' },
      { label: 'Случайность', value: { none: 'нет (пороги)', low: 'пониженная', normal: 'обычная' }[setup.randomness] },
      { label: 'Ресурсы', value: { scarce: 'скудные ×0,5', standard: 'стандартные', ample: 'щедрые ×1,5' }[setup.resources] },
    ],
    prov: 'assumption',
    detail: 1,
  });
  addLog(s, 'weather', {
    title: `Игровая погода: ${setup.weather.label}`,
    reason: `${setup.weather.note} Это игровые эффекты (П-13), а не физические поправки.`,
    conditions: [
      { label: 'Множитель обнаружения', value: f2(setup.weather.detectFactor) },
      { label: 'Множитель времени классификации', value: f2(setup.weather.classifyFactor) },
      { label: 'Болтанка', value: `${setup.weather.turbulence} град/с` },
      ...setup.weather.windBands.map((b, i) => ({
        label: `Ветер, слой ${i + 1} (до ${b.maxAlt >= 100000 ? '∞' : b.maxAlt} м)`,
        value: `${f2(hypot2(b.u, b.v))} м/с — ${b.origin}`,
      })),
    ],
    prov: 'assumption',
    detail: 1,
  });
  return s;
}

/* ———————————————— Шаг ———————————————— */

export function stepState(s: GameState, setup: EpisodeSetup, commands: readonly Command[]): void {
  if (s.finished) return;
  s.step += 1;
  s.t = r3(s.step * setup.dt);
  applyCommands(s, setup, commands);
  lifecycle(s, setup);
  for (const e of s.ents) move(s, setup, e);
  resolveProjectiles(s, setup);
  const every = Math.max(1, Math.round(SENSOR_EVERY_S / setup.dt));
  if (s.step % every === 0) {
    sense(s, setup);
    classify(s, setup);
    decide(s, setup);
  }
  if (s.step % Math.max(1, Math.round(1 / setup.dt)) === 0) engage(s, setup);
  if (s.step % Math.max(1, Math.round(TRAIL_EVERY_S / setup.dt)) === 0) {
    for (const e of s.ents) {
      if (e.phase === 'pending' || e.phase === 'done' || e.phase === 'prep' || !isMoverKind(e.kind)) continue;
      e.trail.push({ x: r3(e.x), y: r3(e.y), alt: Math.round(e.alt) });
      if (e.trail.length > TRAIL_MAX) e.trail.shift();
    }
  }
  checkEnd(s, setup);
}

const isMoverKind = (k: string) => k !== 'ad-post' && k !== 'radar' && k !== 'airfield' && k !== 'launcher';
const isProjectile = (k: string) => k === 'air-missile' || k === 'sam-missile';
const airborne = (e: Ent) => isMoverKind(e.kind) && (e.phase === 'flight' || e.phase === 'action' || e.phase === 'return');

/* ———— Команды ———— */

function applyCommands(s: GameState, setup: EpisodeSetup, commands: readonly Command[]) {
  while (s.cmdIdx < commands.length && commands[s.cmdIdx].t <= s.t + 1e-9) {
    const c = commands[s.cmdIdx++];
    const target = 'objectId' in c ? s.ents.find((e) => e.id === c.objectId) : 'unitId' in c ? s.ents.find((e) => e.id === c.unitId) : undefined;
    const base = { prov: 'user' as const, objectId: 'objectId' in c ? c.objectId : undefined, unitId: 'unitId' in c ? c.unitId : undefined, detail: 1 as const };
    const reject = (why: string) => addLog(s, 'command', { ...base, title: `Команда не выполнена: ${cmdTitle(c)}`, reason: why });
    if (!target) {
      reject('Объект не найден в эпизоде.');
      continue;
    }
    switch (c.type) {
      case 'rtb':
        if (!isAircraft(target.kind) || !airborne(target)) reject('Возврат возможен только для самолёта или беспилотника в полёте.');
        else {
          target.phase = 'return';
          addLog(s, 'command', { ...base, title: `${target.label}: возврат на базу`, reason: 'Немедленная команда пользователя. Задача прервана, объект разворачивается к точке базирования.' });
        }
        break;
      case 'hold':
        if (!isAircraft(target.kind) || !airborne(target)) reject('Ожидание в зоне возможно только для самолёта или беспилотника в полёте.');
        else {
          target.orbitC = { x: target.x, y: target.y };
          target.holdLeft = clamp(c.seconds, 30, 3600);
          target.resume = target.phase === 'flight';
          target.phase = 'action';
          addLog(s, 'command', { ...base, title: `${target.label}: ожидание ${Math.round(target.holdLeft / 60)} мин`, reason: 'Немедленная команда пользователя: барражирование вокруг текущей точки, затем продолжение маршрута.' });
        }
        break;
      case 'set-alt': {
        const m = cls(setup, target.classId).motion;
        if (!m || m.type !== 'aero' || !isAircraft(target.kind)) reject('Высоту можно задать только самолёту или беспилотнику.');
        else {
          target.targetAlt = clamp(c.alt, 200, m.maxAlt);
          addLog(s, 'command', { ...base, title: `${target.label}: новая высота ${target.targetAlt} м`, reason: `Набор или снижение с игровым ограничением ${m.climbRate}/${m.sinkRate} м/с.` });
        }
        break;
      }
      case 'set-speed':
        if (!isAircraft(target.kind)) reject('Скорость можно задать только самолёту или беспилотнику.');
        else {
          target.speedFactor = clamp(c.factor, 0.5, 1.2);
          addLog(s, 'command', { ...base, title: `${target.label}: скорость ×${f2(target.speedFactor)}`, reason: 'Разгон и торможение ограничены игровым ускорением класса.' });
        }
        break;
      case 'release':
        if (!target.payload.some((p) => p.count > 0)) reject('Нагрузки нет: она уже отделена или не была загружена (П-16).');
        else if (!airborne(target) && target.kind !== 'launcher') reject('Отделение возможно только в полёте.');
        else releasePayload(s, setup, target, 'команда пользователя', addLog(s, 'command', { ...base, title: `${target.label}: отделить нагрузку сейчас`, reason: 'Немедленная команда пользователя.' }));
        break;
      case 'authorize':
      case 'deny': {
        const tr = s.tracks.find((x) => x.side === c.unitSide && x.objectId === c.objectId);
        const idx = s.pending.findIndex((p) => p.side === c.unitSide && p.objectId === c.objectId);
        if (!tr || tr.decision !== 'await-user' || idx < 0) {
          reject('Решение уже не ждёт пользователя (объект вне эпизода или решение изменилось).');
          break;
        }
        s.pending.splice(idx, 1);
        tr.decision = c.type === 'authorize' ? 'authorized' : 'denied';
        tr.decisionSeq = addLog(s, 'command', {
          ...base,
          side: c.unitSide,
          rule: 'П-14',
          title: c.type === 'authorize' ? `${sideName(setup, c.unitSide)}: взаимодействие с ${target.label} разрешено пользователем` : `${sideName(setup, c.unitSide)}: взаимодействие с ${target.label} отклонено пользователем`,
          reason: 'Ручной режим управления: решение модели ждало подтверждения в очереди действий.',
          causes: [tr.decisionSeq],
        });
        break;
      }
      case 'weapons':
        if (!cls(setup, target.classId).weapon) reject('У объекта нет игровых средств взаимодействия.');
        else {
          target.weaponsFree = c.mode === 'free';
          addLog(s, 'command', { ...base, title: `${target.label}: ${c.mode === 'free' ? 'пуски разрешены' : 'пуски запрещены'}`, reason: 'Немедленная команда пользователя меняет режим поста.' });
        }
        break;
    }
  }
}

export function cmdTitle(c: CommandBody): string {
  switch (c.type) {
    case 'rtb':
      return 'возврат на базу';
    case 'hold':
      return `ожидание ${Math.round(c.seconds / 60)} мин`;
    case 'set-alt':
      return `высота ${c.alt} м`;
    case 'set-speed':
      return `скорость ×${f2(c.factor)}`;
    case 'release':
      return 'отделить нагрузку';
    case 'authorize':
      return 'разрешить взаимодействие';
    case 'deny':
      return 'отклонить взаимодействие';
    case 'weapons':
      return c.mode === 'free' ? 'разрешить пуски' : 'запретить пуски';
  }
}

/* ———— Жизненный цикл ———— */

function lifecycle(s: GameState, setup: EpisodeSetup) {
  for (const e of s.ents) {
    const c = cls(setup, e.classId);
    if (e.phase === 'pending' && s.t >= e.startS) {
      if (!isMoverKind(e.kind)) {
        e.phase = 'flight'; // «действует»: для наземных объектов фаза означает готовность
        e.causeSeq = addLog(s, 'spawn', {
          objectId: e.id,
          side: e.side,
          title: `${e.label}: ${KIND_RU[e.kind]} готов`,
          reason: `${c.name} (${c.code}), сторона — ${sideName(setup, e.side)}. Игровой профиль, не характеристики реальной системы.`,
          prov: 'user',
          detail: 2,
        });
      } else if (e.parentId === null) {
        e.phase = e.alt > 0 ? 'flight' : 'prep';
        e.causeSeq = addLog(s, 'spawn', {
          objectId: e.id,
          side: e.side,
          title: e.phase === 'prep' ? `${e.label}: подготовка к вылету` : `${e.label}: в воздухе с начала эпизода`,
          reason: `${c.name} (${c.code}), сторона — ${sideName(setup, e.side)}. ${e.phase === 'prep' ? `Игровая подготовка ${Math.round(e.prepLeft / 60)} мин.` : ''} Объект размещён пользователем.`,
          prov: 'user',
          detail: 1,
        });
        if (e.phase === 'flight') takeoff(s, setup, e, false);
      }
    }
    if (e.phase === 'prep') {
      e.prepLeft = Math.max(0, e.prepLeft - setup.dt);
      if (e.prepLeft <= 0) takeoff(s, setup, e, true);
    }
    if (e.kind === 'launcher' && e.phase === 'flight' && e.payload.some((p) => p.count > 0)) {
      e.prepLeft = Math.max(0, e.prepLeft - setup.dt);
      if (e.prepLeft <= 0) {
        releasePayload(s, setup, e, 'время пуска по сценарию', e.causeSeq, 1);
        e.prepLeft = 5;
      }
    }
  }
}

function takeoff(s: GameState, setup: EpisodeSetup, e: Ent, fromGround: boolean) {
  const m = cls(setup, e.classId).motion!;
  e.phase = 'flight';
  e.spd = fromGround ? m.minSpeed : m.cruiseSpeed * e.speedFactor;
  const first = e.route[0];
  if (first) {
    const d = hypot2(first.x - e.x, first.y - e.y);
    if (d > 0) {
      e.hx = (first.x - e.x) / d;
      e.hy = (first.y - e.y) / d;
    }
  }
  if (fromGround)
    addLog(s, 'phase', { objectId: e.id, side: e.side, title: `${e.label}: взлёт`, reason: 'Подготовка завершена. Фаза «полёт».', causes: [e.causeSeq], detail: 2 });
}

/* ———— Движение ———— */

function desiredAlt(setup: EpisodeSetup, e: Ent): number {
  const m = cls(setup, e.classId).motion!;
  if (e.phase === 'return') {
    const d = dist(e, e.home);
    return d < 25 ? 0 : e.targetAlt ?? m.cruiseAlt;
  }
  const wp = e.route[e.wp];
  return e.targetAlt ?? wp?.alt ?? m.cruiseAlt;
}

function move(s: GameState, setup: EpisodeSetup, e: Ent) {
  if (!isMoverKind(e.kind) || !(e.phase === 'flight' || e.phase === 'action' || e.phase === 'return')) return;
  const c = cls(setup, e.classId);
  const m = c.motion!;
  const dt = setup.dt;
  if (m.type === 'ballistic') return moveBallistic(s, setup, e);

  // Куда лететь
  let tgt: Vec | null = null;
  let tgtAlt = desiredAlt(setup, e);
  if (isProjectile(e.kind)) {
    const t = s.ents.find((x) => x.id === e.targetId);
    if (t) {
      tgt = t;
      tgtAlt = t.alt;
    }
  } else if (e.kind === 'cruise') {
    tgt = e.route[e.wp] ?? e.aim;
  } else if (e.phase === 'flight') {
    tgt = e.route[e.wp] ?? null;
    if (!tgt) {
      beginAction(s, setup, e);
      tgt = (e.phase as Ent['phase']) === 'return' ? e.home : e.orbitC;
    }
  } else if (e.phase === 'action') {
    const cc = e.orbitC ?? { x: e.x, y: e.y };
    const rx = e.x - cc.x;
    const ry = e.y - cc.y;
    const rl = hypot2(rx, ry) || 1;
    const R = 12;
    // Точка впереди по окружности радиуса R (поворот радиус-вектора на ~35°)
    const ca = 0.819;
    const sa = 0.574 * e.orbitSign;
    tgt = { x: cc.x + ((rx * ca - ry * sa) / rl) * R, y: cc.y + ((rx * sa + ry * ca) / rl) * R };
  } else if (e.phase === 'return') tgt = e.home;

  // Скорость
  const k = motionScale(setup);
  const vTarget = isProjectile(e.kind) ? m.maxSpeed : clamp(m.cruiseSpeed * e.speedFactor, m.minSpeed, m.maxSpeed);
  e.spd = approach(e.spd, e.phase === 'return' && dist(e, e.home) < 8 ? m.minSpeed : vTarget, m.accel * k * dt);

  // Ветер (игровой снос) и поправка курса по треугольнику скоростей
  const w = windAt(setup.weather, e.alt);
  const wf = m.windFactor;
  const wx = w.u * wf;
  const wy = w.v * wf;
  if (tgt) {
    const dx = tgt.x - e.x;
    const dy = tgt.y - e.y;
    const dl = hypot2(dx, dy);
    let ax = dx;
    let ay = dy;
    if (dl > 0 && (wx !== 0 || wy !== 0)) {
      const ux = dx / dl;
      const uy = dy / dl;
      const along = wx * ux + wy * uy;
      const px = wx - along * ux;
      const py = wy - along * uy;
      const pl2 = px * px + py * py;
      const v2 = e.spd * e.spd;
      if (v2 > pl2) {
        const par = Math.sqrt(v2 - pl2);
        ax = par * ux - px;
        ay = par * uy - py;
      }
    }
    let turn = m.turnRate * k * DEG * dt;
    if (setup.weather.turbulence > 0 && !isProjectile(e.kind)) {
      const [r, next] = nextRandom(s.rng);
      s.rng = next;
      const jitter = (r - 0.5) * 2 * setup.weather.turbulence * DEG * dt;
      const [jx, jy] = turnToward(e.hx, e.hy, -e.hy * jitter + e.hx, e.hx * jitter + e.hy, Math.abs(jitter));
      e.hx = jx;
      e.hy = jy;
    }
    ;[e.hx, e.hy] = turnToward(e.hx, e.hy, ax, ay, turn);
  }

  // Высота
  e.alt = approach(e.alt, clamp(tgtAlt, 0, m.maxAlt), m.climbRate * k * dt, m.sinkRate * k * dt);

  e.gvx = e.hx * e.spd + wx;
  e.gvy = e.hy * e.spd + wy;
  e.x = r3(e.x + (e.gvx * dt) / 1000);
  e.y = r3(e.y + (e.gvy * dt) / 1000);

  // Топливо (игровые секунды полёта)
  if (c.enduranceS) {
    e.fuel = Math.max(0, e.fuel - dt);
    if (e.fuel <= 0) {
      finishEnt(s, e, 'fuel', addLog(s, 'resource', { objectId: e.id, side: e.side, rule: 'П-15', title: `${e.label}: игровое топливо исчерпано`, reason: 'Объект выходит из эпизода (условная вынужденная посадка или окончание полёта). Топливо не бывает отрицательным.', causes: [e.causeSeq], detail: 1 }));
      return;
    }
    if (isAircraft(e.kind) && (e.phase === 'flight' || e.phase === 'action')) {
      const need = (dist(e, e.home) * 1000) / Math.max(40, e.spd) * 1.15 + 120;
      if (e.fuel <= need) {
        e.phase = 'return';
        addLog(s, 'phase', { objectId: e.id, side: e.side, rule: 'П-15', title: `${e.label}: возврат по остатку топлива`, reason: `Осталось ${Math.round(e.fuel)} с игрового топлива; до базы нужно около ${Math.round(need)} с с запасом.`, causes: [e.causeSeq], conditions: [{ label: 'Остаток', value: `${Math.round(e.fuel)} с` }, { label: 'Нужно с запасом', value: `${Math.round(need)} с` }], detail: 1 });
      }
    }
  }

  // Достижение точек
  const reach = Math.max(1.5, (e.spd * dt * 1.5) / 1000);
  if (e.kind === 'cruise') {
    const goal = e.route[e.wp] ?? e.aim;
    if (goal && dist(e, goal) <= reach) {
      if (e.route[e.wp]) e.wp++;
      else
        finishEnt(s, e, 'arrived', addLog(s, 'outcome', { objectId: e.id, side: e.side, title: `${e.label} достиг условной области назначения`, reason: `Область назначения — ${sideName(setup, e.destinationOwner)}. Взаимодействий, изменивших исход, не было. Модель показывает цепочку условий, а не прогноз.`, causes: [e.causeSeq], detail: 1 }));
    }
  } else if (isAircraft(e.kind) && e.phase === 'flight') {
    const wp = e.route[e.wp];
    if (wp && dist(e, wp) <= reach) {
      e.wp++;
      if (e.wp >= e.route.length) beginAction(s, setup, e);
    }
  } else if (e.phase === 'action') {
    e.holdLeft -= dt;
    if (e.holdLeft <= 0) {
      if (e.resume && e.wp < e.route.length) {
        e.phase = 'flight';
        e.resume = false;
        addLog(s, 'phase', { objectId: e.id, side: e.side, title: `${e.label}: продолжение маршрута`, reason: 'Ожидание завершено.', detail: 2 });
      } else {
        e.phase = 'return';
        addLog(s, 'phase', { objectId: e.id, side: e.side, title: `${e.label}: задача выполнена, возвращение`, reason: 'Игровое время сценарного действия истекло.', causes: [e.causeSeq], detail: 2 });
      }
    }
  } else if (e.phase === 'return' && dist(e, e.home) < 3 && e.alt < 60) {
    finishEnt(s, e, 'landed', addLog(s, 'outcome', { objectId: e.id, side: e.side, title: `${e.label}: посадка`, reason: 'Возвращение на базу завершено. Фаза «завершение».', causes: [e.causeSeq], detail: 1 }));
  }
}

function beginAction(s: GameState, setup: EpisodeSetup, e: Ent) {
  const last = e.route[e.route.length - 1] ?? { x: e.x, y: e.y };
  e.orbitC = { x: last.x, y: last.y };
  e.resume = false;
  switch (e.mission) {
    case 'release':
      const sep = e.payload.some((p) => p.count > 0) ? releasePayload(s, setup, e, 'конечная точка маршрута', e.causeSeq) : e.causeSeq;
      e.phase = 'return';
      addLog(s, 'phase', { objectId: e.id, side: e.side, rule: 'П-16', title: `${e.label}: возвращение после отделения нагрузки`, reason: 'Сценарное действие выполнено.', causes: [sep], detail: 2 });
      return;
    case 'patrol':
    case 'recon':
    case 'intercept-area':
      e.phase = 'action';
      addLog(s, 'phase', {
        objectId: e.id,
        side: e.side,
        title: `${e.label}: ${e.mission === 'patrol' ? 'патрулирование' : e.mission === 'recon' ? 'разведка' : 'перехват в зоне'} ${Math.round(e.holdLeft / 60)} мин`,
        reason: 'Маршрут пройден. Фаза «выполнение сценарного действия»: полёт по кругу радиусом 12 км.',
        causes: [e.causeSeq],
        rule: e.mission === 'intercept-area' ? 'П-17' : undefined,
        detail: 2,
      });
      return;
    case 'transit':
      e.home = { x: last.x, y: last.y };
      e.phase = 'return';
      addLog(s, 'phase', { objectId: e.id, side: e.side, title: `${e.label}: заход на посадку в конечной точке`, reason: 'Перелёт по маршруту завершён.', causes: [e.causeSeq], detail: 2 });
      return;
    default:
      e.phase = 'return';
  }
}

function moveBallistic(s: GameState, setup: EpisodeSetup, e: Ent) {
  const m = cls(setup, e.classId).motion!;
  if (!e.from || !e.aim) return;
  const total = Math.max(1, dist(e.from, e.aim));
  e.flightS += setup.dt;
  e.spd = approach(e.spd, m.maxSpeed, m.accel * setup.dt);
  e.progress = Math.min(1, e.progress + (e.spd * setup.dt) / 1000 / total);
  const p = e.progress;
  const apex = (m.apexAlt ?? 50000) * Math.min(1, total / 600);
  e.x = r3(e.from.x + (e.aim.x - e.from.x) * p);
  e.y = r3(e.from.y + (e.aim.y - e.from.y) * p);
  e.alt = Math.round(4 * apex * p * (1 - p));
  e.gvx = e.hx * e.spd;
  e.gvy = e.hy * e.spd;
  if (p >= 1)
    finishEnt(s, e, 'arrived', addLog(s, 'outcome', { objectId: e.id, side: e.side, title: `${e.label} достиг условной области назначения`, reason: `Область назначения — ${sideName(setup, e.destinationOwner)}. Дуга — условная анимация, не расчёт траектории.`, causes: [e.causeSeq], detail: 1 }));
}

/* ———— Нагрузка ———— */

function releasePayload(s: GameState, setup: EpisodeSetup, carrier: Ent, why: string, cause: number, limit = Infinity): number {
  let released = 0;
  let lastSeq = cause;
  for (let i = 0; i < carrier.payload.length && released < limit; i++) {
    const p = carrier.payload[i];
    while (p.count > 0 && released < limit) {
      p.count -= 1;
      released++;
      const c = cls(setup, p.classId);
      const no = s.nextNo++;
      const id = `${carrier.id}.${no}`;
      const d = hypot2(p.aim.x - carrier.x, p.aim.y - carrier.y) || 1;
      const child = newEnt(setup, {
        id,
        classId: p.classId,
        side: carrier.side,
        label: `${c.code}-${no} (${carrier.label})`,
        x: carrier.x,
        y: carrier.y,
        alt: carrier.alt,
        parentId: carrier.id,
        destinationOwner: carrier.payloadOwners[i] ?? null,
        aim: { ...p.aim },
        heading: [(p.aim.x - carrier.x) / d, (p.aim.y - carrier.y) / d],
      });
      child.phase = 'flight';
      child.spd = carrier.kind === 'launcher' ? 0 : carrier.spd;
      child.from = { x: carrier.x, y: carrier.y };
      const seq = addLog(s, carrier.kind === 'launcher' ? 'launch' : 'separation', {
        objectId: id,
        side: carrier.side,
        rule: 'П-16',
        title: carrier.kind === 'launcher' ? `${carrier.label}: пуск ${c.code}` : `${carrier.label}: отделение ${c.code}`,
        reason: `Причина: ${why}. Нагрузка принадлежала ${carrier.label}; осталось ${carrier.payload.reduce((a, q) => a + q.count, 0)}. Отделившийся объект дальше существует самостоятельно, даже если носитель выйдет из эпизода.`,
        conditions: [
          { label: 'Носитель', value: carrier.label },
          { label: 'Условная область назначения', value: sideName(setup, child.destinationOwner) },
          { label: 'Остаток нагрузки', value: String(carrier.payload.reduce((a, q) => a + q.count, 0)) },
        ],
        causes: [cause],
        detail: 1,
      });
      child.causeSeq = seq;
      lastSeq = seq;
      s.ents.push(child);
      if (setup.awareness === 'full') fullAwareness(s, setup, child);
    }
  }
  return lastSeq;
}

/* ———— Снаряды ———— */

function resolveProjectiles(s: GameState, setup: EpisodeSetup) {
  for (const p of s.ents) {
    if (!isProjectile(p.kind) || p.phase === 'done' || p.phase === 'pending') continue;
    const c = cls(setup, p.classId);
    const shooter = s.ents.find((x) => x.id === p.parentId)!;
    const w = cls(setup, shooter.classId).weapon!;
    const t = s.ents.find((x) => x.id === p.targetId);
    p.flightS += setup.dt;
    if (!t || t.phase === 'done') {
      finishEnt(s, p, 'missed', addLog(s, 'interaction', { objectId: p.targetId ?? undefined, unitId: shooter.id, side: p.side, title: `${p.label} снят с задачи`, reason: 'Объект уже вне эпизода.', causes: [p.causeSeq], detail: 2 }));
      continue;
    }
    const d = hypot2(t.x - p.x, t.y - p.y);
    const dz = Math.abs(t.alt - p.alt) / 1000;
    if (hypot2(d, dz) <= (c.proximityKm ?? 1)) {
      const cat = cls(setup, t.classId).airCategory ?? 'aircraft';
      const compat = w.compat[cat] ?? 0;
      const res = roll(s, setup, w.baseP * compat);
      const conditions: Condition[] = [
        { label: 'Базовая игровая вероятность класса', value: f2(w.baseP) },
        { label: `Совместимость с категорией «${CATEGORY_RU[cat]}» (П-11)`, value: f2(compat) },
        { label: 'Уровень случайности', value: setup.randomness },
        { label: 'Итоговая вероятность', value: f2(res.p) },
        { label: 'Выпало', value: f2(res.r), ok: res.ok },
      ];
      if (res.ok) {
        const seq = addLog(s, 'interaction', { objectId: t.id, unitId: shooter.id, side: p.side, title: `Условный перехват ${t.label}: успешно`, reason: `${p.label} поста ${shooter.label}. ${cap(rollText(res))}. При другом зерне исход мог быть иным.`, conditions, roll: { p: res.p, r: res.r }, causes: [p.causeSeq], detail: 1 });
        finishEnt(s, p, 'completed', seq);
        finishEnt(s, t, 'intercepted', addLog(s, 'outcome', { objectId: t.id, side: t.side, title: `${t.label} условно выведен из эпизода`, reason: 'Итог определён игровыми правилами и жребием, а не расчётом поражения.', causes: [seq], detail: 1 }));
      } else {
        const seq = addLog(s, 'interaction', { objectId: t.id, unitId: shooter.id, side: p.side, title: `Условный перехват ${t.label}: неудача`, reason: `${p.label} поста ${shooter.label}. ${cap(rollText(res))}. Возможна повторная попытка, если хватит запаса и объект останется в рубеже.`, conditions, roll: { p: res.p, r: res.r }, causes: [p.causeSeq], detail: 1 });
        finishEnt(s, p, 'missed', seq);
      }
      continue;
    }
    if (p.flightS >= (c.maxFlightS ?? 60)) {
      finishEnt(s, p, 'missed', addLog(s, 'interaction', { objectId: t.id, unitId: shooter.id, side: p.side, title: `${p.label} не сблизился с ${t.label}`, reason: 'Истекло игровое время полёта снаряда.', causes: [p.causeSeq], detail: 2 }));
    }
  }
}

function finishEnt(s: GameState, e: Ent, outcome: Ent['outcome'], seq: number) {
  e.phase = 'done';
  e.outcome = outcome;
  e.outcomeSeq = seq;
  e.gvx = 0;
  e.gvy = 0;
  if (outcome === 'landed') e.alt = 0;
  s.pending = s.pending.filter((p) => p.objectId !== e.id);
}

/* ———— Датчики и сопровождение ———— */

function sensorsOf(s: GameState, setup: EpisodeSetup, side: string) {
  return s.ents.filter((u) => u.side === side && cls(setup, u.classId).sensor && (isMoverKind(u.kind) ? airborne(u) : u.phase === 'flight'));
}

function fullAwareness(s: GameState, setup: EpisodeSetup, o: Ent) {
  if (isProjectile(o.kind)) return;
  for (const sd of setup.sides) {
    if (sd.id === o.side || s.tracks.some((t) => t.side === sd.id && t.objectId === o.id)) continue;
    const tr = newTrack(o.id, sd.id, s.t);
    tr.classified = true;
    tr.detectSeq = tr.classifySeq = addLog(s, 'detect', { objectId: o.id, side: sd.id, title: `${sideName(setup, sd.id)}: ${o.label} известен`, reason: 'Полная видимость — игровое допущение: обнаружение и классификация пропущены.', prov: 'assumption', causes: [o.causeSeq], detail: 3 });
    s.tracks.push(tr);
  }
}

function newTrack(objectId: string, side: string, t: number): Track {
  return { objectId, side, firstSeen: t, lastSeen: t, since: t, classified: false, nextClassifyAt: 0, decision: 'none', decisionAt: 0, verifyUntil: 0, permissionAt: 0, detectSeq: 0, classifySeq: 0, decisionSeq: 0, noted: [] };
}

function sense(s: GameState, setup: EpisodeSetup) {
  if (setup.awareness === 'full') {
    for (const o of s.ents) if (airborne(o)) fullAwareness(s, setup, o);
  }
  for (const sd of setup.sides) {
    const sensors = sensorsOf(s, setup, sd.id);
    for (const o of s.ents) {
      if (o.side === sd.id || !airborne(o) || isProjectile(o.kind)) continue;
      let tr = s.tracks.find((t) => t.side === sd.id && t.objectId === o.id);
      const oc = cls(setup, o.classId);
      let seenBy: Ent | null = null;
      for (const u of sensors) {
        const sp = cls(setup, u.classId).sensor!;
        const range = sp.rangeKm * (o.alt < 300 ? 0.5 : 1);
        if (dist(u, o) > range) continue;
        if (tr) {
          seenBy = u;
          break;
        }
        const res = roll(s, setup, sp.detectP * oc.signature * setup.weather.detectFactor);
        if (res.ok) {
          seenBy = u;
          tr = newTrack(o.id, sd.id, s.t);
          tr.nextClassifyAt = s.t + sp.classifyS * setup.weather.classifyFactor;
          tr.detectSeq = addLog(s, 'detect', {
            objectId: o.id,
            unitId: u.id,
            side: sd.id,
            rule: o.alt < 300 ? 'П-18' : undefined,
            title: `${u.label} (${sideName(setup, sd.id)}) обнаружил ${o.label}`,
            reason: `Объект в игровом радиусе датчика: ${km(dist(u, o))} из ${km(range)}. ${cap(rollText(res))} (база датчика × заметность класса × погодный множитель).`,
            conditions: [
              { label: 'База датчика', value: f2(sp.detectP) },
              { label: 'Заметность класса', value: f2(oc.signature) },
              { label: 'Погодный множитель (П-13)', value: f2(setup.weather.detectFactor) },
              { label: 'Малая высота (П-18)', value: o.alt < 300 ? 'да, радиус ×0,5' : 'нет' },
            ],
            roll: { p: res.p, r: res.r },
            causes: [o.causeSeq],
            detail: 1,
          });
          s.tracks.push(tr);
          break;
        } else if (noteOnce(o, `miss:${u.id}`)) {
          addLog(s, 'detect', { objectId: o.id, unitId: u.id, side: sd.id, title: `${u.label}: ${o.label} в радиусе, но не обнаружен`, reason: `Обнаружение вероятностное: ${rollText(res)}. Попытки повторяются каждые ${SENSOR_EVERY_S} с.`, roll: { p: res.p, r: res.r }, detail: 3 });
        }
      }
      if (tr && seenBy) tr.lastSeen = s.t;
    }
  }
  // Потеря сопровождения
  for (const tr of s.tracks) {
    const o = s.ents.find((e) => e.id === tr.objectId)!;
    if (tr.decision === 'denied' && o.phase !== 'done') continue;
    if (setup.awareness === 'limited' && o.phase !== 'done' && s.t - tr.lastSeen > TRACK_TIMEOUT_S && noteOnce(tr, `lost:${Math.floor(tr.lastSeen)}`)) {
      addLog(s, 'detect', { objectId: o.id, side: tr.side, title: `${sideName(setup, tr.side)}: сопровождение ${o.label} потеряно`, reason: `Ни один датчик стороны не видит объект больше ${TRACK_TIMEOUT_S} с.`, causes: [tr.detectSeq], detail: 2 });
    }
  }
}

const trackActive = (s: GameState, setup: EpisodeSetup, tr: Track) => setup.awareness === 'full' || s.t - tr.lastSeen <= TRACK_TIMEOUT_S;

function classify(s: GameState, setup: EpisodeSetup) {
  for (const tr of s.tracks) {
    if (tr.classified || !trackActive(s, setup, tr) || s.t < tr.nextClassifyAt) continue;
    const o = s.ents.find((e) => e.id === tr.objectId)!;
    if (o.phase === 'done') continue;
    const cat = cls(setup, o.classId).airCategory ?? 'aircraft';
    const res = roll(s, setup, AMBIGUITY[cat]);
    if (res.ok) {
      tr.nextClassifyAt = s.t + 10 * setup.weather.classifyFactor;
      if (noteOnce(tr, 'amb'))
        addLog(s, 'classify', { objectId: o.id, side: tr.side, title: `${sideName(setup, tr.side)}: классификация ${o.label} не завершена`, reason: `Признаки неоднозначны (игровая неоднозначность ${f2(res.p)}, выпало ${f2(res.r)}). Повтор через ${Math.round(10 * setup.weather.classifyFactor)} с.`, roll: { p: res.p, r: res.r }, causes: [tr.detectSeq], detail: 2 });
      continue;
    }
    tr.classified = true;
    tr.classifySeq = addLog(s, 'classify', {
      objectId: o.id,
      side: tr.side,
      title: `${sideName(setup, tr.side)}: ${o.label} — ${CATEGORY_RU[cat]}`,
      reason: `Игровая категория определена через ${Math.round(s.t - tr.since)} с сопровождения. Сторона-источник: ${sideName(setup, o.side)}.`,
      conditions: [
        { label: 'Неоднозначность категории', value: f2(res.p) },
        { label: 'Выпало', value: f2(res.r), ok: true },
        { label: 'Погодный множитель времени (П-13)', value: f2(setup.weather.classifyFactor) },
      ],
      roll: { p: res.p, r: res.r },
      causes: [tr.detectSeq],
      detail: 1,
    });
  }
}

/* ———— Решения ———— */

function setDecision(s: GameState, tr: Track, d: Decision, seq: number) {
  tr.decision = d;
  tr.decisionAt = s.t;
  tr.decisionSeq = seq;
}

function decide(s: GameState, setup: EpisodeSetup) {
  const P = INTERACTION[setup.interactionPreset];
  for (const tr of s.tracks) {
    const o = s.ents.find((e) => e.id === tr.objectId)!;
    if (o.phase === 'done' || !tr.classified) continue;
    const D = tr.side;
    const O = o.side;
    const Z = o.destinationOwner;
    const cat = cls(setup, o.classId).airCategory ?? 'aircraft';
    const who = `${sideName(setup, D)} → ${o.label}`;
    const base = { objectId: o.id, side: D, causes: [tr.classifySeq] };
    const unknownO = isUnknownSide(setup, O);
    const relO = relationOf(setup, D, O);

    if (tr.decision === 'none') {
      const conds: Condition[] = [
        { label: 'Сторона-источник', value: `${sideName(setup, O)}${unknownO ? ' (не установлена)' : ''}` },
        { label: 'Отношение к источнику', value: unknownO ? 'не установлено' : { alliance: 'союз', neutral: 'нейтралитет', conflict: 'конфликт' }[relO.status] },
        { label: 'Условная область назначения', value: sideName(setup, Z) },
        { label: 'Категория', value: CATEGORY_RU[cat] },
      ];
      if (!unknownO && (O === D || relO.status === 'alliance')) {
        setDecision(s, tr, 'observe', addLog(s, 'decision', { ...base, rule: 'П-5', title: `${who}: только сопровождение`, reason: O === D ? 'Объект своей стороны.' : 'Объект союзной стороны: вместо взаимодействия — запрос по каналам связи.', conditions: conds, detail: 2 }));
        continue;
      }
      const rules: string[] = [];
      const reasons: string[] = [];
      if (Z !== D) {
        const relZ = Z === null ? NEUTRAL : relationOf(setup, D, Z);
        if (Z !== null && relZ.jointDefense) {
          rules.push('П-3');
          reasons.push(`объект направлен к стороне «${sideName(setup, Z)}», с ней есть игровое соглашение о совместной обороне`);
        } else if (Z !== null && relZ.status === 'alliance') {
          setDecision(s, tr, 'share', addLog(s, 'decision', { ...base, rule: 'П-2', title: `${who}: передача данных союзнику`, reason: `Объект направлен к «${sideName(setup, Z)}». Союз без соглашения о совместной обороне не даёт основания для взаимодействия.`, conditions: conds, detail: 1 }));
          continue;
        } else {
          setDecision(s, tr, 'observe', addLog(s, 'decision', { ...base, rule: 'П-1', title: `${who}: только наблюдение`, reason: `Условная область назначения — ${sideName(setup, Z)}: вне защищаемой территории стороны.`, conditions: conds, detail: 1 }));
          continue;
        }
      } else {
        rules.push('П-1');
        reasons.push('объект направлен к территории стороны');
      }
      if (cat === 'aircraft' || cat === 'uav') {
        if (unknownO || relO.status !== 'conflict') {
          setDecision(s, tr, 'escort', addLog(s, 'decision', { ...base, rule: [...rules, 'П-7'].join(', '), title: `${who}: сопровождение и опознавание`, reason: `${cap(reasons.join('; '))}. Самолёт или беспилотник стороны без игрового конфликта только сопровождается.`, conditions: conds, detail: 1 }));
          continue;
        }
        rules.push('П-7');
        reasons.push('самолёт стороны в игровом конфликте направлен к защищаемой территории');
      }
      if (unknownO || relO.status === 'neutral') {
        tr.verifyUntil = s.t + P.verifyS;
        setDecision(s, tr, 'verify', addLog(s, 'decision', { ...base, rule: [...rules, 'П-4'].join(', '), title: `${who}: дополнительная проверка`, reason: `${cap(reasons.join('; '))}. Происхождение ${unknownO ? 'не установлено' : 'нейтральное'}: нужно ${P.verifyS} с дополнительного сопровождения (пресет взаимодействий «${setup.interactionPreset}»).`, conditions: conds, detail: 1 }));
        continue;
      }
      rules.push('П-6');
      reasons.push('игровой конфликт учтён вместе с классификацией и направлением');
      toPermission(s, setup, tr, o, rules, reasons, conds);
      continue;
    }
    if (tr.decision === 'verify' && s.t >= tr.verifyUntil) {
      if (!trackActive(s, setup, tr)) continue;
      const res = roll(s, setup, 1 - AMBIGUITY[cat] / 2);
      if (res.ok) {
        const seq = addLog(s, 'decision', { ...base, causes: [tr.decisionSeq], rule: 'П-4', title: `${who}: признаки угрозы подтверждены`, reason: `Дополнительное сопровождение завершено: ${rollText(res)}.`, roll: { p: res.p, r: res.r }, detail: 2 });
        tr.decisionSeq = seq;
        toPermission(s, setup, tr, o, ['П-4'], ['угроза подтверждена дополнительной проверкой'], []);
      } else setDecision(s, tr, 'observe', addLog(s, 'decision', { ...base, causes: [tr.decisionSeq], rule: 'П-4', title: `${who}: угроза не подтверждена`, reason: `Признаки остались неоднозначными (${rollText(res)}). Только наблюдение.`, roll: { p: res.p, r: res.r }, detail: 1 }));
      continue;
    }
    if (tr.decision === 'await-permission' && s.t >= tr.permissionAt) {
      const res = roll(s, setup, P.grantP);
      const seq = addLog(s, 'permission', { ...base, causes: [tr.decisionSeq], rule: 'П-8', title: res.ok ? `${who}: разрешение получено` : `${who}: в разрешении отказано`, reason: `Ответ условного командования: ${rollText(res)}.`, roll: { p: res.p, r: res.r }, detail: 1 });
      if (res.ok) authorize(s, setup, tr, o, seq);
      else setDecision(s, tr, 'denied', seq);
    }
  }
}

function toPermission(s: GameState, setup: EpisodeSetup, tr: Track, o: Ent, rules: string[], reasons: string[], conds: Condition[]) {
  const D = tr.side;
  const P = INTERACTION[setup.interactionPreset];
  const who = `${sideName(setup, D)} → ${o.label}`;
  const base = { objectId: o.id, side: D, causes: [tr.decisionSeq || tr.classifySeq] };
  if (setup.permissionRequired[D]) {
    const [r, next] = nextRandom(s.rng);
    s.rng = next;
    const delay = P.permMin + Math.floor(r * P.permSpread);
    tr.permissionAt = s.t + delay;
    setDecision(s, tr, 'await-permission', addLog(s, 'decision', { ...base, rule: [...rules, 'П-8'].join(', '), title: `${who}: запрошено разрешение`, reason: `${cap(reasons.join('; '))}. Для стороны включено требование разрешения; игровая задержка ответа ${delay} с.`, conditions: conds, detail: 1 }));
  } else {
    const seq = addLog(s, 'decision', { ...base, rule: rules.join(', '), title: `${who}: взаимодействие допустимо по игровым правилам`, reason: `${cap(reasons.join('; '))}. Разрешение не требуется.`, conditions: conds, detail: 1 });
    authorize(s, setup, tr, o, seq);
  }
}

function authorize(s: GameState, setup: EpisodeSetup, tr: Track, o: Ent, seq: number) {
  if (setup.control === 'manual') {
    setDecision(s, tr, 'await-user', addLog(s, 'decision', { objectId: o.id, side: tr.side, causes: [seq], rule: 'П-14', title: `${sideName(setup, tr.side)} → ${o.label}: ждёт решения пользователя`, reason: 'Ручной режим: действие добавлено в очередь. Модель не продолжит без команды «Разрешить» или «Отклонить».', detail: 1 }));
    s.pending.push({ side: tr.side, objectId: o.id, since: s.t, decisionSeq: tr.decisionSeq });
  } else setDecision(s, tr, 'authorized', seq);
}

/* ———— Взаимодействие ———— */

function engage(s: GameState, setup: EpisodeSetup) {
  for (const tr of s.tracks) {
    if (tr.decision !== 'authorized') continue;
    const o = s.ents.find((e) => e.id === tr.objectId)!;
    if (o.phase === 'done' || !trackActive(s, setup, tr)) continue;
    const D = tr.side;
    const inFlight = s.ents.find((p) => isProjectile(p.kind) && p.phase !== 'done' && p.side === D && p.targetId === o.id);
    if (inFlight) continue; // П-9
    const cat = cls(setup, o.classId).airCategory ?? 'aircraft';
    const reasons: string[] = [];
    const keys: string[] = [];
    let chosen: Ent | null = null;
    for (const u of s.ents) {
      if (u.side !== D) continue;
      const w = cls(setup, u.classId).weapon;
      if (!w) continue;
      const ready = isMoverKind(u.kind) ? airborne(u) && u.mission === 'intercept-area' && u.phase !== 'return' : u.phase === 'flight';
      if (!ready) continue;
      const d = dist(u, o);
      if ((w.compat[cat] ?? 0) <= 0) { reasons.push(`${u.label}: класс несовместим с категорией «${CATEGORY_RU[cat]}» (П-11)`); keys.push(`${u.id}:compat`); }
      else if (!u.weaponsFree) { reasons.push(`${u.label}: пуски запрещены командой`); keys.push(`${u.id}:hold`); }
      else if (u.stock <= 0) { reasons.push(`${u.label}: условный запас исчерпан (П-10)`); keys.push(`${u.id}:stock`); }
      else if (d > w.rangeKm) { reasons.push(`${u.label}: вне рубежа (${km(d)} из ${km(w.rangeKm)}, П-10)`); keys.push(`${u.id}:range`); }
      else if (s.t < u.cooldownUntil) { reasons.push(`${u.label}: игровая задержка между пусками (П-12)`); keys.push(`${u.id}:cool`); }
      else {
        chosen = u;
        break;
      }
    }
    if (!chosen) {
      const key = `wait:${keys.join('|')}`;
      if (reasons.length && noteOnce(tr, key)) addLog(s, 'decision', { objectId: o.id, side: D, causes: [tr.decisionSeq], title: `${sideName(setup, D)}: взаимодействие с ${o.label} пока невозможно`, reason: reasons.join('; ') + '.', detail: 2 });
      else if (!reasons.length && noteOnce(tr, 'none'))
        addLog(s, 'decision', { objectId: o.id, side: D, causes: [tr.decisionSeq], rule: 'П-11', title: `${sideName(setup, D)}: нет игровых средств для ${o.label}`, reason: 'У стороны нет готовых постов или истребителей в зоне с совместимым классом.', detail: 2 });
      continue;
    }
    const w = cls(setup, chosen.classId).weapon!;
    const pc = cls(setup, w.projectile);
    chosen.stock = Math.max(0, chosen.stock - 1);
    chosen.cooldownUntil = s.t + w.cooldownS;
    const id = `${chosen.id}.${s.nextNo++}`;
    const d = hypot2(o.x - chosen.x, o.y - chosen.y) || 1;
    const p = newEnt(setup, { id, classId: pc.id, side: D, label: `${pc.code}-${s.nextNo - 1}`, x: chosen.x, y: chosen.y, alt: chosen.alt, parentId: chosen.id, heading: [(o.x - chosen.x) / d, (o.y - chosen.y) / d] });
    p.targetId = o.id;
    p.phase = 'flight';
    p.spd = Math.max(chosen.spd, pc.motion!.cruiseSpeed * 0.5);
    p.causeSeq = addLog(s, 'launch', {
      objectId: o.id,
      unitId: chosen.id,
      side: D,
      rule: 'П-10, П-12',
      title: `${chosen.label}: пуск ${p.label} по ${o.label}`,
      reason: `Все условия выполнены; запас после пуска — ${chosen.stock} у.е.`,
      conditions: [
        { label: 'Решение', value: 'взаимодействие допустимо', ok: true },
        { label: 'Рубеж (П-10)', value: `${km(d)} из ${km(w.rangeKm)}`, ok: true },
        { label: `Совместимость «${CATEGORY_RU[cat]}» (П-11)`, value: f2(w.compat[cat] ?? 0), ok: true },
        { label: 'Запас после пуска', value: `${chosen.stock} у.е.` },
        { label: 'Задержка до следующего пуска (П-12)', value: `${w.cooldownS} с` },
      ],
      causes: [tr.decisionSeq],
      detail: 1,
    });
    s.ents.push(p);
    if (chosen.stock === 0) addLog(s, 'resource', { unitId: chosen.id, side: D, rule: 'П-12', title: `${chosen.label}: условный запас исчерпан`, reason: 'Новые пуски этого поста невозможны. Это ограничение игрового ресурса, а не оценка реальной системы.', detail: 1 });
  }
}

/* ———— Завершение ———— */

function checkEnd(s: GameState, setup: EpisodeSetup) {
  const conds = setup.endConditions;
  let reason = '';
  if (conds.includes('first-outcome') && s.ents.some((e) => e.outcome === 'intercepted' || e.outcome === 'arrived')) reason = 'первый итог взаимодействия (условие завершения)';
  const movers = s.ents.filter((e) => isMoverKind(e.kind));
  const launchersLeft = s.ents.some((e) => e.kind === 'launcher' && e.payload.some((p) => p.count > 0));
  if (!reason && conds.includes('all-finished') && movers.length > 0 && !launchersLeft && movers.every((e) => e.phase === 'done')) reason = 'все подвижные объекты завершили действия';
  if (!reason && s.t >= setup.durationS - 1e-9) reason = 'истекла продолжительность эпизода';
  if (!reason) return;
  s.finished = true;
  s.finishReason = reason;
  for (const e of s.ents) if (isMoverKind(e.kind) && e.phase !== 'done' && e.phase !== 'pending') e.outcome = e.outcome === 'none' ? 'expired' : e.outcome;
  const sum = summarize(s);
  addLog(s, 'system', {
    title: 'Эпизод завершён',
    reason: `Причина: ${reason}. Условно выведено из эпизода: ${sum.intercepted}; достигли области назначения: ${sum.arrived}; посадок: ${sum.landed}; израсходовано игровых снарядов: ${sum.shots}. Это иллюстрация цепочки условий, а не прогноз.`,
    detail: 1,
  });
}

export function summarize(s: GameState) {
  const main = s.ents.filter((e) => !isProjectile(e.kind));
  return {
    intercepted: main.filter((e) => e.outcome === 'intercepted').length,
    arrived: main.filter((e) => e.outcome === 'arrived').length,
    landed: main.filter((e) => e.outcome === 'landed').length,
    fuel: main.filter((e) => e.outcome === 'fuel').length,
    shots: s.ents.filter((e) => isProjectile(e.kind)).length,
    t: s.t,
  };
}

/** Отпечаток: журнал и итоговые положения. Совпадает при повторе с теми же условиями. */
export function stateFingerprint(s: GameState): string {
  const log = s.log.map((e) => `${e.t}|${e.kind}|${e.title}|${e.reason}`).join('\n');
  const pos = s.ents.map((e) => `${e.id}:${r3(e.x)},${r3(e.y)},${Math.round(e.alt)},${e.phase},${e.outcome},${e.stock},${Math.round(e.fuel)}`).join(';');
  return fingerprint(`${log}#${pos}`);
}

/** Цепочка «Почему?»: запись и все её причины до появления объекта, в хронологическом порядке. */
export function whyChain(log: readonly GameEvent[], seq: number): GameEvent[] {
  const out = new Map<number, GameEvent>();
  const stack = [seq];
  while (stack.length) {
    const q = stack.pop()!;
    if (out.has(q) || q <= 0 || q > log.length) continue;
    const e = log[q - 1];
    out.set(q, e);
    stack.push(...e.causes);
  }
  return [...out.values()].sort((a, b) => a.seq - b.seq);
}
