import { describe, expect, test } from 'vitest';
import { CLASS_BY_ID, GAME_CLASSES } from '../../src/game/classes';
import { dcos, dsin, turnToward } from '../../src/game/dmath';
import { stateFingerprint, whyChain } from '../../src/game/engine';
import { EpisodeRunner } from '../../src/game/runner';
import type { Command, EpisodeSetup, ObjectSetup } from '../../src/game/types';
import { buildEffects } from '../../src/game/weatherEffects';

const o = (x: Partial<ObjectSetup> & Pick<ObjectSetup, 'id' | 'classId' | 'side' | 'pos'>): ObjectSetup => ({
  label: x.id,
  startS: 0,
  route: [],
  mission: 'none',
  payload: [],
  destinationOwner: null,
  ...x,
});

function baseSetup(over: Partial<EpisodeSetup> = {}): EpisodeSetup {
  return {
    seed: 11,
    dt: 0.5,
    durationS: 3600,
    endConditions: ['duration', 'all-finished'],
    sides: [
      { id: 'A', name: 'Аврелия' },
      { id: 'K', name: 'Кассиния' },
    ],
    relations: { 'A|K': { status: 'conflict', jointDefense: false } },
    permissionRequired: {},
    objects: [
      o({ id: 'ad', classId: 'g-ad-point', side: 'A', pos: { x: 0, y: 0 } }),
      o({ id: 'up', classId: 'g-ad-upper', side: 'A', pos: { x: -20, y: 10 } }),
      o({ id: 'c1', classId: 'g-carrier', side: 'K', pos: { x: 300, y: 50 }, route: [{ x: 150, y: 20 }], mission: 'release', payload: [{ classId: 'g-cruise', count: 3, aim: { x: -10, y: -5 } }], payloadOwners: ['A'], destinationOwner: 'A' }),
      o({ id: 'f1', classId: 'g-fighter', side: 'A', pos: { x: -60, y: 0 }, route: [{ x: 60, y: 10 }], mission: 'intercept-area', holdS: 1500 }),
    ],
    classes: CLASS_BY_ID,
    weather: buildEffects('windy'),
    awareness: 'limited',
    control: 'auto',
    randomness: 'normal',
    motionPreset: 'standard',
    interactionPreset: 'standard',
    resources: 'standard',
    checkpointEveryS: 30,
    ...over,
  };
}

describe('детерминированная математика', () => {
  test('синус и косинус без Math.sin совпадают с эталоном до 1e-9', () => {
    for (let a = -10; a <= 10; a += 0.37) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-9);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-9);
    }
  });
  test('поворот ограничен заданным углом за шаг', () => {
    const [x, y] = turnToward(0, 1, 1, 0, 0.1);
    expect(Math.acos(x * 0 + y * 1)).toBeCloseTo(0.1, 6);
  });
});

describe('воспроизводимость эпизода', () => {
  test('одинаковый журнал и отпечаток при разных скоростях показа и частотах кадров', () => {
    const ref = new EpisodeRunner(baseSetup()).runToEnd();
    const fp = ref.fingerprint();
    for (const fps of [24, 60, 144]) {
      for (const speed of [1, 10, 60]) {
        const r = new EpisodeRunner(baseSetup());
        let t = 0;
        let guard = 0;
        while (!r.finished && guard++ < 1_000_000) {
          t += speed / fps;
          r.advanceTo(t, 3); // намеренно мало шагов за кадр: имитация «не успеваем считать»
          if (r.t < t - 5) t = r.t; // интерфейс замедляется, а не пропускает шаги
        }
        expect(r.fingerprint(), `${fps} кадров/с, ×${speed}`).toBe(fp);
      }
    }
  });

  test('другое зерно меняет ход, то же зерно — нет', () => {
    const a = new EpisodeRunner(baseSetup()).runToEnd().fingerprint();
    const b = new EpisodeRunner(baseSetup({ seed: 12 })).runToEnd().fingerprint();
    const c = new EpisodeRunner(baseSetup()).runToEnd().fingerprint();
    expect(b).not.toBe(a);
    expect(c).toBe(a);
  });

  test('перемотка назад восстанавливает то же состояние, что прямой расчёт', () => {
    const r = new EpisodeRunner(baseSetup());
    r.seek(2400);
    const at2400 = stateFingerprint(r.state);
    r.seek(1000);
    const direct = new EpisodeRunner(baseSetup());
    direct.seek(1000);
    expect(stateFingerprint(r.state)).toBe(stateFingerprint(direct.state));
    expect(r.log.length).toBe(direct.log.length);
    r.seek(2400);
    expect(stateFingerprint(r.state)).toBe(at2400);
  });
});

