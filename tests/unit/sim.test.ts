import { describe, expect, test } from 'vitest';
import { simulate } from '../../src/sim/engine';
import { SCENARIOS, getScenario } from '../../src/sim/scenarios';
import { cloneRelations, pairKey } from '../../src/sim/world';
import type { Scenario } from '../../src/sim/types';

const run = (s: Scenario, seed = s.seed, relations = s.relations) => simulate({ scenario: s, seed, relations });

describe('воспроизводимость', () => {
  for (const s of SCENARIOS) {
    test(`«${s.title}»: одинаковые условия → одинаковый журнал`, () => {
      const a = run(s);
      const b = run(s);
      expect(b.log).toEqual(a.log);
      expect(b.fingerprint).toBe(a.fingerprint);
      expect(b.frames.length).toBe(a.frames.length);
      expect(a.log.at(-1)?.stage).toBe('system');
    });
  }

  test('другое зерно меняет ход хотя бы одного сценария', () => {
    const changed = SCENARIOS.some((s) => run(s).fingerprint !== run(s, s.seed + 1).fingerprint);
    expect(changed).toBe(true);
  });

  test('настройки сценария не изменяются прогоном', () => {
    const s = getScenario('saturation');
    const before = JSON.stringify(s);
    run(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('учебные правила отношений', () => {
  test('союз без совместной обороны → только передача данных (П-2)', () => {
    const s = getScenario('alliance');
    const r = run(s);
    const b1 = r.log.filter((e) => e.postId === 'B1' && e.stage === 'decision');
    expect(b1[0]?.rule).toBe('П-2');
    expect(r.log.some((e) => e.postId === 'B1' && e.stage === 'intercept')).toBe(false);
  });

  test('после включения совместной обороны тот же пост ссылается на П-3', () => {
    const s = getScenario('alliance');
    const rel = cloneRelations(s.relations);
    rel.pairs[pairKey('A', 'B')].jointDefense = true;
    const r = run(s, s.seed, rel);
    const b1 = r.log.find((e) => e.postId === 'B1' && e.stage === 'decision');
    expect(b1?.rule).toContain('П-3');
  });

  test('конфликт не означает автоматического перехвата, если объект летит не к защищаемой территории (П-1)', () => {
    const base = getScenario('basics');
    const s: Scenario = {
      ...base,
      objects: [{ ...base.objects[0], to: { x: 150, y: 420 }, destination: 'E' }],
    };
    const r = run(s);
    const d = r.log.find((e) => e.stage === 'decision');
    expect(d?.rule).toBe('П-1');
    expect(r.log.some((e) => e.stage === 'intercept' && e.title.includes('пуск'))).toBe(false);
  });

  test('требование разрешения добавляет этап «разрешение» (П-8)', () => {
    const s = getScenario('basics');
    const rel = cloneRelations(s.relations);
    rel.permissionRequired.A = true;
    const r = run(s, s.seed, rel);
    expect(r.log.some((e) => e.stage === 'permission')).toBe(true);
  });

  test('воздушное судно никогда не перехватывается (П-7)', () => {
    const r = run(getScenario('neutral'));
    const air = r.log.filter((e) => e.objectId === 'O1');
    expect(air.some((e) => e.rule === 'П-7')).toBe(true);
    expect(air.some((e) => e.stage === 'intercept')).toBe(false);
  });
});

describe('разделение справочных и учебных данных', () => {
  test('модуль симуляции не импортирует справочную базу, и наоборот', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (dir: string) =>
      fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')] as const);
    for (const [f, src] of read('src/sim')) {
      expect(src, f).not.toMatch(/from\s+['"][^'"]*data\/reference/);
    }
    for (const [f, src] of read('src/data/reference')) {
      expect(src, f).not.toMatch(/from\s+['"][^'"]*\/sim\//);
    }
  });
});
