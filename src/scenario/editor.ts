import { CLASS_BY_ID } from '../game/classes';
import type { Vec } from '../game/types';
import type { ChangeEntry, PlacedObject, ScenarioDoc } from './types';

/**
 * Редактор сценария как чистые функции: каждое изменение создаёт новую версию документа и запись
 * в журнале изменений; прошлые версии хранятся для отмены и повтора. Интерфейс только вызывает эти функции.
 */

export interface EditorState {
  doc: ScenarioDoc;
  past: ScenarioDoc[];
  future: ScenarioDoc[];
  /** Номер правки для отслеживания «несохранённых изменений» */
  rev: number;
  savedRev: number;
}

const HISTORY_MAX = 150;

export function initEditor(doc: ScenarioDoc, saved = true): EditorState {
  return { doc, past: [], future: [], rev: 0, savedRev: saved ? 0 : -1 };
}

export function commit(st: EditorState, label: string, fn: (d: ScenarioDoc) => void, prov: ChangeEntry['prov'] = 'user'): EditorState {
  const next = structuredClone(st.doc);
  fn(next);
  const at = new Date().toISOString();
  next.updatedAt = at;
  next.changeLog = [...next.changeLog, { at, label, prov }].slice(-500);
  return { doc: next, past: [...st.past, st.doc].slice(-HISTORY_MAX), future: [], rev: st.rev + 1, savedRev: st.savedRev };
}

export function undo(st: EditorState): EditorState {
  if (!st.past.length) return st;
  const prev = st.past[st.past.length - 1];
  return { doc: prev, past: st.past.slice(0, -1), future: [st.doc, ...st.future], rev: st.rev + 1, savedRev: st.savedRev };
}

export function redo(st: EditorState): EditorState {
  if (!st.future.length) return st;
  const [next, ...rest] = st.future;
  return { doc: next, past: [...st.past, st.doc], future: rest, rev: st.rev + 1, savedRev: st.savedRev };
}

export const canUndo = (st: EditorState) => st.past.length > 0;
export const canRedo = (st: EditorState) => st.future.length > 0;
export const isDirty = (st: EditorState) => st.rev !== st.savedRev;
export const markSaved = (st: EditorState): EditorState => ({ ...st, savedRev: st.rev });
/** Метка последнего изменения для отмены — показывается на кнопке. */
export const undoLabel = (st: EditorState) => (st.past.length ? st.doc.changeLog[st.doc.changeLog.length - 1]?.label ?? '' : '');

export function nextObjectId(doc: ScenarioDoc): string {
  let n = 1;
  const ids = new Set(doc.objects.map((o) => o.id));
  while (ids.has(`o${n}`)) n++;
  return `o${n}`;
}

function nextLabel(doc: ScenarioDoc, code: string): string {
  let n = 1;
  const labels = new Set(doc.objects.map((o) => o.label));
  while (labels.has(`${code}-${n}`)) n++;
  return `${code}-${n}`;
}

/* ———— Операции ———— */

export function addObject(st: EditorState, classId: string, side: string, pos: Vec): { st: EditorState; id: string } {
  const c = CLASS_BY_ID[classId];
  const id = nextObjectId(st.doc);
  const label = nextLabel(st.doc, c.code);
  const o: PlacedObject = {
    id,
    classId,
    side,
    label,
    pos: { x: round(pos.x), y: round(pos.y) },
    startS: 0,
    route: [],
    mission: c.kind === 'fighter' ? 'intercept-area' : c.kind === 'bomber' ? 'release' : c.kind === 'recon' ? 'recon' : c.kind === 'support' ? 'transit' : c.kind === 'uav' ? 'patrol' : c.kind === 'launcher' ? 'launch' : 'none',
    holdS: c.kind === 'fighter' || c.kind === 'uav' || c.kind === 'recon' ? 900 : undefined,
    payload: [],
  };
  return { st: commit(st, `Добавлен объект ${label} (${c.name})`, (d) => void d.objects.push(o)), id };
}

const round = (v: number) => Math.round(v * 10) / 10;

