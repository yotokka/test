import { WEATHER_VARS, type GridPoint, type UpperLevel, type WeatherSnapshot, type WeatherValues } from './types';

/**
 * Клиент Open-Meteo. Документация прочитана из исходного кода официального сайта
 * (github.com/open-meteo/open-meteo-website, коммит 5cc7ca6 от 24.09.2026): сам сайт из среды сборки
 * был недоступен. Живые ответы API в среде сборки не проверялись: запросы выполняет браузер пользователя.
 *
 * Архив: /v1/archive, модель ERA5 (0,25° ≈ 25 км, с 1940 г., обновление ежедневно с задержкой около 5 дней).
 * Выбрана одна модель, а не «best match», чтобы данные разных лет были согласованы.
 * Текущая погода: /v1/forecast, параметр current (15-минутные данные модели), модель best_match;
 * ветер на изобарических уровнях — из hourly для центральной точки.
 * Условия бесплатного API: только некоммерческое использование, < 10 000 вызовов в сутки, 5 000 в час,
 * 600 в минуту; данные — CC BY 4.0 с указанием источника.
 */

export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';
export const ARCHIVE_FIRST_DAY = '1940-01-01';
/** Задержка обновления ERA5 по документации: «Daily with 5 days delay». */
export const ERA5_DELAY_DAYS = 5;
export const UPPER_LEVELS = [850, 700, 500, 300] as const;

export type WeatherErrorCode = 'offline' | 'blocked' | 'http' | 'api' | 'timeout' | 'range' | 'parse';

