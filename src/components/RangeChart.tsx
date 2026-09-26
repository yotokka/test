import { useLayoutEffect, useRef, useState } from 'react';
import { getSource } from '../data/reference/sources';
import type { FigureKind, Missile, RangeFigure } from '../data/reference/types';
import { formatKm } from '../lib/format';
import { KindShape } from './Icons';

const COLORS: Record<FigureKind, string> = { claim: '#D5AD75', test: '#AAA0C8', estimate: '#83B8AE' };
const KIND_TEXT: Record<FigureKind, string> = { claim: 'заявление', test: 'результат испытаний', estimate: 'оценка' };
const SURFACE = '#222B38';
const MIN = 1;
const MAX = 20000;
const TICKS = [1, 10, 100, 1000, 10000];

function Marker({ kind, x, y }: { kind: FigureKind; x: number; y: number }) {
  const c = COLORS[kind];
  if (kind === 'claim') return <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} fill={c} stroke={SURFACE} strokeWidth={2} />;
  if (kind === 'test') return <path d={`M${x} ${y - 6.5}L${x + 6} ${y + 5}H${x - 6}Z`} fill={c} stroke={SURFACE} strokeWidth={2} strokeLinejoin="round" />;
  return <circle cx={x} cy={y} r={5.5} fill={c} stroke={SURFACE} strokeWidth={2} />;
}

type Row =
  | { type: 'head'; m: Missile }
  | { type: 'fig'; m: Missile; f: RangeFigure }
  | { type: 'none'; m: Missile };

/**
 * Опубликованные значения на логарифмической шкале. Цель — показать разброс и природу чисел,
 * а не «кто дальше»: числа разных статусов и условий не сравнимы напрямую.
 */
export function RangeChart({ missiles }: { missiles: Missile[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [tip, setTip] = useState<{ x: number; y: number; row: Extract<Row, { type: 'fig' }> } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(Math.max(280, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows: Row[] = missiles.flatMap((m) => [
    { type: 'head', m } as Row,
    ...(m.ranges.length ? m.ranges.map((f) => ({ type: 'fig', m, f }) as Row) : [{ type: 'none', m } as Row]),
  ]);

  const padL = 8;
  const padR = 110;
  const plotW = width - padL - padR;
  const x = (v: number) => padL + ((Math.log10(Math.max(MIN, v)) - Math.log10(MIN)) / (Math.log10(MAX) - Math.log10(MIN))) * plotW;
  const HEAD = 26;
  const FIG = 26;
  let y = 8;
  const placed = rows.map((r) => {
    const h = r.type === 'head' ? HEAD : FIG;
    const top = y;
    y += h;
    return { r, top, h };
  });
  const height = y + 30;

  const describe = (f: RangeFigure) => `${f.text}. Статус: ${KIND_TEXT[f.kind]}. ${f.context} Источник: ${getSource(f.sourceId).publisher}.`;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        className="chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="График опубликованных значений дальности на логарифмической шкале. Те же данные приведены в таблице ниже."
      >
        {/* Сетка */}
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={4} y2={height - 26} stroke="rgba(167,178,191,0.14)" strokeWidth={1} />
            <text x={x(t)} y={height - 10} textAnchor="middle" fontSize={11} fill="#A7B2BF" fontFamily="var(--font-mono)">
              {formatKm(t)}
            </text>
          </g>
        ))}
        <text x={width - 4} y={height - 10} textAnchor="end" fontSize={11} fill="#A7B2BF" fontFamily="var(--font-mono)">
          км (лог.)
        </text>

        {placed.map(({ r, top, h }, i) => {
          const cy = top + h / 2;
          if (r.type === 'head')
            return (
              <text key={`h${i}`} x={padL} y={top + 18} fontSize={13} fill="#E8E2D6" fontWeight={600}>
                {r.m.name} <tspan fill="#A7B2BF" fontWeight={400} fontSize={12}>· {r.m.variant}</tspan>
              </text>
            );
          if (r.type === 'none')
            return (
              <text key={`n${i}`} x={padL + 12} y={cy + 4} fontSize={12} fill="#A7B2BF" fontStyle="italic">
                нет надёжных открытых данных
              </text>
            );
          const f = r.f;
          const lo = f.minKm ?? f.maxKm!;
          const hi = f.maxKm ?? f.minKm!;
          const c = COLORS[f.kind];
          const label = `${f.qualifier === 'more-than' ? '> ' : f.qualifier === 'up-to' ? '≤ ' : f.qualifier === 'about' ? '≈ ' : ''}${
            f.minKm !== undefined && f.maxKm !== undefined ? `${formatKm(f.minKm)}–${formatKm(f.maxKm)}` : formatKm(hi)
          } км`;
          const endX = f.qualifier === 'more-than' ? Math.min(x(lo) + 34, padL + plotW) : x(hi);
          return (
            <g
              key={f.id}
              className="chart-row"
              tabIndex={0}
              role="img"
              aria-label={`${r.m.name}: ${describe(f)}`}
              onMouseEnter={() => setTip({ x: x(hi), y: cy, row: r })}
              onMouseLeave={() => setTip(null)}
              onFocus={() => setTip({ x: x(hi), y: cy, row: r })}
              onBlur={() => setTip(null)}
            >
              <rect className="chart-hit" x={padL} y={top + 2} width={width - padL - 4} height={h - 4} rx={6} fill="transparent" />
              {lo !== hi && <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={c} strokeWidth={2} strokeLinecap="round" />}
              {f.qualifier === 'more-than' && (
                <>
                  <line x1={x(lo)} x2={endX} y1={cy} y2={cy} stroke={c} strokeWidth={2} strokeOpacity={0.55} strokeLinecap="round" />
                  <path d={`M${endX - 5} ${cy - 4}L${endX} ${cy}L${endX - 5} ${cy + 4}`} fill="none" stroke={c} strokeOpacity={0.7} strokeWidth={1.5} />
                </>
              )}
              {lo !== hi && <Marker kind={f.kind} x={x(lo)} y={cy} />}
              <Marker kind={f.kind} x={x(f.qualifier === 'more-than' ? lo : hi)} y={cy} />
              <text x={Math.max(endX, x(hi)) + 10} y={cy + 4} fontSize={12} fill="#E8E2D6" fontFamily="var(--font-mono)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(tip.x - 140, 0), width - 290), top: tip.y + 16 }}
          role="presentation"
        >
          <strong>{tip.row.m.name}</strong> · {KIND_TEXT[tip.row.f.kind]}
          <div className="mono">{tip.row.f.text}</div>
          <div className="muted">{tip.row.f.context}</div>
          <div className="muted">Источник: {getSource(tip.row.f.sourceId).publisher}</div>
        </div>
      )}
      <div className="chart-legend" aria-hidden="true">
        {(['claim', 'test', 'estimate'] as FigureKind[]).map((k) => (
          <span key={k} style={{ color: COLORS[k] }}>
            <KindShape kind={k} size={11} />
            <span style={{ color: 'var(--text-2)' }}>{KIND_TEXT[k][0].toUpperCase() + KIND_TEXT[k].slice(1)}</span>
          </span>
        ))}
        <span>&gt; — «более» (нижняя граница)</span>
        <span>≤ — «до»</span>
      </div>
    </div>
  );
}
