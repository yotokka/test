import { describe, expect, test } from 'vitest';
import * as topojson from 'topojson-client';
import { geoArea, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeometryCollection } from 'topojson-specification';
import { stepPlayback } from '../../src/history/playback';
import { addCalendar, advance, dayOf, dayStartMs, fmtWithPrecision, isoOf, msToDay, type SpeedId } from '../../src/history/time';
import { TREATIES } from '../../src/history/treaties';
import type { HistEvent, RecordProps } from '../../src/history/types';
import { loadEngine } from './historyData';

const H = loadEngine();
const D = (iso: string) => dayOf(iso);
const exists = (id: string, iso: string) => H.entityView(id, D(iso))!.exists;
const capital = (id: string, iso: string) => H.entityView(id, D(iso))!.record?.cap;
const eventOn = (iso: string, pred: (e: HistEvent) => boolean = () => true) => H.events.filter((e) => e.date === iso && pred(e));

/**
 * Контрольные переходы. Даты установлены по записям наборов (номер записи fid в CShapes 2.0 GW,
 * строка gwcode в списке GW) до написания тестов — см. docs/history/coverage.md.
 */
describe('контрольные переходы', () => {
  test('объединение Германии: CShapes fid 89/91 до 1990-10-02, fid 88 с 1990-10-03; GW: ГДР до 1990-10-02', () => {
    expect(exists('gw:265', '1990-10-02')).toBe(true);
    expect(capital('gw:260', '1990-10-02')).toBe('Bonn');
    expect(exists('gw:265', '1990-10-03')).toBe(false);
    expect(capital('gw:260', '1990-10-03')).toBe('Berlin');
    expect(exists('gw:265', '2000-01-01')).toBe(false);
    const ev = eventOn('1990-10-03', (e) => e.dataset === 'cshapes-gw')[0];
    expect(ev.changes.map((c) => c.kind)).toEqual(expect.arrayContaining(['disappear', 'capital', 'geometry']));
    expect(H.entities.get('gw:260')!.predecessors.map((p) => p.id)).toContain('gw:265');
    expect(ev.verification).toBe('dataset-import');
  });

  test('распад СССР: даты CShapes и списка GW расходятся и показаны как расхождение', () => {
    // CShapes: Украина с 1991-12-26; список GW: с 1991-12-01
    expect(exists('gw:369', '1991-11-30')).toBe(false);
    const mid = H.entityView('gw:369', D('1991-12-10'))!;
    expect(mid.inGw).toBe(true);
    expect(mid.record).toBeNull();
    expect(H.entityView('gw:369', D('1991-12-26'))!.record).not.toBeNull();
    const gwEvent = eventOn('1991-12-01', (e) => e.dataset === 'gw-states' && e.entities.includes('gw:369'))[0];
    expect(gwEvent.verification).toBe('conflicting');
    expect(gwEvent.conflict?.otherDate).toBe('1991-12-26');
    // Прибалтика: оба набора — 1991-09-06
    for (const id of ['gw:366', 'gw:367', 'gw:368']) {
      expect(exists(id, '1991-09-05')).toBe(false);
      expect(exists(id, '1991-09-06')).toBe(true);
    }
    // Оба набора ведут СССР и Россию под кодом 365 одним составным названием — атлас его не переименовывает
    expect(H.entityName('gw:365', D('1985-01-01')).source).toBe('Russia (Soviet Union)');
    expect(H.entityName('gw:365', D('1995-01-01')).source).toBe('Russia (Soviet Union)');
    expect(H.entities.get('gw:369')!.predecessors.map((p) => p.id)).toContain('gw:365');
  });

  test('распад Чехословакии: 1992-12-31 → 1993-01-01, наборы согласованы', () => {
    expect(exists('gw:315', '1992-12-31')).toBe(true);
    expect(exists('gw:316', '1992-12-31')).toBe(false);
    expect(exists('gw:317', '1992-12-31')).toBe(false);
    expect(exists('gw:315', '1993-01-01')).toBe(false);
    expect(exists('gw:316', '1993-01-01')).toBe(true);
    expect(exists('gw:317', '1993-01-01')).toBe(true);
    expect(eventOn('1993-01-01').every((e) => e.verification === 'dataset-import')).toBe(true);
    expect(H.entities.get('gw:315')!.successors.map((s) => s.id).sort()).toEqual(['gw:316', 'gw:317']);
  });

  test('объединение Йемена: НДРЙ до 1990-05-21, новая геометрия ЙАР с 1990-05-22', () => {
    expect(exists('gw:680', '1990-05-21')).toBe(true);
    expect(exists('gw:680', '1990-05-22')).toBe(false);
    expect(H.entityView('gw:678', D('1990-05-21'))!.record!.fid).not.toBe(H.entityView('gw:678', D('1990-05-22'))!.record!.fid);
    expect(H.entities.get('gw:678')!.predecessors.map((p) => p.id)).toContain('gw:680');
  });

  test('независимость Южного Судана: с 2011-07-09; геометрия Судана меняется в тот же день', () => {
    expect(exists('gw:626', '2011-07-08')).toBe(false);
    expect(exists('gw:626', '2011-07-09')).toBe(true);
    expect(H.entityView('gw:625', D('2011-07-08'))!.record!.fid).not.toBe(H.entityView('gw:625', D('2011-07-09'))!.record!.fid);
    expect(H.entities.get('gw:626')!.predecessors.map((p) => p.id)).toEqual(['gw:625']);
  });

  test('современные государства отсутствуют до своего появления', () => {
    const cases: [string, string][] = [
      ['gw:369', '1991-11-30'],
      ['gw:626', '2011-07-08'],
      ['gw:347', '2008-02-16'],
      ['gw:316', '1992-12-31'],
      ['gw:860', '2002-05-19'],
      ['gw:531', '1993-05-23'],
      ['gw:771', '1971-12-15'],
    ];
    for (const [id, iso] of cases) expect(exists(id, iso), `${id} ${iso}`).toBe(false);
    const in1970 = new Set(H.activeEntities(D('1970-01-01')).map((e) => e.id));
    for (const id of ['gw:369', 'gw:626', 'gw:347', 'gw:316', 'gw:317', 'gw:366', 'gw:705']) expect(in1970.has(id)).toBe(false);
  });
});