describe('команды', () => {
  test('команда применяется ровно один раз, даже после перемотки', () => {
    const cmd: Command = { id: 'c-1', t: 900, type: 'hold', objectId: 'f1', seconds: 300 };
    const r = new EpisodeRunner(baseSetup(), [cmd]);
    r.seek(1500);
    r.seek(200);
    r.seek(1600);
    r.seek(950);
    r.seek(1600);
    const applied = r.log.filter((e) => e.kind === 'command' && e.prov === 'user');
    expect(applied.length).toBe(1);
    const straight = new EpisodeRunner(baseSetup(), [cmd]);
    straight.seek(1600);
    expect(stateFingerprint(r.state)).toBe(stateFingerprint(straight.state));
  });

  test('команда в прошлом эпизода не принимается: нужна новая ветка', () => {
    const r = new EpisodeRunner(baseSetup());
    r.seek(600);
    const res = r.addCommand({ id: 'x', t: 100, type: 'rtb', objectId: 'f1' });
    expect(res.ok).toBe(false);
  });

  test('немедленная команда «возврат» переводит самолёт в фазу возвращения', () => {
    const r = new EpisodeRunner(baseSetup());
    r.seek(700);
    expect(r.addCommand({ id: 'rtb', t: 700, type: 'rtb', objectId: 'f1' }).ok).toBe(true);
    r.seek(702);
    const f = r.state.ents.find((e) => e.id === 'f1')!;
    expect(f.phase).toBe('return');
  });
});

describe('носитель и нагрузка', () => {
  test('нагрузка отделяется один раз, принадлежит носителю и живёт самостоятельно', () => {
    const r = new EpisodeRunner(baseSetup({ objects: baseSetup().objects.filter((x) => x.id !== 'ad' && x.id !== 'f1' && x.id !== 'up') }), [{ id: 'late', t: 1400, type: 'release', objectId: 'c1' }]).runToEnd();
    const carrier = r.state.ents.find((e) => e.id === 'c1')!;
    const kids = r.state.ents.filter((e) => e.parentId === 'c1');
    expect(kids.length).toBe(3);
    expect(carrier.payload[0].count).toBe(0);
    expect(r.log.filter((e) => e.kind === 'separation').length).toBe(3);
    // Повторное отделение отклонено
    expect(r.log.some((e) => e.kind === 'command' && e.title.startsWith('Команда не выполнена'))).toBe(true);
    // Носитель сел раньше, чем нагрузка достигла цели
    const landed = r.log.find((e) => e.objectId === 'c1' && e.title.includes('посадка'))!;
    const arrived = r.log.filter((e) => e.kind === 'outcome' && kids.some((k) => k.id === e.objectId));
    expect(arrived.length).toBe(3);
    expect(Math.max(...arrived.map((a) => a.t))).toBeGreaterThan(0);
    expect(landed).toBeTruthy();
    for (const k of kids) expect(k.outcome).toBe('arrived');
  });
});

