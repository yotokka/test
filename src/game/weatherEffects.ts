import { headingVec } from './dmath';
import type { WeatherEffects, WindBand } from './types';

/**
 * Игровые погодные пресеты. Числа — условные множители для игровых правил и для сноса в игровой
 * кинематике. Это не физические поправки для какого-либо оружия и не модель атмосферы.
 */

export const BAND_LIMITS = [300, 4000, 100000] as const;
export const BAND_RU = ['приземный слой 0–300 м', 'средний слой 300–4000 м', 'верхний слой выше 4000 м'];

export interface GamePreset {
  id: string;
  label: string;
  detectFactor: number;
  classifyFactor: number;
  turbulence: number;
  /** Игровой ветер по слоям: скорость м/с и направление «откуда», град. */
  winds: [number, number][];
  note: string;
}

export const GAME_PRESETS: GamePreset[] = [
  { id: 'clear', label: 'Ясно', detectFactor: 1, classifyFactor: 1, turbulence: 0, winds: [[0, 0], [0, 0], [0, 0]], note: 'Игровые множители не меняются; ветра нет.' },
  { id: 'windy', label: 'Ветрено', detectFactor: 0.95, classifyFactor: 1.1, turbulence: 1.5, winds: [[12, 270], [25, 270], [40, 270]], note: 'Западный игровой ветер усиливается с высотой; лёгкая болтанка.' },
  { id: 'precip', label: 'Осадки', detectFactor: 0.75, classifyFactor: 1.35, turbulence: 0.8, winds: [[6, 200], [14, 220], [22, 240]], note: 'Обнаружение реже, классификация дольше (игровые множители).' },
  { id: 'storm', label: 'Гроза', detectFactor: 0.6, classifyFactor: 1.6, turbulence: 3, winds: [[16, 230], [28, 240], [38, 250]], note: 'Сильная игровая болтанка и заметное ухудшение обнаружения.' },
  { id: 'fog', label: 'Туман', detectFactor: 0.85, classifyFactor: 1.5, turbulence: 0, winds: [[2, 90], [5, 120], [10, 180]], note: 'Классификация заметно дольше; ветер слабый.' },
];

export const PRESET_BY_ID: Record<string, GamePreset> = Object.fromEntries(GAME_PRESETS.map((p) => [p.id, p]));

/** Вектор ветра «куда дует» из скорости и направления «откуда» (метеорологическая запись). */
export function windUV(speed: number, fromDeg: number): { u: number; v: number } {
  const [sx, sy] = headingVec(fromDeg);
  return { u: -sx * speed, v: -sy * speed };
}

export interface BandOverride {
  speed: number;
  fromDeg: number;
  origin: string;
}

/** Собрать игровые эффекты: множители — из пресета, ветер слоя — из данных, если они есть, иначе из пресета. */
export function buildEffects(presetId: string, overrides: (BandOverride | null)[] = []): WeatherEffects {
  const p = PRESET_BY_ID[presetId] ?? GAME_PRESETS[0];
  const windBands: WindBand[] = BAND_LIMITS.map((maxAlt, i) => {
    const o = overrides[i];
    const [speed, from] = o ? [o.speed, o.fromDeg] : p.winds[i];
    const { u, v } = windUV(speed, from);
    return { maxAlt, u, v, origin: o ? o.origin : `игровой пресет «${p.label}»` };
  });
  return { presetId: p.id, label: p.label, detectFactor: p.detectFactor, classifyFactor: p.classifyFactor, turbulence: p.turbulence, windBands, note: p.note };
}

export function windAt(eff: WeatherEffects, alt: number): WindBand {
  for (const b of eff.windBands) if (alt <= b.maxAlt) return b;
  return eff.windBands[eff.windBands.length - 1];
}
