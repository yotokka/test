import type { Topology, GeometryCollection } from 'topojson-specification';
import { ruName } from './names-ru';
import { dayOf, isoOf } from './time';
import { TREATIES } from './treaties';
import type {
  ConflictEpisode,
  DayNum,
  DisputedArea,
  Entity,
  HistEvent,
  Leader,
  Manifest,
  Op,
  RecordProps,
  Treaty,
  TreatyStatus,
} from './types';

/**
 * Историческое состояние на дату вычисляется воспроизводимо: начальное состояние (конец 1969-12-31)
 * + все события с датой не позже выбранного дня, в техническом порядке. Для быстрой перемотки хранятся
 * контрольные снимки на 1 января каждого года; возврат назад берёт более ранний снимок, поэтому
 * прежние границы и отношения восстанавливаются полностью.
 */

export interface HistoryData {
  geo: Topology;
  land: Topology;
  entities: Entity[];
  events: HistEvent[];
  conflicts: ConflictEpisode[];
  leaders: Leader[];
  disputed: DisputedArea[];
  manifest: Manifest;
}

export interface HistState {
  day: DayNum;
  recs: ReadonlySet<number>;
  gw: ReadonlySet<string>;
  eps: ReadonlySet<string>;
  leaders: ReadonlyMap<string, string>;
  treaties: ReadonlyMap<string, TreatyStatus>;
}

interface MutState {
  day: DayNum;
  recs: Set<number>;
  gw: Set<string>;
  eps: Set<string>;
  leaders: Map<string, string>;
  treaties: Map<string, TreatyStatus>;
}

const clone = (s: MutState | HistState): MutState => ({
  day: s.day,
  recs: new Set(s.recs),
  gw: new Set(s.gw),
  eps: new Set(s.eps),
  leaders: new Map(s.leaders),
  treaties: new Map(s.treaties),
});

function apply(s: MutState, op: Op) {
  switch (op.op) {
    case 'rec+':
      s.recs.add(op.fid);
      break;
    case 'rec-':
      s.recs.delete(op.fid);
      break;
    case 'gw+':
      s.gw.add(op.entity);
      break;
    case 'gw-':
      s.gw.delete(op.entity);
      break;
    case 'ep+':
      s.eps.add(op.ep);
      break;
    case 'ep-':
      s.eps.delete(op.ep);
      break;
    case 'lead':
      s.leaders.set(op.entity, op.leader);
      break;
    case 'treaty':
      s.treaties.set(op.treaty, op.status);
      break;
  }
}

/** События договоров (статус «требует проверки») в общем формате событий. */
export function treatyEvents(recordedAt: string): HistEvent[] {
  return TREATIES.flatMap((t) =>
    t.events.map((e, i) => ({
      id: `treaty-${t.id}-${i}`,
      date: e.date,
      precision: e.precision,
      category: 'treaty' as const,
      dataset: 'reference-agreements',
      tech: 6,
      order: 0,
      entities: t.partyEntities,
      changes: [{ kind: `treaty-${e.status}`, text: `${t.ru}: ${e.label}` }],
      ops: [{ op: 'treaty' as const, treaty: t.id, status: e.status }],
      sources: [{ id: 'reference-agreements', locator: `${e.sourceTitle} — ${e.sourceUrl}` }],
      verification: t.verification,
      key: true,
      recordedAt,
      treaty: t.id,
    })),
  );
}

export interface CoverageRow {
  id: string;
  label: string;
  from: DayNum | null;
  to: DayNum | null;
  note: string;
  included: boolean;
}

