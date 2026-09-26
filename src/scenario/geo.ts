import { geoContains } from 'd3-geo';
import * as topojson from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import type { HistoryEngine } from '../history/engine';
import type { RecordProps } from '../history/types';
import type { Region } from './types';

/**
 * Плоская условная система координат сценария: километры от точки (lon0, lat0) на сфере радиусом
 * 6371 км (равнопромежуточная проекция). На расстояниях в тысячи км искажения заметны — это игровая
 * плоскость, а не навигационный расчёт.
 */
export const R_KM = 6371.0088;
const RAD = Math.PI / 180;

export type Frame = { lon0: number; lat0: number };

export function kmToLonLat(f: Frame, x: number, y: number): [number, number] {
  const lat = f.lat0 + y / R_KM / RAD;
  const lon = f.lon0 + x / (R_KM * Math.cos(f.lat0 * RAD)) / RAD;
  return [((((lon + 180) % 360) + 360) % 360) - 180, lat];
}

export function lonLatToKm(f: Frame, lon: number, lat: number): { x: number; y: number } {
  let dl = lon - f.lon0;
  if (dl > 180) dl -= 360;
  if (dl < -180) dl += 360;
  return { x: dl * RAD * R_KM * Math.cos(f.lat0 * RAD), y: (lat - f.lat0) * RAD * R_KM };
}

export const REGIONS: Region[] = [
  { id: 'central-europe', label: 'Центральная Европа', bbox: [2, 45, 25, 56] },
  { id: 'europe', label: 'Европа', bbox: [-12, 35, 42, 62] },
  { id: 'baltic', label: 'Балтика', bbox: [8, 53, 32, 62] },
  { id: 'mediterranean', label: 'Средиземноморье', bbox: [-6, 30, 36, 46] },
  { id: 'middle-east', label: 'Ближний Восток', bbox: [26, 12, 62, 42] },
  { id: 'south-asia', label: 'Южная Азия', bbox: [60, 5, 98, 37] },
  { id: 'east-asia', label: 'Восточная Азия', bbox: [100, 20, 146, 50] },
  { id: 'north-atlantic', label: 'Северная Атлантика', bbox: [-60, 42, 6, 66] },
  { id: 'caribbean', label: 'Карибский бассейн', bbox: [-92, 8, -58, 28] },
  { id: 'horn-of-africa', label: 'Африканский Рог', bbox: [30, -5, 56, 18] },
];

export const regionCenter = (r: Region): Frame => ({ lon0: (r.bbox[0] + r.bbox[2]) / 2, lat0: (r.bbox[1] + r.bbox[3]) / 2 });

/** Размер области в км (для масштаба и проверок). */
export function regionKm(r: Region, f: Frame) {
  const a = lonLatToKm(f, r.bbox[0], r.bbox[1]);
  const b = lonLatToKm(f, r.bbox[2], r.bbox[3]);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

const featCache = new WeakMap<HistoryEngine, Map<number, GeoJSON.Feature>>();
function features(engine: HistoryEngine) {
  let m = featCache.get(engine);
  if (m) return m;
  m = new Map();
  const coll = engine.data.geo.objects.records as GeometryCollection<RecordProps>;
  for (const g of coll.geometries) m.set((g.properties as RecordProps).fid, topojson.feature(engine.data.geo, g) as unknown as GeoJSON.Feature);
  featCache.set(engine, m);
  return m;
}

/** Запись CShapes, содержащая точку, среди активных записей. */
export function recordAt(engine: HistoryEngine, recs: Iterable<number>, lon: number, lat: number): number | null {
  const fs = features(engine);
  for (const fid of recs) {
    const f = fs.get(fid);
    if (f && geoContains(f, [lon, lat])) return fid;
  }
  return null;
}

export function recordFeature(engine: HistoryEngine, fid: number) {
  return features(engine).get(fid) ?? null;
}
