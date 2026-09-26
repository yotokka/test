/**
 * Типы УЧЕБНОЙ модели. Все сущности вымышлены: страны, карта, профили объектов, посты и параметры.
 * Модуль намеренно не импортирует ничего из справочной базы (src/data/reference).
 */

export type CountryId = 'A' | 'B' | 'K' | 'D' | 'E';
/** Происхождение объекта: вымышленная страна или «не установлено». */
export type OriginId = CountryId | 'X';

export type RelationStatus = 'alliance' | 'neutral' | 'conflict';

export interface PairRelation {
  status: RelationStatus;
  /** Учебное соглашение о совместной обороне. */
  jointDefense: boolean;
}

export interface RelationSettings {
  /** Ключ — пара стран в алфавитном порядке, например "A|B". */
  pairs: Record<string, PairRelation>;
  /** Нужна ли стране учебная санкция на каждый перехват. */
  permissionRequired: Record<CountryId, boolean>;
}

/** Учебные профили — условные аналоги, а не модели реальных изделий. */
export type Profile = 'arc' | 'low' | 'air';

export interface ProfileParams {
  name: string;
  analog: string;
  /** у.е. за такт */
  speed: number;
  /** Множитель к вероятности обнаружения постом за такт (0…1). */
  visibility: number;
  /** Сколько тактов сопровождения нужно для попытки классификации. */
  classifyTicks: number;
  /** Вероятность, что попытка классификации не даст однозначного результата. */
  ambiguity: number;
  /** Множитель к учебной вероятности успешного перехвата. */
  interceptFactor: number;
  classLabel: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PostSpec {
  id: string;
  name: string;
  country: CountryId;
  x: number;
  y: number;
  /** Учебный радиус обнаружения, у.е. */
  detectRadius: number;
  /** Учебный радиус, в котором возможен условный перехват, у.е. */
  engageRadius: number;
  /** Базовая учебная вероятность обнаружения за такт. */
  detectP: number;
  /** Учебный запас перехватчиков. */
  stock: number;
  /** Базовая учебная вероятность успешного условного перехвата. */
  interceptP: number;
}

export interface ObjectSpec {
  id: string;
  label: string;
  profile: Profile;
  origin: OriginId;
  spawnTick: number;
  from: Point;
  to: Point;
  /** Страна, где находится условная область назначения (задана сценарием, пользователь её не выбирает). */
  destination: CountryId;
}

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  learningGoal: string;
  seed: number;
  maxTicks: number;
  relations: RelationSettings;
  posts: PostSpec[];
  objects: ObjectSpec[];
}

export interface SimConfig {
  scenario: Scenario;
  seed: number;
  relations: RelationSettings;
}

export type Stage =
  | 'spawn'
  | 'detect'
  | 'track'
  | 'classify'
  | 'decision'
  | 'permission'
  | 'intercept'
  | 'outcome'
  | 'system';

export interface Roll {
  /** Учебная вероятность события. */
  p: number;
  /** Выпавшее псевдослучайное число. Событие наступает, если r < p. */
  r: number;
}

export interface LogEntry {
  seq: number;
  tick: number;
  stage: Stage;
  objectId?: string;
  postId?: string;
  title: string;
  reason: string;
  rule?: string;
  roll?: Roll;
}

export type ObjStatus = 'pending' | 'flying' | 'intercepted' | 'arrived';

export type Decision =
  | 'none'
  | 'observe'
  | 'share'
  | 'verify'
  | 'await-permission'
  | 'authorized'
  | 'denied';

export interface TrackState {
  detected: boolean;
  trackedTicks: number;
  classified: boolean;
  decision: Decision;
  verifyTicks: number;
  permissionAt: number;
  /** Какие однократные пояснения уже записаны в журнал (чтобы не повторять их каждый такт). */
  noted: string[];
}

export interface ObjState {
  spec: ObjectSpec;
  x: number;
  y: number;
  status: ObjStatus;
  trail: Point[];
  tracks: Record<string, TrackState>;
  attempts: number;
}

export interface InterceptorState {
  id: string;
  postId: string;
  targetId: string;
  x: number;
  y: number;
  trail: Point[];
  launchedAt: number;
}

export interface PostState {
  spec: PostSpec;
  stock: number;
  cooldownUntil: number;
}

export interface SimState {
  tick: number;
  rng: number;
  objects: ObjState[];
  interceptors: InterceptorState[];
  posts: PostState[];
  log: LogEntry[];
  finished: boolean;
  nextInterceptorNo: number;
}

/** Облегчённый кадр для отрисовки на шаге времени. */
export interface Frame {
  tick: number;
  objects: {
    id: string;
    x: number;
    y: number;
    status: ObjStatus;
    trail: Point[];
    detectedBy: string[];
    classified: boolean;
    decision: Decision;
  }[];
  interceptors: { id: string; postId: string; targetId: string; x: number; y: number; trail: Point[] }[];
  posts: { id: string; stock: number }[];
  logCount: number;
}

export interface SimResult {
  frames: Frame[];
  log: LogEntry[];
  fingerprint: string;
  summary: { intercepted: number; arrived: number; interceptorsUsed: number; ticks: number };
}
