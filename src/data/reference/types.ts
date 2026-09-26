/**
 * Типы СПРАВОЧНОЙ базы (реальные системы и документы).
 * Модуль симуляции (src/sim) не импортирует ничего из этой папки — это проверяется тестом.
 */

/** Статус характеристики — как её следует читать. */
export type FigureKind = 'claim' | 'test' | 'estimate';

/**
 * Как именно проверялось значение в этой сборке.
 * - direct: страница первоисточника открыта и значение сверено с текстом.
 * - search-index: страница из среды сборки недоступна; значение и ссылка взяты из поисковой выдачи.
 */
export type CheckMethod = 'direct' | 'search-index';

/** Дата с явной точностью: "2017-11-29", "2017-11" или "2017". null — дата не установлена. */
export type PartialDate = string | null;

export interface Source {
  id: string;
  /** Название публикации так, как оно указано в выдаче/на странице. */
  title: string;
  publisher: string;
  url: string;
  /** Тип источника: влияет на то, как читать сведения. */
  sourceType: 'official' | 'manufacturer' | 'research' | 'museum' | 'treaty-text' | 'media';
  /** Дата публикации самого материала (НЕ дата проверки). */
  published: PartialDate;
  /** Откуда известна дата публикации. */
  publishedNote?: string;
  language: 'en' | 'ru' | 'other';
}

export interface Check {
  /** Дата, когда значение сверялось в этой сборке. */
  date: string;
  method: CheckMethod;
  note?: string;
  /** Источник, который подтверждает формулировку, когда текст основного источника не удалось увидеть. */
  corroboratedBy?: string;
}

export interface RangeFigure {
  id: string;
  kind: FigureKind;
  /** Нижняя граница, км (если указан диапазон). */
  minKm?: number;
  /** Верхняя граница или единственное значение, км. */
  maxKm?: number;
  /** Как сформулировано значение: «более», «до», «около», «диапазон». */
  qualifier: 'more-than' | 'up-to' | 'about' | 'range' | 'exact';
  /** Текстовая формулировка значения на русском, с исходными единицами, если они отличаются. */
  text: string;
  /** К чему относится число: модификация, условия, нагрузка, тип цели. */
  context: string;
  sourceId: string;
  /**
   * Роль источника для этого числа:
   * primary — сам автор числа (ведомство, производитель, исследователь, сделавший оценку);
   * secondary — пересказ чужого числа (например, база данных цитирует официальную цифру);
   * tertiary — энциклопедия или сводка без собственной проверки.
   */
  sourceRole: 'primary' | 'secondary' | 'tertiary';
  check: Check;
}

export type MissileCategory = 'ballistic' | 'cruise' | 'sam';
export type Period = 'ww2' | 'early-cold-war' | 'late-cold-war' | 'post-cold-war' | 'modern';

export interface Missile {
  id: string;
  name: string;
  /** Конкретная модификация, к которой относятся приведённые числа. */
  variant: string;
  altNames?: string[];
  countries: string[];
  category: MissileCategory;
  subclass: string;
  period: Period;
  /** Год начала службы/применения, если он есть в проверенных источниках; иначе null. */
  serviceYear: number | null;
  serviceYearSourceId?: string;
  purpose: string;
  history: string;
  /** Источники для исторической справки (не для чисел). */
  historySourceIds: string[];
  ranges: RangeFigure[];
  /** Пояснение, почему оценки расходятся (если их несколько). */
  discrepancy?: string;
  /** Отдельные оговорки: чем эта модификация отличается от соседних. */
  caveats?: string[];
}

export interface Agreement {
  id: string;
  name: string;
  shortName: string;
  type: 'alliance' | 'arms-control' | 'export-regime' | 'bilateral-defense';
  parties: string;
  events: { date: PartialDate; label: string; sourceId: string; check: Check }[];
  summary: string;
  /** Что соглашение НЕ означает — чтобы не делать поспешных выводов. */
  notImplies: string;
  statusNote?: string;
}
