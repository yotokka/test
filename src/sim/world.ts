import type { CountryId, OriginId, PairRelation, Profile, ProfileParams, RelationSettings, RelationStatus } from './types';

/** Вымышленная карта. Координаты — условные единицы (у.е.) в прямоугольнике 1000 × 640. */
export const MAP_W = 1000;
export const MAP_H = 640;

export interface CountryDef {
  id: CountryId;
  name: string;
  /** Родительный падеж: «территории Аврелии». */
  gen: string;
  /** Дательный падеж: «к Аврелии». */
  dat: string;
  /** Короткая подпись для карты. */
  short: string;
  /** Контур (SVG path) — вымышленная береговая линия и границы. */
  path: string;
  labelAt: { x: number; y: number };
}

export const COUNTRIES: CountryDef[] = [
  {
    id: 'B',
    name: 'Борея',
    gen: 'Бореи',
    dat: 'Борее',
    short: 'БОР',
    path: 'M40,40 L300,28 L520,46 L700,34 L880,60 L905,150 L820,176 L690,168 L600,196 L470,188 L360,206 L250,192 L130,210 L52,176 Z',
    labelAt: { x: 470, y: 110 },
  },
  {
    id: 'E',
    name: 'Эстравия',
    gen: 'Эстравии',
    dat: 'Эстравии',
    short: 'ЭСТ',
    path: 'M52,176 L130,210 L250,192 L262,300 L240,420 L262,540 L200,600 L96,590 L44,470 L60,330 Z',
    labelAt: { x: 150, y: 390 },
  },
  {
    id: 'A',
    name: 'Аврелия',
    gen: 'Аврелии',
    dat: 'Аврелии',
    short: 'АВР',
    path: 'M250,192 L360,206 L470,188 L600,196 L618,300 L596,400 L640,470 L580,560 L440,600 L320,590 L262,540 L240,420 L262,300 Z',
    labelAt: { x: 430, y: 330 },
  },
  {
    id: 'K',
    name: 'Кассиния',
    gen: 'Кассинии',
    dat: 'Кассинии',
    short: 'КАС',
    path: 'M600,196 L690,168 L820,176 L905,150 L960,230 L948,360 L900,450 L790,470 L640,470 L596,400 L618,300 Z',
    labelAt: { x: 790, y: 310 },
  },
  {
    id: 'D',
    name: 'Дельмар',
    gen: 'Дельмара',
    dat: 'Дельмару',
    short: 'ДЕЛ',
    path: 'M760,540 L840,516 L920,534 L944,590 L880,618 L790,610 L748,578 Z',
    labelAt: { x: 850, y: 572 },
  },
];

export const COUNTRY_BY_ID: Record<CountryId, CountryDef> = Object.fromEntries(
  COUNTRIES.map((c) => [c.id, c]),
) as Record<CountryId, CountryDef>;

export function originName(o: OriginId): string {
  return o === 'X' ? 'не установлено' : COUNTRY_BY_ID[o].name;
}

/**
 * УЧЕБНЫЕ профили объектов. Числа вымышлены и подобраны только для наглядности:
 * они не соответствуют характеристикам реальных ракет или самолётов.
 */
export const PROFILES: Record<Profile, ProfileParams> = {
  arc: {
    name: 'Профиль «Дуга»',
    analog: 'условный аналог баллистической траектории',
    speed: 7,
    visibility: 0.9,
    classifyTicks: 3,
    ambiguity: 0.15,
    interceptFactor: 0.75,
    classLabel: 'быстрый объект на дуговой траектории',
  },
  low: {
    name: 'Профиль «Бриз»',
    analog: 'условный аналог маловысотного полёта крылатой ракеты',
    speed: 2.6,
    visibility: 0.35,
    classifyTicks: 4,
    ambiguity: 0.3,
    interceptFactor: 0.95,
    classLabel: 'малозаметный маловысотный объект',
  },
  air: {
    name: 'Профиль «Борт»',
    analog: 'условное воздушное судно',
    speed: 3.2,
    visibility: 0.95,
    classifyTicks: 3,
    ambiguity: 0.4,
    interceptFactor: 0,
    classLabel: 'воздушное судно',
  },
};

/** Общие учебные константы модели. */
export const MODEL = {
  interceptorSpeed: 10,
  hitRadius: 8,
  relaunchCooldown: 3,
  permissionDelayMin: 2,
  permissionDelaySpread: 5,
  permissionGrantP: 0.8,
  verifyTicks: 4,
  trailLength: 60,
} as const;

export const RELATION_NAMES: Record<RelationStatus, string> = {
  alliance: 'Союз',
  neutral: 'Нейтралитет',
  conflict: 'Конфликт',
};

export function pairKey(a: CountryId, b: CountryId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const DEFAULT_PAIR: PairRelation = { status: 'neutral', jointDefense: false };

export function getRelation(rel: RelationSettings, a: CountryId, b: CountryId): PairRelation {
  return rel.pairs[pairKey(a, b)] ?? DEFAULT_PAIR;
}

export const ALL_PAIRS: [CountryId, CountryId][] = (() => {
  const ids = COUNTRIES.map((c) => c.id).sort() as CountryId[];
  const out: [CountryId, CountryId][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
})();

/** Полная матрица отношений: все пары по умолчанию нейтральны, затем применяются значения сценария. */
export function makeRelations(
  overrides: Partial<Record<string, Partial<PairRelation>>>,
  permission: Partial<Record<CountryId, boolean>> = {},
): RelationSettings {
  const pairs: Record<string, PairRelation> = {};
  for (const [a, b] of ALL_PAIRS) {
    const k = pairKey(a, b);
    pairs[k] = { ...DEFAULT_PAIR, ...(overrides[k] ?? {}) };
  }
  const permissionRequired = { A: false, B: false, K: false, D: false, E: false, ...permission };
  return { pairs, permissionRequired };
}

export function cloneRelations(r: RelationSettings): RelationSettings {
  return {
    pairs: Object.fromEntries(Object.entries(r.pairs).map(([k, v]) => [k, { ...v }])),
    permissionRequired: { ...r.permissionRequired },
  };
}
