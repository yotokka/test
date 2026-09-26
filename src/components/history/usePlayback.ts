import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryEngine } from '../../history/engine';
import { stepPlayback } from '../../history/playback';
import { dayStartMs, msToDay, type SpeedId } from '../../history/time';
import type { HistEvent } from '../../history/types';

export interface JournalEntry {
  seq: number;
  event: HistEvent;
  dir: 1 | -1;
}

const JOURNAL_MAX = 400;

/**
 * Непрерывное воспроизведение исторического времени. Кадры анимации только двигают часы;
 * какие события пройдены, определяет чистая функция stepPlayback по интервалу дней.
 */
export function usePlayback(engine: HistoryEngine, initialDay: number, isKey: (e: HistEvent) => boolean, onStop: (e: HistEvent) => void) {
  const [ms, setMs] = useState(() => dayStartMs(initialDay));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedId>('month');
  const [dir, setDir] = useState<1 | -1>(1);
  const [stopAtKey, setStopAtKey] = useState(true);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalTotal, setJournalTotal] = useState(0);
  const seq = useRef(0);

  const st = useRef({ ms, speed, dir, stopAtKey, isKey, onStop });
  st.current = { ms, speed, dir, stopAtKey, isKey, onStop };

  const record = useCallback((events: HistEvent[], d: 1 | -1) => {
    if (!events.length) return;
    const ordered = d === 1 ? events : [...events].reverse();
    setJournalTotal((n) => n + ordered.length);
    setJournal((prev) => {
      const add = ordered.slice(-JOURNAL_MAX).map((event) => ({ seq: ++seq.current, event, dir: d }));
      return [...add.reverse(), ...prev].slice(0, JOURNAL_MAX);
    });
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(250, now - last); // после сворачивания вкладки не прыгаем на минуты вперёд
      last = now;
      const cur = st.current;
      const r = stepPlayback(engine, { ms: cur.ms, speed: cur.speed, dir: cur.dir, stopAtKey: cur.stopAtKey }, dt, cur.isKey);
      record(r.crossed, cur.dir);
      st.current.ms = r.ms;
      setMs(r.ms);
      if (r.stoppedAt) {
        setPlaying(false);
        cur.onStop(r.stoppedAt);
        return;
      }
      if (r.hitBound) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, engine, record]);

  /** Переход к дню: все промежуточные события попадают в журнал. */
  const seekDay = useCallback(
    (day: number) => {
      const target = Math.max(engine.start, Math.min(engine.end, day));
      const from = msToDay(st.current.ms);
      record(engine.eventsBetween(from, target), target >= from ? 1 : -1);
      st.current.ms = dayStartMs(target);
      setMs(dayStartMs(target));
    },
    [engine, record],
  );

  const toggle = useCallback(() => {
    const day = msToDay(st.current.ms);
    // В конце шкалы запуск вперёд начинается с начала; в начале шкалы запуск назад — с конца
    if (!playing && st.current.dir === 1 && day >= engine.end) seekDay(engine.start);
    if (!playing && st.current.dir === -1 && day <= engine.start) seekDay(engine.end);
    setPlaying((p) => !p);
  }, [playing, engine, seekDay]);

  return {
    ms,
    day: msToDay(ms),
    playing,
    setPlaying,
    toggle,
    speed,
    setSpeed,
    dir,
    setDir,
    stopAtKey,
    setStopAtKey,
    seekDay,
    journal,
    journalTotal,
    clearJournal: () => {
      setJournal([]);
      setJournalTotal(0);
    },
  };
}
