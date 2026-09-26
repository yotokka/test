import { MILESTONES, MISSILES } from './missiles';
import { CATALOG_FAMILIES_EXTRA } from './catalogData';
import type { Check, Milestone } from './types';

/**
 * Каталог техники: семейство → модификация → страна происхождения → эксплуатанты с периодами.
 *
 * Правила:
 * — наличие системы в каталоге не означает, что она была у какой-либо страны: принадлежность стране
 *   хранится только как подтверждённый источником период эксплуатации с указанием неопределённости;
 * — заказано, поставлено и находится в строю — разные величины; неизвестное количество — null;
 * — реальные характеристики остаются в справочнике и в игровой расчёт не передаются.
 */

export type CatCategory = 'ballistic' | 'cruise' | 'air-missile' | 'sam' | 'fighter' | 'bomber' | 'recon-support' | 'uav';

export const CAT_RU: Record<CatCategory, string> = {
  ballistic: 'Баллистические ракеты',
  cruise: 'Крылатые ракеты и самолёты-снаряды',
  'air-missile': 'Авиационные ракеты',
  sam: 'Зенитные системы',
  fighter: 'Истребители и перехватчики',
  bomber: 'Бомбардировщики и самолёты-носители',
  'recon-support': 'Разведывательные и вспомогательные самолёты',
  uav: 'Беспилотные аппараты',
};

export interface CountValue {
  value: number;
  qualifier: 'exact' | 'about' | 'more-than' | 'up-to';
  /** На какую дату число (для «в строю»); null — не указано */
  asOf: string | null;
  sourceId: string;
  note?: string;
}

export interface OperatorPeriod {
  /** Код страны каталога */
  operator: string;
  /** Исторические субъекты (GW), к которым относится эксплуатант */
  entityIds: string[];
  /** Начало эксплуатации (ГГГГ, ГГГГ-ММ или ГГГГ-ММ-ДД); null — не установлено */
  from: string | null;
  /** Окончание эксплуатации, если установлено источником */
  to: string | null;
  /** До какой даты эксплуатация подтверждена источником (если окончание не установлено) */
  confirmedUntil: string | null;
  sourceId: string;
  check: Check;
  uncertainty: string;
  ordered: CountValue | null;
  delivered: CountValue | null;
  inService: CountValue | null;
}

export interface CatalogVariant {
  id: string;
  name: string;
  designation?: string;
  milestones: Milestone[];
  operators: OperatorPeriod[];
  note?: string;
  /** Связь с карточкой справочника ракет (если есть) */
  missileRef?: string;
}

export interface CatalogFamily {
  id: string;
  name: string;
  altNames?: string[];
  category: CatCategory;
  /** Исторический термин, если отличается от современного (например, «самолёт-снаряд») */
  historicalTerm?: string;
  origin: string;
  description: string;
  sourceIds: string[];
  variants: CatalogVariant[];
}

/** Страна каталога → исторические субъекты GW. Для Германии 1939–1945 гг. субъекта в базе с 1970 г. нет. */
export const OPERATOR_ENTITIES: Record<string, string[]> = {
  us: ['gw:2'],
  su: ['gw:365'],
  ru: ['gw:365'],
  cn: ['gw:710'],
  kp: ['gw:731'],
  in: ['gw:750'],
  uk: ['gw:200'],
  fr: ['gw:220'],
  il: ['gw:666'],
  de: [],
  frg: ['gw:260'],
  se: ['gw:380'],
  it: ['gw:325'],
  jp: ['gw:740'],
};

export const OPERATOR_RU: Record<string, string> = {
  us: 'США',
  su: 'СССР',
  ru: 'Россия',
  cn: 'КНР',
  kp: 'КНДР',
  in: 'Индия',
  uk: 'Великобритания',
  fr: 'Франция',
  il: 'Израиль',
  de: 'Германия (1939–1945)',
  frg: 'ФРГ / Германия',
  se: 'Швеция',
  it: 'Италия',
  jp: 'Япония',
};

const MISSILE_FAMILY: Record<string, { id: string; name: string }> = {
  'atacms-1': { id: 'atacms', name: 'ATACMS' },
  'atacms-1a': { id: 'atacms', name: 'ATACMS' },
  'iskander-m': { id: 'iskander', name: '«Искандер»' },
  'iskander-e': { id: 'iskander', name: '«Искандер»' },
  'kalibr-3m14': { id: 'kalibr', name: '«Калибр» / Club' },
  'club-3m14e': { id: 'kalibr', name: '«Калибр» / Club' },
};