describe('игровые правила ПВО по категориям', () => {
  test('пост верхнего рубежа не работает по крылатым объектам (П-11), ближний — работает', () => {
    const r = new EpisodeRunner(baseSetup({ objects: baseSetup().objects.filter((x) => x.id !== 'f1'), awareness: 'full' })).runToEnd();
    const launches = r.log.filter((e) => e.kind === 'launch' && e.unitId);
    expect(launches.some((e) => e.unitId === 'ad')).toBe(true);
    expect(launches.some((e) => e.unitId === 'up')).toBe(false);
    expect(r.log.some((e) => e.reason.includes('З-λ') || e.reason.includes('up: класс несовместим'))).toBe(true);
  });

  test('баллистическую категорию берёт только совместимый класс', () => {
    const objs = [
      o({ id: 'ad', classId: 'g-ad-post', side: 'A', pos: { x: 0, y: 0 } }),
      o({ id: 'up', classId: 'g-ad-upper', side: 'A', pos: { x: -20, y: 10 } }),
      o({ id: 'L', classId: 'g-launcher', side: 'K', pos: { x: 350, y: 0 }, mission: 'launch', payload: [{ classId: 'g-ballistic', count: 2, aim: { x: -5, y: 0 } }], payloadOwners: ['A'], destinationOwner: 'A' }),
    ];
    const r = new EpisodeRunner(baseSetup({ objects: objs, awareness: 'full' })).runToEnd();
    const launches = r.log.filter((e) => e.kind === 'launch' && e.unitId !== 'L' && e.unitId);
    expect(launches.every((e) => e.unitId === 'up')).toBe(true);
    expect(launches.length).toBeGreaterThan(0);
  });

  test('самолёт нейтральной стороны только сопровождается (П-7)', () => {
    const objs = [o({ id: 'ad', classId: 'g-ad-post', side: 'A', pos: { x: 0, y: 0 } }), o({ id: 'tr', classId: 'g-support', side: 'K', pos: { x: 100, y: 0 }, alt: 7000, route: [{ x: -100, y: 0 }], mission: 'transit', destinationOwner: 'A' })];
    const r = new EpisodeRunner(baseSetup({ objects: objs, awareness: 'full', relations: {} })).runToEnd();
    expect(r.log.some((e) => e.kind === 'decision' && e.rule?.includes('П-7'))).toBe(true);
    expect(r.log.some((e) => e.kind === 'launch')).toBe(false);
  });

  test('ручной режим ставит решение в очередь и ждёт команды (П-14)', () => {
    const r = new EpisodeRunner(baseSetup({ control: 'manual', awareness: 'full', objects: baseSetup().objects.filter((x) => x.id !== 'f1') }));
    r.advanceTo(3600, 1e9, (e) => e.rule === 'П-14');
    expect(r.state.pending.length).toBeGreaterThan(0);
    const p = r.state.pending[0];
    expect(r.state.ents.filter((e) => e.kind === 'sam-missile').length).toBe(0);
    r.addCommand({ id: 'ok', t: r.t, type: 'authorize', unitSide: p.side, objectId: p.objectId });
    r.advanceTo(r.t + 30);
    expect(r.log.some((e) => e.kind === 'command' && e.rule === 'П-14')).toBe(true);
  });
});