export class HistoryEngine {
  readonly data: HistoryData;
  readonly start: DayNum;
  readonly end: DayNum;
  readonly mapEnd: DayNum;
  readonly ucdpEnd: DayNum;
  readonly leadersEnd: DayNum;
  readonly events: HistEvent[];
  readonly eventDays: DayNum[];
  readonly records = new Map<number, RecordProps>();
  readonly entities = new Map<string, Entity>();
  readonly episodes = new Map<string, ConflictEpisode>();
  readonly leaderById = new Map<string, Leader>();
  private initial: HistState;
  private checkpoints: { day: DayNum; state: HistState }[] = [];
  private cache = new Map<DayNum, HistState>();

  constructor(data: HistoryData) {
    this.data = data;
    const ds = data.manifest.datasets;
    this.start = dayOf(data.manifest.timeline.start);
    this.mapEnd = dayOf(ds['cshapes-gw'].coverage.to!);
    this.ucdpEnd = dayOf(ds['ucdp-acd'].coverage.to!);
    this.leadersEnd = dayOf(ds['archigos'].coverage.to!);
    this.end = Math.max(this.mapEnd, dayOf(ds['gw-states'].coverage.to!), this.ucdpEnd, this.leadersEnd);

    const coll = data.geo.objects.records as GeometryCollection<RecordProps>;
    for (const g of coll.geometries) {
      const p = g.properties as RecordProps;
      this.records.set(p.fid, p);
    }
    for (const e of data.entities) this.entities.set(e.id, e);
    for (const c of data.conflicts) this.episodes.set(c.id, c);
    for (const l of data.leaders) this.leaderById.set(l.id, l);

    // Договоры: события до начала шкалы формируют начальное состояние, остальные входят в шкалу.
    const tEvents = treatyEvents(data.manifest.importedAt);
    const all = [...data.events, ...tEvents.filter((e) => dayOf(e.date) >= this.start)];
    all.sort((a, b) => a.date.localeCompare(b.date) || a.tech - b.tech || a.id.localeCompare(b.id));
    all.forEach((e, i) => (e.order = i));
    this.events = all;
    this.eventDays = all.map((e) => dayOf(e.date));

    const init = this.stateByIntervals(this.start - 1);
    for (const e of tEvents.filter((x) => dayOf(x.date) < this.start)) for (const op of e.ops) apply(init, op);
    this.initial = init;
    this.buildCheckpoints();
  }

  /**
   * Состояние по интервалам записей (независимый способ расчёта). Используется для начального
   * состояния и в тестах для сверки с результатом применения событий.
   */
  stateByIntervals(day: DayNum): MutState {
    const iso = isoOf(day);
    const s: MutState = { day, recs: new Set(), gw: new Set(), eps: new Set(), leaders: new Map(), treaties: new Map() };
    // end = последний день покрытия набора означает «конец наблюдения», а не прекращение записи.
    const mapEndIso = isoOf(this.mapEnd);
    for (const r of this.records.values()) if (r.start <= iso && (r.end >= iso || r.end === mapEndIso)) s.recs.add(r.fid);
    for (const e of this.entities.values()) for (const p of e.gw) if (p.from <= iso && (p.to === null || p.to >= iso)) s.gw.add(e.id);
    for (const c of this.episodes.values()) if (c.start <= iso && (c.end === null || c.end > iso)) s.eps.add(c.id);
    const byEnt = new Map<string, Leader>();
    for (const l of this.leaderById.values()) {
      if (l.start <= iso) {
        const cur = byEnt.get(l.entity);
        if (!cur || l.start > cur.start || (l.start === cur.start && l.id > cur.id)) byEnt.set(l.entity, l);
      }
    }
    for (const [ent, l] of byEnt) s.leaders.set(ent, l.id);
    for (const t of TREATIES) {
      let st: TreatyStatus | undefined;
      for (const e of t.events) if (e.date <= iso) st = e.status;
      if (st) s.treaties.set(t.id, st);
    }
    return s;
  }

