import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { memo, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import * as topojson from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import type { HistoryEngine } from '../../history/engine';
import { ruName } from '../../history/names-ru';
import type { RecordProps } from '../../history/types';

export interface Layers {
  states: boolean;
  dependencies: boolean;
  disputed: boolean;
  capitals: boolean;
  labels: boolean;
  land: boolean;
  graticule: boolean;
  conflicts: boolean;
  unverified: boolean;
}

export const W = 960;
export const H = 500;

interface Prepared {
  sphere: string;
  graticule: string;
  land: string;
  rec: Map<number, { d: string; props: RecordProps; label: [number, number] | null; area: number; cap: [number, number] | null }>;
  disputed: Map<string, string>;
}

const cache = new WeakMap<HistoryEngine, Prepared>();

/** Проекция и пути считаются один раз на сессию; смена даты только выбирает, какие пути показать. */
function prepare(engine: HistoryEngine): Prepared {
  const hit = cache.get(engine);
  if (hit) return hit;
  const projection = geoNaturalEarth1().fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    { type: 'Sphere' },
  );
  const path = geoPath(projection);
  const geo = engine.data.geo;
  const recColl = geo.objects.records as GeometryCollection<RecordProps>;
  const rec: Prepared['rec'] = new Map();
  for (const g of recColl.geometries) {
    const f = topojson.feature(geo, g) as unknown as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, RecordProps>;
    const p = g.properties as RecordProps;
    // Подпись — в центре самой крупной части, а не всей мультиполигональной записи
    let label: [number, number] | null = null;
    let best = 0;
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const coords of parts) {
      const a = path.area({ type: 'Polygon', coordinates: coords });
      if (a > best) {
        best = a;
        label = path.centroid({ type: 'Polygon', coordinates: coords }) as [number, number];
      }
    }
    const cap = Number.isFinite(p.capLon) ? (projection([p.capLon, p.capLat]) as [number, number] | null) : null;
    rec.set(p.fid, { d: path(f) ?? '', props: p, label: label && Number.isFinite(label[0]) ? label : null, area: best, cap });
  }
  const disputed = new Map<string, string>();
  const dColl = geo.objects.disputed as GeometryCollection<{ id: string }>;
  for (const g of dColl.geometries) disputed.set((g.properties as { id: string }).id, path(topojson.feature(geo, g) as never) ?? '');
  const land = path(topojson.feature(engine.data.land, engine.data.land.objects.land) as never) ?? '';
  const prepared = { sphere: path({ type: 'Sphere' }) ?? '', graticule: path(geoGraticule10()) ?? '', land, rec, disputed };
  cache.set(engine, prepared);
  return prepared;
}

interface Props {
  engine: HistoryEngine;
  recsKey: string;
  recs: number[];
  disputedIds: string[];
  conflictEntities: string[];
  selectedEntity: string | null;
  layers: Layers;
  mapCovered: boolean;
  dayLabel: string;
  onSelect: (entityId: string) => void;
}

