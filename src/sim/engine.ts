import { fingerprint, nextRandom, normalizeSeed } from './rng';
import type {
  CountryId,
  Frame,
  InterceptorState,
  LogEntry,
  ObjState,
  PostState,
  Roll,
  SimConfig,
  SimResult,
  SimState,
  Stage,
  TrackState,
} from './types';
import { COUNTRY_BY_ID, MODEL, PROFILES, RELATION_NAMES, getRelation, originName } from './world';

/*
 * Учебный движок. Время дискретно (такты). Все случайные события берутся из одного
 * детерминированного генератора в фиксированном порядке (объекты и посты — в порядке сценария),
 * поэтому одинаковые сценарий, зерно и настройки отношений дают одинаковый журнал.
 * Скорость воспроизведения в интерфейсе на результат не влияет: она меняет только темп показа кадров.
 * Используются только арифметика и квадратный корень — они одинаково вычисляются во всех браузерах.
 */

const fmt = (v: number) => v.toFixed(2);
const cname = (id: CountryId) => COUNTRY_BY_ID[id].name;
const cgen = (id: CountryId) => COUNTRY_BY_ID[id].gen;
const cdat = (id: CountryId) => COUNTRY_BY_ID[id].dat;

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function newTrack(): TrackState {
  return {
    detected: false,
    trackedTicks: 0,
    classified: false,
    decision: 'none',
    verifyTicks: 0,
    permissionAt: 0,
    noted: [],
  };
}

export function createState(config: SimConfig): SimState {
  const { scenario } = config;
  const objects: ObjState[] = scenario.objects.map((spec) => ({
    spec,
    x: spec.from.x,
    y: spec.from.y,
    status: 'pending',
    trail: [],
    tracks: Object.fromEntries(scenario.posts.map((p) => [p.id, newTrack()])),
    attempts: 0,
  }));
  const posts: PostState[] = scenario.posts.map((spec) => ({ spec, stock: spec.stock, cooldownUntil: 0 }));
  const state: SimState = {
    tick: 0,
    rng: normalizeSeed(config.seed),
    objects,
    interceptors: [],
    posts,
    log: [],
    finished: false,
    nextInterceptorNo: 1,
  };
  addLog(state, 'system', {
    title: `Сценарий «${scenario.title}» подготовлен`,
    reason: `Зерно генератора: ${normalizeSeed(config.seed)}. Одинаковые сценарий, зерно и настройки отношений всегда дают одинаковый журнал.`,
  });
  return state;
}

function addLog(
  state: SimState,
  stage: Stage,
  e: { title: string; reason: string; objectId?: string; postId?: string; rule?: string; roll?: Roll },
) {
  const entry: LogEntry = { seq: state.log.length + 1, tick: state.tick, stage, ...e };
  state.log.push(entry);
}

function roll(state: SimState, p: number): Roll & { ok: boolean } {
  const [r, next] = nextRandom(state.rng);
  state.rng = next;
  return { p, r, ok: r < p };
}

function noteOnce(track: TrackState, key: string): boolean {
  if (track.noted.includes(key)) return false;
  track.noted.push(key);
  return true;
}

const rollText = (x: Roll) => `учебная вероятность ${fmt(x.p)}, выпало ${fmt(x.r)}`;

