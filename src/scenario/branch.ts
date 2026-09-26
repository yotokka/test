import type { HistoryEngine } from '../history/engine';
import { ruName } from '../history/names-ru';
import { dayOf } from '../history/time';
import type { HistEvent, Op, TreatyStatus } from '../history/types';
import type { HistoricalWorld, WorldEdit } from './types';

/**
 * Мир ветки альтернативной истории.
 *
 * До даты ветвления ветка совпадает с историей. Начиная с неё берётся историческое состояние на дату
 * ветвления, к нему применяются изменения пользователя, а исторические события после точки ветвления:
 * — в режиме «stop» не применяются вовсе;
 * — в режиме «compatible» применяются, только если выполнены необходимые условия: все участвующие
 *   субъекты существуют в ветке, событие не прекращает сохранённый пользователем субъект, а новый субъект
 *   не возникает из предшественника, которого пользователь изменил. Пропуск объясняется в журнале.
 * Историческая база при этом не меняется: HistoryEngine только читается.
 *
 * Технический порядок дня: сначала изменения пользователя с этой датой, затем исторические события
 * в их собственном техническом порядке.
 */

export interface SkippedEvent {
  event: HistEvent;
  reason: string;
  code: 'policy-stop' | 'suppressed' | 'removed' | 'merged' | 'preserved' | 'predecessor' | 'not-created';
}

export interface BranchState {
  day: number;
  forkDay: number;
  recs: Set<number>;
  gw: Set<string>;
  eps: Set<string>;
  leaders: Map<string, string>;
  treaties: Map<string, TreatyStatus>;
  removed: Map<string, WorldEdit>;
  /** поглощённый → поглотивший */
  merged: Map<string, string>;
  preserved: Set<string>;
  notCreated: Set<string>;
  applied: HistEvent[];
  skipped: SkippedEvent[];
  edits: WorldEdit[];
}

export const POLICY_RU = {
  stop: 'остановить исторические изменения после точки ветвления',
  compatible: 'продолжать совместимые исторические события',
};

export class BranchWorld {
  readonly engine: HistoryEngine;
  readonly world: HistoricalWorld;
  readonly forkDay: number;
  private cache = new Map<number, BranchState>();

  constructor(engine: HistoryEngine, world: HistoricalWorld) {
    this.engine = engine;
    this.world = world;
    this.forkDay = dayOf(world.forkDate);
  }

  private name(id: string, day: number) {
    return ruName(this.engine.entityName(id, day).source);
  }

  private entityOfRecord(fid: number): string | null {
    const r = this.engine.records.get(fid);
    return r ? this.engine.idForCode(r.code) : null;
  }

  stateAt(day: number): BranchState {
    const hit = this.cache.get(day);
    if (hit) return hit;
    const src = day < this.forkDay ? this.engine.stateAt(day) : this.engine.stateAt(this.forkDay);
    const s: BranchState = {
      day,
      forkDay: this.forkDay,
      recs: new Set(src.recs),
      gw: new Set(src.gw),
      eps: new Set(src.eps),
      leaders: new Map(src.leaders),
      treaties: new Map(src.treaties),
      removed: new Map(),
      merged: new Map(),
      preserved: new Set(),
      notCreated: new Set(),
      applied: [],
      skipped: [],
      edits: [],
    };
    if (day < this.forkDay) return s;

    const edits = [...this.world.edits].filter((e) => dayOf(e.day) <= day).sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
    const events = this.engine.eventsBetween(this.forkDay, Math.min(day, this.engine.end));
    let ei = 0;
    const suppressed = new Set(this.world.edits.filter((e) => e.kind === 'suppress-event').map((e) => (e as { eventId: string }).eventId));

    const applyEditsUpTo = (d: number) => {
      while (ei < edits.length && dayOf(edits[ei].day) <= d) {
        const e = edits[ei++];
        s.edits.push(e);
        if (e.kind === 'remove-entity') s.removed.set(e.entity, e);
        else if (e.kind === 'merge-entities') s.merged.set(e.absorbed, e.into);
        else if (e.kind === 'preserve-entity') s.preserved.add(e.entity);
      }
    };
    applyEditsUpTo(this.forkDay);

    for (const ev of events) {
      const d = dayOf(ev.date);
      applyEditsUpTo(d);
      const skip = this.check(s, ev, suppressed, d);
      if (skip) {
        s.skipped.push({ event: ev, ...skip });
        continue;
      }
      for (const op of ev.ops) applyOp(s, op);
      s.applied.push(ev);
    }
    applyEditsUpTo(day);
    if (this.cache.size > 48) this.cache.clear();
    this.cache.set(day, s);
    return s;
  }

