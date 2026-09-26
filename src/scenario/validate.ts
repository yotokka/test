import { CLASS_BY_ID, isAircraft } from '../game/classes';
import { archiveDateProblem } from '../weather/openMeteo';
import type { ScenarioDoc } from './types';

/**
 * Проверка сценария перед запуском: понятные сообщения о несовместимых настройках. Ошибка блокирует
 * запуск, предупреждение — нет, но объясняет, что будет сделано по умолчанию.
 */

export interface Issue {
  level: 'error' | 'warn' | 'info';
  text: string;
  objectId?: string;
  field?: string;
}

export interface AvailabilityCheck {
  status: 'confirmed' | 'unconfirmed' | 'unknown';
  text: string;
}

export interface ValidateContext {
  today: string;
  /** Существует ли исторический субъект в ветке на дату эпизода */
  entityExists?: (entityId: string) => boolean;
  /** Подтверждена ли эксплуатация модификации этим субъектом на дату */
  availability?: (histRef: string, entityId: string | null, date: string) => AvailabilityCheck;
  inRegion?: (x: number, y: number) => boolean;
}

export function validateScenario(doc: ScenarioDoc, ctx: ValidateContext): Issue[] {
  const out: Issue[] = [];
  const part = new Map(doc.participants.map((p) => [p.id, p]));
  if (doc.participants.length === 0) out.push({ level: 'error', text: 'Нет участников: добавьте хотя бы одну сторону.', field: 'participants' });
  if (doc.objects.length === 0) out.push({ level: 'warn', text: 'В сценарии нет объектов: эпизод покажет только погоду и мир.', field: 'objects' });
  if (!doc.episode.endConditions.length) out.push({ level: 'error', text: 'Не выбрано ни одного условия завершения.', field: 'endConditions' });
  if (doc.episode.durationS < 60) out.push({ level: 'error', text: 'Эпизод короче минуты.', field: 'duration' });

  for (const p of doc.participants) {
    if (p.entityId && ctx.entityExists && !ctx.entityExists(p.entityId))
      out.push({ level: 'error', text: `Участник «${p.name}» выступает от субъекта, которого нет в этой ветке на дату эпизода (${doc.episode.date}).`, field: 'participants' });
  }

  for (const o of doc.objects) {
    const c = CLASS_BY_ID[o.classId];
    const name = `«${o.label}»`;
    if (!c) {
      out.push({ level: 'error', text: `${name}: неизвестный игровой класс.`, objectId: o.id });
      continue;
    }
    if (!part.has(o.side)) out.push({ level: 'error', text: `${name}: сторона не входит в участников.`, objectId: o.id });
    if (o.startS >= doc.episode.durationS) out.push({ level: 'error', text: `${name}: время появления (${Math.round(o.startS / 60)} мин) позже конца эпизода.`, objectId: o.id });
    if (ctx.inRegion && !ctx.inRegion(o.pos.x, o.pos.y)) out.push({ level: 'warn', text: `${name}: объект вне выбранной области карты.`, objectId: o.id });
    if (isAircraft(c.kind)) {
      if (o.route.length === 0 && o.mission !== 'none') out.push({ level: 'warn', text: `${name}: маршрут не задан — сценарное действие начнётся над точкой базирования.`, objectId: o.id });
      if (o.mission === 'release' && !o.payload.some((p) => p.count > 0)) out.push({ level: 'error', text: `${name}: задача «отделение нагрузки», но нагрузка не загружена.`, objectId: o.id });
      if (o.mission === 'intercept-area' && !c.weapon) out.push({ level: 'error', text: `${name}: у класса ${c.code} нет игровых средств для задачи «перехват в зоне».`, objectId: o.id });
    }
    if (o.payload.length) {
      const total = o.payload.reduce((a, p) => a + p.count, 0);
      if (!c.payloadClasses) out.push({ level: 'error', text: `${name}: класс ${c.code} не может нести нагрузку.`, objectId: o.id });
      else {
        for (const p of o.payload) if (!c.payloadClasses.includes(p.classId)) out.push({ level: 'error', text: `${name}: нагрузка ${CLASS_BY_ID[p.classId]?.code ?? p.classId} несовместима с классом ${c.code}.`, objectId: o.id });
        if (c.payloadMax !== undefined && total > c.payloadMax) out.push({ level: 'error', text: `${name}: нагрузки ${total}, а класс вмещает ${c.payloadMax}.`, objectId: o.id });
      }
      for (const p of o.payload) if (p.count < 0) out.push({ level: 'error', text: `${name}: отрицательное количество нагрузки.`, objectId: o.id });
    }
    if (c.kind === 'launcher' && !o.payload.some((p) => p.count > 0)) out.push({ level: 'warn', text: `${name}: пусковая без нагрузки ничего не сделает.`, objectId: o.id });
    if (o.stock !== undefined && o.stock !== null && o.stock < 0) out.push({ level: 'error', text: `${name}: отрицательный запас.`, objectId: o.id });
    if (o.histRef && ctx.availability) {
      const p = part.get(o.side);
      const a = ctx.availability(o.histRef, p?.entityId ?? null, doc.episode.date);
      if (a.status !== 'confirmed') {
        const lvl = doc.settings.availability === 'strict' ? 'error' : doc.settings.availability === 'warn' ? 'warn' : 'info';
        out.push({ level: lvl, text: `${name}: ${a.text}${lvl === 'error' ? ' Строгий режим доступности не разрешает такую подпись.' : ' Подпись будет отмечена как допущение сценария.'}`, objectId: o.id });
      }
    }
  }

  // Погода
  const wx = doc.weather;
  if (doc.world.kind === 'test-scene' && wx.source !== 'manual')
    out.push({ level: 'error', text: 'Испытательная сцена вымышлена: у неё нет реальной погоды. Выберите ручные условия.', field: 'weather' });
  if (wx.source === 'current' && doc.episode.date !== ctx.today)
    out.push({ level: 'error', text: `Текущая погода подходит только для сценария с сегодняшней датой (${ctx.today}). Для ${doc.episode.date} выберите архив или ручные условия.`, field: 'weather' });
  if (wx.source === 'archive') {
    const pr = archiveDateProblem(doc.episode.date, ctx.today);
    if (pr) out.push({ level: pr.startsWith('ERA5') ? 'warn' : 'error', text: pr, field: 'weather' });
  }
  if (wx.source !== 'manual' && !wx.snapshot)
    out.push({ level: 'warn', text: 'Погодный снимок не загружен: эпизод пойдёт с игровым пресетом без данных. Загрузите снимок или выберите ручные условия.', field: 'weather' });
  if (wx.snapshot && wx.source !== wx.snapshot.source)
    out.push({ level: 'error', text: `Сохранённый снимок — ${wx.snapshot.source === 'archive' ? 'архивный' : 'текущий'}, а выбран источник «${wx.source}». Архивную и текущую погоду нельзя подменять друг другом.`, field: 'weather' });
  if (wx.snapshot && wx.source === 'archive' && !wx.snapshot.validTime.startsWith(doc.episode.date))
    out.push({ level: 'error', text: `Архивный снимок относится к ${wx.snapshot.validTime.slice(0, 10)}, а дата эпизода — ${doc.episode.date}. Загрузите снимок заново.`, field: 'weather' });

  if (doc.world.kind === 'historical' && doc.episode.date < doc.world.forkDate)
    out.push({ level: 'error', text: 'Дата эпизода раньше даты ветвления: до точки ветвления действует история без изменений.', field: 'date' });
  if (doc.settings.control === 'manual' && !doc.settings.autopause.includes('decision'))
    out.push({ level: 'info', text: 'Ручное управление: решения ждут вас в очереди действий. Можно включить автопаузу на «Решение».', field: 'control' });
  return out;
}
