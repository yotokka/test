import { describe, expect, test } from 'vitest';
import { MISSILES } from '../../src/data/reference/missiles';
import { AGREEMENTS } from '../../src/data/reference/agreements';
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
    expect(SOURCES.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([]);
  });

  test('все три категории и несколько стран представлены', () => {
    const cats = new Set(MISSILES.map((m) => m.category));
    expect([...cats].sort()).toEqual(['ballistic', 'cruise', 'sam']);
    expect(new Set(MISSILES.flatMap((m) => m.countries)).size).toBeGreaterThanOrEqual(6);
  });
});
