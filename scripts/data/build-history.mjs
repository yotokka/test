// Сборка исторической базы из загруженных наборов (.cache/raw) в src/history/data.
// Запуск: node scripts/data/fetch.mjs && python3 scripts/data/rda_to_json.py && node scripts/data/build-history.mjs
//
// Что делает:
//  1. CShapes 2.0 (вариант Gleditsch & Ward, с зависимыми территориями): берёт записи, действующие
//     хотя бы один день в 1970-01-01…2019-12-31; выравнивает обход колец для сферической проекции;
//     строит общую топологию (общие границы соседей — общие дуги), упрощает её, не теряя островов.
//  2. Спорные участки: выделяет по геометрии самого набора три участка, где CShapes меняет
//     принадлежность территории (Западная Сахара, Восточный Тимор, Крым).
//  3. Субъекты: устойчивые идентификаторы gw:<код> (есть в списке GW) и cs:<код> (только в CShapes);
//     предшественники/преемники — по пересечению геометрий до и после изменения.
//  4. События: изменения карты (CShapes), список независимых государств (GW), вооружённые
//     конфликты (UCDP ACD), смены руководителей (Archigos). Для каждого — источник и место в наборе.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as topojsonClient from 'topojson-client';
import * as topojsonServer from 'topojson-server';
import * as topojsonSimplify from 'topojson-simplify';
import { geoArea } from 'd3-geo';
import polygonClipping from 'polygon-clipping';

const RAW = '.cache/raw';
const OUT = 'src/history/data';
mkdirSync(OUT, { recursive: true });

const START = '1970-01-01';
const CSHAPES_END = '2019-12-31';
const IMPORTED_AT = process.env.IMPORTED_AT ?? new Date().toISOString().slice(0, 10);
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
const fetchLog = readJSON(`${RAW}/fetch-log.json`);

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const minDate = (a, b) => (a < b ? a : b);

/* ───────────────────────── 1. CShapes ───────────────────────── */

const csTopo = readJSON(`${RAW}/cshapes__inst__extdata__cshapes_2_gw.topojson`);
const allGeoms = csTopo.objects.cshapes_2_gw.geometries;
const inRange = allGeoms.filter((g) => g.properties.end >= START && g.properties.start <= CSHAPES_END);

function rewindPolygon(poly) {
  // d3-geo ожидает внешние кольца по часовой стрелке (площадь < 2π); в GeoJSON RFC 7946 — наоборот.
  return geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly;
}
function rewind(geom) {
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: rewindPolygon(geom.coordinates) };
  return { type: 'MultiPolygon', coordinates: geom.coordinates.map(rewindPolygon) };
}
const polys = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates);

const records = inRange.map((g) => {
  const f = topojsonClient.feature(csTopo, g);
  const p = g.properties;
  return {
    type: 'Feature',
    id: p.fid,
    properties: {
      fid: p.fid,
      code: p.gwcode,
      name: p.country_name,
      start: p.start,
      end: p.end,
      status: p.status,
      owner: Number(p.owner),
      cap: p.capname,
      capLon: p.caplong,
      capLat: p.caplat,
      bdef: p.b_def,
    },
    geometry: rewind(f.geometry),
  };
});
const recByFid = new Map(records.map((r) => [r.properties.fid, r]));
const ringCountRaw = Object.fromEntries(records.map((r) => [r.properties.fid, polys(r.geometry).reduce((s, p) => s + p.length, 0)]));
// Исходное число колец сохраняется в свойствах — по нему тесты проверяют, что острова не потеряны.
for (const r of records) r.properties.rings = ringCountRaw[r.properties.fid];

/* ───────────────────────── 2. Спорные участки ───────────────────────── */

// Для polygon-clipping нужны планарные кольца против часовой стрелки — порядок исправляет сама библиотека.
const toPC = (geom) => polys(geom);
const find = (code, pred) => records.find((r) => r.properties.code === code && pred(r.properties));

const spanishSahara = find(609, (p) => p.status === 'colony');
const eastTimorColony = find(860, (p) => p.status === 'colony');
const ukraineBefore = find(369, (p) => p.end === '2014-03-17');
const ukraineAfter = find(369, (p) => p.start === '2014-03-18');
for (const [n, v] of Object.entries({ spanishSahara, eastTimorColony, ukraineBefore, ukraineAfter })) if (!v) throw new Error(`Не найдена запись: ${n}`);

