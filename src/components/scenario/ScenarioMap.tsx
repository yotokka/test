import { geoPath, geoProjection, type GeoProjection } from 'd3-geo';
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPE, type ReactNode, type WheelEvent as RWE } from 'react';
import * as topojson from 'topojson-client';
import { CLASS_BY_ID, isAircraft } from '../../game/classes';
import { SCENE_COUNTRIES } from '../../game/testScene';
import type { Vec } from '../../game/types';
import type { HistoryEngine } from '../../history/engine';
import { ruName } from '../../history/names-ru';
import type { BranchState, BranchWorld } from '../../scenario/branch';
import { R_KM, lonLatToKm, recordFeature, regionKm, type Frame } from '../../scenario/geo';
import type { ScenarioDoc } from '../../scenario/types';
import type { DisplayEnt } from './useEpisode';

/**
 * Карта сценария в плоских км (x — восток, y — север; в SVG y направлен вниз, поэтому рисуем (x, −y)).
 * Масштабирование и сдвиг меняют только вид; объекты перемещаются только инструментом «Редактирование».
 */

export type Tool = 'select' | 'add' | 'edit' | 'route' | 'aim';

export interface MapLayers {
  borders: boolean;
  labels: boolean;
  routes: boolean;
  ranges: boolean;
  trails: boolean;
  wind: boolean;
  precip: boolean;
  compare: boolean;
  grid: boolean;
}

export interface View {
  cx: number;
  cy: number;
  span: number;
}

interface Props {
  doc: ScenarioDoc;
  engine: HistoryEngine | null;
  bw: BranchWorld | null;
  bs: BranchState | null;
  tool: Tool;
  addClassId: string | null;
  selection: string[];
  pinned: string | null;
  layers: MapLayers;
  play: { ents: DisplayEnt[]; t: number } | null;
  view: View;
  setView: (v: View | ((v: View) => View)) => void;
  cursor: Vec | null;
  focusId: string | null;
  onSelect: (ids: string[], mode: 'replace' | 'toggle' | 'add') => void;
  onPlace: (pos: Vec) => void;
  onMove: (ids: string[], dx: number, dy: number) => void;
  onWaypoint: (id: string, idx: number, pos: Vec) => void;
  onAddWaypoint: (id: string, pos: Vec) => void;
  onAim: (id: string, idx: number, pos: Vec) => void;
  onContext: (clientX: number, clientY: number, id: string | null, pos: Vec) => void;
  onPointerWorld?: (pos: Vec | null) => void;
  overlay?: ReactNode;
  quality: 'low' | 'medium' | 'high';
}

/* ———— Проекция исторической геометрии в плоские км ———— */

function planeProjection(f: Frame): GeoProjection {
  const c = Math.cos((f.lat0 * Math.PI) / 180);
  const raw = (l: number, p: number): [number, number] => [l * c, p];
  const pr = geoProjection(raw as never).rotate([-f.lon0, 0]).scale(R_KM).translate([0, (R_KM * f.lat0 * Math.PI) / 180]);
  return pr.precision(0.5);
}

const pathCache = new Map<string, Map<number, { d: string; label: [number, number] | null; area: number }>>();
function recordPaths(engine: HistoryEngine, frame: Frame, bbox: [number, number, number, number]) {
  const key = `${engine.data.manifest.buildId}|${frame.lon0}|${frame.lat0}|${bbox.join(',')}`;
  let m = pathCache.get(key);
  if (m) return m;
  m = new Map();
  const proj = planeProjection(frame);
  const r = regionKm({ id: '', label: '', bbox }, frame);
  const pad = Math.max(r.x1 - r.x0, r.y1 - r.y0);
  proj.clipExtent([
    [r.x0 - pad, -r.y1 - pad],
    [r.x1 + pad, -r.y0 + pad],
  ]);
  const path = geoPath(proj);
  for (const fid of engine.records.keys()) {
    const f = recordFeature(engine, fid);
    if (!f) continue;
    const d = path(f as never) ?? '';
    if (!d) continue;
    const area = path.area(f as never);
    const c = path.centroid(f as never) as [number, number];
    m.set(fid, { d, label: Number.isFinite(c[0]) ? c : null, area });
  }
  pathCache.set(key, m);
  return m;
}

