import type { DayNum, Precision } from './types';

/** Календарь исторического режима. Все даты — UTC; часы используются только как техническая шкала. */

export const DAY_MS = 86_400_000;

export function dayOf(iso: string): DayNum {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}
export function isoOf(day: DayNum): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
export function msToDay(ms: number): DayNum {
  return Math.floor(ms / DAY_MS);
}
export const dayStartMs = (day: DayNum) => day * DAY_MS;

export function isValidIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Календарный сдвиг: месяцы и годы — календарные периоды; 31 января + 1 месяц = 28/29 февраля. */
export function addCalendar(day: DayNum, unit: 'day' | 'month' | 'year', n: number): DayNum {
  if (unit === 'day') return day + n;
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dd = d.getUTCDate();
  const months = unit === 'month' ? n : n * 12;
  const ty = y + Math.floor((m + months) / 12);
  const tm = (((m + months) % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return msToDay(Date.UTC(ty, tm, Math.min(dd, last)));
}

/* ———— Скорости воспроизведения ———— */

export type SpeedId = 'realtime' | 'day' | 'month' | 'year';

export const SPEEDS: { id: SpeedId; label: string; hint: string }[] = [
  { id: 'realtime', label: '1×', hint: '1 секунда исторического времени за 1 секунду' },
  { id: 'day', label: '1 день/сек', hint: '1 календарный день за 1 секунду' },
  { id: 'month', label: '1 месяц/сек', hint: '1 календарный месяц за 1 секунду' },
  { id: 'year', label: '1 год/сек', hint: '1 календарный год за 1 секунду' },
];

function monthStartMs(index: number): number {
  return Date.UTC(Math.floor(index / 12), ((index % 12) + 12) % 12, 1);
}
function monthPos(ms: number): number {
  const d = new Date(ms);
  const idx = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const a = monthStartMs(idx);
  return idx + (ms - a) / (monthStartMs(idx + 1) - a);
}
function fromMonthPos(pos: number): number {
  const idx = Math.floor(pos);
  const a = monthStartMs(idx);
  return a + (pos - idx) * (monthStartMs(idx + 1) - a);
}

/**
 * Сдвиг исторического времени за realMs реальных миллисекунд. Чистая функция.
 * Для «месяц/сек» и «год/сек» время движется по календарным периодам: февраль проходит за ту же
 * секунду, что и март, хотя он короче.
 */
export function advance(ms: number, realMs: number, speed: SpeedId, dir: 1 | -1): number {
  const k = (realMs / 1000) * dir;
  switch (speed) {
    case 'realtime':
      return ms + realMs * dir;
    case 'day':
      return ms + k * DAY_MS;
    case 'month':
      return fromMonthPos(monthPos(ms) + k);
    case 'year':
      return fromMonthPos(monthPos(ms) + k * 12);
  }
}

/* ———— Формат ———— */

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function fmtDay(day: DayNum): string {
  const [y, m, d] = isoOf(day).split('-');
  return `${d}.${m}.${y}`;
}

/** Дата события в точности источника. Техническая привязка к началу дня не показывается как время. */
export function fmtWithPrecision(iso: string, precision: Precision): { text: string; note: string } {
  const [y, m, d] = iso.split('-').map(Number);
  if (precision === 'year') return { text: `${y} г.`, note: 'точность — год' };
  if (precision === 'month') return { text: `${MONTHS_NOM[m - 1]} ${y} г.`, note: 'точность — месяц' };
  const dayText = `${d} ${MONTHS_GEN[m - 1]} ${y} г.`;
  if (precision === 'day') return { text: dayText, note: 'точность — день (время суток не установлено)' };
  if (precision === 'ucdp-end') return { text: dayText, note: 'дата окончания эпизода по UCDP; точность в используемом подмножестве не указана' };
  const code = precision.replace('ucdp-', '');
  return { text: dayText, note: `дата по UCDP; код точности ${code} (расшифровка кода не сверена с кодбуком UCDP)` };
}