const crimeaCoords = polygonClipping.difference(toPC(ukraineBefore.geometry), toPC(ukraineAfter.geometry));
// Убираем «щепки» от несовпадения вершин двух версий границы: оставляем части площадью > 100 км².
const EARTH_KM2 = 6371.0088 ** 2;
const crimeaParts = crimeaCoords
  .map((poly) => rewindPolygon(poly))
  .filter((poly) => geoArea({ type: 'Polygon', coordinates: poly }) * EARTH_KM2 > 100);
const crimeaGeom = { type: 'MultiPolygon', coordinates: crimeaParts };
const km2 = (g) => Math.round(geoArea(g) * EARTH_KM2);

const DISPUTED = [
  {
    id: 'wsah',
    ru: 'Западная Сахара',
    from: '1975-11-14',
    to: CSHAPES_END,
    toKnown: false,
    geometrySource: `Контур записи «Spanish Sahara» (fid ${spanishSahara.properties.fid}, до 1975-11-13) того же набора`,
    positions: [
      { date: '1975-11-14', text: 'CShapes 2.0 делит территорию между Марокко и Мавританией (записи Morocco и Mauritania с 1975-11-14).', source: 'cshapes-gw' },
      { date: '1979-08-05', text: 'CShapes 2.0 относит всю территорию к Марокко; в журнале изменений пакета это решение кодирования указано отдельно (версия 0.2-9).', source: 'cshapes-changelog' },
    ],
    status: 'Международный статус территории не установлен проверенным источником в этой сборке. Кодирование набора не следует читать как признанную границу.',
    geometry: spanishSahara.geometry,
  },
  {
    id: 'etim',
    ru: 'Восточный Тимор',
    from: '1976-07-17',
    to: '2002-05-19',
    toKnown: true,
    geometrySource: `Контур записи «East Timor» со статусом colony (fid ${eastTimorColony.properties.fid}, до 1976-07-16) того же набора`,
    positions: [
      { date: '1976-07-17', text: 'CShapes 2.0 включает территорию в запись Indonesia.', source: 'cshapes-gw' },
      { date: '2002-05-20', text: 'CShapes 2.0 и список GW начинают запись независимого государства East Timor.', source: 'cshapes-gw' },
    ],
    status: 'Международный статус территории в 1976–2002 гг. не установлен проверенным источником в этой сборке.',
    geometry: eastTimorColony.geometry,
  },
  {
    id: 'crim',
    ru: 'Крым',
    from: '2014-03-18',
    to: CSHAPES_END,
    toKnown: false,
    geometrySource: `Разность записей Ukraine: fid ${ukraineBefore.properties.fid} (до 2014-03-17) минус fid ${ukraineAfter.properties.fid} (с 2014-03-18); площадь участка ≈ ${km2(crimeaGeom).toLocaleString('ru-RU')} км² по упрощённой геометрии`,
    positions: [
      { date: '2014-03-18', text: 'CShapes 2.0 переносит участок из записи Ukraine в запись Russia (Soviet Union).', source: 'cshapes-gw' },
    ],
    status: 'Международный статус территории не установлен проверенным источником в этой сборке. Кодирование набора не следует читать как признанную границу.',
    geometry: crimeaGeom,
  },
].map((d) => ({ ...d, areaKm2: km2(d.geometry) }));

/* ───────────────────────── Топология и упрощение ───────────────────────── */