const landCache = new Map<string, string>();
function landPath(engine: HistoryEngine, frame: Frame, bbox: [number, number, number, number]) {
  const key = `${frame.lon0}|${frame.lat0}|${bbox.join(',')}`;
  const hit = landCache.get(key);
  if (hit !== undefined) return hit;
  const proj = planeProjection(frame);
  const r = regionKm({ id: '', label: '', bbox }, frame);
  const pad = Math.max(r.x1 - r.x0, r.y1 - r.y0);
  proj.clipExtent([
    [r.x0 - pad, -r.y1 - pad],
    [r.x1 + pad, -r.y0 + pad],
  ]);
  const d = geoPath(proj)(topojson.feature(engine.data.land, engine.data.land.objects.land) as never) ?? '';
  landCache.set(key, d);
  return d;
}

/* ———— Значки ———— */

const MARK: Record<string, string> = {
  aircraft: 'M0,-7 L5,5 L0,2.5 L-5,5 Z',
  uav: 'M0,-5 L6,1 L0,-1 L-6,1 Z',
  cruise: 'M0,-5 L2.2,3 L0,1.6 L-2.2,3 Z',
  ballistic: 'M0,-4 L3,3 L-3,3 Z',
  missile: 'M0,-3 L1.2,2 L-1.2,2 Z',
  'ad-post': 'M-5,-5 L5,-5 L5,5 L-5,5 Z',
  radar: 'M0,-6 A6,6 0 1,1 -0.01,-6 Z',
  airfield: 'M-7,-2 L7,-2 L7,2 L-7,2 Z',
  launcher: 'M0,-6 L6,0 L0,6 L-6,0 Z',
};
function markOf(kind: string) {
  if (isAircraft(kind) && kind !== 'uav') return MARK.aircraft;
  if (kind === 'uav') return MARK.uav;
  if (kind === 'cruise') return MARK.cruise;
  if (kind === 'ballistic') return MARK.ballistic;
  if (kind === 'air-missile' || kind === 'sam-missile') return MARK.missile;
  return MARK[kind] ?? MARK['ad-post'];
}
const rotates = (kind: string) => isAircraft(kind) || kind === 'cruise' || kind === 'ballistic' || kind === 'air-missile' || kind === 'sam-missile';

