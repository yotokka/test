import { ENGINE_VERSION } from '../game/engine';
import { regionCenter, REGIONS } from './geo';
import { DEFAULT_SETTINGS } from './settings';
import { FORMAT, FORMAT_VERSION, type HistoryPolicy, type Participant, type Region, type ScenarioDoc } from './types';

export const CATALOG_VERSION = 'catalog-2026-09-26';
export const SIDE_COLORS = ['#83B8AE', '#D58D86', '#AAA0C8', '#D5AD75', '#8FA9C8', '#B5C48A'];

let counter = 0;
/** Идентификаторы сценариев не участвуют в расчёте, поэтому могут зависеть от времени. */
export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  counter += 1;
  return `${prefix}-${rnd}${counter.toString(36)}`;
}

const nowIso = () => new Date().toISOString();

function base(over: Partial<ScenarioDoc> & Pick<ScenarioDoc, 'world' | 'region' | 'frame' | 'episode' | 'title'>): ScenarioDoc {
  const t = nowIso();
  const id = newId('scn');
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    historyBuildId: null,
    catalogVersion: CATALOG_VERSION,
    id,
    description: '',
    createdAt: t,
    updatedAt: t,
    branch: { id: newId('br'), name: 'Основная ветка', parent: null, createdAt: t },
    participants: [],
    relations: {},
    permissionRequired: {},
    objects: [],
    settings: { ...DEFAULT_SETTINGS, autopause: [...DEFAULT_SETTINGS.autopause] },
    weather: {
      source: 'manual',
      snapshot: null,
      manual: { label: 'Ясно (ручные условия)', temperature: null, precipitation: null, cloudCover: null, windSpeed: null, windDir: null, phenomenon: 'none' },
      effectPreset: 'auto',
      useDataWind: true,
    },
    seed: 1990,
    commands: [],
    changeLog: [{ at: t, label: 'Сценарий создан', prov: 'user' }],
    ...over,
  };
}

/** Новая ветка альтернативной истории от выбранной даты. */
export function newHistorical(opts: { buildId: string; date: string; region?: Region; policy?: HistoryPolicy; today?: string }): ScenarioDoc {
  const region = opts.region ?? REGIONS[0];
  const d = base({
    title: `Ветка от ${opts.date.split('-').reverse().join('.')}`,
    world: { kind: 'historical', forkDate: opts.date, policy: opts.policy ?? 'compatible', edits: [] },
    region,
    frame: regionCenter(region),
    episode: { date: opts.date, startTime: '12:00', durationS: 3600, endConditions: ['duration', 'all-finished'] },
    historyBuildId: opts.buildId,
  });
  d.weather.source = opts.today && opts.today === opts.date ? 'current' : 'archive';
  d.changeLog = [{ at: d.createdAt, label: `Ветка создана от исторической даты ${opts.date} (сборка исторических данных ${opts.buildId})`, prov: 'user' }];
  return d;
}

export function testSceneParticipants(): Participant[] {
  return [
    { id: 'A', name: 'Аврелия', entityId: null, color: SIDE_COLORS[0] },
    { id: 'K', name: 'Кассиния', entityId: null, color: SIDE_COLORS[1] },
    { id: 'B', name: 'Борея', entityId: null, color: SIDE_COLORS[2] },
    { id: 'D', name: 'Дельмар', entityId: null, color: SIDE_COLORS[3] },
    { id: 'E', name: 'Эстравия', entityId: null, color: SIDE_COLORS[4] },
    { id: 'X', name: 'Не установлено', entityId: null, unknown: true, color: '#A7B2BF' },
  ];
}

/** Условная испытательная сцена с вымышленными странами и масштабом. */
export function newTestScene(title = 'Испытательная сцена'): ScenarioDoc {
  return base({
    title,
    world: { kind: 'test-scene', sceneId: 'polygon-1' },
    region: { id: 'polygon-1', label: 'Полигон (вымышленная карта)', bbox: [-500, -320, 500, 320] },
    frame: null,
    episode: { date: '1985-06-01', startTime: '10:00', durationS: 3600, endConditions: ['duration', 'all-finished'] },
    participants: testSceneParticipants(),
  });
}

/** Продолжить новой веткой: исходный сценарий не меняется. atT — момент эпизода, до которого сохраняются команды. */
export function forkChild(doc: ScenarioDoc, opts: { name?: string; atT?: number | null } = {}): ScenarioDoc {
  const c = structuredClone(doc);
  const t = nowIso();
  c.id = newId('scn');
  c.createdAt = t;
  c.updatedAt = t;
  const atT = opts.atT ?? null;
  c.branch = { id: newId('br'), name: opts.name ?? `Ветка от «${doc.branch.name}»`, parent: { id: doc.id, name: doc.branch.name, atT }, createdAt: t };
  if (atT !== null) c.commands = c.commands.filter((x) => x.t <= atT + 1e-9);
  c.changeLog = [...c.changeLog, { at: t, label: atT !== null ? `Новая ветка от момента эпизода ${Math.round(atT)} с` : 'Новая ветка', prov: 'user' }];
  delete c.demo;
  return c;
}