let topo = topojsonServer.topology({
  records: { type: 'FeatureCollection', features: records },
  disputed: {
    type: 'FeatureCollection',
    features: DISPUTED.map((d) => ({ type: 'Feature', id: d.id, properties: { id: d.id }, geometry: d.geometry })),
  },
});
const presimplified = topojsonSimplify.presimplify(topo, topojsonSimplify.sphericalTriangleArea);
// Защита островов: у каждой дуги сохраняем внутреннюю точку; у замкнутых дуг — крайние точки
// (min/max по долготе и широте). Крайние точки идут в порядке обхода и сохраняют ориентацию кольца.
let protectedPts = 0;
const protect = (arc, i) => {
  if (i > 0 && i < arc.length - 1 && arc[i][2] !== Infinity) {
    arc[i][2] = Infinity;
    protectedPts++;
  }
};
for (const arc of presimplified.arcs) {
  const n = arc.length;
  if (n < 3) continue;
  const closed = arc[0][0] === arc[n - 1][0] && arc[0][1] === arc[n - 1][1];
  if (!closed) {
    protect(arc, Math.floor(n / 2));
    continue;
  }
  let [a, b, c, d] = [0, 0, 0, 0];
  arc.forEach((pt, i) => {
    if (pt[0] < arc[a][0]) a = i;
    if (pt[0] > arc[b][0]) b = i;
    if (pt[1] < arc[c][1]) c = i;
    if (pt[1] > arc[d][1]) d = i;
  });
  for (const i of new Set([a, b, c, d])) protect(arc, i);
}
const SIMPLIFY_QUANTILE = 0.12;
const minWeight = topojsonSimplify.quantile(presimplified, SIMPLIFY_QUANTILE);
const cloneTopo = (t) => ({ ...t, arcs: t.arcs.map((arc) => arc.map((pt) => pt.slice())) });
const ringsOf = (g) => (g.type === 'Polygon' ? g.arcs.map((r) => [r]) : g.type === 'MultiPolygon' ? g.arcs : []);

// Итерации: если кольцо после упрощения вырождается или меняет ориентацию, его дуги сохраняются полностью.
let refined = 0;
for (let iter = 0; iter < 6; iter++) {
  const t = topojsonSimplify.simplify(cloneTopo(presimplified), minWeight);
  const bad = new Set();
  for (const obj of Object.values(t.objects)) {
    for (const g of obj.geometries) {
      const f = topojsonClient.feature(t, g);
      const fp = polys(f.geometry);
      ringsOf(g).forEach((polyArcs, pi) => {
        polyArcs.forEach((ringArcs, ri) => {
          const ring = fp[pi]?.[ri];
          const tooSmall = !ring || ring.length < 4;
          const flipped = ri === 0 && ring && geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI;
          if (tooSmall || flipped) for (const a of ringArcs) bad.add(a < 0 ? ~a : a);
        });
      });
    }
  }
  if (bad.size === 0) {
    topo = t;
    break;
  }
  for (const i of bad) for (const pt of presimplified.arcs[i]) pt[2] = Infinity;
  refined += bad.size;
  if (iter === 5) throw new Error('Не удалось упростить без потери колец');
}
topo = topojsonClient.quantize(topo, 1e5);

// Проверка: ни одно кольцо не потеряно и не выродилось, внешние кольца не вывернуты
const simplified = topojsonClient.feature(topo, topo.objects.records).features;
for (const f of simplified) {
  const rings = polys(f.geometry).flat();
  if (rings.length !== ringCountRaw[f.properties.fid]) throw new Error(`Потеряно кольцо в записи ${f.properties.fid}`);
  for (const r of rings) if (r.length < 4) throw new Error(`Вырожденное кольцо в записи ${f.properties.fid}`);
  for (const p of polys(f.geometry)) if (geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI) throw new Error(`Неверный обход в записи ${f.properties.fid}`);
}
const geoText = JSON.stringify(topo);
writeFileSync(`${OUT}/geo.topo.json`, geoText);

// Физическая подложка: Natural Earth 1:110m land (через npm world-atlas 2.0.2)
const land = readJSON('node_modules/world-atlas/land-110m.json');
writeFileSync(`${OUT}/land.topo.json`, JSON.stringify(land));

/* ───────────────────────── 3. Субъекты ───────────────────────── */

const gwList = readJSON(`${RAW}/gwstates.json`).map((g) => ({ ...g, end: g.end === '9999-12-31' ? null : g.end }));
const gwByCode = new Map();
for (const g of gwList) (gwByCode.get(g.gwcode) ?? gwByCode.set(g.gwcode, []).get(g.gwcode)).push(g);
const entityId = (code) => (gwByCode.has(code) ? `gw:${code}` : `cs:${code}`);

const entities = new Map();
function ensureEntity(code) {
  const id = entityId(code);
  if (!entities.has(id)) entities.set(id, { id, code, names: [], records: [], gw: [], predecessors: [], successors: [] });
  return entities.get(id);
}
for (const r of records.map((x) => x.properties).sort((a, b) => a.start.localeCompare(b.start))) {
  const e = ensureEntity(r.code);
  e.records.push(r.fid);
  const last = e.names.at(-1);
  if (last && last.name === r.name) last.to = r.end;
  else e.names.push({ name: r.name, from: r.start, to: r.end, source: 'cshapes-gw' });
}
for (const g of gwList.filter((g) => (g.end ?? '9999') >= START)) {
  const e = ensureEntity(g.gwcode);
  e.gw.push({ from: g.start, to: g.end, microstate: g.microstate, name: g.country_name });
  if (e.names.length === 0) e.names.push({ name: g.country_name, from: g.start, to: g.end, source: 'gw-states' });
}

