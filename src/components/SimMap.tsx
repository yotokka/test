import { memo } from 'react';
import type { Frame, Profile, Scenario } from '../sim/types';
import { COUNTRIES, MAP_H, MAP_W } from '../sim/world';

export type Selection = { kind: 'obj' | 'post'; id: string } | null;

const C = {
  grid: 'rgba(131,184,174,0.07)',
  gridMajor: 'rgba(131,184,174,0.14)',
  land: '#263140',
  edge: '#4A5A6E',
  label: '#A7B2BF',
  text: '#E8E2D6',
  teal: '#83B8AE',
  amber: '#D5AD75',
  lav: '#AAA0C8',
  coral: '#D58D86',
  air: '#A7B2BF',
  bg: '#1C2330',
};

export function ObjShape({ profile, x, y, filled, color, r = 7 }: { profile: Profile; x: number; y: number; filled: boolean; color: string; r?: number }) {
  const common = { fill: filled ? color : C.bg, stroke: color, strokeWidth: 1.6 };
  if (profile === 'arc') return <path d={`M${x} ${y - r}L${x + r * 0.95} ${y + r * 0.7}H${x - r * 0.95}Z`} strokeLinejoin="round" {...common} />;
  if (profile === 'low') return <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} strokeLinejoin="round" {...common} />;
  return <circle cx={x} cy={y} r={r * 0.8} {...common} />;
}

const STATUS_TEXT = {
  hidden: 'не обнаружен',
  detected: 'сопровождается',
  classified: 'классифицирован',
  intercepted: 'перехвачен (усл.)',
  arrived: 'достиг обл. назначения',
};