describe('воспроизводимость состояния', () => {
  const same = (a: ReturnType<typeof H.stateAt>, b: ReturnType<typeof H.stateAt>) => {
    expect([...a.recs].sort()).toEqual([...b.recs].sort());
    expect([...a.gw].sort()).toEqual([...b.gw].sort());
    expect([...a.eps].sort()).toEqual([...b.eps].sort());
    expect([...a.leaders].sort()).toEqual([...b.leaders].sort());
    expect([...a.treaties].sort()).toEqual([...b.treaties].sort());
  };

  test('события + снимки дают то же, что расчёт по интервалам (каждые 97 дней)', () => {
    for (let d = H.start; d <= H.end; d += 97) same(H.stateAt(d), H.stateByIntervals(d));
  });

  test('перемотка назад полностью восстанавливает прежние границы и отношения', () => {
    const before = H.stateAt(D('1990-10-02'));
    const snapshot = { recs: [...before.recs], gw: [...before.gw] };
    H.stateAt(D('2011-07-09'));
    H.stateAt(D('1995-01-01'));
    const again = H.stateAt(D('1990-10-02'));
    expect([...again.recs]).toEqual(snapshot.recs);
    expect([...again.gw]).toEqual(snapshot.gw);
    same(again, H.stateByIntervals(D('1990-10-02')));
  });

  test('одинаковое конечное состояние и одинаковые пройденные события при разных скоростях', () => {
    const target = D('1994-06-15');
    const results: { day: number; ids: string[] }[] = [];
    const runs: [SpeedId, number][] = [
      ['day', 16],
      ['day', 1000],
      ['month', 50],
      ['month', 7000],
      ['year', 16],
      ['year', 400],
    ];
    for (const [speed, dt] of runs) {
      let ms = dayStartMs(D('1989-01-01'));
      const seen: string[] = [];
      for (let guard = 0; guard < 1e6; guard++) {
        const r = stepPlayback(H, { ms, speed, dir: 1, stopAtKey: false }, dt, () => false);
        const clampDay = Math.min(msToDay(r.ms), target);
        const crossed = H.eventsBetween(msToDay(ms), clampDay);
        seen.push(...crossed.map((e) => e.id));
        ms = clampDay === target ? dayStartMs(target) : r.ms;
        if (clampDay === target) break;
      }
      results.push({ day: msToDay(ms), ids: seen });
    }
    for (const r of results) {
      expect(r.day).toBe(target);
      expect(r.ids).toEqual(results[0].ids);
    }
    expect(results[0].ids).toEqual(H.eventsBetween(D('1989-01-01'), target).map((e) => e.id));
  });

  test('крупный скачок не пропускает промежуточные изменения', () => {
    const r = stepPlayback(H, { ms: dayStartMs(D('1990-01-01')), speed: 'year', dir: 1, stopAtKey: false }, 3000, () => false);
    const ids = r.crossed.map((e) => e.id);
    for (const d of ['1990-05-22', '1990-10-03', '1991-12-26', '1992-04-27']) expect(ids.some((id) => id === `cs-${d}`)).toBe(true);
  });

  test('остановка на ключевом событии вперёд и назад без зацикливания', () => {
    const key = (e: HistEvent) => e.dataset === 'cshapes-gw';
    let st = { ms: dayStartMs(D('1990-06-01')), speed: 'year' as SpeedId, dir: 1 as const, stopAtKey: true };
    const f = stepPlayback(H, st, 1000, key);
    expect(f.stoppedAt?.date).toBe('1990-10-03');
    expect(msToDay(f.ms)).toBe(D('1990-10-03'));
    const back = { ...st, ms: f.ms, dir: -1 as const };
    const b1 = stepPlayback(H, back, 1000, key);
    expect(b1.stoppedAt?.date).toBe('1990-05-22');
    const b2 = stepPlayback(H, { ...back, ms: b1.ms }, 1000, key);
    expect(b2.stoppedAt?.date).not.toBe('1990-05-22');
    st = { ...st, ms: dayStartMs(H.end) };
    expect(stepPlayback(H, st, 1000, key).hitBound).toBe(true);
  });
});

