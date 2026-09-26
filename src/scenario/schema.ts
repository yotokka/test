import { CLASS_BY_ID } from '../game/classes';
import { ENGINE_VERSION } from '../game/engine';
import { sceneToKm } from '../game/testScene';
import type { Command } from '../game/types';
import { CATALOG_VERSION, newTestScene } from './factory';
import { DEFAULT_SETTINGS } from './settings';
import { FORMAT, FORMAT_VERSION, type PlacedObject, type ScenarioDoc } from './types';

/**
 * Проверка экспортированного сценария по схеме и версии формата.
 *
 * Документированные миграции:
 * — «legacy-sim» (сценарий прежней учебной симуляции: posts/objects/maxTicks, без поля format) →
 *   формат 1 на испытательной сцене. Посты становятся условными зенитными постами класса З-θ с прежним
 *   запасом (прежние радиусы и вероятности не переносятся: действуют параметры игрового класса);
 *   объекты профиля «Дуга» — пусковой с баллистической нагрузкой, «Бриз» — пусковой с крылатой нагрузкой,
 *   «Борт» — транспортным самолётом с перелётом; 1 прежний такт = 5 с; координаты — 1 у.е. = 1 км.
 * Файл более новой версии формата не открывается: показывается понятная ошибка.
 */

export interface SchemaResult {
  ok: boolean;
  doc: ScenarioDoc | null;
  errors: string[];
  warnings: string[];
  migrated: string[];
}

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function isLegacySim(j: unknown): boolean {
  return isObj(j) && !('format' in j) && Array.isArray(j.posts) && Array.isArray(j.objects) && isNum(j.maxTicks);
}

const TICK_S = 5;

export function migrateLegacySim(j: J): ScenarioDoc {
  const d = newTestScene(isStr(j.title) ? String(j.title) : 'Сценарий прежней симуляции');
  d.description = isStr(j.summary) ? String(j.summary) : '';
  d.seed = isNum(j.seed) ? j.seed : d.seed;
  const rel = isObj(j.relations) ? j.relations : {};
  const pairs = isObj(rel.pairs) ? rel.pairs : {};
  for (const [k, v] of Object.entries(pairs)) if (isObj(v)) d.relations[k] = { status: (v.status as 'alliance' | 'neutral' | 'conflict') ?? 'neutral', jointDefense: !!v.jointDefense };
  if (isObj(rel.permissionRequired)) for (const [k, v] of Object.entries(rel.permissionRequired)) d.permissionRequired[k] = !!v;
  const objs: PlacedObject[] = [];
  for (const p of j.posts as J[]) {
    objs.push({ id: String(p.id), classId: 'g-ad-post', side: String(p.country), label: String(p.name), pos: sceneToKm(Number(p.x), Number(p.y)), startS: 0, route: [], mission: 'none', payload: [], stock: Number(p.stock), note: 'Перенесено из прежней симуляции: запас сохранён, радиусы и вероятности — игрового класса З-θ.' });
  }
  for (const o of j.objects as J[]) {
    const from = isObj(o.from) ? sceneToKm(Number(o.from.x), Number(o.from.y)) : { x: 0, y: 0 };
    const to = isObj(o.to) ? sceneToKm(Number(o.to.x), Number(o.to.y)) : { x: 0, y: 0 };
    const side = String(o.origin);
    const startS = Number(o.spawnTick ?? 0) * TICK_S;
    if (o.profile === 'air') objs.push({ id: String(o.id), classId: 'g-support', side, label: String(o.label), pos: from, alt: 7000, startS, route: [to], mission: 'transit', payload: [], note: 'Перенесено из профиля «Борт».' });
    else objs.push({ id: String(o.id), classId: 'g-launcher', side, label: String(o.label), pos: from, startS, route: [], mission: 'launch', payload: [{ classId: o.profile === 'low' ? 'g-cruise' : 'g-ballistic', count: 1, aim: to }], note: `Перенесено из профиля «${o.profile === 'low' ? 'Бриз' : 'Дуга'}».` });
  }
  d.objects = objs;
  d.episode.durationS = Math.max(1800, Number(j.maxTicks) * TICK_S * 3);
  d.changeLog.push({ at: d.createdAt, label: 'Миграция «legacy-sim» → формат 1: посты и профили заменены игровыми классами', prov: 'assumption' });
  if (isStr(j.learningGoal)) d.demo = { id: `legacy-${String(j.id)}`, learningGoal: String(j.learningGoal) };
  return d;
}

/** Разбор и проверка сценария из JSON. */
export function parseScenario(text: string): SchemaResult {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch (e) {
    return { ok: false, doc: null, errors: [`Файл не является JSON: ${(e as Error).message}`], warnings: [], migrated: [] };
  }
  return checkScenario(j);
}