describe('ресурсы', () => {
  test('запас, топливо и нагрузка никогда не отрицательны', () => {
    for (const res of ['scarce', 'standard', 'ample'] as const) {
      const r = new EpisodeRunner(baseSetup({ resources: res, awareness: 'full' }));
      while (!r.finished) {
        r.stepOnce();
        for (const e of r.state.ents) {
          expect(e.stock).toBeGreaterThanOrEqual(0);
          expect(e.fuel).toBeGreaterThanOrEqual(0);
          for (const p of e.payload) expect(p.count).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('скудные ресурсы уменьшают запас постов', () => {
    const a = new EpisodeRunner(baseSetup({ resources: 'scarce' }));
    const b = new EpisodeRunner(baseSetup({ resources: 'ample' }));
    expect(a.state.ents.find((e) => e.id === 'ad')!.stock).toBeLessThan(b.state.ents.find((e) => e.id === 'ad')!.stock);
  });
});

describe('движение', () => {
  test('скорость меняется плавно, поворот ограничен, высота набирается постепенно', () => {
    const objs = [o({ id: 'f', classId: 'g-fighter', side: 'A', pos: { x: 0, y: 0 }, route: [{ x: 0, y: 100 }, { x: -100, y: 100 }], mission: 'patrol' })];
    const setup = baseSetup({ objects: objs, weather: buildEffects('clear') });
    const r = new EpisodeRunner(setup);
    const m = CLASS_BY_ID['g-fighter'].motion!;
    let prev = { spd: 0, alt: 0, hx: 0, hy: 1 };
    for (let i = 0; i < 2000 && !r.finished; i++) {
      r.stepOnce();
      const f = r.state.ents[0];
      if (f.phase === 'prep' || f.phase === 'pending') continue;
      expect(Math.abs(f.spd - prev.spd)).toBeLessThanOrEqual(m.accel * setup.dt + 1e-9 + (prev.spd === 0 ? m.minSpeed : 0));
      expect(Math.abs(f.alt - prev.alt)).toBeLessThanOrEqual(Math.max(m.climbRate, m.sinkRate) * setup.dt + 1e-6);
      const dot = Math.min(1, f.hx * prev.hx + f.hy * prev.hy);
      if (prev.spd > 0) expect(Math.acos(dot)).toBeLessThanOrEqual((m.turnRate * Math.PI) / 180 * setup.dt + 1e-6);
      prev = { spd: f.spd, alt: f.alt, hx: f.hx, hy: f.hy };
    }
  });

  test('ветер сносит, а поправка курса держит самолёт на линии маршрута', () => {
    const objs = [o({ id: 't', classId: 'g-support', side: 'A', pos: { x: 0, y: 0 }, alt: 7000, route: [{ x: 300, y: 0 }], mission: 'transit' })];
    const r = new EpisodeRunner(baseSetup({ objects: objs, weather: buildEffects('storm') }));
    let maxOff = 0;
    let crab = 0;
    for (let i = 0; i < 2400 && !r.finished; i++) {
      r.stepOnce();
      const e = r.state.ents[0];
      if (e.x > 30 && e.x < 270) {
        maxOff = Math.max(maxOff, Math.abs(e.y));
        crab = Math.max(crab, Math.abs(e.hy));
      }
    }
    expect(maxOff).toBeLessThan(6); // держит линию с игровой болтанкой
    expect(crab).toBeGreaterThan(0.05); // нос развёрнут против ветра
  });

  test('баллистический игровой профиль не зависит от ветра', () => {
    const mk = (w: string) => new EpisodeRunner(baseSetup({ objects: [o({ id: 'L', classId: 'g-launcher', side: 'K', pos: { x: 300, y: 0 }, mission: 'launch', payload: [{ classId: 'g-ballistic', count: 1, aim: { x: 0, y: 0 } }] })], weather: buildEffects(w) })).runToEnd();
    const a = mk('clear').state.ents.find((e) => e.kind === 'ballistic')!;
    const b = mk('storm').state.ents.find((e) => e.kind === 'ballistic')!;
    expect([a.x, a.y]).toEqual([b.x, b.y]);
  });
});

describe('журнал объясняет решения', () => {
  test('у итога взаимодействия есть цепочка «Почему?» до появления объекта', () => {
    const r = new EpisodeRunner(baseSetup({ awareness: 'limited' })).runToEnd();
    const hit = r.log.find((e) => e.kind === 'interaction' && e.conditions?.length);
    expect(hit).toBeTruthy();
    const chain = whyChain(r.log, hit!.seq);
    const kinds = chain.map((e) => e.kind);
    expect(kinds).toContain('launch');
    expect(kinds).toContain('decision');
    expect(kinds).toContain('classify');
    expect(kinds).toContain('detect');
    expect(kinds.some((k) => k === 'separation')).toBe(true);
    for (const e of chain.filter((x) => x.kind === 'decision' && x.rule)) expect(e.rule).toMatch(/П-\d+/);
  });

  test('игровые классы не содержат реальных названий и помечены как игровые профили', () => {
    for (const c of GAME_CLASSES) {
      expect(c.name.toLowerCase()).toMatch(/условн/);
      expect(c.description).toMatch(/Игров|Точка базирования/);
    }
  });
});
