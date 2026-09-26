import { BAND_RU, buildEffects, PRESET_BY_ID, type BandOverride } from '../game/weatherEffects';
import type { WeatherEffects } from '../game/types';
import { phenomenonOf, WMO_RU } from './openMeteo';
import type { WeatherConfig, WeatherSnapshot, WeatherValues } from './types';

/**
 * Перевод погодного контекста в игровые эффекты. Реальные данные — исторический и визуальный контекст;
 * их влияние на игру задаётся игровыми пресетами по документированным порогам. Ветер игровых слоёв
 * берётся из данных только там, где источник даёт значение для этого слоя: условия на высоте полёта
 * из приземного ветра не выводятся.
 *
 * Пороги автоматического выбора пресета (центральная точка области):
 *   код WMO 95–99 → «Гроза»; 45/48 → «Туман»; дождь, морось или снег при осадках ≥ 0,5 мм/ч → «Осадки»;
 *   ветер на 10 м ≥ 10 м/с или порывы ≥ 17 м/с → «Ветрено»; иначе «Ясно».
 */

export function centerValues(s: WeatherSnapshot): WeatherValues {
  return s.grid[0].values;
}

export function autoPreset(v: WeatherValues | null): { id: string; why: string; known: boolean } {
  if (!v) return { id: 'clear', why: 'нет погодных данных — выбран пресет «Ясно» как игровое допущение', known: false };
  const ph = phenomenonOf(v.weather_code);
  if (ph === 'storm') return { id: 'storm', why: `код WMO ${v.weather_code} (${WMO_RU[v.weather_code!]})`, known: true };
  if (ph === 'fog') return { id: 'fog', why: `код WMO ${v.weather_code} (${WMO_RU[v.weather_code!]})`, known: true };
  if ((ph === 'rain' || ph === 'snow' || ph === 'drizzle') && v.precipitation !== null && v.precipitation >= 0.5)
    return { id: 'precip', why: `код WMO ${v.weather_code}, осадки ${v.precipitation} мм/ч ≥ 0,5`, known: true };
  if ((v.wind_speed_10m !== null && v.wind_speed_10m >= 10) || (v.wind_gusts_10m !== null && v.wind_gusts_10m >= 17))
    return { id: 'windy', why: `ветер на 10 м ${v.wind_speed_10m ?? 'н/д'} м/с, порывы ${v.wind_gusts_10m ?? 'н/д'} м/с`, known: true };
  const unknown = v.weather_code === null && v.wind_speed_10m === null;
  return unknown
    ? { id: 'clear', why: 'значения не пришли — выбран «Ясно» как игровое допущение', known: false }
    : { id: 'clear', why: 'нет явлений и сильного ветра по порогам', known: true };
}

function pickUpper(s: WeatherSnapshot, lo: number, hi: number, prefer: number[]): BandOverride | null {
  if (!s.upper) return null;
  for (const hPa of prefer) {
    const l = s.upper.find((x) => x.hPa === hPa);
    if (!l || l.windSpeed === null || l.windDir === null) continue;
    if (l.heightM !== null && (l.heightM < lo || l.heightM > hi)) continue;
    return { speed: l.windSpeed, fromDeg: l.windDir, origin: `Open-Meteo, уровень ${hPa} гПа${l.heightM !== null ? ` (≈${Math.round(l.heightM)} м)` : ''}, текущая модель` };
  }
  return null;
}

export interface EffectsExplained {
  effects: WeatherEffects;
  presetWhy: string;
  lines: string[];
}

export function effectsFor(cfg: WeatherConfig): EffectsExplained {
  const lines: string[] = [];
  let presetId: string;
  let presetWhy: string;
  const snap = cfg.source === 'manual' ? null : cfg.snapshot;
  if (cfg.effectPreset !== 'auto') {
    presetId = PRESET_BY_ID[cfg.effectPreset] ? cfg.effectPreset : 'clear';
    presetWhy = 'выбран пользователем';
  } else if (cfg.source === 'manual') {
    const m = cfg.manual;
    const map = { none: 'clear', rain: 'precip', snow: 'precip', storm: 'storm', fog: 'fog' } as const;
    presetId = m.phenomenon === 'none' && m.windSpeed !== null && m.windSpeed >= 10 ? 'windy' : map[m.phenomenon];
    presetWhy = `по ручным условиям «${m.label}» (не исторические данные)`;
  } else {
    const a = autoPreset(snap ? centerValues(snap) : null);
    presetId = a.id;
    presetWhy = a.why;
  }
  const overrides: (BandOverride | null)[] = [null, null, null];
  if (cfg.useDataWind) {
    if (snap) {
      const v = centerValues(snap);
      const src = snap.source === 'archive' ? 'ERA5' : 'текущая модель';
      if (v.wind_speed_100m !== null && v.wind_direction_100m !== null) overrides[0] = { speed: v.wind_speed_100m, fromDeg: v.wind_direction_100m, origin: `Open-Meteo, ${src}, ветер на 100 м` };
      else if (v.wind_speed_10m !== null && v.wind_direction_10m !== null) overrides[0] = { speed: v.wind_speed_10m, fromDeg: v.wind_direction_10m, origin: `Open-Meteo, ${src}, ветер на 10 м` };
      overrides[1] = pickUpper(snap, 300, 4000, [850, 700]);
      overrides[2] = pickUpper(snap, 4000, 20000, [500, 300]);
    } else if (cfg.source === 'manual' && cfg.manual.windSpeed !== null && cfg.manual.windDir !== null) {
      overrides[0] = { speed: cfg.manual.windSpeed, fromDeg: cfg.manual.windDir, origin: `ручные условия «${cfg.manual.label}»` };
    }
  }
  const effects = buildEffects(presetId, overrides);
  lines.push(`Игровой пресет «${effects.label}»: ${presetWhy}.`);
  effects.windBands.forEach((b, i) => lines.push(`${BAND_RU[i]}: ${b.origin}.`));
  if (cfg.useDataWind && snap && !snap.upper)
    lines.push('Для средних и верхних слоёв архив ERA5 в этом API даёт только приземные значения; ветер этих слоёв взят из игрового пресета, а не выведен из приземного.');
  return { effects, presetWhy, lines };
}