export function checkScenario(j: unknown): SchemaResult {
  const migrated: string[] = [];
  if (isLegacySim(j)) {
    j = migrateLegacySim(j as J);
    migrated.push('Сценарий прежней учебной симуляции переведён в формат 1 (см. журнал изменений).');
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(j)) return { ok: false, doc: null, errors: ['Ожидался объект сценария.'], warnings, migrated };
  if (j.format !== FORMAT) return { ok: false, doc: null, errors: [`Неизвестный формат файла: ожидалось «${FORMAT}».`], warnings, migrated };
  if (!isNum(j.formatVersion)) errors.push('Нет версии формата (formatVersion).');
  else if (j.formatVersion > FORMAT_VERSION)
    return { ok: false, doc: null, errors: [`Файл создан более новой версией формата (${j.formatVersion}); эта версия атласа понимает формат до ${FORMAT_VERSION}. Обновите атлас.`], warnings, migrated };
  else if (j.formatVersion < 1) errors.push(`Версия формата ${j.formatVersion} не поддерживается.`);

  const need = (k: string, pred: (v: unknown) => boolean, what: string) => {
    if (!pred(j[k as keyof typeof j])) errors.push(`Поле «${k}»: ${what}.`);
  };
  need('id', isStr, 'нужна строка');
  need('title', isStr, 'нужна строка');
  need('seed', isNum, 'нужно число');
  need('objects', Array.isArray, 'нужен список');
  need('participants', Array.isArray, 'нужен список');
  need('commands', Array.isArray, 'нужен список');
  need('world', isObj, 'нужен объект');
  need('episode', isObj, 'нужен объект');
  need('settings', isObj, 'нужен объект');
  need('weather', isObj, 'нужен объект');
  need('region', isObj, 'нужен объект');
  if (errors.length) return { ok: false, doc: null, errors, warnings, migrated };

  const w = j.world as J;
  if (w.kind === 'historical') {
    if (!isDate(w.forkDate)) errors.push('Дата ветвления должна быть в формате ГГГГ-ММ-ДД.');
    if (w.policy !== 'stop' && w.policy !== 'compatible') errors.push('Правило продолжения истории: stop или compatible.');
    if (!Array.isArray(w.edits)) errors.push('Изменения мира (world.edits) должны быть списком.');
    if (!isObj(j.frame)) errors.push('Для исторического мира нужна система координат (frame).');
  } else if (w.kind !== 'test-scene') errors.push('Мир сценария: historical или test-scene.');
  const ep = j.episode as J;
  if (!isDate(ep.date)) errors.push('Дата эпизода должна быть в формате ГГГГ-ММ-ДД.');
  if (!isStr(ep.startTime) || !/^\d{2}:\d{2}$/.test(ep.startTime)) errors.push('Время начала эпизода — ЧЧ:ММ (UTC).');
  if (!isNum(ep.durationS) || ep.durationS <= 0 || ep.durationS > 6 * 3600) errors.push('Продолжительность эпизода — от 1 с до 6 ч.');

  const parts = new Set((j.participants as J[]).map((p) => String(p?.id)));
  (j.objects as J[]).forEach((o, i) => {
    if (!isObj(o)) return errors.push(`Объект №${i + 1}: не объект.`);
    if (!isStr(o.id)) errors.push(`Объект №${i + 1}: нет идентификатора.`);
    if (!isStr(o.classId) || !CLASS_BY_ID[o.classId]) errors.push(`Объект ${o.id ?? i + 1}: неизвестный игровой класс «${String(o.classId)}».`);
    if (!parts.has(String(o.side))) errors.push(`Объект ${o.id ?? i + 1}: сторона «${String(o.side)}» не найдена среди участников.`);
    if (!isObj(o.pos) || !isNum(o.pos.x) || !isNum(o.pos.y)) errors.push(`Объект ${o.id ?? i + 1}: нет координат.`);
    if (!Array.isArray(o.route)) errors.push(`Объект ${o.id ?? i + 1}: маршрут должен быть списком.`);
    if (!Array.isArray(o.payload)) errors.push(`Объект ${o.id ?? i + 1}: нагрузка должна быть списком.`);
  });
  const ids = (j.objects as J[]).map((o) => o?.id);
  if (new Set(ids).size !== ids.length) errors.push('Идентификаторы объектов повторяются.');
  (j.commands as J[]).forEach((c, i) => {
    if (!isObj(c) || !isStr(c.id) || !isNum(c.t) || !isStr(c.type)) errors.push(`Команда №${i + 1}: нужны id, t и type.`);
  });
  const wx = j.weather as J;
  if (wx.snapshot !== null && wx.snapshot !== undefined) {
    const s = wx.snapshot as J;
    if (!isObj(s) || !Array.isArray(s.grid) || !isStr(s.fetchedAt)) errors.push('Погодный снимок повреждён: нет сетки или времени получения.');
  }
  if (errors.length) return { ok: false, doc: null, errors, warnings, migrated };

  const doc = j as unknown as ScenarioDoc;
  // Недостающие необязательные поля — значения по умолчанию, с пометкой
  const s = doc.settings as Partial<ScenarioDoc['settings']>;
  const missing = Object.keys(DEFAULT_SETTINGS).filter((k) => !(k in s));
  if (missing.length) {
    doc.settings = { ...DEFAULT_SETTINGS, ...s };
    warnings.push(`Настройки дополнены значениями по умолчанию: ${missing.join(', ')}.`);
  }
  if (!Array.isArray(doc.changeLog)) doc.changeLog = [];
  if (doc.engineVersion !== ENGINE_VERSION) warnings.push(`Сценарий сохранён движком ${doc.engineVersion}, сейчас ${ENGINE_VERSION}: журнал повтора может отличаться.`);
  if (doc.catalogVersion !== CATALOG_VERSION) warnings.push(`Версия каталога в файле — ${doc.catalogVersion}, сейчас ${CATALOG_VERSION}.`);
  doc.commands = [...doc.commands].sort((a: Command, b: Command) => a.t - b.t || a.id.localeCompare(b.id));
  return { ok: true, doc, errors, warnings, migrated };
}

export function serialize(doc: ScenarioDoc): string {
  return JSON.stringify(doc, null, 2);
}