// Даты изменений карты
const changeDates = new Set();
for (const { properties: p } of records) {
  if (p.start > START) changeDates.add(p.start);
  if (p.end < CSHAPES_END) changeDates.add(addDays(p.end, 1));
}
const sortedChanges = [...changeDates].sort();
const activeOn = (day) => records.filter((r) => r.properties.start <= day && r.properties.end >= day);
// Для расчёта преемственности используется упрощённая геометрия (устойчивее для планарной обрезки).
const simpleByFid = new Map(simplified.map((f) => [f.properties.fid, f.geometry]));
const sg = (r) => simpleByFid.get(r.properties.fid);
const polyBBox = (poly) => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};
const bbHit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
// Площадь пересечения по частям мультиполигона (планарная обрезка в градусах, площадь — сферическая).
const overlapKm2 = (ga, gb) => {
  let sum = 0;
  const pa = polys(ga).map((p) => [p, polyBBox(p)]);
  const pb = polys(gb).map((p) => [p, polyBBox(p)]);
  for (const [a, ba] of pa) {
    for (const [b, bb] of pb) {
      if (!bbHit(ba, bb)) continue;
      try {
        for (const poly of polygonClipping.intersection([a], [b])) sum += geoArea({ type: 'Polygon', coordinates: rewindPolygon(poly) }) * EARTH_KM2;
      } catch (err) {
        console.warn('intersection failed', err.message);
      }
    }
  }
  return sum;
};

function codesOn(day) {
  return new Set(activeOn(day).map((r) => r.properties.code));
}

// Преемственность: новый субъект ← субъекты, чья геометрия до изменения пересекается с его новой геометрией
for (const day of sortedChanges) {
  const before = codesOn(addDays(day, -1));
  const after = activeOn(day);
  for (const r of after) {
    const code = r.properties.code;
    if (before.has(code) || r.properties.start !== day) continue;
    // Ищем покрывавшие эту территорию записи назад, не более чем на 60 дней (пробелы кодирования)
    let preds = [];
    for (let back = 1; back <= 60 && preds.length === 0; back++) {
      const d = addDays(day, -back);
      preds = activeOn(d)
        .filter((o) => o.properties.code !== code)
        .map((o) => ({ o, km2: overlapKm2(sg(o), sg(r)) }))
        .filter((x) => x.km2 > 500)
        .map((x) => ({ code: x.o.properties.code, fid: x.o.properties.fid, km2: Math.round(x.km2), lastDay: d }));
    }
    const e = ensureEntity(code);
    for (const p of preds) {
      const pe = ensureEntity(p.code);
      if (!e.predecessors.some((x) => x.id === pe.id)) e.predecessors.push({ id: pe.id, on: day, overlapKm2: p.km2, method: 'geometry-overlap' });
      if (!pe.successors.some((x) => x.id === e.id)) pe.successors.push({ id: e.id, on: day, overlapKm2: p.km2, method: 'geometry-overlap' });
    }
  }
  // Исчезнувший субъект → его территорию получили
  const afterCodes = new Set(after.map((r) => r.properties.code));
  for (const code of before) {
    if (afterCodes.has(code)) continue;
    const lastRec = records.find((r) => r.properties.code === code && r.properties.end === addDays(day, -1));
    if (!lastRec) continue;
    const pe = ensureEntity(code);
    for (let fwd = 0; fwd <= 60; fwd++) {
      const d = addDays(day, fwd);
      const succ = activeOn(d)
        .map((o) => ({ o, km2: overlapKm2(sg(o), sg(lastRec)) }))
        .filter((x) => x.km2 > 500);
      if (succ.length) {
        for (const s of succ) {
          const se = ensureEntity(s.o.properties.code);
          if (!pe.successors.some((x) => x.id === se.id)) pe.successors.push({ id: se.id, on: d, overlapKm2: Math.round(s.km2), method: 'geometry-overlap' });
          if (!se.predecessors.some((x) => x.id === pe.id)) se.predecessors.push({ id: pe.id, on: d, overlapKm2: Math.round(s.km2), method: 'geometry-overlap' });
        }
        break;
      }
    }
  }
}