/** Семейства из справочника ракет: эксплуатант — только страна происхождения и только при записи этапа «принятие/применение». */
function fromMissiles(): CatalogFamily[] {
  const fams = new Map<string, CatalogFamily>();
  for (const m of MISSILES) {
    const fam = MISSILE_FAMILY[m.id] ?? { id: m.id, name: m.name };
    const service = (MILESTONES[m.id] ?? []).find((x) => x.kind === 'service');
    const operators: OperatorPeriod[] = service
      ? m.countries.map((c) => ({
          operator: c,
          entityIds: OPERATOR_ENTITIES[c] ?? [],
          from: service.date,
          to: null,
          confirmedUntil: null,
          sourceId: service.sourceId,
          check: service.check,
          uncertainty: 'Установлено начало эксплуатации страной происхождения; окончание и численность в источнике не приведены.',
          ordered: null,
          delivered: null,
          inService: null,
        }))
      : [];
    const variant: CatalogVariant = { id: m.id, name: m.name, designation: m.variant, milestones: MILESTONES[m.id] ?? [], operators, missileRef: m.id };
    const f = fams.get(fam.id);
    if (f) f.variants.push(variant);
    else
      fams.set(fam.id, {
        id: fam.id,
        name: fam.name,
        altNames: m.altNames,
        category: m.category,
        historicalTerm: m.id === 'v1' ? 'самолёт-снаряд' : undefined,
        origin: m.countries[0],
        description: m.purpose,
        sourceIds: m.historySourceIds,
        variants: [variant],
      });
  }
  return [...fams.values()];
}

export const CATALOG: CatalogFamily[] = [...fromMissiles(), ...CATALOG_FAMILIES_EXTRA];

export const VARIANTS: (CatalogVariant & { family: CatalogFamily })[] = CATALOG.flatMap((f) => f.variants.map((v) => ({ ...v, family: f })));
export const variantById = (id: string) => VARIANTS.find((v) => v.id === id);

/** Сравнение неполных дат: «1983» ≤ «1983-12-01» считается по началу периода. */
const lo = (d: string) => (d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
const hi = (d: string) => (d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d);

export interface Availability {
  status: 'confirmed' | 'unconfirmed' | 'unknown';
  text: string;
  period?: OperatorPeriod;
}

/** Подтверждена ли эксплуатация модификации субъектом на дату. */
export function availability(variantId: string, entityId: string | null, date: string): Availability {
  const v = variantById(variantId);
  if (!v) return { status: 'unknown', text: 'модификация не найдена в каталоге.' };
  if (!entityId) return { status: 'unconfirmed', text: `сторона вымышленная: эксплуатация «${v.name}» ею не может быть подтверждена.` };
  const ps = v.operators.filter((p) => p.entityIds.includes(entityId));
  if (!ps.length) return { status: 'unconfirmed', text: `в каталоге нет подтверждённого периода эксплуатации «${v.name}» этим субъектом. Наличие в каталоге не означает наличия у страны.` };
  for (const p of ps) {
    if (!p.from) continue;
    const end = p.to ?? p.confirmedUntil;
    if (lo(p.from) <= date && (end === null ? false : date <= hi(end))) return { status: 'confirmed', text: `эксплуатация подтверждена: ${p.from} — ${end}.`, period: p };
  }
  const p = ps[0];
  if (p.from && date < lo(p.from)) return { status: 'unconfirmed', text: `на эту дату ещё не эксплуатировалась: начало — ${p.from}.`, period: p };
  return { status: 'unconfirmed', text: `начало эксплуатации ${p.from ?? 'не установлено'}; на ${date} источник эксплуатацию не подтверждает (окончание не установлено).`, period: p };
}

/** Фильтр по периоду: модификации, у которых есть этап не позднее года (разработка/испытание/служба различаются). */
export function reachedBy(v: CatalogVariant, stage: Milestone['kind'], year: number): boolean {
  const rank = { development: 0, test: 1, service: 2 } as const;
  return v.milestones.some((m) => rank[m.kind] >= rank[stage] && Number(m.date.slice(0, 4)) <= year);
}

export interface CoverageCell {
  families: number;
  variants: number;
  withOperator: number;
}

/** Таблица покрытия: категория × десятилетие (по первому этапу модификации) × страна происхождения. */
export function coverageTable() {
  const decades = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  const cats = Object.keys(CAT_RU) as CatCategory[];
  const byCat: Record<string, Record<number, CoverageCell & { undated: number }>> = {};
  const byCountry: Record<string, Record<string, number>> = {};
  for (const c of cats) byCat[c] = Object.fromEntries(decades.map((d) => [d, { families: 0, variants: 0, withOperator: 0, undated: 0 }]));
  const undated: Record<string, number> = Object.fromEntries(cats.map((c) => [c, 0]));
  for (const f of CATALOG) {
    byCountry[f.origin] ??= Object.fromEntries(cats.map((c) => [c, 0]));
    byCountry[f.origin][f.category] += f.variants.length;
    const seen = new Set<number>();
    for (const v of f.variants) {
      const first = v.milestones.map((m) => Number(m.date.slice(0, 4))).sort((a, b) => a - b)[0];
      if (first === undefined) {
        undated[f.category]++;
        continue;
      }
      const dec = Math.max(1940, Math.min(2020, Math.floor(first / 10) * 10));
      const cell = byCat[f.category][dec];
      cell.variants++;
      if (v.operators.length) cell.withOperator++;
      if (!seen.has(dec)) {
        cell.families++;
        seen.add(dec);
      }
    }
  }
  return { decades, cats, byCat, byCountry, undated };
}