function HistoryMapImpl({ engine, recs, disputedIds, conflictEntities, selectedEntity, layers, mapCovered, dayLabel, onSelect }: Props) {
  const P = useMemo(() => prepare(engine), [engine]);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);

  const visible = recs
    .map((fid) => P.rec.get(fid)!)
    .filter((r) => r && (r.props.status === 'independent' ? layers.states : layers.dependencies));
  const conflictSet = new Set(conflictEntities);

  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.max(1, Math.min(8, v.k * f));
      // Масштабирование относительно центра видимой области
      const cx = W / 2;
      const cy = H / 2;
      const x = cx - ((cx - v.x) * k) / v.k;
      const y = cy - ((cy - v.y) * k) / v.k;
      return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x, y };
    });

  const toSvg = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e: RPointerEvent) => {
    if (view.k === 1) return;
    const p = toSvg(e);
    drag.current = { x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.vx + (p.x - d.x), y: d.vy + (p.y - d.y) }));
  };
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };
  const click = (code: number) => {
    if (drag.current?.moved) return;
    onSelect(engine.idForCode(code));
  };

  const labelMin = 900 / view.k ** 2;
  const sw = 1 / view.k;

  return (
    <div className="hmap" style={{ touchAction: view.k > 1 ? 'none' : 'pan-y' }}>
      <svg
        ref={svgRef}
        className="hmap-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Историческая карта на ${dayLabel}: ${visible.length} территорий в наборе CShapes${mapCovered ? '' : ' — дата вне покрытия набора, границы не подтверждены'}. Выбор страны доступен через поиск слева.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          onUp();
          setHover(null);
        }}
      >
        <defs>
          <pattern id="hatch-dep" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#AAA0C8" strokeOpacity="0.55" strokeWidth="1.2" />
          </pattern>
          <pattern id="hatch-disp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#D58D86" strokeWidth="1.6" />
          </pattern>
          <pattern id="hatch-gap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#A7B2BF" strokeOpacity="0.25" strokeWidth="1" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <path d={P.sphere} fill="#1A212D" stroke="rgba(167,178,191,0.35)" strokeWidth={sw} />
          {layers.graticule && <path d={P.graticule} fill="none" stroke="rgba(131,184,174,0.10)" strokeWidth={0.6 * sw} />}
          {layers.land && <path d={P.land} fill="#252E3B" stroke="none" />}
          {visible.map((r) => {
            const id = engine.idForCode(r.props.code);
            const dep = r.props.status !== 'independent';
            const sel = id === selectedEntity;
            return (
              <path
                key={r.props.fid}
                className="hmap-rec"
                d={r.d}
                fill={!mapCovered ? 'url(#hatch-gap)' : dep ? 'url(#hatch-dep)' : sel ? '#3a4a5e' : '#2E3A4A'}
                stroke={sel ? '#D5AD75' : mapCovered ? '#7C8EA3' : '#6B7686'}
                strokeWidth={(sel ? 1.6 : 0.55) * sw}
                strokeDasharray={mapCovered ? undefined : `${3 * sw} ${3 * sw}`}
                onClick={() => click(r.props.code)}
                onMouseMove={(e) => {
                  const p = toSvg(e as unknown as RPointerEvent);
                  setHover({ name: ruName(r.props.name) + (dep ? ' (зависимая территория)' : ''), x: p.x, y: p.y });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {layers.conflicts &&
            visible
              .filter((r) => conflictSet.has(engine.idForCode(r.props.code)))
              .map((r) => <path key={`c${r.props.fid}`} d={r.d} fill="none" stroke="#D58D86" strokeWidth={1.4 * sw} strokeDasharray={`${1.5 * sw} ${2.5 * sw}`} pointerEvents="none" />)}
          {layers.disputed &&
            disputedIds.map((id) => (
              <path key={id} d={P.disputed.get(id)} fill="url(#hatch-disp)" fillOpacity={0.85} stroke="#D58D86" strokeWidth={1.1 * sw} strokeDasharray={`${4 * sw} ${2 * sw}`} pointerEvents="none" />
            ))}
          {layers.capitals &&
            visible
              .filter((r) => r.cap)
              .map((r) => (
                <rect key={`k${r.props.fid}`} x={r.cap![0] - 1.6 * sw} y={r.cap![1] - 1.6 * sw} width={3.2 * sw} height={3.2 * sw} fill="#D5AD75" pointerEvents="none" />
              ))}
          {layers.labels &&
            visible
              .filter((r) => r.label && r.area > labelMin && r.props.status === 'independent')
              .map((r) => (
                <text
                  key={`t${r.props.fid}`}
                  x={r.label![0]}
                  y={r.label![1]}
                  textAnchor="middle"
                  fontSize={8.5 * sw}
                  fill="#E8E2D6"
                  fillOpacity={0.82}
                  pointerEvents="none"
                  className="hmap-label"
                >
                  {shortRu(ruName(r.props.name))}
                </text>
              ))}
        </g>
      </svg>
      {hover && (
        <div className="hmap-tip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }} role="presentation">
          {hover.name}
        </div>
      )}
      <div className="hmap-zoom" role="group" aria-label="Масштаб карты">
        <button className="btn btn-sm" onClick={() => zoom(1.6)} aria-label="Приблизить">
          +
        </button>
        <button className="btn btn-sm" onClick={() => zoom(1 / 1.6)} aria-label="Отдалить" disabled={view.k === 1}>
          −
        </button>
        <button className="btn btn-sm" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Показать весь мир" disabled={view.k === 1}>
          ⟲
        </button>
      </div>
      <div className="hmap-scale">Обзорная карта · проекция Natural Earth I · не для измерений</div>
      {!mapCovered && (
        <div className="hmap-gap" role="status">
          Дата вне покрытия CShapes (после 31.12.2019). Контуры — последний снимок набора, <strong>не подтверждены</strong> для этой даты.
        </div>
      )}
    </div>
  );
}

/**
 * Подпись на карте: составное название источника сохраняется целиком (например, «Россия (СССР)»),
 * сокращаются только длинные официальные формы. Современное название не подставляется.
 */
const SHORT: [string, string][] = [
  ['Соединённые Штаты Америки', 'США'],
  ['Федеративная Республика Германия', 'ФРГ'],
  ['Германская Демократическая Республика', 'ГДР'],
  ['Центральноафриканская Республика', 'ЦАР'],
  ['Демократическая Республика Конго', 'ДР Конго'],
  ['Объединённые Арабские Эмираты', 'ОАЭ'],
  ['Советский Союз', 'СССР'],
  ['Соединённое Королевство', 'Великобритания'],
  ['Йеменская Арабская Республика', 'ЙАР'],
  ['Малагасийская Республика', 'Малагасийская Респ.'],
];
function shortRu(n: string) {
  return SHORT.reduce((s, [a, b]) => s.replace(a, b), n);
}

export const HistoryMap = memo(HistoryMapImpl, (a, b) =>
  a.recsKey === b.recsKey &&
  a.selectedEntity === b.selectedEntity &&
  a.layers === b.layers &&
  a.mapCovered === b.mapCovered &&
  a.disputedIds.join() === b.disputedIds.join() &&
  a.conflictEntities.join() === b.conflictEntities.join() &&
  a.dayLabel === b.dayLabel,
);
