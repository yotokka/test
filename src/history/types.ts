/**
 * Модель данных исторического режима.
 * Время исторического действия (date, from/to) хранится отдельно от времени добавления в базу (recordedAt).
 */

/** Номер дня от 1970-01-01 (UTC). Используется движком; интерфейс всегда показывает точность источника. */
export type DayNum = number;

export type Verification =
  | 'document-verified' // проверено по документу
  | 'dataset-import' // импортировано из документированного набора
  | 'needs-check' // требует проверки
  | 'conflicting'; // источники расходятся

/** Точность даты. «ucdp-N» — код точности UCDP N (расшифровка кодбука не сверена); «ucdp-end» — дата окончания эпизода UCDP. */
export type Precision = 'day' | 'month' | 'year' | `ucdp-${string}`;

export type EventCategory = 'statehood' | 'border' | 'capital' | 'conflict' | 'leader' | 'treaty';

export type Op =
  | { op: 'rec+'; fid: number }
  | { op: 'rec-'; fid: number }
  | { op: 'gw+'; entity: string }
  | { op: 'gw-'; entity: string }
  | { op: 'ep+'; ep: string }
  | { op: 'ep-'; ep: string }
  | { op: 'lead'; entity: string; leader: string }
  | { op: 'treaty'; treaty: string; status: TreatyStatus };

export interface SourceRef {
  id: string;
  /** Точное место подтверждения: файл, запись, поле. */
  locator: string;
}

export interface Change {
  kind: string;
  entity?: string;
  text: string;
}

export interface HistEvent {
  id: string;
  /** Техническая дата применения (начало дня). Историческая точность — в поле precision. */
  date: string;
  precision: Precision;
  category: EventCategory;
  dataset: string;
  /** Технический порядок применения событий одного дня; не утверждение об исторической последовательности. */
  tech: number;
  order: number;
  entities: string[];
  changes: Change[];
  ops: Op[];
  sources: SourceRef[];
  verification: Verification;
  key: boolean;
  recordedAt: string;
  conflict?: { otherDate: string; otherSource: string; note: string };
  conflicts?: { entity: string; otherDate: string; otherSource: string; note: string }[];
  noGeometry?: boolean;
  ucdp?: { conflictId: number; type: string; incompatibility: string; maxIntensity: number };
  treaty?: string;
}

export interface NamePeriod {
  name: string;
  from: string;
  to: string | null;
  source: string;
}

export interface Entity {
  id: string;
  code: number;
  names: NamePeriod[];
  records: number[];
  gw: { from: string; to: string | null; microstate: boolean; name: string }[];
  predecessors: { id: string; on: string; overlapKm2: number; method: string }[];
  successors: { id: string; on: string; overlapKm2: number; method: string }[];
}

export interface RecordProps {
  fid: number;
  code: number;
  name: string;
  start: string;
  end: string;
  status: 'independent' | 'colony' | 'protectorate' | 'mandate';
  owner: number;
  cap: string;
  capLon: number;
  capLat: number;
  bdef: number;
  /** Число колец в исходной (неупрощённой) геометрии. */
  rings: number;
}

export interface ConflictEpisode {
  id: string;
  conflictId: number;
  conflictStart: string;
  conflictStartPrec: number;
  start: string;
  startPrec: number;
  end: string | null;
  endKnown: boolean;
  lastYear: number;
  type: string;
  incompatibility: string;
  sideA: string[];
  sideB: string[];
  /** Стороны по годам наблюдения UCDP: состав участников меняется внутри эпизода. */
  sidesByYear: Record<string, { a: string[]; b: string[] }>;
  years: Record<string, number>;
  maxIntensity: number;
}

export interface Leader {
  id: string;
  entity: string;
  name: string;
  start: string;
  end: string;
  entry: string;
  exit: string;
  exitcode: string;
}

export interface DisputedArea {
  id: string;
  ru: string;
  from: string;
  to: string;
  toKnown: boolean;
  geometrySource: string;
  positions: { date: string; text: string; source: string }[];
  status: string;
  areaKm2: number;
}

export interface DatasetInfo {
  name: string;
  version: string;
  md5?: string;
  coverage: { from: string | null; to: string | null; note: string };
  [k: string]: unknown;
}

export interface Manifest {
  schema: number;
  buildId: string;
  importedAt: string;
  fetchedAt: string;
  timeline: { start: string };
  datasets: Record<string, DatasetInfo>;
  counts: Record<string, number>;
}

export type TreatyStatus = 'signed' | 'signed-eif-unknown' | 'in-force' | 'established' | 'partially-ended' | 'terminated' | 'expired';

export interface Treaty {
  id: string;
  ru: string;
  kind: 'treaty' | 'alliance' | 'regime' | 'organization';
  parties: string;
  partyEntities: string[];
  events: { date: string; precision: Precision; status: TreatyStatus; label: string; sourceUrl: string; sourceTitle: string }[];
  verification: Verification;
  note: string;
}
