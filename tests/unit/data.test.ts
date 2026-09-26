import { describe, expect, test } from 'vitest';
import { MILESTONES, MISSILES, reachedStage } from '../../src/data/reference/missiles';
import { AGREEMENTS } from '../../src/data/reference/agreements';
import { availability, CAT_RU, CATALOG, coverageTable, reachedBy, VARIANTS, type CatCategory } from '../../src/data/reference/catalog';
import { DATASET, SOURCES } from '../../src/data/reference/sources';

const sourceIds = new Set(SOURCES.map((s) => s.id));
const PARTIAL = /^\d{4}(-\d{2}(-\d{2})?)?$/;

describe('справочная база', () => {
  test('идентификаторы уникальны', () => {
    expect(new Set(MISSILES.map((m) => m.id)).size).toBe(MISSILES.length);
    expect(sourceIds.size).toBe(SOURCES.length);
    const figIds = MISSILES.flatMap((m) => m.ranges.map((r) => r.id));
    expect(new Set(figIds).size).toBe(figIds.length);
  });

  test('каждое число имеет источник, статус и отметку проверки', () => {
    for (const m of MISSILES) {
      for (const r of m.ranges) {
        expect(sourceIds.has(r.sourceId), `${m.id}/${r.id}`).toBe(true);
        expect(['claim', 'test', 'estimate']).toContain(r.kind);
        expect(r.check.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['direct', 'search-index']).toContain(r.check.method);
        expect(r.minKm ?? r.maxKm, `${r.id}: нет числа`).toBeTypeOf('number');
        if (r.minKm !== undefined && r.maxKm !== undefined) expect(r.minKm).toBeLessThanOrEqual(r.maxKm);
        expect(r.context.length).toBeGreaterThan(10);
        if (r.check.corroboratedBy) expect(sourceIds.has(r.check.corroboratedBy), r.id).toBe(true);
      }
    }
  });

  test('если данных нет — это явно пояснено', () => {
    for (const m of MISSILES.filter((x) => x.ranges.length === 0)) {
      expect(m.caveats?.length, m.id).toBeGreaterThan(0);
    }
  });

  test('несколько оценок сопровождаются объяснением расхождения', () => {
    for (const m of MISSILES.filter((x) => x.ranges.length > 1)) {
      expect(m.discrepancy, m.id).toBeTruthy();
    }
  });

  test('дата публикации не позже даты проверки и хранится отдельно', () => {
    for (const s of SOURCES) {
      if (s.published !== null) {
        expect(s.published).toMatch(PARTIAL);
        expect(s.published <= DATASET.builtAt, s.id).toBe(true);
      }
      expect(s.url.startsWith('https://'), s.id).toBe(true);
    }
  });

  test('источники истории и соглашений существуют', () => {
    for (const m of MISSILES) for (const id of m.historySourceIds) expect(sourceIds.has(id), `${m.id}:${id}`).toBe(true);
    for (const a of AGREEMENTS) {
      for (const e of a.events) {
        expect(sourceIds.has(e.sourceId), `${a.id}`).toBe(true);
        expect(e.date).toMatch(PARTIAL);
      }
    }
  });

  test('каждый источник где-то используется', () => {
    const used = new Set<string>();
    for (const m of MISSILES) {
      m.historySourceIds.forEach((id) => used.add(id));
      if (m.serviceYearSourceId) used.add(m.serviceYearSourceId);
      for (const r of m.ranges) {
        used.add(r.sourceId);
        if (r.check.corroboratedBy) used.add(r.check.corroboratedBy);
      }
    }
    for (const a of AGREEMENTS) a.events.forEach((e) => used.add(e.sourceId));
    for (const f of CATALOG) {
      f.sourceIds.forEach((id) => used.add(id));
      for (const v of f.variants) {
        v.milestones.forEach((m) => used.add(m.sourceId));
        v.operators.forEach((o) => used.add(o.sourceId));
      }
    }
    expect(SOURCES.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([]);
  });

  test('все три категории и несколько стран представлены', () => {
    const cats = new Set(MISSILES.map((m) => m.category));
    expect([...cats].sort()).toEqual(['ballistic', 'cruise', 'sam']);
    expect(new Set(MISSILES.flatMap((m) => m.countries)).size).toBeGreaterThanOrEqual(6);
  });
});

describe('этапы систем и фильтр по году', () => {
  test('разработка, испытание и принятие на вооружение различаются', () => {
    expect(reachedStage('minuteman3', 'development', 1965)).toBe(true);
    expect(reachedStage('minuteman3', 'service', 1969)).toBe(false);
    expect(reachedStage('minuteman3', 'service', 1970)).toBe(true);
    expect(reachedStage('hwasong15', 'test', 2016)).toBe(false);
    expect(reachedStage('hwasong15', 'test', 2017)).toBe(true);
    expect(reachedStage('hwasong15', 'service', 2019)).toBe(false);
    expect(reachedStage('kh55', 'service', 1990)).toBe(false);
  });
  test('более поздняя модификация не считается существовавшей раньше; без записей даты не домысливаются', () => {
    expect(reachedStage('tomahawk-iv', 'service', 2000)).toBe(false);
    expect(reachedStage('atacms-1a', 'development', 2020)).toBe(false);
    for (const [id, list] of Object.entries(MILESTONES)) {
      expect(MISSILES.some((m) => m.id === id)).toBe(true);
      for (const x of list) {
        expect(x.date).toMatch(/^\d{4}(-\d{2})?$/);
        expect(x.check.method).toBe('search-index');
      }
    }
  });
});

describe('каталог техники', () => {
  test('все восемь категорий представлены; идентификаторы уникальны; источники существуют', () => {
    const cats = new Set(CATALOG.map((f) => f.category));
    for (const c of Object.keys(CAT_RU) as CatCategory[]) expect(cats.has(c), c).toBe(true);
    const ids = VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(SOURCES.map((s) => s.id));
    for (const f of CATALOG) {
      for (const id of f.sourceIds) expect(known.has(id), `${f.id}: ${id}`).toBe(true);
      for (const v of f.variants) {
        for (const m of v.milestones) {
          expect(known.has(m.sourceId)).toBe(true);
          expect(m.date).toMatch(/^\d{4}(-\d{2})?$/);
        }
        for (const o of v.operators) {
          expect(known.has(o.sourceId)).toBe(true);
          expect(o.uncertainty.length).toBeGreaterThan(10);
          for (const c of [o.ordered, o.delivered, o.inService]) if (c) expect(known.has(c.sourceId)).toBe(true);
        }
        // Если нет ни этапов, ни эксплуатантов — это объяснено
        if (!v.milestones.length || !v.operators.length) expect((v.note ?? '') + v.operators.map((o) => o.uncertainty).join('') + (v.missileRef ?? ''), v.id).not.toBe('');
      }
    }
  });

  test('исторический термин «самолёт-снаряд» сохранён', () => {
    expect(CATALOG.some((f) => f.historicalTerm === 'самолёт-снаряд')).toBe(true);
  });

  test('наличие в каталоге не означает наличия у страны: эксплуатация только по подтверждённому периоду', () => {
    expect(availability('viggen', 'gw:380', '1985-06-01').status).toBe('confirmed');
    expect(availability('viggen', 'gw:380', '1970-06-01').status).toBe('unconfirmed');
    expect(availability('viggen', 'gw:380', '2010-06-01').status).toBe('unconfirmed');
    expect(availability('f16a', 'gw:365', '1985-06-01').status).toBe('unconfirmed');
    expect(availability('mig21pf', 'gw:365', '1975-06-01').status).toBe('unconfirmed');
    expect(availability('vulcan', 'gw:200', '1984-03-15').status).toBe('confirmed');
    expect(availability('vulcan', 'gw:200', '1984-04-02').status).toBe('unconfirmed');
    // Начало известно, окончание — нет: на поздние даты источник не подтверждает
    expect(availability('f15a', 'gw:2', '2020-01-01').text).toMatch(/не подтверждает/);
    expect(availability('nope', 'gw:2', '2020-01-01').status).toBe('unknown');
    expect(availability('viggen', null, '1985-01-01').status).toBe('unconfirmed');
  });

  test('заказано, поставлено и в строю хранятся раздельно; неизвестное — null', () => {
    for (const v of VARIANTS)
      for (const o of v.operators) {
        expect('ordered' in o && 'delivered' in o && 'inService' in o).toBe(true);
        if (o.inService) expect(o.inService.note ?? o.inService.asOf).toBeTruthy();
      }
  });

  test('фильтр по периоду различает разработку, испытание и службу', () => {
    const f16 = VARIANTS.find((v) => v.id === 'f16a')!;
    expect(reachedBy(f16, 'test', 1976)).toBe(true);
    expect(reachedBy(f16, 'service', 1978)).toBe(false);
    expect(reachedBy(f16, 'service', 1979)).toBe(true);
    const mq9 = VARIANTS.find((v) => v.id === 'mq9')!;
    expect(reachedBy(mq9, 'development', 2030)).toBe(false);
  });

  test('таблица покрытия считает все модификации', () => {
    const t = coverageTable();
    let n = 0;
    for (const c of t.cats) for (const d of t.decades) n += t.byCat[c][d].variants;
    for (const c of t.cats) n += t.undated[c];
    expect(n).toBe(VARIANTS.length);
  });
});