  private buildCheckpoints() {
    const s = clone(this.initial);
    let i = 0;
    const endYear = new Date(this.end * 86_400_000).getUTCFullYear();
    for (let y = new Date(this.start * 86_400_000).getUTCFullYear(); y <= endYear; y++) {
      const cpDay = dayOf(`${y}-01-01`);
      while (i < this.events.length && this.eventDays[i] <= cpDay) {
        for (const op of this.events[i].ops) apply(s, op);
        i++;
      }
      s.day = cpDay;
      this.checkpoints.push({ day: cpDay, state: clone(s) });
    }
  }

  /** Индекс первого события с днём > day (двоичный поиск). */
  private upper(day: DayNum): number {
    let lo = 0;
    let hi = this.eventDays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.eventDays[mid] <= day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  stateAt(day: DayNum): HistState {
    const d = Math.max(this.start, Math.min(this.end, day));
    const hit = this.cache.get(d);
    if (hit) return hit;
    let base: HistState = this.initial;
    let from = this.start - 1;
    for (const cp of this.checkpoints) {
      if (cp.day <= d) {
        base = cp.state;
        from = cp.day;
      } else break;
    }
    const s = clone(base);
    for (let i = this.upper(from); i < this.eventDays.length && this.eventDays[i] <= d; i++) for (const op of this.events[i].ops) apply(s, op);
    s.day = d;
    if (this.cache.size > 64) this.cache.clear();
    this.cache.set(d, s);
    return s;
  }

  /** События, применённые при переходе от дня a к дню b (в порядке применения; при движении назад — отменённые). */
  eventsBetween(a: DayNum, b: DayNum): HistEvent[] {
    if (a === b) return [];
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return this.events.slice(this.upper(lo), this.upper(hi));
  }

  nextEvent(day: DayNum, pred: (e: HistEvent) => boolean = () => true): HistEvent | undefined {
    for (let i = this.upper(day); i < this.events.length; i++) if (pred(this.events[i])) return this.events[i];
    return undefined;
  }
  prevEvent(day: DayNum, pred: (e: HistEvent) => boolean = () => true): HistEvent | undefined {
    // «Предыдущее» — строго раньше текущего дня
    for (let i = this.upper(day - 1) - 1; i >= 0; i--) if (pred(this.events[i])) return this.events[i];
    return undefined;
  }

  entityName(id: string, day: DayNum): { source: string; ru: string } {
    const e = this.entities.get(id);
    if (!e) return { source: id, ru: id };
    const iso = isoOf(day);
    const n = e.names.find((x) => x.from <= iso && (x.to === null || x.to >= iso)) ?? e.names.at(-1) ?? { name: e.gw[0]?.name ?? id };
    return { source: n.name, ru: ruName(n.name) };
  }

  /** Субъекты, существующие на дату: с геометрией CShapes или в списке GW. */
  activeEntities(day: DayNum) {
    const s = this.stateAt(day);
    const out = new Map<string, { id: string; fid: number | null; status: string; inGw: boolean }>();
    for (const fid of s.recs) {
      const r = this.records.get(fid)!;
      const id = this.idForCode(r.code);
      out.set(id, { id, fid, status: r.status, inGw: s.gw.has(id) });
    }
    for (const id of s.gw) if (!out.has(id)) out.set(id, { id, fid: null, status: 'independent', inGw: true });
    return [...out.values()];
  }

  idForCode(code: number): string {
    return this.entities.has(`gw:${code}`) ? `gw:${code}` : `cs:${code}`;
  }

  /** Стороны эпизода в году выбранной даты (или в ближайшем предыдущем году наблюдения). */
  sidesOn(ep: ConflictEpisode, day: DayNum): { a: string[]; b: string[] } {
    const y = new Date(day * 86_400_000).getUTCFullYear();
    const years = Object.keys(ep.sidesByYear).map(Number).sort((p, q) => p - q);
    const pick = years.filter((k) => k <= y).at(-1) ?? years[0];
    return ep.sidesByYear[pick];
  }

  entityView(id: string, day: DayNum) {
    const s = this.stateAt(day);
    const e = this.entities.get(id);
    if (!e) return null;
    const fid = e.records.find((f) => s.recs.has(f)) ?? null;
    const rec = fid !== null ? this.records.get(fid)! : null;
    const leaderId = s.leaders.get(id);
    const leader = leaderId ? this.leaderById.get(leaderId) : undefined;
    const iso = isoOf(day);
    const leaderValid = leader && leader.end >= iso ? leader : undefined;
    const conflicts = [...s.eps]
      .map((x) => this.episodes.get(x)!)
      .map((c) => ({ ep: c, sides: this.sidesOn(c, day) }))
      .filter(({ sides }) => sides.a.includes(id) || sides.b.includes(id));
    const treaties = TREATIES.filter((t) => t.partyEntities.includes(id)).map((t: Treaty) => ({ treaty: t, status: s.treaties.get(t.id) ?? null }));
    const involving = this.events.filter((ev) => ev.entities.includes(id));
    const idx = involving.findIndex((ev) => dayOf(ev.date) > day);
    const cut = idx === -1 ? involving.length : idx;
    return {
      entity: e,
      exists: rec !== null || s.gw.has(id),
      name: this.entityName(id, day),
      record: rec,
      owner: rec && rec.owner !== rec.code ? this.idForCode(rec.owner) : null,
      inGw: s.gw.has(id),
      gwPeriod: e.gw.find((p) => p.from <= iso && (p.to === null || p.to >= iso)) ?? null,
      leader: leaderValid ?? null,
      leadersCovered: day <= this.leadersEnd,
      conflicts,
      conflictsCovered: day <= this.ucdpEnd,
      treaties,
      mapCovered: day <= this.mapEnd,
      prevEvents: involving.slice(Math.max(0, cut - 3), cut).reverse(),
      nextEvents: involving.slice(cut, cut + 3),
    };
  }

  disputedAt(day: DayNum): DisputedArea[] {
    const iso = isoOf(day);
    return this.data.disputed.filter((d) => d.from <= iso && d.to >= iso);
  }

  coverage(): CoverageRow[] {
    const ds = this.data.manifest.datasets;
    const row = (id: string, label: string): CoverageRow => ({
      id,
      label,
      from: ds[id].coverage.from ? Math.max(this.start, dayOf(ds[id].coverage.from!)) : null,
      to: ds[id].coverage.to ? dayOf(ds[id].coverage.to!) : null,
      note: ds[id].coverage.note,
      included: true,
    });
    return [
      row('cshapes-gw', 'Карта: границы, столицы, статус территорий'),
      row('gw-states', 'Список независимых государств'),
      row('ucdp-acd', 'Вооружённые конфликты'),
      row('archigos', 'Руководители государств'),
      { id: 'treaties', label: 'Договоры (8 записей, требуют проверки)', from: null, to: null, note: 'Даты сверены только по поисковой выдаче; в основное состояние не входят.', included: false },
      { id: 'alliances', label: 'Союзы и договорные обязательства (ATOP, COW)', from: null, to: null, note: 'Не включены: условия распространения не проверены.', included: false },
      { id: 'orgs', label: 'Членство в организациях', from: null, to: null, note: 'Нет проверенного источника в этой сборке.', included: false },
      { id: 'diplomacy', label: 'Дипломатические отношения', from: null, to: null, note: 'Нет проверенного источника в этой сборке.', included: false },
      { id: 'renames', label: 'Смены официальных названий', from: null, to: null, note: 'Наборы используют составные названия на весь период; даты переименований не закодированы.', included: false },
      { id: 'flags', label: 'Исторические флаги', from: null, to: null, note: 'Нет проверенного набора; флаги не показываются.', included: false },
      { id: 'control', label: 'Фактический контроль территорий', from: null, to: null, note: 'Нет отдельного подходящего набора; слой недоступен.', included: false },
    ];
  }
}
