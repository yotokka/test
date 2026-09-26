import { useEffect, useRef } from 'react';
import { windUV } from '../../game/weatherEffects';
import { lonLatToKm, type Frame } from '../../scenario/geo';
import { phenomenonOf, type Phenomenon } from '../../weather/openMeteo';
import type { WeatherConfig } from '../../weather/types';
import type { View } from './ScenarioMap';

/**
 * Анимация погодного контекста поверх карты: линии приземного ветра, дождь, снег, гроза, туман.
 * Это визуализация снимка данных (или ручных условий) на один момент времени; интерполяция между
 * узлами сетки — только для отображения. На расчёт игровой модели анимация не влияет.
 */

export interface WxPoint {
  x: number;
  y: number;
  u: number | null;
  v: number | null;
  precip: number | null;
  phen: Phenomenon | null;
  cloud: number | null;
}

export interface WeatherVisual {
  points: WxPoint[];
  label: string;
}

export function weatherVisual(cfg: WeatherConfig, frame: Frame | null): WeatherVisual | null {
  if (cfg.source !== 'manual' && !cfg.snapshot) return { points: [], label: 'снимок не загружен — погода не показана (ручные условия не выдаются за исторические)' };
  if (cfg.source === 'manual') {
    const m = cfg.manual;
    const uv = m.windSpeed !== null && m.windDir !== null ? windUV(m.windSpeed, m.windDir) : null;
    return {
      points: [{ x: 0, y: 0, u: uv?.u ?? null, v: uv?.v ?? null, precip: m.precipitation, phen: m.phenomenon, cloud: m.cloudCover }],
      label: `ручные условия «${m.label}» — не исторические данные`,
    };
  }
  if (!frame || !cfg.snapshot) return null;
  const s = cfg.snapshot;
  return {
    points: s.grid.slice(s.grid.length > 1 ? 1 : 0).map((g) => {
      const p = lonLatToKm(frame, g.lon, g.lat);
      const sp = g.values.wind_speed_10m;
      const dir = g.values.wind_direction_10m;
      const uv = sp !== null && dir !== null ? windUV(sp, dir) : null;
      return { x: p.x, y: p.y, u: uv?.u ?? null, v: uv?.v ?? null, precip: g.values.precipitation, phen: phenomenonOf(g.values.weather_code), cloud: g.values.cloud_cover };
    }),
    label: `${s.source === 'archive' ? 'архив ERA5' : 'текущая модель'}, ${s.validTime.replace('T', ' ')} UTC, сетка ${s.gridSize}×${s.gridSize}; интерполяция — только для отображения`,
  };
}

/** Взвешенное по расстоянию значение в точке (только для отображения). */
function sample(pts: WxPoint[], x: number, y: number): WxPoint {
  if (pts.length === 1) return pts[0];
  let wsum = 0;
  let u = 0;
  let v = 0;
  let pr = 0;
  let prw = 0;
  let near = pts[0];
  let best = Infinity;
  for (const p of pts) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + 1;
    const w = 1 / d2;
    if (d2 < best) {
      best = d2;
      near = p;
    }
    if (p.u !== null && p.v !== null) {
      u += p.u * w;
      v += p.v * w;
      wsum += w;
    }
    if (p.precip !== null) {
      pr += p.precip * w;
      prw += w;
    }
  }
  return { x, y, u: wsum ? u / wsum : null, v: wsum ? v / wsum : null, precip: prw ? pr / prw : null, phen: near.phen, cloud: near.cloud };
}