function moveObjects(state: SimState) {
  for (const o of state.objects) {
    if (o.spec.spawnTick === state.tick && o.status === 'pending') {
      o.status = 'flying';
      const prof = PROFILES[o.spec.profile];
      addLog(state, 'spawn', {
        objectId: o.spec.id,
        title: `Появление объекта ${o.spec.label} (${prof.name})`,
        reason: `Происхождение: ${originName(o.spec.origin)}. Условная область назначения: ${cname(
          o.spec.destination,
        )} (задана сценарием). Посты пока ничего не знают: карта показывает «истинное» положение только для наглядности.`,
      });
      o.trail.push({ x: o.x, y: o.y });
      continue;
    }
    if (o.status !== 'flying') continue;
    const prof = PROFILES[o.spec.profile];
    const d = dist(o.x, o.y, o.spec.to.x, o.spec.to.y);
    if (d <= prof.speed) {
      o.x = o.spec.to.x;
      o.y = o.spec.to.y;
      o.status = 'arrived';
      addLog(state, 'outcome', {
        objectId: o.spec.id,
        title:
          o.spec.profile === 'air'
            ? `${o.spec.label} достиг условного пункта назначения`
            : `${o.spec.label} достиг условной области назначения`,
        reason:
          o.spec.profile === 'air'
            ? 'Воздушное судно завершило маршрут; модель не рассматривала его перехват (П-7).'
            : o.attempts > 0
              ? `Объект не был перехвачен: учебных попыток — ${o.attempts}. Модель иллюстрирует неопределённость, а не предсказывает реальный исход.`
              : 'Перехват не выполнялся: смотрите в журнале, какое учебное правило или ограничение сработало.',
      });
    } else {
      o.x += ((o.spec.to.x - o.x) / d) * prof.speed;
      o.y += ((o.spec.to.y - o.y) / d) * prof.speed;
    }
    o.trail.push({ x: o.x, y: o.y });
    if (o.trail.length > MODEL.trailLength) o.trail.shift();
  }
}

function moveInterceptors(state: SimState) {
  const keep: InterceptorState[] = [];
  for (const it of state.interceptors) {
    const target = state.objects.find((o) => o.spec.id === it.targetId)!;
    const post = state.posts.find((p) => p.spec.id === it.postId)!;
    if (target.status !== 'flying') {
      addLog(state, 'system', {
        objectId: target.spec.id,
        postId: post.spec.id,
        title: `Перехватчик ${it.id} снят с задачи`,
        reason: 'Объект больше не активен в модели.',
      });
      continue;
    }
    const prof = PROFILES[target.spec.profile];
    // Упреждение: целимся в точку, где объект будет через время подлёта (без тригонометрии).
    const dToObj = dist(it.x, it.y, target.x, target.y);
    const dToGoal = dist(target.x, target.y, target.spec.to.x, target.spec.to.y) || 1;
    const vx = ((target.spec.to.x - target.x) / dToGoal) * prof.speed;
    const vy = ((target.spec.to.y - target.y) / dToGoal) * prof.speed;
    const t = dToObj / MODEL.interceptorSpeed;
    const ax = target.x + vx * t;
    const ay = target.y + vy * t;
    const dAim = dist(it.x, it.y, ax, ay);
    if (dAim <= MODEL.interceptorSpeed) {
      it.x = ax;
      it.y = ay;
    } else {
      it.x += ((ax - it.x) / dAim) * MODEL.interceptorSpeed;
      it.y += ((ay - it.y) / dAim) * MODEL.interceptorSpeed;
    }
    it.trail.push({ x: it.x, y: it.y });
    if (it.trail.length > MODEL.trailLength) it.trail.shift();

    if (dist(it.x, it.y, target.x, target.y) <= MODEL.hitRadius) {
      const p = post.spec.interceptP * prof.interceptFactor;
      const res = roll(state, p);
      if (res.ok) {
        target.status = 'intercepted';
        addLog(state, 'outcome', {
          objectId: target.spec.id,
          postId: post.spec.id,
          title: `Условный перехват ${target.spec.label} успешен`,
          reason: `Перехватчик ${it.id} поста «${post.spec.name}». Исход определён жребием: ${rollText(res)}. При другом зерне результат мог быть иным.`,
          roll: { p: res.p, r: res.r },
        });
      } else {
        addLog(state, 'outcome', {
          objectId: target.spec.id,
          postId: post.spec.id,
          title: `Условный перехват ${target.spec.label} не удался`,
          reason: `Перехватчик ${it.id} поста «${post.spec.name}». Исход определён жребием: ${rollText(res)}. Если объект останется в зоне и хватит запаса, возможна повторная попытка.`,
          roll: { p: res.p, r: res.r },
        });
      }
      continue;
    }
    if (state.tick - it.launchedAt > 40) {
      addLog(state, 'outcome', {
        objectId: target.spec.id,
        postId: post.spec.id,
        title: `Перехватчик ${it.id} не сблизился с объектом`,
        reason: 'Истекло учебное время полёта перехватчика.',
      });
      continue;
    }
    keep.push(it);
  }
  state.interceptors = keep;
}