/* ───────────────────────── 4. События ───────────────────────── */

const events = [];
// Технический порядок применения событий одного дня (не историческая последовательность):
// 1 геометрия → 2 список GW → 3 начало эпизода конфликта → 4 окончание эпизода → 5 руководители → 6 договоры.
const TECH = { geometry: 1, gw: 2, conflictStart: 3, conflictEnd: 4, leader: 5 };
const src = (id, locator) => ({ id, locator });

// 4a. Изменения карты CShapes
const statusRu = { independent: 'независимое государство', colony: 'колония', protectorate: 'протекторат', mandate: 'подмандатная территория' };
for (const day of sortedChanges) {
  const ended = records.filter((r) => r.properties.end === addDays(day, -1)).map((r) => r.properties);
  const started = records.filter((r) => r.properties.start === day).map((r) => r.properties);
  const codes = [...new Set([...ended, ...started].map((p) => p.code))];
  const changes = [];
  for (const code of codes) {
    const a = ended.find((p) => p.code === code);
    const b = started.find((p) => p.code === code);
    const id = entityId(code);
    if (a && !b) changes.push({ kind: 'disappear', entity: id, text: `запись прекращается (${a.name})` });
    else if (!a && b) changes.push({ kind: 'appear', entity: id, text: `запись начинается (${b.name}, ${statusRu[b.status]})` });
    else {
      if (a.status !== b.status) changes.push({ kind: 'status', entity: id, text: `статус: ${statusRu[a.status]} → ${statusRu[b.status]}` });
      if (a.cap !== b.cap) changes.push({ kind: 'capital', entity: id, text: `столица: ${a.cap} → ${b.cap}` });
      if (a.name !== b.name) changes.push({ kind: 'rename', entity: id, text: `название: ${a.name} → ${b.name}` });
      if (a.owner !== b.owner) changes.push({ kind: 'owner', entity: id, text: `владелец в наборе: ${a.owner} → ${b.owner}` });
      changes.push({ kind: 'geometry', entity: id, text: 'новая версия геометрии' });
    }
  }
  const kinds = new Set(changes.map((c) => c.kind));
  const category = kinds.has('appear') || kinds.has('disappear') || kinds.has('status') ? 'statehood' : kinds.has('capital') ? 'capital' : 'border';
  events.push({
    id: `cs-${day}`,
    date: day,
    precision: 'day',
    category,
    dataset: 'cshapes-gw',
    tech: TECH.geometry,
    entities: codes.map(entityId),
    changes,
    ops: [...ended.map((p) => ({ op: 'rec-', fid: p.fid })), ...started.map((p) => ({ op: 'rec+', fid: p.fid }))],
    sources: [src('cshapes-gw', `cshapes_2_gw.topojson: ${[...ended.map((p) => `fid ${p.fid} end=${p.end}`), ...started.map((p) => `fid ${p.fid} start=${p.start}`)].join('; ')}`)],
    verification: 'dataset-import',
    key: true,
  });
}