export class WeatherError extends Error {
  code: WeatherErrorCode;
  constructor(code: WeatherErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const ERROR_RU: Record<WeatherErrorCode, string> = {
  offline: 'Нет подключения к сети.',
  blocked: 'Запрос не дошёл до Open-Meteo: его заблокировали браузер, политика страницы или сетевой фильтр.',
  http: 'Сервер Open-Meteo ответил ошибкой.',
  api: 'Open-Meteo отклонил запрос.',
  timeout: 'Сервер не ответил за отведённое время.',
  range: 'Для этой даты архив недоступен.',
  parse: 'Ответ не удалось разобрать.',
};

/** Сетка точек по области: n × n узлов, центр — первый. */
export function gridPoints(bbox: [number, number, number, number], n: number): { lat: number; lon: number }[] {
  const [w, s, e, nn] = bbox;
  const pts: { lat: number; lon: number }[] = [{ lat: round2((s + nn) / 2), lon: round2((w + e) / 2) }];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const lat = round2(s + ((nn - s) * (i + 0.5)) / n);
      const lon = round2(w + ((e - w) * (j + 0.5)) / n);
      pts.push({ lat, lon });
    }
  return pts;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

export function archiveRequest(pts: { lat: number; lon: number }[], date: string): string {
  const q = new URLSearchParams({
    latitude: pts.map((p) => p.lat).join(','),
    longitude: pts.map((p) => p.lon).join(','),
    start_date: date,
    end_date: date,
    hourly: WEATHER_VARS.join(','),
    models: 'era5',
    timezone: 'GMT',
    wind_speed_unit: 'ms',
  });
  return `${ARCHIVE_URL}?${q.toString()}`;
}

export function currentRequest(pts: { lat: number; lon: number }[]): string {
  const upper = UPPER_LEVELS.flatMap((l) => [`wind_speed_${l}hPa`, `wind_direction_${l}hPa`, `geopotential_height_${l}hPa`]);
  const q = new URLSearchParams({
    latitude: pts.map((p) => p.lat).join(','),
    longitude: pts.map((p) => p.lon).join(','),
    current: WEATHER_VARS.join(','),
    hourly: upper.join(','),
    forecast_days: '1',
    timezone: 'GMT',
    wind_speed_unit: 'ms',
  });
  return `${FORECAST_URL}?${q.toString()}`;
}

/** Проверка даты для архива. Возвращает текст причины или null. */
export function archiveDateProblem(date: string, today: string): string | null {
  if (date < ARCHIVE_FIRST_DAY) return 'Архив Open-Meteo (ERA5) начинается с 1940 г.';
  const lag = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  if (lag < 0) return 'Дата в будущем: архивных данных нет.';
  if (lag < ERA5_DELAY_DAYS) return `ERA5 обновляется с задержкой около ${ERA5_DELAY_DAYS} дней: для этой даты данных ещё может не быть. Текущая погода вместо архивной не подставляется.`;
  return null;
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function getJson(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new WeatherError('offline', ERROR_RU.offline);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetcher(url, ctl ? { signal: ctl.signal } : undefined);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new WeatherError('timeout', ERROR_RU.timeout);
    throw new WeatherError('blocked', `${ERROR_RU.blocked} (${(e as Error).message || 'сетевая ошибка'})`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new WeatherError('http', `${ERROR_RU.http} HTTP ${res.status}.`);
    throw new WeatherError('parse', ERROR_RU.parse);
  }
  const b = body as { error?: boolean; reason?: string };
  if (b && typeof b === 'object' && !Array.isArray(b) && b.error) throw new WeatherError('api', `${ERROR_RU.api} ${b.reason ?? ''}`.trim());
  if (!res.ok) throw new WeatherError('http', `${ERROR_RU.http} HTTP ${res.status}${res.status === 429 ? ' — превышен лимит бесплатного API' : ''}.`);
  return body;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface LocResp {
  latitude?: number;
  longitude?: number;
  hourly?: Record<string, unknown[]> & { time?: string[] };
  hourly_units?: Record<string, string>;
  current?: Record<string, unknown> & { time?: string };
  current_units?: Record<string, string>;
}

/** Разбор ответа архива: берётся час начала эпизода. Отсутствующие значения остаются null. */
export function parseArchive(body: unknown, pts: { lat: number; lon: number }[], date: string, hour: number, request: string, fetchedAt: string): WeatherSnapshot {
  const list = (Array.isArray(body) ? body : [body]) as LocResp[];
  if (!list.length || !list[0]?.hourly?.time) throw new WeatherError('parse', ERROR_RU.parse);
  const want = `${date}T${String(hour).padStart(2, '0')}:00`;
  const grid: GridPoint[] = list.map((loc, i) => {
    const idx = loc.hourly?.time?.indexOf(want) ?? -1;
    const values = Object.fromEntries(WEATHER_VARS.map((v) => [v, idx >= 0 ? num(loc.hourly?.[v]?.[idx]) : null])) as WeatherValues;
    return { lat: pts[i]?.lat ?? num(loc.latitude) ?? 0, lon: pts[i]?.lon ?? num(loc.longitude) ?? 0, cellLat: num(loc.latitude), cellLon: num(loc.longitude), values };
  });
  return {
    id: `wx-archive-${date}-${hour}-${fetchedAt}`,
    source: 'archive',
    provider: 'Open-Meteo',
    request,
    model: 'era5',
    modelNote: 'ERA5 — реанализ ECMWF, сетка 0,25° (около 25 км), почасовые значения. Реанализ — модельная оценка, а не наблюдение в точке.',
    fetchedAt,
    validTime: `${want}Z`,
    center: { lat: pts[0].lat, lon: pts[0].lon },
    gridSize: Math.round(Math.sqrt(Math.max(1, grid.length - 1))),
    grid,
    units: list[0].hourly_units ?? {},
    upper: null,
    attribution: ATTRIBUTION,
  };
}

/** Разбор текущей погоды: значения current; изобарические уровни — из hourly центральной точки. */
export function parseCurrent(body: unknown, pts: { lat: number; lon: number }[], request: string, fetchedAt: string): WeatherSnapshot {
  const list = (Array.isArray(body) ? body : [body]) as LocResp[];
  if (!list.length || !list[0]?.current) throw new WeatherError('parse', ERROR_RU.parse);
  const grid: GridPoint[] = list.map((loc, i) => ({
    lat: pts[i]?.lat ?? 0,
    lon: pts[i]?.lon ?? 0,
    cellLat: num(loc.latitude),
    cellLon: num(loc.longitude),
    values: Object.fromEntries(WEATHER_VARS.map((v) => [v, num(loc.current?.[v])])) as WeatherValues,
  }));
  const c0 = list[0];
  const time = String(c0.current?.time ?? '');
  const hourKey = time.slice(0, 13) + ':00';
  const hIdx = c0.hourly?.time?.indexOf(hourKey) ?? -1;
  const upper: UpperLevel[] | null =
    hIdx >= 0
      ? UPPER_LEVELS.map((l) => ({
          hPa: l,
          heightM: num(c0.hourly?.[`geopotential_height_${l}hPa`]?.[hIdx]),
          windSpeed: num(c0.hourly?.[`wind_speed_${l}hPa`]?.[hIdx]),
          windDir: num(c0.hourly?.[`wind_direction_${l}hPa`]?.[hIdx]),
        }))
      : null;
  return {
    id: `wx-current-${fetchedAt}`,
    source: 'current',
    provider: 'Open-Meteo',
    request,
    model: 'best_match',
    modelNote: 'Прогнозная модель, выбранная Open-Meteo для точки («best match»); текущие условия — 15-минутные модельные данные, а не наблюдение на месте.',
    fetchedAt,
    validTime: time ? `${time}Z` : '',
    center: { lat: pts[0].lat, lon: pts[0].lon },
    gridSize: Math.round(Math.sqrt(Math.max(1, grid.length - 1))),
    grid,
    units: c0.current_units ?? {},
    upper,
    attribution: ATTRIBUTION,
  };
}

export interface FetchOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
  now?: () => Date;
}

const defaultFetcher: Fetcher = (url, init) => fetch(url, init as RequestInit);

export async function fetchArchive(bbox: [number, number, number, number], date: string, hour: number, n: number, opt: FetchOptions = {}): Promise<WeatherSnapshot> {
  const now = (opt.now ?? (() => new Date()))();
  const problem = archiveDateProblem(date, now.toISOString().slice(0, 10));
  if (problem && !problem.startsWith('ERA5 обновляется')) throw new WeatherError('range', problem);
  const pts = gridPoints(bbox, n);
  const url = archiveRequest(pts, date);
  const body = await getJson(url, opt.fetcher ?? defaultFetcher, opt.timeoutMs ?? 15000);
  return parseArchive(body, pts, date, hour, url, now.toISOString());
}

export async function fetchCurrent(bbox: [number, number, number, number], n: number, opt: FetchOptions = {}): Promise<WeatherSnapshot> {
  const now = (opt.now ?? (() => new Date()))();
  const pts = gridPoints(bbox, n);
  const url = currentRequest(pts);
  const body = await getJson(url, opt.fetcher ?? defaultFetcher, opt.timeoutMs ?? 15000);
  return parseCurrent(body, pts, url, now.toISOString());
}

/** WMO-коды, которые возвращает API (подмножество WMO 4677, по документации Open-Meteo). */
export const WMO_RU: Record<number, string> = {
  0: 'ясно',
  1: 'преимущественно ясно',
  2: 'переменная облачность',
  3: 'пасмурно',
  45: 'туман',
  48: 'туман с изморозью',
  51: 'слабая морось',
  53: 'умеренная морось',
  55: 'сильная морось',
  56: 'слабая переохлаждённая морось',
  57: 'сильная переохлаждённая морось',
  61: 'слабый дождь',
  63: 'умеренный дождь',
  65: 'сильный дождь',
  66: 'слабый ледяной дождь',
  67: 'сильный ледяной дождь',
  71: 'слабый снег',
  73: 'умеренный снег',
  75: 'сильный снег',
  77: 'снежные зёрна',
  80: 'слабый ливень',
  81: 'умеренный ливень',
  82: 'очень сильный ливень',
  85: 'слабый снегопад',
  86: 'сильный снегопад',
  95: 'гроза',
  96: 'гроза со слабым градом',
  97: 'сильная гроза',
  99: 'гроза с сильным градом',
};

export type Phenomenon = 'none' | 'rain' | 'snow' | 'storm' | 'fog' | 'drizzle';

/** Явление для анимации по коду WMO. null-код — явление не установлено. */
export function phenomenonOf(code: number | null): Phenomenon | null {
  if (code === null) return null;
  if (code >= 95) return 'storm';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 61 || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  return 'none';
}

/** Описание источника погоды для раздела «Источники». */
export const WEATHER_SOURCE = {
  title: 'Open-Meteo — Historical Weather API и Forecast API',
  publisher: 'Open-Meteo',
  docs: 'https://open-meteo.com/en/docs/historical-weather-api',
  terms: 'https://open-meteo.com/en/terms',
  licence: 'https://open-meteo.com/en/licence',
  docsSource: 'https://github.com/open-meteo/open-meteo-website (коммит 5cc7ca6, 24.09.2026)',
  conditions:
    'Бесплатный API — только некоммерческое использование; меньше 10 000 вызовов в сутки, 5 000 в час, 600 в минуту; данные — CC BY 4.0 с указанием источника. Коммерческое использование — по платной подписке.',
  models: 'Архив: ERA5 (0,25° ≈ 25 км, с 1940 г., задержка около 5 дней). Текущая погода: best match (15-минутные данные модели), изобарические уровни 850/700/500/300 гПа.',
  checked: 'Условия и описание прочитаны из исходного кода сайта в репозитории GitHub; сам сайт и живые ответы API из среды сборки недоступны. Запросы выполняет браузер пользователя.',
};
