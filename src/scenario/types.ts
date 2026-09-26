import type { Command, EndCondition, MissionKind, PairRelation, Vec, Waypoint } from '../game/types';
import type {
  Awareness,
  ControlMode,
  EventKind,
  InteractionPreset,
  MotionPreset,
  Randomness,
  ResourcePreset,
} from '../game/types';
import type { WeatherConfig } from '../weather/types';

/**
 * Формат сценария альтернативной истории. Историческая база не копируется в сценарий: хранится дата
 * ветвления, версия сборки исторических данных и пользовательские изменения мира. Поэтому исходная
 * история остаётся неизменной и доступной для сравнения.
 */

export const FORMAT = 'atlas-scenario';
export const FORMAT_VERSION = 1;

/** Правило продолжения исторических событий после точки ветвления. */
export type HistoryPolicy = 'stop' | 'compatible';

export type WorldEdit =
  | { id: string; day: string; kind: 'remove-entity'; entity: string; note?: string }
  | { id: string; day: string; kind: 'merge-entities'; absorbed: string; into: string; note?: string }
  | { id: string; day: string; kind: 'preserve-entity'; entity: string; note?: string }
  | { id: string; day: string; kind: 'suppress-event'; eventId: string; note?: string }
  | { id: string; day: string; kind: 'assumption'; text: string };

export interface HistoricalWorld {
  kind: 'historical';
  forkDate: string;
  policy: HistoryPolicy;
  edits: WorldEdit[];
}
export interface TestSceneWorld {
  kind: 'test-scene';
  sceneId: 'polygon-1';
}

export interface Participant {
  id: string;
  name: string;
  /** Исторический субъект, от имени которого выступает сторона (null — вымышленная сторона) */
  entityId: string | null;
  unknown?: boolean;
  color: string;
}

export interface PlacedObject {
  id: string;
  classId: string;
  side: string;
  label: string;
  pos: Vec;
  alt?: number | null;
  startS: number;
  route: Waypoint[];
  mission: MissionKind;
  holdS?: number;
  payload: { classId: string; count: number; aim: Vec }[];
  speedFactor?: number;
  stock?: number | null;
  /** Историческая модификация из справочника — только подпись к игровому профилю */
  histRef?: string | null;
  note?: string;
}

export interface ScenarioSettings {
  availability: 'strict' | 'warn' | 'free';
  playbackSpeed: number;
  awareness: Awareness;
  control: ControlMode;
  randomness: Randomness;
  motionPreset: MotionPreset;
  interactionPreset: InteractionPreset;
  resources: ResourcePreset;
  autopause: EventKind[];
  logDetail: 1 | 2 | 3;
  checkpointEveryS: number;
  quality: 'low' | 'medium' | 'high';
}

export interface ChangeEntry {
  at: string;
  label: string;
  prov: 'user' | 'assumption';
}

export interface Region {
  id: string;
  label: string;
  /** [запад, юг, восток, север], градусы */
  bbox: [number, number, number, number];
}

export interface ScenarioDoc {
  format: typeof FORMAT;
  formatVersion: number;
  engineVersion: string;
  /** Идентификатор сборки исторической базы (manifest.buildId); null — испытательная сцена */
  historyBuildId: string | null;
  catalogVersion: string;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string; parent: { id: string; name: string; atT: number | null } | null; createdAt: string };
  world: HistoricalWorld | TestSceneWorld;
  region: Region;
  /** Начало плоской системы координат (км) — фиксируется при создании ветки */
  frame: { lon0: number; lat0: number } | null;
  episode: { date: string; startTime: string; durationS: number; endConditions: EndCondition[] };
  participants: Participant[];
  relations: Record<string, PairRelation>;
  permissionRequired: Record<string, boolean>;
  objects: PlacedObject[];
  settings: ScenarioSettings;
  weather: WeatherConfig;
  seed: number;
  commands: Command[];
  changeLog: ChangeEntry[];
  demo?: { id: string; learningGoal: string };
}
