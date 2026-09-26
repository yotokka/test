/**
 * Типы ИГРОВОЙ воздушной модели. Все классы, параметры, стороны и правила условны.
 * Модуль не импортирует справочную базу (src/data/reference) и историческую базу (src/history):
 * опубликованные характеристики реальных систем в расчёт не попадают (проверяется тестом).
 *
 * Единицы: положение — км в плоской условной системе (x — восток, y — север); высота — м;
 * скорость — м/с; время — с игрового эпизода; ресурсы — условные единицы (у.е.).
 */

/** Игровая категория воздушного объекта — по ней ПВО определяет совместимость. */
export type AirCategory = 'aircraft' | 'uav' | 'cruise' | 'ballistic' | 'missile';

export type ClassKind =
  | 'fighter'
  | 'bomber'
  | 'recon'
  | 'support'
  | 'uav'
  | 'cruise'
  | 'ballistic'
  | 'air-missile'
  | 'sam-missile'
  | 'ad-post'
  | 'radar'
  | 'airfield'
  | 'launcher';

export type MotionType = 'aero' | 'ballistic' | 'static';

export interface MotionProfile {
  type: MotionType;
  /** м/с */
  cruiseSpeed: number;
  maxSpeed: number;
  minSpeed: number;
  /** м/с² */
  accel: number;
  /** град/с — ограничение скорости поворота */
  turnRate: number;
  /** м/с */
  climbRate: number;
  sinkRate: number;
  /** м — высота крейсерского полёта по умолчанию */
  cruiseAlt: number;
  maxAlt: number;
  /** Игровой коэффициент сноса ветром (0 — ветер не учитывается). */
  windFactor: number;
  /** Только для баллистического игрового профиля: высота вершины дуги (м) и время разгона (с). Анимация, не баллистика. */
  apexAlt?: number;
  boostS?: number;
}

export interface SensorSpec {
  /** км */
  rangeKm: number;
  /** Базовая игровая вероятность обнаружения за одну проверку. */
  detectP: number;
  /** с — время сопровождения до попытки классификации */
  classifyS: number;
}

export interface WeaponSpec {
  /** Класс игрового объекта, который выпускается при взаимодействии. */
  projectile: string;
  /** у.е. — запас по умолчанию */
  stock: number;
  /** км */
  rangeKm: number;
  /** с — задержка между пусками */
  cooldownS: number;
  /** Игровая совместимость с категориями: 0 — несовместимо, иначе множитель к базовой вероятности. */
  compat: Partial<Record<AirCategory, number>>;
  /** Базовая игровая вероятность успешного взаимодействия. */
  baseP: number;
}

export interface GameClass {
  id: string;
  /** Условный код, например «И-α». */
  code: string;
  name: string;
  kind: ClassKind;
  airCategory?: AirCategory;
  motion?: MotionProfile;
  sensor?: SensorSpec;
  weapon?: WeaponSpec;
  /** Игровая заметность 0…1 */
  signature: number;
  /** с — игровая продолжительность полёта (топливо в секундах) */
  enduranceS?: number;
  /** с — подготовка к вылету или пуску */
  prepS?: number;
  /** Какие классы можно подвесить/загрузить (носитель или пусковая). */
  payloadClasses?: string[];
  payloadMax?: number;
  /** Для управляемых снарядов: предельное время полёта и радиус сближения. */
  maxFlightS?: number;
  proximityKm?: number;
  description: string;
}

export interface Vec {
  x: number;
  y: number;
}
export interface Waypoint extends Vec {
  /** м; если не задано — крейсерская высота класса */
  alt?: number;
}

export type MissionKind = 'transit' | 'patrol' | 'recon' | 'release' | 'intercept-area' | 'launch' | 'none';

export interface PayloadSpec {
  classId: string;
  count: number;
  /** Условная точка назначения отделившегося объекта (в плоских км). */
  aim: Vec;
}

