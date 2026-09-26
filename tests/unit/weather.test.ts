import { describe, expect, test } from 'vitest';
import { archiveDateProblem, archiveRequest, fetchArchive, fetchCurrent, gridPoints, parseArchive, phenomenonOf, WeatherError } from '../../src/weather/openMeteo';
import { autoPreset, effectsFor } from '../../src/weather/effects';
import { WEATHER_VARS, type WeatherConfig } from '../../src/weather/types';

/**
 * Ответы ниже — синтетические учебные примеры в формате, описанном в документации Open-Meteo.
 * Это не данные источника: живые ответы API в среде сборки недоступны.
 */
const hourly = (vals: Partial<Record<string, (number | null)[]>>) => ({
  time: ['1990-10-05T08:00', '1990-10-05T09:00', '1990-10-05T10:00'],
  ...Object.fromEntries(WEATHER_VARS.map((v) => [v, vals[v] ?? [null, null, null]])),
});
const loc = (vals: Partial<Record<string, (number | null)[]>>) => ({ latitude: 50.5, longitude: 13.5, hourly_units: { temperature_2m: '°C', wind_speed_10m: 'm/s' }, hourly: hourly(vals) });
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
const now = () => new Date('2026-09-26T12:00:00Z');
const bbox: [number, number, number, number] = [2, 45, 25, 56];

describe('погода: запросы и разбор', () => {
  test('архив запрашивается у одной модели ERA5 в м/с и UTC', () => {
    const url = archiveRequest(gridPoints(bbox, 2), '1990-10-05');
    expect(url).toContain('archive-api.open-meteo.com/v1/archive');
    expect(url).toContain('models=era5');
    expect(url).toContain('wind_speed_unit=ms');
    expect(url).toContain('timezone=GMT');
    expect(url).toContain('start_date=1990-10-05');
  });

  test('отсутствующие значения остаются null, а не 0', () => {
    const pts = gridPoints(bbox, 1);
    const body = [loc({ temperature_2m: [10, 11, 12], wind_speed_10m: [3, null, 5] }), loc({})];
    const s = parseArchive(body, pts, '1990-10-05', 9, 'url', '2026-09-26T12:00:00Z');
    expect(s.grid[0].values.temperature_2m).toBe(11);
    expect(s.grid[0].values.wind_speed_10m).toBeNull();
    expect(s.grid[0].values.cloud_cover).toBeNull();
    expect(s.grid[1].values.temperature_2m).toBeNull();
    expect(s.validTime).toBe('1990-10-05T09:00Z');
  });

  test('при отсутствии данных пресет выбирается как игровое допущение, а не как «ясно по данным»', () => {
    const v = Object.fromEntries(WEATHER_VARS.map((k) => [k, null])) as never;
    const a = autoPreset(v);
    expect(a.known).toBe(false);
    expect(a.why).toMatch(/допущение/);
  });

  test('коды WMO переводятся в явления для анимации', () => {
    expect(phenomenonOf(95)).toBe('storm');
    expect(phenomenonOf(73)).toBe('snow');
    expect(phenomenonOf(63)).toBe('rain');
    expect(phenomenonOf(45)).toBe('fog');
    expect(phenomenonOf(null)).toBeNull();
  });
});

describe('погода без сети', () => {
  test('заблокированный запрос даёт понятную причину', async () => {
    const fetcher = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(fetchArchive(bbox, '1990-10-05', 9, 2, { fetcher, now })).rejects.toMatchObject({ code: 'blocked' });
  });

  test('ошибка API и превышение лимита распознаются', async () => {
    const api = async () => ({ ok: false, status: 400, json: async () => ({ error: true, reason: 'Latitude must be in range' }) });
    await expect(fetchArchive(bbox, '1990-10-05', 9, 2, { fetcher: api, now })).rejects.toMatchObject({ code: 'api' });
    const lim = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const err = await fetchArchive(bbox, '1990-10-05', 9, 2, { fetcher: lim, now }).catch((e: WeatherError) => e);
    expect((err as WeatherError).message).toMatch(/лимит/);
  });

  test('архив до 1940 г. и в будущем не запрашивается', async () => {
    expect(archiveDateProblem('1939-12-31', '2026-09-26')).toMatch(/1940/);
    expect(archiveDateProblem('2026-10-01', '2026-09-26')).toMatch(/будущем/);
    expect(archiveDateProblem('2026-09-24', '2026-09-26')).toMatch(/задержкой/);
    await expect(fetchArchive(bbox, '1939-06-01', 9, 2, { fetcher: ok({}), now })).rejects.toMatchObject({ code: 'range' });
  });

  test('без снимка эпизод работает на ручных условиях или пресете', () => {
    const cfg: WeatherConfig = { source: 'archive', snapshot: null, manual: { label: 'x', temperature: null, precipitation: null, cloudCover: null, windSpeed: null, windDir: null, phenomenon: 'none' }, effectPreset: 'auto', useDataWind: true };
    const e = effectsFor(cfg);
    expect(e.effects.presetId).toBe('clear');
    expect(e.lines.join(' ')).toMatch(/допущение/);
    expect(e.effects.windBands.every((b) => b.origin.startsWith('игровой пресет'))).toBe(true);
  });

  test('текущая погода: высотный ветер берётся с изобарических уровней, а не из приземного', async () => {
    const body = [
      {
        latitude: 50.5,
        longitude: 13.5,
        current: { time: '2026-09-26T12:00', ...Object.fromEntries(WEATHER_VARS.map((v) => [v, v === 'wind_speed_100m' ? 9 : v === 'wind_direction_100m' ? 280 : v === 'weather_code' ? 61 : null])) },
        hourly: { time: ['2026-09-26T12:00'], wind_speed_850hPa: [15], wind_direction_850hPa: [270], geopotential_height_850hPa: [1480], wind_speed_500hPa: [30], wind_direction_500hPa: [260], geopotential_height_500hPa: [5600] },
      },
    ];
    const s = await fetchCurrent(bbox, 0, { fetcher: ok(body), now });
    expect(s.upper?.find((u) => u.hPa === 850)?.windSpeed).toBe(15);
    expect(s.upper?.find((u) => u.hPa === 700)?.windSpeed).toBeNull();
    const e = effectsFor({ source: 'current', snapshot: s, manual: { label: '', temperature: null, precipitation: null, cloudCover: null, windSpeed: null, windDir: null, phenomenon: 'none' }, effectPreset: 'auto', useDataWind: true });
    expect(e.effects.windBands[0].origin).toMatch(/100 м/);
    expect(e.effects.windBands[1].origin).toMatch(/850 гПа/);
    expect(e.effects.windBands[2].origin).toMatch(/500 гПа/);
  });

  test('архив ERA5 без высотных уровней: верхние слои — игровой пресет с пояснением', async () => {
    const s = await fetchArchive(bbox, '1990-10-05', 9, 0, { fetcher: ok([loc({ wind_speed_100m: [7, 8, 9], wind_direction_100m: [200, 210, 220] })]), now });
    const e = effectsFor({ source: 'archive', snapshot: s, manual: { label: '', temperature: null, precipitation: null, cloudCover: null, windSpeed: null, windDir: null, phenomenon: 'none' }, effectPreset: 'auto', useDataWind: true });
    expect(e.effects.windBands[0].origin).toMatch(/ERA5, ветер на 100 м/);
    expect(e.effects.windBands[1].origin).toMatch(/игровой пресет/);
    expect(e.lines.join(' ')).toMatch(/не выведен из приземного/);
  });
});