describe('календарь и точность дат', () => {
  test('месяцы и годы — календарные периоды', () => {
    expect(isoOf(addCalendar(D('2020-01-31'), 'month', 1))).toBe('2020-02-29');
    expect(isoOf(addCalendar(D('2019-01-31'), 'month', 1))).toBe('2019-02-28');
    expect(isoOf(addCalendar(D('1992-02-29'), 'year', 1))).toBe('1993-02-28');
    expect(isoOf(addCalendar(D('1990-10-03'), 'day', -1))).toBe('1990-10-02');
    // «1 месяц/сек»: одна секунда переводит с 1 февраля на 1 марта (28 дней), с 1 марта — на 1 апреля (31 день)
    expect(isoOf(msToDay(advance(dayStartMs(D('1990-02-01')), 1000, 'month', 1)))).toBe('1990-03-01');
    expect(isoOf(msToDay(advance(dayStartMs(D('1990-03-01')), 1000, 'month', 1)))).toBe('1990-04-01');
    expect(isoOf(msToDay(advance(dayStartMs(D('1990-01-01')), 1000, 'year', 1)))).toBe('1991-01-01');
    expect(advance(0, 1000, 'realtime', 1)).toBe(1000);
  });

  test('точность показывается как в источнике', () => {
    expect(fmtWithPrecision('1987-04-01', 'month').text).toBe('апрель 1987 г.');
    expect(fmtWithPrecision('1990-10-03', 'day').note).toContain('время суток не установлено');
    expect(fmtWithPrecision('1990-10-03', 'ucdp-3').note).toContain('код точности 3');
  });
});

describe('договоры', () => {
  test('между подписанием и вступлением в силу статус «подписан», не «действует»', () => {
    const inf = (iso: string) => H.stateAt(D(iso)).treaties.get('inf');
    expect(inf('1987-12-07')).toBeUndefined();
    expect(inf('1988-01-15')).toBe('signed');
    expect(inf('1988-06-01')).toBe('in-force');
    expect(inf('2019-08-02')).toBe('terminated');
    expect(H.stateAt(D('1980-01-01')).treaties.get('warsaw')).toBe('signed-eif-unknown');
    expect(H.stateAt(D('1972-08-01')).treaties.get('abm')).toBe('signed');
  });

  test('договоры с непроверенными датами помечены «требует проверки»', () => {
    expect(H.events.filter((e) => e.category === 'treaty').every((e) => e.verification === 'needs-check')).toBe(true);
    expect(TREATIES.every((t) => t.verification === 'needs-check')).toBe(true);
  });
});