function SimMapImpl({
  scenario,
  frame,
  selection,
  onSelect,
}: {
  scenario: Scenario;
  frame: Frame;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const specById = new Map(scenario.objects.map((o) => [o.id, o]));
  const lines: JSX.Element[] = [];
  for (let x = 0; x <= MAP_W; x += 50) {
    lines.push(<line key={`vx${x}`} x1={x} x2={x} y1={0} y2={MAP_H} stroke={x % 250 === 0 ? C.gridMajor : C.grid} strokeWidth={1} />);
  }
  for (let y = 0; y <= MAP_H; y += 50) {
    lines.push(<line key={`hy${y}`} x1={0} x2={MAP_W} y1={y} y2={y} stroke={y % 250 === 0 ? C.gridMajor : C.grid} strokeWidth={1} />);
  }

  const active = frame.objects.filter((o) => o.status !== 'pending');
  const summary = active
    .map((o) => {
      const s = specById.get(o.id)!;
      const st = o.status === 'intercepted' ? STATUS_TEXT.intercepted : o.status === 'arrived' ? STATUS_TEXT.arrived : o.detectedBy.length ? STATUS_TEXT.detected : STATUS_TEXT.hidden;
      return `${s.label}: ${st}`;
    })
    .join('; ');

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label={`Условная карта, такт ${frame.tick}. ${summary || 'Объектов пока нет.'}`}
    >
      <rect width={MAP_W} height={MAP_H} fill={C.bg} />
      <g aria-hidden="true">{lines}</g>

      {/* Вымышленные страны */}
      <g aria-hidden="true">
        {COUNTRIES.map((c) => (
          <path key={c.id} d={c.path} fill={C.land} fillOpacity={0.8} stroke={C.edge} strokeWidth={1} />
        ))}
        {COUNTRIES.map((c) => (
          <text key={`l${c.id}`} x={c.labelAt.x} y={c.labelAt.y} textAnchor="middle" fill={C.label} fillOpacity={0.75} fontSize={17} letterSpacing={3}>
            {c.name.toUpperCase()}
          </text>
        ))}
      </g>

      {/* Координатные подписи */}
      <g aria-hidden="true" fill={C.label} fillOpacity={0.6} fontSize={12}>
        {[250, 500, 750].map((v) => (
          <text key={`cx${v}`} x={v + 4} y={14}>
            {v}
          </text>
        ))}
        {[250, 500].map((v) => (
          <text key={`cy${v}`} x={4} y={v - 4}>
            {v}
          </text>
        ))}
      </g>

      {/* Посты и учебные зоны */}
      {scenario.posts.map((p) => {
        const stock = frame.posts.find((x) => x.id === p.id)?.stock ?? p.stock;
        const sel = selection?.kind === 'post' && selection.id === p.id;
        return (
          <g key={p.id} className="map-obj" onClick={() => onSelect({ kind: 'post', id: p.id })}>
            <circle cx={p.x} cy={p.y} r={p.detectRadius} pointerEvents="none" fill="none" stroke={C.teal} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 6" />
            <circle cx={p.x} cy={p.y} r={p.engageRadius} pointerEvents="none" fill={C.amber} fillOpacity={0.035} stroke={C.amber} strokeOpacity={0.35} strokeWidth={1} />
            {sel && <rect x={p.x - 12} y={p.y - 12} width={24} height={24} rx={4} fill="none" stroke={C.amber} strokeDasharray="3 3" />}
            <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={2} fill="#222B38" stroke={C.teal} strokeWidth={1.6} />
            <circle cx={p.x} cy={p.y} r={2} fill={C.teal} />
            <text x={p.x + 12} y={p.y + 5} fill={C.text} fontSize={15}>
              «{p.name}» <tspan fill={C.label}>запас {stock}</tspan>
            </text>
          </g>
        );
      })}

      {/* Объекты */}
      {active.map((o) => {
        const s = specById.get(o.id)!;
        const color = s.profile === 'air' ? C.air : C.lav;
        const sel = selection?.kind === 'obj' && selection.id === o.id;
        const pts = o.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const done = o.status === 'intercepted' || o.status === 'arrived';
        const detected = o.detectedBy.length > 0;
        const status =
          o.status === 'intercepted'
            ? STATUS_TEXT.intercepted
            : o.status === 'arrived'
              ? STATUS_TEXT.arrived
              : o.classified && detected
                ? STATUS_TEXT.classified
                : detected
                  ? STATUS_TEXT.detected
                  : STATUS_TEXT.hidden;
        return (
          <g key={o.id} className="map-obj" onClick={() => onSelect({ kind: 'obj', id: o.id })}>
            <line x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y} pointerEvents="none" stroke={color} strokeOpacity={0.12} strokeWidth={1} strokeDasharray="2 6" />
            <polyline points={pts} fill="none" stroke={color} strokeOpacity={done ? 0.3 : 0.6} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
            {sel && <circle cx={o.x} cy={o.y} r={15} fill="none" stroke={C.amber} strokeDasharray="3 3" />}
            {o.decision === 'authorized' && !done && <circle cx={o.x} cy={o.y} r={11} fill="none" stroke={C.amber} strokeOpacity={0.7} strokeWidth={1.2} />}
            {o.status === 'intercepted' ? (
              <path d={`M${o.x - 6} ${o.y - 6}L${o.x + 6} ${o.y + 6}M${o.x + 6} ${o.y - 6}L${o.x - 6} ${o.y + 6}`} stroke={C.label} strokeWidth={1.8} strokeLinecap="round" />
            ) : o.status === 'arrived' ? (
              <>
                <rect x={o.x - 9} y={o.y - 9} width={18} height={18} rx={3} fill="none" stroke={C.coral} strokeWidth={1.4} />
                <ObjShape profile={s.profile} x={o.x} y={o.y} filled={false} color={color} r={5} />
              </>
            ) : (
              <ObjShape profile={s.profile} x={o.x} y={o.y} filled={detected} color={color} />
            )}
            <text x={o.x + 14} y={o.y - 4} fill={C.text} fontSize={15}>
              {s.label}
            </text>
            <text x={o.x + 14} y={o.y + 13} fill={C.label} fontSize={13}>
              {status}
            </text>
            {/* Увеличенная область попадания для клика */}
            <circle cx={o.x} cy={o.y} r={16} fill="transparent" />
          </g>
        );
      })}

      {/* Учебные перехватчики */}
      {frame.interceptors.map((it) => (
        <g key={it.id} className="map-int" aria-hidden="true">
          <polyline points={it.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={C.amber} strokeOpacity={0.6} strokeWidth={1} />
          <path d={`M${it.x - 5} ${it.y}H${it.x + 5}M${it.x} ${it.y - 5}V${it.y + 5}`} stroke={C.amber} strokeWidth={1.8} strokeLinecap="round" />
          <text x={it.x + 8} y={it.y - 6} fill={C.amber} fontSize={13}>
            {it.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

export const SimMap = memo(SimMapImpl);

export function MapLegend() {
  return (
    <div className="map-legend" aria-label="Легенда карты">
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <ObjShape profile="arc" x={0} y={0} filled color={C.lav} r={6} />
        </svg>
        «Дуга»
      </span>
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <ObjShape profile="low" x={0} y={0} filled color={C.lav} r={6} />
        </svg>
        «Бриз»
      </span>
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <ObjShape profile="air" x={0} y={0} filled color={C.air} r={6} />
        </svg>
        «Борт»
      </span>
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <ObjShape profile="arc" x={0} y={0} filled={false} color={C.lav} r={6} />
        </svg>
        контур — не обнаружен
      </span>
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <rect x={-5} y={-5} width={10} height={10} rx={2} fill="#222B38" stroke={C.teal} strokeWidth={1.6} />
        </svg>
        пост
      </span>
      <span>
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <path d="M-5 0H5M0 -5V5" stroke={C.amber} strokeWidth={1.8} />
        </svg>
        учебный перехватчик
      </span>
      <span>
        <svg width="22" height="10" aria-hidden="true">
          <line x1="1" y1="5" x2="21" y2="5" stroke={C.teal} strokeDasharray="3 4" />
        </svg>
        зона обнаружения
      </span>
      <span>
        <svg width="22" height="10" aria-hidden="true">
          <line x1="1" y1="5" x2="21" y2="5" stroke={C.amber} strokeOpacity={0.7} />
        </svg>
        зона перехвата
      </span>
      <span>× — условно перехвачен</span>
      <span>
        <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
          <rect x={-6} y={-6} width={12} height={12} rx={2} fill="none" stroke={C.coral} strokeWidth={1.4} />
        </svg>
        достиг области назначения
      </span>
    </div>
  );
}
