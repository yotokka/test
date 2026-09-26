/**
 * Погодный контекст сценария. Значения хранятся как в ответе источника; отсутствующее значение — null,
 * а не 0. Снимок сохраняется в сценарии, и повтор эпизода использует его, а не новый запрос.
 */

export const WEATHER_VARS = [
  'temperature_2m',
  'precipitation',
  'rain',
  'snowfall',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'wind_speed_100m',
  'wind_direction_100m',
  'weather_code',
] as const;
export type WeatherVar = (typeof WEATHER_VARS)[number];

export type WeatherValues = Record<WeatherVar, number | null>;

export interface GridPoint {
  lat: number;
  lon: number;
  /** Центр ячейки модели, который вернул источник (может отличаться от запрошенной точки). */
  cellLat: number | null;
  cellLon: number | null;
  values: WeatherValues;
}

export interface UpperLevel {
  hPa: number;
  /** м над уровнем моря по данным модели (геопотенциальная высота); null — не пришло */
  heightM: number | null;
  windSpeed: number | null;
  windDir: number | null;
}

export type WeatherSource = 'archive' | 'current' | 'manual';

export interface WeatherSnapshot {
  id: string;
  source: 'archive' | 'current';
  provider: string;
  /** Адрес запроса без личных данных — для проверки */
  request: string;
  model: string;
  modelNote: string;
  /** Когда снимок получен (время запроса) */
  fetchedAt: string;
  /** Время данных (час, UTC) */
  validTime: string;
  center: { lat: number; lon: number };
  gridSize: number;
  grid: GridPoint[];
  units: Record<string, string>;
  /** Ветер на изобарических уровнях (только текущая погода) или null — нет данных */
  upper: UpperLevel[] | null;
  attribution: string;
  /** Отметка для учебных тестовых наборов: такие снимки не являются данными источника */
  synthetic?: boolean;
}

export interface ManualWeather {
  label: string;
  /** °C; null — не задано */
  temperature: number | null;
  /** мм/ч */
  precipitation: number | null;
  /** % */
  cloudCover: number | null;
  /** м/с и направление «откуда» у земли */
  windSpeed: number | null;
  windDir: number | null;
  /** Условный тип явления для анимации */
  phenomenon: 'none' | 'rain' | 'snow' | 'storm' | 'fog';
}

export interface WeatherConfig {
  source: WeatherSource;
  snapshot: WeatherSnapshot | null;
  manual: ManualWeather;
  /** Игровой пресет эффектов: «auto» — подобрать по данным по документированным порогам */
  effectPreset: 'auto' | string;
  /** Брать ветер игровых слоёв из данных, где он есть */
  useDataWind: boolean;
}

export const VAR_RU: Record<WeatherVar, string> = {
  temperature_2m: 'Температура на 2 м',
  precipitation: 'Осадки за час',
  rain: 'Дождь за час',
  snowfall: 'Снег за час',
  cloud_cover: 'Облачность',
  wind_speed_10m: 'Ветер на 10 м',
  wind_direction_10m: 'Направление ветра на 10 м',
  wind_gusts_10m: 'Порывы на 10 м',
  wind_speed_100m: 'Ветер на 100 м',
  wind_direction_100m: 'Направление ветра на 100 м',
  weather_code: 'Код погоды WMO',
};