  /** Проверка необходимых условий исторического события в ветке. null — событие применимо. */
  private check(s: BranchState, ev: HistEvent, suppressed: Set<string>, day: number): Omit<SkippedEvent, 'event'> | null {
    if (this.world.policy === 'stop') return { code: 'policy-stop', reason: 'Выбрано правило «остановить исторические изменения после точки ветвления».' };
    if (suppressed.has(ev.id)) return { code: 'suppressed', reason: 'Пользователь отменил это событие в ветке.' };
    for (const id of ev.entities) {
      if (s.removed.has(id)) return { code: 'removed', reason: `${this.name(id, day)} удалён пользователем в ветке: событие о нём теряет смысл.` };
      if (s.merged.has(id)) return { code: 'merged', reason: `${this.name(id, day)} объединён пользователем с «${this.name(s.merged.get(id)!, day)}»: событие о нём не применяется.` };
      if (s.notCreated.has(id)) return { code: 'not-created', reason: `${this.name(id, day)} не возник в этой ветке (его появление было пропущено раньше).` };
    }
    // Не прекращает ли событие сохранённый субъект?
    for (const id of s.preserved) {
      const ends = ev.ops.some((op) => (op.op === 'gw-' && op.entity === id) || (op.op === 'rec-' && this.entityOfRecord(op.fid) === id && !ev.ops.some((o2) => o2.op === 'rec+' && this.entityOfRecord(o2.fid) === id)));
      if (ends) return { code: 'preserved', reason: `Событие прекращает субъект «${this.name(id, day)}», который пользователь сохранил в ветке.` };
    }
    // Возникновение нового субъекта из изменённого пользователем предшественника
    for (const id of this.createdBy(s, ev)) {
      const ent = this.engine.entities.get(id);
      const touched = ent?.predecessors.find((p) => s.removed.has(p.id) || s.merged.has(p.id) || s.preserved.has(p.id) || s.notCreated.has(p.id));
      if (touched) {
        s.notCreated.add(id);
        return { code: 'predecessor', reason: `${this.name(id, day)} возникает из «${this.name(touched.id, day)}», который изменён в ветке пользователем: появление не применяется.` };
      }
    }
    return null;
  }

  /** Субъекты, которые событие создаёт (до события у них нет записей и они не в списке GW). */
  private createdBy(s: BranchState, ev: HistEvent): string[] {
    const out = new Set<string>();
    for (const op of ev.ops) {
      const id = op.op === 'gw+' ? op.entity : op.op === 'rec+' ? this.entityOfRecord(op.fid) : null;
      if (!id) continue;
      const ent = this.engine.entities.get(id);
      const hasRec = ent?.records.some((f) => s.recs.has(f));
      if (!hasRec && !s.gw.has(id)) out.add(id);
    }
    return [...out];
  }

  /** Кто владеет записью в ветке (с учётом объединений); null — территория без принадлежности в ветке. */
  ownerOf(s: BranchState, fid: number): string | null {
    const id = this.entityOfRecord(fid);
    if (!id) return null;
    if (s.removed.has(id)) return null;
    return s.merged.get(id) ?? id;
  }

  /** Существует ли субъект в ветке на дату. */
  exists(s: BranchState, id: string): boolean {
    if (s.removed.has(id) || s.merged.has(id) || s.notCreated.has(id)) return false;
    const ent = this.engine.entities.get(id);
    return !!ent && (ent.records.some((f) => s.recs.has(f)) || s.gw.has(id));
  }

  /** Сравнение с историей на дату: чем ветка отличается от исторической базы. */
  diff(day: number) {
    const b = this.stateAt(day);
    const h = this.engine.stateAt(day);
    const onlyBranch = [...b.recs].filter((f) => !h.recs.has(f));
    const onlyHistory = [...h.recs].filter((f) => !b.recs.has(f));
    const changedOwner = [...b.recs].filter((f) => this.ownerOf(b, f) !== this.entityOfRecord(f));
    return { onlyBranch, onlyHistory, changedOwner, skipped: b.skipped.length, edits: b.edits.length };
  }
}

function applyOp(s: BranchState, op: Op) {
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

export const EDIT_RU: Record<WorldEdit['kind'], string> = {
  'remove-entity': 'удалить субъект',
  'merge-entities': 'объединить субъекты',
  'preserve-entity': 'сохранить субъект',
  'suppress-event': 'отменить событие',
  assumption: 'допущение сценария',
};