/** Объект в начальном состоянии эпизода (подготовлен сценарием). */
export interface ObjectSetup {
  id: string;
  classId: string;
  side: string;
  label: string;
  pos: Vec;
  alt?: number;
  /** с — время появления/готовности в эпизоде */
  startS: number;
  route: Waypoint[];
  mission: MissionKind;
  /** с — продолжительность сценарного действия (патруль, разведка) */
  holdS?: number;
  payload: PayloadSpec[];
  /** Доля крейсерской скорости 0.5…1.2 */
  speedFactor?: number;
  /** Переопределение запаса игрового ресурса. */
  stock?: number;
  /** Сторона-владелец условной области назначения (вычисляется сценарием по карте), null — не участник. */
  destinationOwner: string | null;
  /** Для отделяемых/пускаемых объектов: сторона-владелец области назначения каждой нагрузки. */
  payloadOwners?: (string | null)[];
}

export type RelationStatus = 'alliance' | 'neutral' | 'conflict';
export interface PairRelation {
  status: RelationStatus;
  jointDefense: boolean;
}

export interface SideSetup {
  id: string;
  name: string;
  /** Сторона «не установлено»: её объекты рассматриваются как объекты неустановленного происхождения (П-4) */
  unknown?: boolean;
}

export interface WindBand {
  /** м — верхняя граница слоя */
  maxAlt: number;
  /** м/с — компоненты ветра, КУДА дует (восток, север) */
  u: number;
  v: number;
  /** Откуда взято значение для этого слоя — показывается в журнале. */
  origin: string;
}

export interface WeatherEffects {
  presetId: string;
  label: string;
  /** Множитель к вероятности обнаружения */
  detectFactor: number;
  /** Множитель ко времени классификации */
  classifyFactor: number;
  /** град/с — случайная болтанка курса (игровой эффект) */
  turbulence: number;
  windBands: WindBand[];
  note: string;
}

export type Awareness = 'full' | 'limited';
export type ControlMode = 'auto' | 'manual';
export type Randomness = 'none' | 'low' | 'normal';
export type MotionPreset = 'standard' | 'smooth' | 'agile';
export type InteractionPreset = 'standard' | 'cautious' | 'permissive';
export type ResourcePreset = 'scarce' | 'standard' | 'ample';
export type EndCondition = 'duration' | 'all-finished' | 'first-outcome';

export interface EpisodeSetup {
  seed: number;
  /** с — фиксированный шаг модели */
  dt: number;
  durationS: number;
  endConditions: EndCondition[];
  sides: SideSetup[];
  /** Ключ — пара сторон в алфавитном порядке «a|b» */
  relations: Record<string, PairRelation>;
  permissionRequired: Record<string, boolean>;
  objects: ObjectSetup[];
  classes: Record<string, GameClass>;
  weather: WeatherEffects;
  awareness: Awareness;
  control: ControlMode;
  randomness: Randomness;
  motionPreset: MotionPreset;
  interactionPreset: InteractionPreset;
  resources: ResourcePreset;
  /** с — частота контрольных снимков для перемотки */
  checkpointEveryS: number;
}

/* ———— Команды пользователя ———— */

export type CommandBody =
  | { type: 'rtb'; objectId: string }
  | { type: 'hold'; objectId: string; seconds: number }
  | { type: 'set-alt'; objectId: string; alt: number }
  | { type: 'set-speed'; objectId: string; factor: number }
  | { type: 'release'; objectId: string }
  | { type: 'authorize'; unitSide: string; objectId: string }
  | { type: 'deny'; unitSide: string; objectId: string }
  | { type: 'weapons'; unitId: string; mode: 'hold' | 'free' };

/** Команда с временной отметкой эпизода. Применяется ровно один раз на первом шаге с t ≥ отметки. */
export type Command = CommandBody & { id: string; t: number };

/* ———— Состояние ———— */

export type Phase = 'pending' | 'prep' | 'flight' | 'action' | 'return' | 'done';
export type Outcome = 'none' | 'arrived' | 'completed' | 'landed' | 'intercepted' | 'fuel' | 'expired' | 'missed';

