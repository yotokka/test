import type { HistoryEngine } from './engine';
import { advance, dayStartMs, msToDay, type SpeedId } from './time';
import type { HistEvent } from './types';

export interface PlaybackState {
  ms: number;
  speed: SpeedId;
  dir: 1 | -1;
  stopAtKey: boolean;
}

export interface StepResult {
  ms: number;
  /** Все события, пройденные за шаг, в порядке применения (при движении назад — отменённые). */
  crossed: HistEvent[];
  stoppedAt: HistEvent | null;
  hitBound: boolean;
}

/**
 * Один шаг воспроизведения. Чистая функция: результат зависит только от положения, скорости и
 * прошедшего реального времени. События определяются по пройденному интервалу дней, поэтому
 * крупный скачок не пропускает промежуточные изменения, а скорость не меняет их порядок.
 */
export function stepPlayback(engine: HistoryEngine, st: PlaybackState, realMs: number, isKey: (e: HistEvent) => boolean): StepResult {
  const minMs = dayStartMs(engine.start);
  const maxMs = dayStartMs(engine.end + 1) - 1;
  let next = advance(st.ms, realMs, st.speed, st.dir);
  let hitBound = false;
  if (next <= minMs) {
    next = minMs;
    hitBound = st.dir === -1;
  }
  if (next >= maxMs) {
    next = maxMs;
    hitBound = st.dir === 1;
  }
  const fromDay = msToDay(st.ms);
  let toDay = msToDay(next);
  let crossed = engine.eventsBetween(fromDay, toDay);
  let stoppedAt: HistEvent | null = null;
  if (st.stopAtKey && crossed.length) {
    // При движении назад событие текущего дня уже показано — останавливаемся только на более ранних.
    const seq = st.dir === 1 ? crossed : [...crossed].reverse().filter((e) => engine.eventDays[e.order] < fromDay);
    const key = seq.find(isKey);
    if (key) {
      // Остановка в начале дня ключевого события: событие показано применённым в обоих направлениях.
      const d = engine.eventDays[key.order];
      toDay = d;
      next = dayStartMs(d);
      stoppedAt = key;
      hitBound = false;
      crossed = engine.eventsBetween(fromDay, toDay);
    }
  }
  return { ms: next, crossed, stoppedAt, hitBound };
}