// 4b. Список независимых государств GW
for (const g of gwList) {
  const id = entityId(g.gwcode);
  const hasGeom = records.some((r) => r.properties.code === g.gwcode);
  const mk = (kind, day, ops, text) => {
    // Сверка с датами CShapes для того же субъекта
    const csDay = kind === 'enter'
      ? records.find((r) => r.properties.code === g.gwcode && r.properties.status === 'independent' && r.properties.start <= addDays(day, 60) && r.properties.start >= addDays(day, -60) && !records.some((q) => q.properties.code === g.gwcode && q.properties.status === 'independent' && q.properties.end === addDays(r.properties.start, -1)))?.properties.start
      : records.filter((r) => r.properties.code === g.gwcode && r.properties.status === 'independent').map((r) => addDays(r.properties.end, 1)).find((d) => d <= addDays(day, 60) && d >= addDays(day, -60) && d <= CSHAPES_END);
    const conflicting = hasGeom && csDay && csDay !== day;
    events.push({
      id: `gw-${kind}-${g.gwcode}-${day}`,
      date: day,
      precision: 'day',
      category: 'statehood',
      dataset: 'gw-states',
      tech: TECH.gw,
      entities: [id],
      changes: [{ kind: kind === 'enter' ? 'gw-enter' : 'gw-exit', entity: id, text }],
      ops,
      sources: [src('gw-states', `gwstates: gwcode ${g.gwcode}, ${kind === 'enter' ? `start=${g.start}` : `end=${g.end}`}`)],
      verification: conflicting ? 'conflicting' : 'dataset-import',
      conflict: conflicting ? { otherDate: csDay, otherSource: 'cshapes-gw', note: `В геометрии CShapes 2.0 соответствующее изменение датировано ${csDay}.` } : undefined,
      noGeometry: !hasGeom,
      key: true,
    });
  };
  if (g.start >= START) mk('enter', g.start, [{ op: 'gw+', entity: id }], `включается в список независимых государств GW${g.microstate ? ' (как микрогосударство)' : ''}`);
  if (g.end && g.end >= START) mk('exit', addDays(g.end, 1), [{ op: 'gw-', entity: id }], 'исключается из списка независимых государств GW');
}
// Обратная пометка расхождений на событиях CShapes
for (const e of events.filter((x) => x.verification === 'conflicting' && x.dataset === 'gw-states')) {
  const cs = events.find((x) => x.id === `cs-${e.conflict.otherDate}`);
  if (cs) {
    cs.verification = 'conflicting';
    (cs.conflicts ??= []).push({ entity: e.entities[0], otherDate: e.date, otherSource: 'gw-states', note: `В списке GW соответствующее изменение датировано ${e.date}.` });
  }
}

// 4c. UCDP ACD: эпизоды вооружённых конфликтов
const ucdp = readJSON(`${RAW}/ucdp_acd.json`);
const UCDP_END_YEAR = Math.max(...ucdp.map((r) => r.year));
const episodes = new Map();
for (const r of ucdp) {
  const key = `${r.conflict_id}:${r.start_date2}`;
  const ep = episodes.get(key) ?? {
    id: `ucdp-${r.conflict_id}-${r.start_date2}`,
    conflictId: r.conflict_id,
    conflictStart: r.start_date,
    conflictStartPrec: r.start_prec,
    start: r.start_date2,
    startPrec: r.start_prec2,
    end: null,
    type: r.type_of_conflict,
    incompatibility: r.incompatibility,
    sideA: new Set(),
    sideB: new Set(),
    years: {},
  };
  const addSide = (set, v) => v && String(v).split(/[ ,]+/).filter(Boolean).forEach((x) => set.add(Number(x)));
  // Участники записываются по годам наблюдения: состав сторон меняется внутри эпизода.
  const ya = new Set();
  const yb = new Set();
  addSide(ya, r.gwno_a);
  addSide(ya, r.gwno_a_2nd);
  addSide(yb, r.gwno_b);
  addSide(yb, r.gwno_b_2nd);
  ya.forEach((x) => ep.sideA.add(x));
  yb.forEach((x) => ep.sideB.add(x));
  ep.sidesByYear ??= {};
  ep.sidesByYear[r.year] = { a: [...ya], b: [...yb] };
  ep.years[r.year] = r.intensity_level;
  if (r.ep_end === 1 && r.ep_end_date) ep.end = r.ep_end_date;
  episodes.set(key, ep);
}
const conflicts = [];
for (const ep of episodes.values()) {
  const lastYear = Math.max(...Object.keys(ep.years).map(Number));
  if ((ep.end ?? `${lastYear}-12-31`) < START) continue;
  const c = {
    ...ep,
    sideA: [...ep.sideA].map(entityId),
    sideB: [...ep.sideB].map(entityId),
    sidesByYear: Object.fromEntries(Object.entries(ep.sidesByYear).map(([y, v]) => [y, { a: v.a.map(entityId), b: v.b.map(entityId) }])),
    lastYear,
    // Если конец эпизода не записан, он продолжается по последнему году наблюдения — конец неизвестен.
    endKnown: Boolean(ep.end),
    maxIntensity: Math.max(...Object.values(ep.years)),
  };
  conflicts.push(c);
  const typeRu = { interstate: 'межгосударственный', intrastate: 'внутригосударственный', II: 'интернационализированный внутригосударственный', extrasystemic: 'внесистемный' }[c.type] ?? c.type;
  const incRu = { territory: 'территория', government: 'власть', both: 'территория и власть' }[c.incompatibility] ?? c.incompatibility;
  const sidesIn = (iso) => {
    const y = Number(iso.slice(0, 4));
    const rec = c.sidesByYear[y] ?? c.sidesByYear[Math.min(...Object.keys(c.sidesByYear).map(Number).filter((k) => k >= y))] ?? { a: c.sideA, b: c.sideB };
    return [...new Set([...rec.a, ...rec.b])];
  };
  if (c.start >= START) {
    const parties = sidesIn(c.start);
    events.push({
      id: `${c.id}-start`,
      date: c.start,
      precision: `ucdp-${c.startPrec}`,
      category: 'conflict',
      dataset: 'ucdp-acd',
      tech: TECH.conflictStart,
      entities: parties,
      changes: [{ kind: 'conflict-start', entity: parties[0], text: `начало эпизода вооружённого конфликта UCDP №${c.conflictId} (${typeRu}; предмет: ${incRu})` }],
      ops: [{ op: 'ep+', ep: c.id }],
      sources: [src('ucdp-acd', `ucdp_acd: conflict_id ${c.conflictId}, start_date2=${c.start}, start_prec2=${c.startPrec}`)],
      verification: 'dataset-import',
      key: c.maxIntensity === 2 && c.start === c.conflictStart,
      ucdp: { conflictId: c.conflictId, type: c.type, incompatibility: c.incompatibility, maxIntensity: c.maxIntensity },
    });
  }
  if (c.end && c.end >= START) {
    const parties = sidesIn(c.end);
    events.push({
      id: `${c.id}-end`,
      date: c.end,
      precision: 'ucdp-end',
      category: 'conflict',
      dataset: 'ucdp-acd',
      tech: TECH.conflictEnd,
      entities: parties,
      changes: [{ kind: 'conflict-end', entity: parties[0], text: `окончание эпизода вооружённого конфликта UCDP №${c.conflictId}` }],
      ops: [{ op: 'ep-', ep: c.id }],
      sources: [src('ucdp-acd', `ucdp_acd: conflict_id ${c.conflictId}, ep_end_date=${c.end}`)],
      verification: 'dataset-import',
      key: false,
      ucdp: { conflictId: c.conflictId, type: c.type, incompatibility: c.incompatibility, maxIntensity: c.maxIntensity },
    });
  }
}

