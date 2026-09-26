import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EpisodeRunner } from '../../game/runner';
import type { Command, Ent, EventKind, GameEvent } from '../../game/types';
import type { HistoryEngine } from '../../history/engine';
import { buildSetup } from '../../scenario/setup';
import type { ScenarioDoc } from '../../scenario/types';

/**
 * Воспроизведение эпизода. Модель считает фиксированными шагами; кадр анимации лишь решает, до какого
 * игрового момента досчитать (реальное время × скорость показа). Если за кадр не успеваем, показ
 * замедляется, а шаги не пропускаются — поэтому скорость показа и частота кадров не меняют результат.
 * Бегунок пересоздаётся из сценария при любом изменении начального состояния или команд и
 * досчитывается до прежнего момента: состояние всегда — функция сценария.
 */

export interface DisplayEnt extends Ent {
  dx: number;
  dy: number;
  dalt: number;
}

const MAX_STEPS_PER_FRAME = 600;

/** Ключ всего, что влияет на расчёт (без скорости показа, качества, автопауз и фильтра журнала). */
export function setupKey(doc: ScenarioDoc): string {
  const { settings, ...rest } = doc;
  const { playbackSpeed: _a, quality: _b, autopause: _c, logDetail: _d, ...s } = settings;
  return JSON.stringify({ ...rest, settings: s, changeLog: null, updatedAt: null, title: null, description: null });
}

export function useEpisode(doc: ScenarioDoc, engine: HistoryEngine | null, enabled: boolean) {
  const key = setupKey(doc);
  const built = useMemo(() => buildSetup(doc, { engine }), [key, engine]); // eslint-disable-line react-hooks/exhaustive-deps
  const runnerRef = useRef<EpisodeRunner | null>(null);
  const displayT = useRef(0);
  const [, force] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [behind, setBehind] = useState(false);
  const [stopped, setStopped] = useState<GameEvent | null>(null);
  const [replayCheck, setReplayCheck] = useState<{ a: string; b: string } | null>(null);
  const speedRef = useRef(doc.settings.playbackSpeed);
  speedRef.current = doc.settings.playbackSpeed;
  const autoRef = useRef<EventKind[]>(doc.settings.autopause);
  autoRef.current = doc.settings.autopause;

  // Пересоздать бегунок при изменении сценария; вернуться к прежнему моменту
  useEffect(() => {
    if (!enabled) return;
    const keepT = displayT.current;
    const r = new EpisodeRunner(built.setup, doc.commands);
    r.seek(keepT);
    runnerRef.current = r;
    displayT.current = r.t;
    force((n) => n + 1);
  }, [built, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !enabled) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const r = runnerRef.current;
      if (!r) return;
      const dt = Math.min(250, now - last);
      last = now;
      const target = Math.min(built.setup.durationS, displayT.current + (dt / 1000) * speedRef.current);
      const res = r.advanceTo(target, MAX_STEPS_PER_FRAME, (e) => autoRef.current.includes(e.kind) && e.detail === 1);
      if (res.stoppedBy) {
        displayT.current = r.t;
        setStopped(res.stoppedBy);
        setPlaying(false);
      } else if (res.behind) {
        displayT.current = r.t; // замедление показа, а не пропуск шагов
        setBehind(true);
      } else {
        displayT.current = target;
        setBehind(false);
      }
      if (r.finished) {
        displayT.current = r.t;
        setPlaying(false);
      }
      force((n) => (n + 1) % 1_000_000);
      if (!r.finished && !res.stoppedBy) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, enabled, built]);

  const r = runnerRef.current;

  const seek = useCallback((t: number) => {
    const rr = runnerRef.current;
    if (!rr) return;
    setPlaying(false);
    rr.seek(Math.max(0, Math.min(built.setup.durationS, t)));
    displayT.current = rr.t;
    setStopped(null);
    force((n) => n + 1);
  }, [built]);

  const stepOnce = useCallback(() => {
    const rr = runnerRef.current;
    if (!rr) return;
    setPlaying(false);
    rr.stepOnce();
    displayT.current = rr.t;
    force((n) => n + 1);
  }, []);

  const play = useCallback(() => {
    const rr = runnerRef.current;
    if (!rr) return;
    if (rr.finished) {
      rr.seek(0);
      displayT.current = 0;
    }
    setStopped(null);
    setPlaying(true);
  }, []);

  /** Повтор с тем же начальным состоянием: новый расчёт с нуля и сверка отпечатка с текущим до конца. */
  const replay = useCallback(() => {
    const a = new EpisodeRunner(built.setup, doc.commands).runToEnd().fingerprint();
    const b = new EpisodeRunner(built.setup, doc.commands).runToEnd().fingerprint();
    setReplayCheck({ a, b });
    seek(0);
    setPlaying(true);
  }, [built, doc.commands, seek]);

  /** Отображаемые положения: между двумя последними шагами — для плавности при любой частоте кадров. */
  const ents: DisplayEnt[] = useMemo(() => {
    if (!r) return [];
    const alpha = Math.max(0, Math.min(1, (displayT.current - r.t) / built.setup.dt));
    return r.state.ents.map((e) => {
      const p = r.prev.get(e.id);
      if (!p || e.phase === 'done') return { ...e, dx: e.x, dy: e.y, dalt: e.alt };
      return { ...e, dx: p.x + (e.x - p.x) * alpha, dy: p.y + (e.y - p.y) * alpha, dalt: p.alt + (e.alt - p.alt) * alpha };
    });
  }, [r, r?.state.step, displayT.current]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    runner: r,
    setup: built.setup,
    weatherLines: built.weatherLines,
    t: r?.t ?? 0,
    displayT: displayT.current,
    horizon: r?.horizon ?? 0,
    ents,
    log: r?.log ?? [],
    pending: r?.state.pending ?? [],
    finished: r?.finished ?? false,
    finishReason: r?.state.finishReason ?? '',
    playing,
    behind,
    stopped,
    replayCheck,
    clearReplayCheck: () => setReplayCheck(null),
    play,
    pause: () => setPlaying(false),
    toggle: () => (playing ? setPlaying(false) : play()),
    seek,
    stepOnce,
    replay,
    /** Проверка команды: в текущий момент и без рассчитанного будущего — сразу; иначе нужна новая ветка. */
    canCommandNow(): { ok: true } | { ok: false; reason: string } {
      const rr = runnerRef.current;
      if (!rr) return { ok: false, reason: 'Эпизод не запущен.' };
      const future = doc.commands.some((c) => c.t > rr.t + 1e-9);
      if (future) return { ok: false, reason: 'После этого момента уже записаны команды: новая команда изменит сохранённое будущее. Продолжите новой веткой.' };
      return { ok: true };
    },
    newCommand(body: Omit<Command, 'id' | 't'>): Command {
      const rr = runnerRef.current;
      return { ...(body as Command), id: `cmd-${doc.commands.length + 1}-${Math.round((rr?.t ?? 0) * 10)}`, t: rr?.t ?? 0 };
    },
  };
}

export type Episode = ReturnType<typeof useEpisode>;