/** Цепочка учебных правил: возвращает решение и пояснение с номерами правил. */
function decide(state: SimState, config: SimConfig, post: PostState, o: ObjState, track: TrackState) {
  const { relations } = config;
  const D = post.spec.country;
  const O = o.spec.origin;
  const Z = o.spec.destination;
  const base = { objectId: o.spec.id, postId: post.spec.id };
  const who = `Пост «${post.spec.name}» (${cname(D)}), объект ${o.spec.label}`;

  if (o.spec.profile === 'air') {
    track.decision = 'observe';
    addLog(state, 'decision', {
      ...base,
      rule: 'П-7',
      title: `${who}: только сопровождение`,
      reason: 'Объект классифицирован как воздушное судно. Модель не рассматривает перехват воздушных судов: показаны только сопровождение и запрос опознавания.',
    });
    return;
  }
  if (O !== 'X' && (O === D || getRelation(relations, D, O).status === 'alliance')) {
    track.decision = 'observe';
    addLog(state, 'decision', {
      ...base,
      rule: 'П-5',
      title: `${who}: перехват не рассматривается`,
      reason:
        O === D
          ? 'Объект принадлежит собственной стране поста.'
          : `Происхождение — ${cname(O)}; у ${cgen(D)} с этой страной учебный союз. Вместо перехвата — запрос по каналам связи.`,
    });
    return;
  }

  const reasons: string[] = [];
  const rules: string[] = [];
  if (Z !== D) {
    const rel = getRelation(relations, D, Z);
    if (rel.jointDefense) {
      reasons.push(`объект направлен к ${cdat(Z)}; с этой страной есть учебное соглашение о совместной обороне`);
      rules.push('П-3');
    } else if (rel.status === 'alliance') {
      track.decision = 'share';
      addLog(state, 'decision', {
        ...base,
        rule: 'П-2',
        title: `${who}: передача данных союзнику`,
        reason: `Объект направлен к ${cdat(Z)}. Между странами союз, но без соглашения о совместной обороне, поэтому учебного основания для перехвата нет. Данные сопровождения переданы ${cdat(Z)}.`,
      });
      return;
    } else {
      track.decision = 'observe';
      addLog(state, 'decision', {
        ...base,
        rule: 'П-1',
        title: `${who}: только наблюдение`,
        reason: `Условная область назначения — ${cname(Z)}. Это вне защищаемой территории ${cgen(D)} (отношение: ${RELATION_NAMES[rel.status].toLowerCase()}, соглашения о совместной обороне нет).`,
      });
      return;
    }
  } else {
    reasons.push(`объект направлен к территории ${cgen(D)}`);
    rules.push('П-1');
  }

  const originStatus = O === 'X' ? 'unknown' : getRelation(relations, D, O).status;
  if (originStatus === 'unknown' || originStatus === 'neutral') {
    track.decision = 'verify';
    track.verifyTicks = MODEL.verifyTicks;
    addLog(state, 'decision', {
      ...base,
      rule: [...rules, 'П-4'].join(', '),
      title: `${who}: нужна дополнительная проверка`,
      reason: `${capitalize(reasons.join('; '))}. Происхождение: ${
        O === 'X' ? 'не установлено' : `${cname(O)} (нейтралитет)`
      }. Прежде чем рассматривать перехват, нужно ${MODEL.verifyTicks} такта дополнительного сопровождения для подтверждения признаков угрозы.`,
    });
    return;
  }
  // Конфликт
  reasons.push(`происхождение — ${cname(O as CountryId)} (учебный конфликт); сам по себе конфликт не является основанием, учтены классификация и направление`);
  rules.push('П-6');
  proceedToPermission(state, config, post, o, track, reasons, rules);
}