export function WeatherCanvas({ visual, view, wind, precip, quality }: { visual: WeatherVisual | null; view: View; wind: boolean; precip: boolean; quality: 'low' | 'medium' | 'high' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !visual || !visual.points.length || (!wind && !precip)) {
      cv?.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const n = quality === 'low' ? 250 : quality === 'medium' ? 700 : 1400;
    const drops = quality === 'low' ? 120 : quality === 'medium' ? 350 : 800;
    let W = 0;
    let H = 0;
    const resize = () => {
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    // Частицы ветра — в экранных координатах; скорость движения — условная для наглядности
    const parts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, age: Math.random() * 80 }));
    const rain = Array.from({ length: drops }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 }));
    let flash = 0;
    let raf = 0;
    const worldAt = (sx: number, sy: number) => {
      const v = viewRef.current;
      const spanH = (v.span * H) / W;
      return { x: v.cx - v.span / 2 + (sx / W) * v.span, y: v.cy + spanH / 2 - (sy / H) * spanH };
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const mid = sample(visual.points, worldAt(W / 2, H / 2).x, worldAt(W / 2, H / 2).y);
      // Туман и облачность — мягкая дымка
      if (precip && (mid.phen === 'fog' || (mid.cloud ?? 0) > 85)) {
        ctx.fillStyle = mid.phen === 'fog' ? 'rgba(200,205,212,0.10)' : 'rgba(167,178,191,0.05)';
        ctx.fillRect(0, 0, W, H);
      }
      if (wind) {
        ctx.lineWidth = 1;
        for (const p of parts) {
          const w = worldAt(p.x, p.y);
          const s = sample(visual.points, w.x, w.y);
          if (s.u === null || s.v === null) continue;
          const sp = Math.hypot(s.u, s.v);
          const vx = s.u * 0.35;
          const vy = -s.v * 0.35;
          const a = Math.min(0.55, 0.12 + sp / 40) * Math.min(1, p.age / 12) * Math.min(1, (90 - p.age) / 12);
          ctx.strokeStyle = sp > 17 ? `rgba(213,141,134,${a})` : sp > 9 ? `rgba(213,173,117,${a})` : `rgba(131,184,174,${a})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + vx * 2.2, p.y + vy * 2.2);
          ctx.stroke();
          if (!reduce) {
            p.x += vx * 0.25;
            p.y += vy * 0.25;
            p.age += 1;
          }
          if (p.age > 90 || p.x < -10 || p.y < -10 || p.x > W + 10 || p.y > H + 10) {
            p.x = Math.random() * W;
            p.y = Math.random() * H;
            p.age = 0;
          }
        }
      }
      if (precip && mid.phen && mid.phen !== 'none' && mid.phen !== 'fog') {
        const intensity = mid.precip === null ? 0.4 : Math.min(1, 0.15 + mid.precip / 6);
        const count = Math.round(rain.length * intensity);
        const snow = mid.phen === 'snow';
        const wx = (mid.u ?? 0) * 0.15;
        ctx.strokeStyle = snow ? 'rgba(232,226,214,0.55)' : 'rgba(170,190,215,0.35)';
        ctx.fillStyle = 'rgba(232,226,214,0.7)';
        for (let i = 0; i < count; i++) {
          const d = rain[i];
          if (snow) {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1.2 * d.s, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + wx * 3, d.y + 9 * d.s);
            ctx.stroke();
          }
          if (!reduce) {
            d.y += (snow ? 0.9 : 7) * d.s;
            d.x += wx * (snow ? 1.4 : 1) + (snow ? Math.sin(d.y / 20) * 0.3 : 0);
            if (d.y > H) {
              d.y = -10;
              d.x = Math.random() * W;
            }
            if (d.x > W) d.x -= W;
            if (d.x < 0) d.x += W;
          }
        }
        if (mid.phen === 'storm' && !reduce) {
          if (flash <= 0 && Math.random() < 0.004) flash = 7;
          if (flash > 0) {
            ctx.fillStyle = `rgba(232,226,214,${0.05 * flash})`;
            ctx.fillRect(0, 0, W, H);
            flash -= 1;
          }
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visual, wind, precip, quality]);

  return <canvas ref={ref} className="sc-wx" aria-hidden="true" />;
}