describe('целостность ссылок и данных', () => {
  test('нет ссылок на несуществующие исторические субъекты и записи', () => {
    const ids = new Set(H.entities.keys());
    for (const e of H.events) {
      for (const id of e.entities) expect(ids.has(id), `${e.id} → ${id}`).toBe(true);
      for (const op of e.ops) if (op.op === 'rec+' || op.op === 'rec-') expect(H.records.has(op.fid)).toBe(true);
      expect(e.sources.length).toBeGreaterThan(0);
      expect(e.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const c of H.episodes.values()) for (const id of [...c.sideA, ...c.sideB]) expect(ids.has(id)).toBe(true);
    for (const l of H.leaderById.values()) expect(ids.has(l.entity)).toBe(true);
    for (const t of TREATIES) for (const id of t.partyEntities) expect(ids.has(id)).toBe(true);
    for (const e of H.entities.values()) for (const p of [...e.predecessors, ...e.successors]) expect(ids.has(p.id)).toBe(true);
  });

  test('события одного дня имеют документированный технический порядок', () => {
    for (let i = 1; i < H.events.length; i++) {
      const a = H.events[i - 1];
      const b = H.events[i];
      expect(a.date <= b.date).toBe(true);
      if (a.date === b.date) expect(a.tech <= b.tech).toBe(true);
      expect(b.order).toBe(i);
    }
  });

  test('упрощённая геометрия не теряет островов и не выворачивает кольца', () => {
    const coll = H.data.geo.objects.records as GeometryCollection<RecordProps>;
    for (const g of coll.geometries) {
      const f = topojson.feature(H.data.geo, g) as unknown as { geometry: { type: string; coordinates: number[][][][] | number[][][] } };
      const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
      const rings = polys.flat();
      expect(rings.length, `fid ${(g.properties as RecordProps).fid}`).toBe((g.properties as RecordProps).rings);
      for (const r of rings) expect(r.length).toBeGreaterThanOrEqual(4);
      for (const p of polys) expect(geoArea({ type: 'Polygon', coordinates: p })).toBeLessThan(2 * Math.PI);
    }
  });

  test('соседние государства делят общие дуги границы', () => {
    const coll = H.data.geo.objects.records as GeometryCollection<RecordProps>;
    const idx = (fid: number) => coll.geometries.findIndex((g) => (g.properties as RecordProps).fid === fid);
    const nb = topojson.neighbors(coll.geometries as never);
    expect(nb[idx(115)]).toContain(idx(116)); // Чехия — Словакия
    expect(nb[idx(89)]).toContain(idx(91)); // ФРГ (до 1990) — ГДР
  });

  test('линия перемены дат: проекция не даёт «полос» через всю карту', () => {
    const projection = geoNaturalEarth1().fitSize([1000, 520], { type: 'Sphere' });
    const path = geoPath(projection);
    const coll = H.data.geo.objects.records as GeometryCollection<RecordProps>;
    for (const fid of [181, 182]) {
      const g = coll.geometries.find((x) => (x.properties as RecordProps).fid === fid)!;
      const d = path(topojson.feature(H.data.geo, g) as never)!;
      for (const sub of d.split('M').slice(1)) {
        const pts = sub.replace(/Z/g, '').split('L').map((p) => p.split(',').map(Number));
        for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThan(400);
      }
    }
  });
});

describe('пробелы и спорные данные видимы', () => {
  test('покрытие наборов указано, а за пределами — отмечено', () => {
    expect(isoOf(H.mapEnd)).toBe('2019-12-31');
    expect(H.entityView('gw:2', D('2020-06-01'))!.mapCovered).toBe(false);
    expect(H.entityView('gw:2', D('2016-06-01'))!.leadersCovered).toBe(false);
    const rows = H.coverage();
    for (const id of ['alliances', 'orgs', 'diplomacy', 'renames', 'flags', 'control']) expect(rows.find((r) => r.id === id)!.included).toBe(false);
  });

  test('спорные участки активны только в свои даты и с атрибуцией позиции', () => {
    expect(H.disputedAt(D('1974-01-01'))).toHaveLength(0);
    expect(H.disputedAt(D('1980-01-01')).map((d) => d.id).sort()).toEqual(['etim', 'wsah']);
    expect(H.disputedAt(D('2015-01-01')).map((d) => d.id).sort()).toEqual(['crim', 'wsah']);
    for (const d of H.data.disputed) {
      expect(d.positions.length).toBeGreaterThan(0);
      expect(d.status).toMatch(/не установлен/);
    }
  });

  test('микрогосударства и субъекты без геометрии видны, но помечены', () => {
    const v = H.entityView('gw:396', D('2010-01-01'))!;
    expect(v.inGw).toBe(true);
    expect(v.record).toBeNull();
    expect(H.events.find((e) => e.id === 'gw-enter-396-2008-08-26')!.noGeometry).toBe(true);
  });
});

describe('конфликты по годам', () => {
  test('участники эпизода берутся из записи соответствующего года, а не из всего эпизода', () => {
    const ep = H.episodes.get([...H.episodes.keys()].find((k) => k.startsWith('ucdp-333-'))!)!;
    const all = new Set([...ep.sideA, ...ep.sideB]);
    const in1990 = H.sidesOn(ep, D('1990-06-01'));
    expect(all.size).toBeGreaterThan(new Set([...in1990.a, ...in1990.b]).size);
    // ФРГ не участвует в эпизоде в 1990 г.
    expect(H.entityView('gw:260', D('1990-06-01'))!.conflicts.some((c) => c.ep.id === ep.id)).toBe(false);
  });
});