export interface TrailPoint {
  x: number;
  y: number;
  alt: number;
}

export interface Ent {
  id: string;
  classId: string;
  side: string;
  label: string;
  kind: ClassKind;
  /** Для отделившихся и выпущенных объектов — кто их выпустил. */
  parentId: string | null;
  x: number;
  y: number;
  alt: number;
  /** м/с — воздушная скорость */
  spd: number;
  /** Единичный вектор курса */
  hx: number;
  hy: number;
  /** м/с — путевая скорость (с ветром), для отрисовки ориентации следа */
  gvx: number;
  gvy: number;
  phase: Phase;
  outcome: Outcome;
  route: Waypoint[];
  wp: number;
  mission: MissionKind;
  holdLeft: number;
  /** с игрового топлива */
  fuel: number;
  home: Vec;
  speedFactor: number;
  targetAlt: number | null;
  startS: number;
  prepLeft: number;
  payload: PayloadSpec[];
  payloadOwners: (string | null)[];
  stock: number;
  cooldownUntil: number;
  weaponsFree: boolean;
  /** Для снарядов: цель и сторона, от имени которой выполнено взаимодействие */
  targetId: string | null;
  flightS: number;
  destinationOwner: string | null;
  aim: Vec | null;
  /** Баллистический профиль: точка старта и пройденная доля */
  from: Vec | null;
  progress: number;
  trail: TrailPoint[];
  /** Номер записи журнала, объясняющей появление (для цепочки «Почему?») */
  causeSeq: number;
  /** Номер записи журнала с итогом */
  outcomeSeq: number;
  orbitSign: number;
  /** Центр круга ожидания/патрулирования */
  orbitC: Vec | null;
  /** После ожидания продолжить маршрут */
  resume: boolean;
  /** Однократные пояснения, уже записанные в журнал */
  noted: string[];
}

export type Decision = 'none' | 'observe' | 'share' | 'escort' | 'verify' | 'await-permission' | 'await-user' | 'authorized' | 'denied';

export interface Track {
  objectId: string;
  side: string;
  firstSeen: number;
  lastSeen: number;
  since: number;
  classified: boolean;
  nextClassifyAt: number;
  decision: Decision;
  decisionAt: number;
  verifyUntil: number;
  permissionAt: number;
  detectSeq: number;
  classifySeq: number;
  decisionSeq: number;
  noted: string[];
}

export type EventKind =
  | 'spawn'
  | 'phase'
  | 'detect'
  | 'classify'
  | 'decision'
  | 'permission'
  | 'launch'
  | 'separation'
  | 'interaction'
  | 'outcome'
  | 'resource'
  | 'command'
  | 'weather'
  | 'system';

/** Происхождение записи: игровая модель, действие пользователя или допущение сценария. */
export type Provenance = 'model' | 'user' | 'assumption';

export interface Condition {
  label: string;
  value: string;
  ok?: boolean;
}

export interface GameEvent {
  seq: number;
  t: number;
  kind: EventKind;
  prov: Provenance;
  objectId?: string;
  unitId?: string;
  side?: string;
  title: string;
  reason: string;
  rule?: string;
  conditions?: Condition[];
  roll?: { p: number; r: number };
  /** Записи, из которых вытекает эта (цепочка «Почему?») */
  causes: number[];
  /** Подробность: 1 — главное, 2 — обычное, 3 — всё */
  detail: 1 | 2 | 3;
}

export interface PendingAction {
  side: string;
  objectId: string;
  since: number;
  decisionSeq: number;
}

export interface GameState {
  step: number;
  t: number;
  rng: number;
  ents: Ent[];
  tracks: Track[];
  log: GameEvent[];
  finished: boolean;
  finishReason: string;
  cmdIdx: number;
  nextNo: number;
  /** Очередь решений, ждущих пользователя (ручной режим) */
  pending: PendingAction[];
}