export function moveObjects(st: EditorState, ids: string[], dx: number, dy: number, withRoutes = true): EditorState {
  if (!ids.length || (dx === 0 && dy === 0)) return st;
  return commit(st, ids.length === 1 ? `Перемещён объект ${label(st.doc, ids[0])}` : `Перемещено объектов: ${ids.length}`, (d) => {
    for (const o of d.objects)
      if (ids.includes(o.id)) {
        o.pos = { x: round(o.pos.x + dx), y: round(o.pos.y + dy) };
        if (withRoutes) {
          o.route = o.route.map((w) => ({ ...w, x: round(w.x + dx), y: round(w.y + dy) }));
          o.payload = o.payload.map((p) => ({ ...p, aim: { x: round(p.aim.x + dx), y: round(p.aim.y + dy) } }));
        }
      }
  });
}

export function deleteObjects(st: EditorState, ids: string[]): EditorState {
  if (!ids.length) return st;
  return commit(st, ids.length === 1 ? `Удалён объект ${label(st.doc, ids[0])}` : `Удалено объектов: ${ids.length}`, (d) => {
    d.objects = d.objects.filter((o) => !ids.includes(o.id));
  });
}

export function duplicateObjects(st: EditorState, ids: string[], offset: Vec = { x: 20, y: -20 }): { st: EditorState; ids: string[] } {
  const created: string[] = [];
  const next = commit(st, ids.length === 1 ? `Дублирован объект ${label(st.doc, ids[0])}` : `Дублировано объектов: ${ids.length}`, (d) => {
    for (const id of ids) {
      const src = d.objects.find((o) => o.id === id);
      if (!src) continue;
      const c = structuredClone(src);
      c.id = nextObjectId(d);
      c.label = nextLabel(d, CLASS_BY_ID[c.classId].code);
      c.pos = { x: round(c.pos.x + offset.x), y: round(c.pos.y + offset.y) };
      c.route = c.route.map((w) => ({ ...w, x: round(w.x + offset.x), y: round(w.y + offset.y) }));
      c.payload = c.payload.map((p) => ({ ...p, aim: { x: round(p.aim.x + offset.x), y: round(p.aim.y + offset.y) } }));
      d.objects.push(c);
      created.push(c.id);
    }
  });
  return { st: next, ids: created };
}

/** Групповое редактирование: одно изменение — одна запись отмены. */
export function updateObjects(st: EditorState, ids: string[], patch: Partial<PlacedObject>, what: string): EditorState {
  if (!ids.length) return st;
  return commit(st, ids.length === 1 ? `${label(st.doc, ids[0])}: ${what}` : `Групповое изменение (${ids.length}): ${what}`, (d) => {
    for (const o of d.objects) if (ids.includes(o.id)) Object.assign(o, structuredClone(patch));
  });
}

export function setRoute(st: EditorState, id: string, route: PlacedObject['route'], what: string): EditorState {
  return commit(st, `${label(st.doc, id)}: ${what}`, (d) => {
    const o = d.objects.find((x) => x.id === id);
    if (o) o.route = route.map((w) => ({ ...w, x: round(w.x), y: round(w.y) }));
  });
}

export function setPayload(st: EditorState, id: string, payload: PlacedObject['payload']): EditorState {
  return commit(st, `${label(st.doc, id)}: нагрузка изменена`, (d) => {
    const o = d.objects.find((x) => x.id === id);
    if (o) o.payload = payload.map((p) => ({ classId: p.classId, count: Math.max(0, Math.floor(p.count)), aim: { x: round(p.aim.x), y: round(p.aim.y) } }));
  });
}

const label = (d: ScenarioDoc, id: string) => d.objects.find((o) => o.id === id)?.label ?? id;

/** Предварительный просмотр: описание того, что изменится, без применения. */
export function previewPatch(doc: ScenarioDoc, ids: string[], patch: Partial<PlacedObject>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const o = doc.objects.find((x) => x.id === id);
    if (!o) continue;
    for (const [k, v] of Object.entries(patch)) {
      const before = (o as unknown as Record<string, unknown>)[k];
      if (JSON.stringify(before) !== JSON.stringify(v)) out.push(`${o.label}: ${k} ${fmt(before)} → ${fmt(v)}`);
    }
  }
  return out;
}
const fmt = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