// 4d. Archigos: руководители
const arch = readJSON(`${RAW}/archigos.json`).filter((l) => l.enddate >= START);
const leaders = arch.map((l) => ({
  id: l.obsid,
  entity: entityId(l.gwcode),
  name: l.leader,
  start: l.startdate,
  end: l.enddate,
  entry: l.entry,
  exit: l.exit,
  exitcode: l.exitcode,
}));
const ARCHIGOS_END = leaders.reduce((m, l) => (l.end > m ? l.end : m), '0000');
const byEntity = new Map();
for (const l of leaders) (byEntity.get(l.entity) ?? byEntity.set(l.entity, []).get(l.entity)).push(l);
for (const [ent, list] of byEntity) {
  list.sort((a, b) => a.start.localeCompare(b.start));
  list.forEach((l, i) => {
    if (l.start < START) return;
    const prev = list[i - 1];
    const irregular = l.entry !== 'Regular' || (prev && prev.exit !== 'Regular' && prev.exit !== 'Still in Office');
    events.push({
      id: `arch-${l.id}`,
      date: l.start,
      precision: 'day',
      category: 'leader',
      dataset: 'archigos',
      tech: TECH.leader,
      entities: [ent],
      changes: [{ kind: 'leader', entity: ent, text: `руководитель: ${prev ? prev.name : '—'} → ${l.name} (приход: ${l.entry}${prev ? `; уход предшественника: ${prev.exit}` : ''})` }],
      ops: [{ op: 'lead', entity: ent, leader: l.id }],
      sources: [src('archigos', `archigos: obsid ${l.id}, startdate=${l.start}`)],
      verification: 'dataset-import',
      key: Boolean(irregular),
    });
  });
}

// Проверка ссылок
const entityIds = new Set(entities.keys());
for (const c of conflicts) for (const id of [...c.sideA, ...c.sideB]) if (!entityIds.has(id)) ensureEntity(Number(id.split(':')[1]));
for (const l of leaders) if (!entityIds.has(l.entity)) ensureEntity(Number(l.entity.split(':')[1]));

events.sort((a, b) => a.date.localeCompare(b.date) || a.tech - b.tech || a.id.localeCompare(b.id));
events.forEach((e, i) => {
  e.order = i;
  e.recordedAt = IMPORTED_AT;
});