function MapImpl(p: Props) {
  const { doc, engine, bw, bs, tool, selection, layers, view, setView } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [px, setPx] = useState({ w: 800, h: 520 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
  const [ghost, setGhost] = useState<Vec | null>(null);
  const [box, setBox] = useState<{ a: Vec; b: Vec } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dx: number; dy: number } | null>(null);
  const drag = useRef<{
    kind: 'pan' | 'move' | 'wp' | 'aim' | 'box';
    start: Vec;
    startClient: { x: number; y: number };
    view: View;
    id?: string;
    idx?: number;
    moved: boolean;
    pointers: Map<number, { x: number; y: number }>;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; span: number } | null>(null);
  const longPress = useRef<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx({ w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spanH = (view.span * px.h) / px.w;
  const k = view.span / px.w; // км на пиксель
  const vb = `${view.cx - view.span / 2} ${-view.cy - spanH / 2} ${view.span} ${spanH}`;

  const toWorld = (clientX: number, clientY: number): Vec => {
    const r = svg.current!.getBoundingClientRect();
    const x = view.cx - view.span / 2 + ((clientX - r.left) / r.width) * view.span;
    const sy = -view.cy - spanH / 2 + ((clientY - r.top) / r.height) * spanH;
    return { x, y: -sy };
  };

  // Центрирование на объекте по запросу (переход из журнала)
  useEffect(() => {
    if (!p.focusId) return;
    const o = p.play?.ents.find((e) => e.id === p.focusId) ?? doc.objects.find((x) => x.id === p.focusId);
    if (!o) return;
    const pos = 'dx' in o ? { x: o.dx, y: o.dy } : (o as { pos: Vec }).pos;
    setView((v) => ({ ...v, cx: pos.x, cy: pos.y }));
  }, [p.focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ———— Базовая карта ———— */

  const base = useMemo(() => {
    if (doc.world.kind === 'test-scene') {
      return (
        <g>
          <rect x={-500} y={-320} width={1000} height={640} fill="#1C2330" stroke="rgba(167,178,191,0.3)" vectorEffect="non-scaling-stroke" />
          {SCENE_COUNTRIES.map((c) => {
            const part = doc.participants.find((x) => x.id === c.id);
            return (
              <g key={c.id}>
                <polygon points={c.poly.map(([x, y]) => `${x - 500},${y - 320}`).join(' ')} fill={part ? `${part.color}22` : '#273241'} stroke="#7C8EA3" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </g>
      );
    }
    if (!engine || !doc.frame || !bs || !bw) return null;
    const paths = recordPaths(engine, doc.frame, doc.region.bbox);
    const land = landPath(engine, doc.frame, doc.region.bbox);
    const hist = layers.compare ? engine.stateAt(bs.day) : null;
    return (
      <g>
        <path d={land} fill="#232C39" stroke="none" />
        {[...bs.recs].map((fid) => {
          const pp = paths.get(fid);
          if (!pp) return null;
          const owner = bw.ownerOf(bs, fid);
          const part = owner ? doc.participants.find((x) => x.entityId === owner) : null;
          const rec = engine.records.get(fid)!;
          const dep = rec.status !== 'independent';
          const changed = owner !== engine.idForCode(rec.code) || (hist && !hist.recs.has(fid));
          return (
            <path
              key={fid}
              d={pp.d}
              fill={owner === null ? 'url(#sc-hatch-removed)' : part ? `${part.color}30` : dep ? 'url(#sc-hatch-dep)' : '#2E3A4A'}
              stroke={layers.compare && changed ? '#D5AD75' : layers.borders ? '#7C8EA3' : 'rgba(124,142,163,0.35)'}
              strokeWidth={layers.compare && changed ? 2 : 0.7}
              strokeDasharray={layers.compare && changed ? '5 3' : undefined}
              vectorEffect="non-scaling-stroke"
              data-rec={fid}
            />
          );
        })}
        {hist &&
          [...hist.recs]
            .filter((f) => !bs.recs.has(f))
            .map((fid) => {
              const pp = paths.get(fid);
              return pp ? <path key={`h${fid}`} d={pp.d} fill="none" stroke="#AAA0C8" strokeWidth={1.4} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null;
            })}
      </g>
    );
  }, [doc.world, doc.frame, doc.region.bbox, doc.participants, engine, bs, bw, layers.borders, layers.compare]);

  const labels = useMemo(() => {
    if (!layers.labels) return null;
    if (doc.world.kind === 'test-scene')
      return SCENE_COUNTRIES.map((c) => (
        <text key={c.id} x={c.labelAt[0] - 500} y={c.labelAt[1] - 320} className="sc-label" fontSize={11 * k} textAnchor="middle">
          {c.name}
        </text>
      ));
    if (!engine || !doc.frame || !bs || !bw) return null;
    const paths = recordPaths(engine, doc.frame, doc.region.bbox);
    return [...bs.recs].map((fid) => {
      const pp = paths.get(fid);
      if (!pp?.label || pp.area < (140 * k) ** 2) return null;
      const owner = bw.ownerOf(bs, fid);
      const name = owner ? ruName(engine.entityName(owner, bs.day).source) : 'без принадлежности в ветке';
      return (
        <text key={fid} x={pp.label[0]} y={pp.label[1]} className="sc-label" fontSize={10.5 * k} textAnchor="middle">
          {name}
        </text>
      );
    });
  }, [layers.labels, k, doc.world.kind, doc.frame, doc.region.bbox, engine, bs, bw]);

  const grid = useMemo(() => {
    if (!layers.grid) return null;
    const step = view.span > 2500 ? 500 : view.span > 900 ? 100 : view.span > 250 ? 50 : 10;
    const x0 = Math.floor((view.cx - view.span) / step) * step;
    const y0 = Math.floor((-view.cy - spanH) / step) * step;
    const lines: JSX.Element[] = [];
    for (let x = x0; x < view.cx + view.span; x += step) lines.push(<line key={`x${x}`} x1={x} x2={x} y1={-view.cy - spanH} y2={-view.cy + spanH} />);
    for (let y = y0; y < -view.cy + spanH; y += step) lines.push(<line key={`y${y}`} y1={y} y2={y} x1={view.cx - view.span} x2={view.cx + view.span} />);
    return (
      <g stroke="rgba(131,184,174,0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none">
        {lines}
      </g>
    );
  }, [layers.grid, view, spanH]);

  /* ———— Объекты ———— */

  const color = (side: string) => doc.participants.find((x) => x.id === side)?.color ?? '#A7B2BF';
  const sel = new Set(selection);
  const s = k; // единица размера значка в км (1 пиксель)
  const dp = dragPreview;

  const editObjects = !p.play;
  const objEls = editObjects
    ? doc.objects.map((o) => {
        const c = CLASS_BY_ID[o.classId];
        const moving = dp && sel.has(o.id);
        const x = o.pos.x + (moving ? dp.dx : 0);
        const y = o.pos.y + (moving ? dp.dy : 0);
        const first = o.route[0];
        let ang = 0;
        if (first) ang = (Math.atan2(first.x - o.pos.x, first.y - o.pos.y) * 180) / Math.PI;
        return (
          <g key={o.id} data-obj={o.id} className="sc-obj" transform={`translate(${x} ${-y})`}>
            {(sel.has(o.id) || p.pinned === o.id) && <circle r={13 * s} fill="none" stroke="#D5AD75" strokeWidth={1.6 * s} strokeDasharray={p.pinned === o.id && !sel.has(o.id) ? `${3 * s} ${2 * s}` : undefined} />}
            <path d={markOf(c.kind)} transform={`rotate(${rotates(c.kind) ? ang : 0}) scale(${1.25 * s})`} fill={color(o.side)} stroke="#171C26" strokeWidth={0.8} />
            <circle r={14 * s} fill="transparent" />
            {(layers.labels || sel.has(o.id)) && (
              <text y={-15 * s} fontSize={10 * s} textAnchor="middle" className="sc-olabel">
                {o.label}
              </text>
            )}
          </g>
        );
      })
    : p.play!.ents
        .filter((e) => e.phase !== 'pending' && !(e.phase === 'done' && (e.kind === 'air-missile' || e.kind === 'sam-missile')))
        .map((e) => {
          const ang = (Math.atan2(e.gvx || e.hx, e.gvy || e.hy) * 180) / Math.PI;
          const done = e.phase === 'done';
          const small = e.kind === 'air-missile' || e.kind === 'sam-missile';
          return (
            <g key={e.id} data-obj={e.id} className="sc-obj" transform={`translate(${e.dx} ${-e.dy})`} opacity={done ? 0.45 : 1}>
              {(sel.has(e.id) || p.pinned === e.id) && <circle r={13 * s} fill="none" stroke="#D5AD75" strokeWidth={1.6 * s} />}
              <path d={markOf(e.kind)} transform={`rotate(${rotates(e.kind) ? ang : 0}) scale(${(small ? 1 : 1.25) * s})`} fill={e.outcome === 'intercepted' ? 'none' : color(e.side)} stroke={e.outcome === 'intercepted' ? color(e.side) : '#171C26'} strokeWidth={e.outcome === 'intercepted' ? 1.4 * s : 0.8} />
              {e.outcome === 'intercepted' && <path d={`M${-5 * s},${-5 * s} L${5 * s},${5 * s} M${5 * s},${-5 * s} L${-5 * s},${5 * s}`} stroke="#D58D86" strokeWidth={1.2 * s} />}
              {!small && <circle r={12 * s} fill="transparent" />}
              {!small && (layers.labels || sel.has(e.id)) && (
                <text y={-14 * s} fontSize={10 * s} textAnchor="middle" className="sc-olabel">
                  {e.label}
                  {isAircraft(e.kind) || e.kind === 'cruise' || e.kind === 'ballistic' ? ` · ${Math.round(e.dalt)} м` : ''}
                </text>
              )}
            </g>
          );
        });

  const routes =
    layers.routes && editObjects
      ? doc.objects.map((o) => {
          const moving = dp && sel.has(o.id) ? dp : { dx: 0, dy: 0 };
          const pts = [o.pos, ...o.route].map((w) => `${w.x + moving.dx},${-(w.y + moving.dy)}`).join(' ');
          const isSel = sel.has(o.id);
          return (
            <g key={`r${o.id}`}>
              {o.route.length > 0 && <polyline points={pts} fill="none" stroke={color(o.side)} strokeOpacity={isSel ? 0.9 : 0.45} strokeWidth={isSel ? 1.6 : 1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
              {isSel &&
                o.route.map((w, i) => (
                  <g key={i} data-wp={`${o.id}:${i}`} transform={`translate(${w.x + moving.dx} ${-(w.y + moving.dy)})`} className="sc-handle">
                    <circle r={5 * s} fill="#171C26" stroke={color(o.side)} strokeWidth={1.4 * s} />
                    <text y={3.5 * s} fontSize={8 * s} textAnchor="middle" className="sc-olabel">
                      {i + 1}
                    </text>
                  </g>
                ))}
              {o.payload.map((pl, i) => {
                const last = o.route[o.route.length - 1] ?? o.pos;
                return (
                  <g key={`a${i}`}>
                    <line x1={last.x + moving.dx} y1={-(last.y + moving.dy)} x2={pl.aim.x + moving.dx} y2={-(pl.aim.y + moving.dy)} stroke="#D58D86" strokeOpacity={isSel ? 0.8 : 0.35} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    <g data-aim={`${o.id}:${i}`} transform={`translate(${pl.aim.x + moving.dx} ${-(pl.aim.y + moving.dy)})`} className={isSel ? 'sc-handle' : undefined}>
                      <path d={`M${-6 * s},0 L${6 * s},0 M0,${-6 * s} L0,${6 * s}`} stroke="#D58D86" strokeWidth={1.4 * s} />
                      <circle r={4 * s} fill="none" stroke="#D58D86" strokeWidth={1 * s} />
                      {isSel && <circle r={8 * s} fill="transparent" />}
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })
      : null;

  const trailMax = p.quality === 'low' ? 20 : p.quality === 'medium' ? 60 : 120;
  const trails =
    layers.trails && p.play
      ? p.play.ents
          .filter((e) => e.trail.length > 1 && e.phase !== 'pending')
          .map((e) => {
            const pts = [...e.trail.slice(-trailMax).map((q) => `${q.x},${-q.y}`), e.phase !== 'done' ? `${e.dx},${-e.dy}` : ''].join(' ');
            return <polyline key={`t${e.id}`} points={pts} fill="none" stroke={color(e.side)} strokeOpacity={e.kind === 'ballistic' ? 0.8 : 0.5} strokeWidth={e.kind === 'ballistic' ? 1.6 : 1.1} strokeDasharray={e.kind === 'ballistic' ? '1 3' : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
          })
      : null;

  const ranges = layers.ranges
    ? (p.play ? p.play.ents.map((e) => ({ id: e.id, classId: e.classId, x: e.dx, y: e.dy, side: e.side })) : doc.objects.map((o) => ({ id: o.id, classId: o.classId, x: o.pos.x, y: o.pos.y, side: o.side })))
        .filter((o) => sel.has(o.id) || p.pinned === o.id)
        .flatMap((o) => {
          const c = CLASS_BY_ID[o.classId];
          const out: JSX.Element[] = [];
          if (c.sensor) out.push(<circle key={`s${o.id}`} cx={o.x} cy={-o.y} r={c.sensor.rangeKm} fill="none" stroke={color(o.side)} strokeOpacity={0.45} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
          if (c.weapon) out.push(<circle key={`w${o.id}`} cx={o.x} cy={-o.y} r={c.weapon.rangeKm} fill={`${color(o.side)}10`} stroke={color(o.side)} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" pointerEvents="none" />);
          return out;
        })
    : null;

  /* ———— Указатель ———— */

  const hitTarget = (el: Element | null) => {
    const o = el?.closest('[data-obj],[data-wp],[data-aim]');
    if (!o) return null;
    const a = o.getAttribute('data-obj');
    if (a) return { kind: 'obj' as const, id: a };
    const w = o.getAttribute('data-wp');
    if (w) {
      const [id, i] = w.split(':');
      return { kind: 'wp' as const, id, idx: Number(i) };
    }
    const m = o.getAttribute('data-aim')!;
    const [id, i] = m.split(':');
    return { kind: 'aim' as const, id, idx: Number(i) };
  };

  const onDown = (e: RPE<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), span: view.span };
      drag.current = null;
      return;
    }
    if (e.button === 2) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const hit = hitTarget(e.target as Element);
    const base = { start: w, startClient: { x: e.clientX, y: e.clientY }, view, moved: false, pointers: pointers.current };
    if (e.pointerType !== 'mouse') {
      longPress.current = window.setTimeout(() => {
        if (drag.current && !drag.current.moved) {
          p.onContext(e.clientX, e.clientY, hit?.id ?? null, w);
          drag.current = null;
        }
      }, 550);
    }
    if (tool === 'edit' && hit?.kind === 'obj' && !p.play) {
      if (!sel.has(hit.id)) p.onSelect([hit.id], e.shiftKey || e.ctrlKey || e.metaKey ? 'add' : 'replace');
      drag.current = { kind: 'move', id: hit.id, ...base };
    } else if ((tool === 'edit' || tool === 'select' || tool === 'route') && hit?.kind === 'wp' && !p.play) drag.current = { kind: 'wp', id: hit.id, idx: hit.idx, ...base };
    else if ((tool === 'edit' || tool === 'select' || tool === 'aim') && hit?.kind === 'aim' && !p.play) drag.current = { kind: 'aim', id: hit.id, idx: hit.idx, ...base };
    else if (tool === 'select' && e.shiftKey && !hit) drag.current = { kind: 'box', ...base };
    else drag.current = { kind: 'pan', ...base, id: hit?.kind === 'obj' ? hit.id : undefined };
  };

  const onMove = (e: RPE<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const span = Math.max(20, Math.min(12000, (pinch.current.span * pinch.current.d) / Math.max(10, d)));
      setView((v) => ({ ...v, span }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    p.onPointerWorld?.(w);
    if (tool === 'add' || tool === 'route' || tool === 'aim') setGhost(w);
    const d = drag.current;
    if (!d) return;
    const moved = Math.abs(e.clientX - d.startClient.x) + Math.abs(e.clientY - d.startClient.y) > 4;
    if (moved && !d.moved) {
      d.moved = true;
      if (longPress.current) clearTimeout(longPress.current);
    }
    if (!d.moved) return;
    if (d.kind === 'pan') {
      const r = svg.current!.getBoundingClientRect();
      const dxKm = ((e.clientX - d.startClient.x) / r.width) * d.view.span;
      const dyKm = ((e.clientY - d.startClient.y) / r.height) * ((d.view.span * px.h) / px.w);
      setView({ ...d.view, cx: d.view.cx - dxKm, cy: d.view.cy + dyKm });
    } else if (d.kind === 'move') setDragPreview({ dx: w.x - d.start.x, dy: w.y - d.start.y });
    else if (d.kind === 'box') setBox({ a: d.start, b: w });
    else if (d.kind === 'wp' || d.kind === 'aim') setDragPreview({ dx: w.x - d.start.x, dy: w.y - d.start.y });
  };

  const onUp = (e: RPE<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (longPress.current) clearTimeout(longPress.current);
    const d = drag.current;
    drag.current = null;
    const w = toWorld(e.clientX, e.clientY);
    if (!d) return;
    if (d.kind === 'move' && d.moved && dragPreview) p.onMove(selection.includes(d.id!) ? selection : [d.id!], dragPreview.dx, dragPreview.dy);
    else if (d.kind === 'wp' && d.moved) p.onWaypoint(d.id!, d.idx!, w);
    else if (d.kind === 'aim' && d.moved) p.onAim(d.id!, d.idx!, w);
    else if (d.kind === 'box' && box) {
      const [x0, x1] = [Math.min(box.a.x, box.b.x), Math.max(box.a.x, box.b.x)];
      const [y0, y1] = [Math.min(box.a.y, box.b.y), Math.max(box.a.y, box.b.y)];
      const list = p.play ? p.play.ents.map((q) => ({ id: q.id, x: q.dx, y: q.dy })) : doc.objects.map((o) => ({ id: o.id, ...o.pos }));
      p.onSelect(list.filter((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1).map((q) => q.id), 'add');
    } else if (!d.moved) {
      const hit = hitTarget(e.target as Element);
      if (tool === 'add') p.onPlace(w);
      else if (tool === 'route' && selection[0]) p.onAddWaypoint(selection[0], w);
      else if (tool === 'aim' && selection[0]) p.onAim(selection[0], 0, w);
      else if (hit?.kind === 'obj') p.onSelect([hit.id], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace');
      else if (!hit) p.onSelect([], 'replace');
    }
    setDragPreview(null);
    setBox(null);
  };

  const onWheel = (e: RWE<SVGSVGElement>) => {
    const w = toWorld(e.clientX, e.clientY);
    const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const span = Math.max(20, Math.min(12000, v.span * f));
      const r = span / v.span;
      return { span, cx: w.x - (w.x - v.cx) * r, cy: w.y - (w.y - v.cy) * r };
    });
  };

  const ghostEl =
    ghost && tool === 'add' && p.addClassId ? (
      <g transform={`translate(${ghost.x} ${-ghost.y})`} opacity={0.6} pointerEvents="none">
        <path d={markOf(CLASS_BY_ID[p.addClassId].kind)} transform={`scale(${1.25 * s})`} fill="#D5AD75" />
        {CLASS_BY_ID[p.addClassId].weapon && <circle r={CLASS_BY_ID[p.addClassId].weapon!.rangeKm} fill="none" stroke="#D5AD75" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        {CLASS_BY_ID[p.addClassId].sensor && <circle r={CLASS_BY_ID[p.addClassId].sensor!.rangeKm} fill="none" stroke="#D5AD75" strokeOpacity={0.4} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />}
      </g>
    ) : ghost && (tool === 'route' || tool === 'aim') && selection[0] ? (
      (() => {
        const o = doc.objects.find((x) => x.id === selection[0]);
        if (!o) return null;
        const from = tool === 'route' ? o.route[o.route.length - 1] ?? o.pos : o.route[o.route.length - 1] ?? o.pos;
        return <line x1={from.x} y1={-from.y} x2={ghost.x} y2={-ghost.y} stroke="#D5AD75" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
      })()
    ) : null;

  const scaleKm = [10, 25, 50, 100, 250, 500, 1000, 2500].find((v) => v / k > 70) ?? 2500;
  const cursorEl = p.cursor ? (
    <g transform={`translate(${p.cursor.x} ${-p.cursor.y})`} pointerEvents="none">
      <path d={`M${-10 * s},0 L${-3 * s},0 M${3 * s},0 L${10 * s},0 M0,${-10 * s} L0,${-3 * s} M0,${3 * s} L0,${10 * s}`} stroke="#E8E2D6" strokeWidth={1.4 * s} />
    </g>
  ) : null;

  return (
    <div ref={wrap} className="sc-map" data-tool={tool} style={{ touchAction: 'none' }}>
      <svg
        ref={svg}
        className="sc-svg"
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={`Карта сценария «${doc.title}»: ${doc.objects.length} объектов. Инструмент: ${TOOL_RU[tool]}. Управление с клавиатуры — стрелки и Enter, список объектов слева.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          setGhost(null);
          setHover(null);
          p.onPointerWorld?.(null);
        }}
        onWheel={onWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          const hit = hitTarget(e.target as Element);
          p.onContext(e.clientX, e.clientY, hit?.id ?? null, toWorld(e.clientX, e.clientY));
        }}
        onMouseOver={(e) => {
          const hit = hitTarget(e.target as Element);
          if (hit?.kind !== 'obj') return setHover(null);
          const r = wrap.current!.getBoundingClientRect();
          const o = doc.objects.find((x) => x.id === hit.id) ?? p.play?.ents.find((x) => x.id === hit.id);
          if (o) setHover({ id: hit.id, x: e.clientX - r.left, y: e.clientY - r.top, text: `${o.label} — ${CLASS_BY_ID[o.classId].name}` });
        }}
      >
        <defs>
          <pattern id="sc-hatch-dep" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#AAA0C8" strokeOpacity="0.5" strokeWidth="1.2" />
          </pattern>
          <pattern id="sc-hatch-removed" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="7" height="7" fill="#1E2531" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#D5AD75" strokeOpacity="0.45" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect x={view.cx - view.span * 2} y={-view.cy - spanH * 2} width={view.span * 4} height={spanH * 4} fill="#1A212D" />
        {base}
        {grid}
        {labels}
        {ranges}
        {routes}
        {trails}
        {objEls}
        {ghostEl}
        {cursorEl}
        {box && <rect x={Math.min(box.a.x, box.b.x)} y={-Math.max(box.a.y, box.b.y)} width={Math.abs(box.a.x - box.b.x)} height={Math.abs(box.a.y - box.b.y)} fill="rgba(213,173,117,0.08)" stroke="#D5AD75" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {p.overlay}
      {hover && (
        <div className="hmap-tip" style={{ left: hover.x, top: hover.y }} role="presentation">
          {hover.text}
        </div>
      )}
      <div className="sc-scale" aria-hidden="true">
        <span style={{ width: scaleKm / k }} /> {scaleKm} км · плоская игровая система координат
      </div>
      <div className="hmap-zoom" role="group" aria-label="Масштаб карты">
        <button className="btn btn-sm" onClick={() => setView((v) => ({ ...v, span: Math.max(20, v.span / 1.5) }))} aria-label="Приблизить" title="Приблизить (+)">
          +
        </button>
        <button className="btn btn-sm" onClick={() => setView((v) => ({ ...v, span: Math.min(12000, v.span * 1.5) }))} aria-label="Отдалить" title="Отдалить (−)">
          −
        </button>
      </div>
    </div>
  );
}

export const TOOL_RU: Record<Tool, string> = { select: 'Выбор', add: 'Добавление', edit: 'Редактирование', route: 'Маршрут', aim: 'Область назначения' };

export const ScenarioMap = memo(MapImpl);

/** Вид по умолчанию: вся область сценария. */
export function defaultView(doc: ScenarioDoc): View {
  if (doc.world.kind === 'test-scene' || !doc.frame) return { cx: 0, cy: 0, span: 1060 };
  const r = regionKm(doc.region, doc.frame);
  return { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, span: Math.max(200, (r.x1 - r.x0) * 1.04) };
}

export { lonLatToKm };
