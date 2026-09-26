import { loadJSON, saveJSON } from '../lib/storage';
import { checkScenario, serialize, type SchemaResult } from './schema';
import type { ScenarioDoc } from './types';

/**
 * Хранение сценариев в браузере: автосохранение (одна запись) и именованные сохранения.
 * Хранилище может быть недоступно (приватный режим) — тогда работает только экспорт в файл.
 */

const AUTO = 'atlas.scenario.autosave';
const SLOTS = 'atlas.scenario.slots';
const SLOTS_MAX = 30;

export interface SlotMeta {
  id: string;
  title: string;
  branch: string;
  savedAt: string;
}

export function autosave(doc: ScenarioDoc) {
  saveJSON(AUTO, { savedAt: new Date().toISOString(), doc });
}

export function readAutosave(): { savedAt: string; result: SchemaResult } | null {
  const raw = loadJSON<{ savedAt: string; doc: unknown } | null>(AUTO, null);
  if (!raw) return null;
  return { savedAt: raw.savedAt, result: checkScenario(raw.doc) };
}

export function clearAutosave() {
  try {
    window.localStorage.removeItem(AUTO);
  } catch {
    /* нет хранилища */
  }
}

export function listSlots(): SlotMeta[] {
  return loadJSON<{ meta: SlotMeta; doc: unknown }[]>(SLOTS, []).map((x) => x.meta);
}

export function saveSlot(doc: ScenarioDoc): SlotMeta {
  const all = loadJSON<{ meta: SlotMeta; doc: unknown }[]>(SLOTS, []).filter((x) => x.meta.id !== doc.id);
  const meta: SlotMeta = { id: doc.id, title: doc.title, branch: doc.branch.name, savedAt: new Date().toISOString() };
  all.unshift({ meta, doc });
  saveJSON(SLOTS, all.slice(0, SLOTS_MAX));
  return meta;
}

export function loadSlot(id: string): SchemaResult | null {
  const hit = loadJSON<{ meta: SlotMeta; doc: unknown }[]>(SLOTS, []).find((x) => x.meta.id === id);
  return hit ? checkScenario(structuredClone(hit.doc)) : null;
}

export function deleteSlot(id: string) {
  saveJSON(
    SLOTS,
    loadJSON<{ meta: SlotMeta; doc: unknown }[]>(SLOTS, []).filter((x) => x.meta.id !== id),
  );
}

/** Экспорт в файл: браузер скачивает JSON. */
export function exportFile(doc: ScenarioDoc) {
  const blob = new Blob([serialize(doc)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safe = doc.title.replace(/[^\p{L}\p{N}\-_. ]+/gu, '').trim().replace(/\s+/g, '_') || 'scenario';
  a.download = `${safe}.atlas-scenario.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