/* ───────────────────────── 5. Манифест ───────────────────────── */

const psv = readJSON(`${RAW}/ps_data_version.json`);
const md5 = (f) => fetchLog.files.find((x) => x.file.endsWith(f))?.md5;
const manifest = {
  schema: 1,
  buildId: createHash('sha1').update(geoText + JSON.stringify(events)).digest('hex').slice(0, 12),
  importedAt: IMPORTED_AT,
  fetchedAt: fetchLog.fetchedAt,
  timeline: { start: START },
  datasets: {
    'cshapes-gw': {
      name: 'CShapes 2.0, вариант Gleditsch & Ward, с зависимыми территориями',
      version: '2.0 (R-пакет cshapes 2.0, опубликован на CRAN 2021-06-05)',
      file: 'inst/extdata/cshapes_2_gw.topojson.xz',
      md5: md5('cshapes_2_gw.topojson.xz'),
      coverage: { from: START, to: CSHAPES_END, note: 'Набор покрывает 1886-01-01…2019-12-31; в атлас импортированы записи, действующие с 1970-01-01.' },
      records: records.length,
      simplification: { method: 'Visvalingam (topojson-simplify, сферическая площадь)', quantile: SIMPLIFY_QUANTILE, minWeight, protectedPoints: protectedPts, fullyProtectedArcs: refined, quantization: 1e5 },
    },
    'gw-states': {
      name: 'Список независимых государств Gleditsch & Ward',
      version: `R-пакет states ${readFileSync(`${RAW}/states__DESCRIPTION`, 'utf8').match(/Version: (.+)/)[1]}`,
      md5: md5('gwstates.rda'),
      coverage: { from: START, to: '2025-08-25', note: 'Открытые периоды обозначены в наборе как 9999-12-31. Датой последнего подтверждения принята дата публикации пакета (2025-08-25); дата актуализации самих данных в пакете не указана.' },
      records: gwList.length,
    },
    'ucdp-acd': {
      name: 'UCDP Armed Conflict Dataset (подмножество peacesciencer)',
      version: `25.1 по описанию набора в peacesciencer ${readFileSync(`${RAW}/peacesciencer__DESCRIPTION`, 'utf8').match(/Version: (.+)/)[1]}; таблица версий того же пакета указывает ${psv.find((v) => v.data === 'UCDP Armed Conflicts')?.version} — расхождение внутри пакета; фактический охват по годам — до ${UCDP_END_YEAR}`,
      md5: md5('ucdp_acd.rda'),
      coverage: { from: START, to: `${UCDP_END_YEAR}-12-31`, note: 'Единица наблюдения — конфликт-год. Даты начала и окончания эпизодов даны с кодами точности UCDP; их расшифровка не сверена с кодбуком.' },
      episodes: conflicts.length,
    },
    archigos: {
      name: 'Archigos — политические руководители (подмножество peacesciencer)',
      version: `4.1 (${psv.find((v) => v.data === 'Archigos')?.version})`,
      md5: md5('archigos.rda'),
      coverage: { from: START, to: ARCHIGOS_END, note: 'Дата конца охвата — последняя дата окончания в наборе; «Still in Office» означает «в должности на конец охвата».' },
      leaders: leaders.length,
    },
    'natural-earth-land': {
      name: 'Natural Earth 1:110m land (через npm world-atlas 2.0.2)',
      version: 'Natural Earth 4.1.0; world-atlas 2.0.2 (опубликован в npm 2019-09-05)',
      coverage: { from: null, to: null, note: 'Современная физическая подложка без политических границ; не является реконструкцией береговой линии прошлых лет.' },
    },
  },
  counts: { entities: entities.size, events: events.length, disputed: DISPUTED.length, changeDates: sortedChanges.length },
};

writeFileSync(`${OUT}/entities.json`, JSON.stringify([...entities.values()].sort((a, b) => a.code - b.code)));
writeFileSync(`${OUT}/events.json`, JSON.stringify(events));
writeFileSync(`${OUT}/conflicts.json`, JSON.stringify(conflicts));
writeFileSync(`${OUT}/leaders.json`, JSON.stringify(leaders));
writeFileSync(`${OUT}/disputed.json`, JSON.stringify(DISPUTED.map(({ geometry, ...d }) => d)));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.counts), 'geo bytes', geoText.length, 'buildId', manifest.buildId);