function proceedToPermission(
  state: SimState,
  config: SimConfig,
  post: PostState,
  o: ObjState,
  track: TrackState,
  reasons: string[],
  rules: string[],
) {
  const { relations } = config;
  const D = post.spec.country;
  const base = { objectId: o.spec.id, postId: post.spec.id };
  const who = `Пост «${post.spec.name}» (${cname(D)}), объект ${o.spec.label}`;
  if (relations.permissionRequired[D]) {
    const [r, next] = nextRandom(state.rng);
    state.rng = next;
    const delay = MODEL.permissionDelayMin + Math.floor(r * MODEL.permissionDelaySpread);
    track.decision = 'await-permission';
    track.permissionAt = state.tick + delay;
    addLog(state, 'decision', {
      ...base,
      rule: [...rules, 'П-8'].join(', '),
      title: `${who}: запрошено разрешение на перехват`,
      reason: `${capitalize(reasons.join('; '))}. Для ${cgen(D)} включено требование разрешения. Учебная задержка ответа: ${delay} такт(а).`,
    });
  } else {
    track.decision = 'authorized';
    addLog(state, 'decision', {
      ...base,
      rule: rules.join(', '),
      title: `${who}: перехват допустим по учебным правилам`,
      reason: `${capitalize(reasons.join('; '))}. Разрешение для ${cgen(D)} не требуется.`,
    });
  }
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function processPosts(state: SimState, config: SimConfig) {
  for (const post of state.posts) {
    for (const o of state.objects) {
      if (o.status !== 'flying') continue;
      const prof = PROFILES[o.spec.profile];
      const track = o.tracks[post.spec.id];
      const d = dist(post.spec.x, post.spec.y, o.x, o.y);
      const inRange = d <= post.spec.detectRadius;
      const base = { objectId: o.spec.id, postId: post.spec.id };
      const who = `Пост «${post.spec.name}» (${cname(post.spec.country)})`;

      // 1. Обнаружение и сопровождение
      if (!track.detected) {
        if (!inRange) continue;
        const res = roll(state, post.spec.detectP * prof.visibility);
        if (res.ok) {
          track.detected = true;
          track.trackedTicks = 0;
          addLog(state, 'detect', {
            ...base,
            title: `${who} обнаружил объект ${o.spec.label}`,
            reason: `Объект в учебной зоне обнаружения (${Math.round(d)} из ${post.spec.detectRadius} у.е.). ${capitalize(
              rollText(res),
            )} (база поста × заметность профиля).`,
            roll: { p: res.p, r: res.r },
          });
        } else if (noteOnce(track, 'miss')) {
          addLog(state, 'detect', {
            ...base,
            title: `${who}: объект ${o.spec.label} в зоне, но пока не обнаружен`,
            reason: `Обнаружение вероятностное: ${rollText(res)}. Попытки повторяются каждый такт; в журнал записывается только первая.`,
            roll: { p: res.p, r: res.r },
          });
        }
        continue;
      }
      if (!inRange) {
        track.detected = false;
        track.trackedTicks = 0;
        addLog(state, 'track', {
          ...base,
          title: `${who}: сопровождение ${o.spec.label} прекращено`,
          reason: 'Объект вышел из учебной зоны обнаружения поста.',
        });
        continue;
      }
      track.trackedTicks += 1;

      // 2. Классификация
      if (!track.classified) {
        if (track.trackedTicks < prof.classifyTicks) continue;
        const res = roll(state, prof.ambiguity);
        if (res.ok) {
          track.trackedTicks = 0;
          addLog(state, 'classify', {
            ...base,
            title: `${who}: классификация ${o.spec.label} не завершена`,
            reason: `Признаки неоднозначны (учебная неоднозначность ${fmt(res.p)}, выпало ${fmt(res.r)}). Нужно ещё ${prof.classifyTicks} такта сопровождения.`,
            roll: { p: res.p, r: res.r },
          });
          continue;
        }
        track.classified = true;
        addLog(state, 'classify', {
          ...base,
          title: `${who}: ${o.spec.label} классифицирован`,
          reason: `Класс: ${prof.classLabel}. Потребовалось ${track.trackedTicks} такта сопровождения; вероятность неоднозначного результата была ${fmt(
            res.p,
          )}, выпало ${fmt(res.r)}.`,
          roll: { p: res.p, r: res.r },
        });
      }

      // 3. Решение
      if (track.decision === 'none') {
        decide(state, config, post, o, track);
        continue;
      }
      if (track.decision === 'verify') {
        track.verifyTicks -= 1;
        if (track.verifyTicks > 0) continue;
        const res = roll(state, 1 - prof.ambiguity / 2);
        if (res.ok) {
          addLog(state, 'decision', {
            ...base,
            rule: 'П-4',
            title: `${who}: признаки угрозы ${o.spec.label} подтверждены`,
            reason: `Дополнительное сопровождение завершено: ${rollText(res)}.`,
            roll: { p: res.p, r: res.r },
          });
          proceedToPermission(state, config, post, o, track, ['угроза подтверждена дополнительной проверкой'], ['П-4']);
        } else {
          track.decision = 'observe';
          addLog(state, 'decision', {
            ...base,
            rule: 'П-4',
            title: `${who}: угроза ${o.spec.label} не подтверждена`,
            reason: `Признаки остались неоднозначными (${rollText(res)}). По учебному правилу — только наблюдение.`,
            roll: { p: res.p, r: res.r },
          });
        }
        continue;
      }
      if (track.decision === 'await-permission') {
        if (state.tick < track.permissionAt) continue;
        const res = roll(state, MODEL.permissionGrantP);
        if (res.ok) {
          track.decision = 'authorized';
          addLog(state, 'permission', {
            ...base,
            rule: 'П-8',
            title: `${who}: разрешение на перехват ${o.spec.label} получено`,
            reason: `Ответ учебного командования: ${rollText(res)}.`,
            roll: { p: res.p, r: res.r },
          });
        } else {
          track.decision = 'denied';
          addLog(state, 'permission', {
            ...base,
            rule: 'П-8',
            title: `${who}: в разрешении на перехват ${o.spec.label} отказано`,
            reason: `Учебная условность: командование может отказать по причинам, не видимым посту (${rollText(res)}).`,
            roll: { p: res.p, r: res.r },
          });
        }
        continue;
      }

      // 4. Условный перехват
      if (track.decision !== 'authorized') continue;
      if (state.interceptors.some((it) => it.targetId === o.spec.id)) {
        const other = state.interceptors.find((it) => it.targetId === o.spec.id)!;
        if (other.postId !== post.spec.id && noteOnce(track, 'deconflict')) {
          addLog(state, 'intercept', {
            ...base,
            rule: 'П-9',
            title: `${who}: пуск по ${o.spec.label} отложен`,
            reason: `К объекту уже летит перехватчик ${other.id}. Посты не дублируют пуск.`,
          });
        }
        continue;
      }
      if (d > post.spec.engageRadius) {
        if (noteOnce(track, 'wait-zone')) {
          addLog(state, 'intercept', {
            ...base,
            rule: 'П-10',
            title: `${who}: ожидание входа ${o.spec.label} в зону перехвата`,
            reason: `Сейчас ${Math.round(d)} у.е., учебная зона перехвата — ${post.spec.engageRadius} у.е.`,
          });
        }
        continue;
      }
      if (post.stock <= 0) {
        if (noteOnce(track, 'stock')) {
          addLog(state, 'intercept', {
            ...base,
            rule: 'П-10',
            title: `${who}: учебный запас перехватчиков исчерпан`,
            reason: 'Новый пуск невозможен. Этот исход показывает ограниченность ресурса, а не «уязвимость» какой-либо системы.',
          });
        }
        continue;
      }
      if (state.tick < post.cooldownUntil) continue;
      const id = `П${state.nextInterceptorNo++}`;
      post.stock -= 1;
      post.cooldownUntil = state.tick + MODEL.relaunchCooldown;
      o.attempts += 1;
      state.interceptors.push({
        id,
        postId: post.spec.id,
        targetId: o.spec.id,
        x: post.spec.x,
        y: post.spec.y,
        trail: [{ x: post.spec.x, y: post.spec.y }],
        launchedAt: state.tick,
      });
      addLog(state, 'intercept', {
        ...base,
        title: `${who}: пуск учебного перехватчика ${id} по ${o.spec.label}`,
        reason: `Все условия выполнены: объект в зоне (${Math.round(d)} из ${post.spec.engageRadius} у.е.), решение принято, запас после пуска — ${post.stock}.`,
      });
    }
  }
}

export function step(state: SimState, config: SimConfig): void {
  if (state.finished) return;
  state.tick += 1;
  moveObjects(state);
  moveInterceptors(state);
  processPosts(state, config);

  const allDone = state.objects.every((o) => o.status === 'intercepted' || o.status === 'arrived');
  if (allDone && state.interceptors.length === 0) {
    state.finished = true;
    const s = summarize(state);
    addLog(state, 'system', {
      title: 'Сценарий завершён',
      reason: `Условно перехвачено: ${s.intercepted}; достигли области назначения: ${s.arrived}; учебных перехватчиков израсходовано: ${s.interceptorsUsed}. Это иллюстрация неопределённости, а не прогноз.`,
    });
  } else if (state.tick >= config.scenario.maxTicks) {
    state.finished = true;
    addLog(state, 'system', {
      title: 'Достигнут предел времени сценария',
      reason: 'Модель остановлена по ограничению длительности.',
    });
  }
}

function summarize(state: SimState) {
  return {
    intercepted: state.objects.filter((o) => o.status === 'intercepted').length,
    arrived: state.objects.filter((o) => o.status === 'arrived').length,
    interceptorsUsed: state.nextInterceptorNo - 1,
    ticks: state.tick,
  };
}

function snapshot(state: SimState): Frame {
  return {
    tick: state.tick,
    objects: state.objects.map((o) => ({
      id: o.spec.id,
      x: o.x,
      y: o.y,
      status: o.status,
      trail: o.trail.slice(),
      detectedBy: Object.entries(o.tracks)
        .filter(([, t]) => t.detected)
        .map(([id]) => id),
      classified: Object.values(o.tracks).some((t) => t.classified),
      decision: strongestDecision(Object.values(o.tracks).map((t) => t.decision)),
    })),
    interceptors: state.interceptors.map((it) => ({
      id: it.id,
      postId: it.postId,
      targetId: it.targetId,
      x: it.x,
      y: it.y,
      trail: it.trail.slice(),
    })),
    posts: state.posts.map((p) => ({ id: p.spec.id, stock: p.stock })),
    logCount: state.log.length,
  };
}

const DECISION_ORDER = ['none', 'observe', 'share', 'denied', 'verify', 'await-permission', 'authorized'] as const;
function strongestDecision(ds: TrackState['decision'][]): TrackState['decision'] {
  let best: TrackState['decision'] = 'none';
  for (const d of ds) if (DECISION_ORDER.indexOf(d) > DECISION_ORDER.indexOf(best)) best = d;
  return best;
}

/** Полный прогон сценария. Кадры сохраняются для воспроизведения и перемотки. */
export function simulate(config: SimConfig): SimResult {
  const state = createState(config);
  const frames: Frame[] = [snapshot(state)];
  while (!state.finished) {
    step(state, config);
    frames.push(snapshot(state));
  }
  const text = state.log.map((e) => `${e.tick}|${e.stage}|${e.title}|${e.reason}`).join('\n');
  return { frames, log: state.log, fingerprint: fingerprint(text), summary: summarize(state) };
}
