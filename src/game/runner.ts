import { createState, stateFingerprint, stepState } from './engine';
import type { Command, EpisodeSetup, GameEvent, GameState } from './types';

/**
 * Прогон эпизода с контрольными снимками. Журнал только дополняется, поэтому снимок хранит состояние
 * без журнала и длину журнала; при перемотке назад берётся ближайший более ранний снимок и шаги
 * повторяются с теми же командами. Команда, отметка которой позже снимка, применится заново ровно один раз.
 */

type Snap = { step: number; state: GameState; logLen: number };

const cloneState = (s: GameState): GameState => {
  const { log, ...rest } = s;
  const c = structuredClone(rest) as Omit<GameState, 'log'>;
  return { ...c, log };
};

export function sortCommands(cmds: readonly Command[]): Command[] {
  return [...cmds].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

export class EpisodeRunner {
  readonly setup: EpisodeSetup;
  private commands: Command[];
  state: GameState;
  /** Полный журнал самой дальней рассчитанной ветви времени */
  private fullLog: GameEvent[] = [];
  private snaps: Snap[] = [];
  private every: number;
  /** Положения на предыдущем шаге — для плавной отрисовки между шагами */
  prev = new Map<string, { x: number; y: number; alt: number }>();
  /** Самый поздний рассчитанный момент (для полосы перемотки) */
  horizon = 0;

  constructor(setup: EpisodeSetup, commands: readonly Command[] = []) {
    this.setup = setup;
    this.commands = sortCommands(commands);
    this.every = Math.max(1, Math.round(setup.checkpointEveryS / setup.dt));
    this.state = createState(setup);
    this.fullLog = this.state.log;
    this.snaps.push({ step: 0, state: cloneState({ ...this.state, log: [] }), logLen: this.state.log.length });
  }

  get t() {
    return this.state.t;
  }
  get finished() {
    return this.state.finished;
  }
  get log(): readonly GameEvent[] {
    return this.state.log;
  }
  getCommands(): readonly Command[] {
    return this.commands;
  }

  /** Один фиксированный шаг. Возвращает новые записи журнала. */
  stepOnce(): GameEvent[] {
    if (this.state.finished) return [];
    const before = this.state.log.length;
    this.prev.clear();
    for (const e of this.state.ents) this.prev.set(e.id, { x: e.x, y: e.y, alt: e.alt });
    stepState(this.state, this.setup, this.commands);
    if (this.state.step % this.every === 0 && !this.snaps.some((x) => x.step === this.state.step)) {
      this.snaps.push({ step: this.state.step, state: cloneState({ ...this.state, log: [] }), logLen: this.state.log.length });
    }
    if (this.state.t > this.horizon) this.horizon = this.state.t;
    return this.state.log.slice(before);
  }

  /**
   * Продвинуться до игрового момента t (не дальше), но не больше maxSteps шагов за вызов.
   * Возвращает новые записи и признак, что расчёт не успел (интерфейс покажет «замедлено»).
   */
  advanceTo(t: number, maxSteps = 4000, stopAt?: (e: GameEvent) => boolean): { events: GameEvent[]; behind: boolean; stoppedBy: GameEvent | null } {
    const out: GameEvent[] = [];
    let n = 0;
    while (!this.state.finished && this.state.t + this.setup.dt <= t + 1e-9) {
      if (n++ >= maxSteps) return { events: out, behind: true, stoppedBy: null };
      const ev = this.stepOnce();
      out.push(...ev);
      const hit = stopAt ? ev.find(stopAt) : undefined;
      if (hit) return { events: out, behind: false, stoppedBy: hit };
    }
    return { events: out, behind: false, stoppedBy: null };
  }

  /** Перемотка к моменту t: назад — через снимок, вперёд — расчётом. */
  seek(t: number) {
    const target = Math.max(0, t);
    if (target < this.state.t) {
      let snap = this.snaps[0];
      for (const x of this.snaps) if (x.step * this.setup.dt <= target + 1e-9 && x.step >= snap.step) snap = x;
      const st = cloneState(snap.state);
      st.log = this.fullLog.slice(0, snap.logLen);
      this.state = st;
      this.fullLog = st.log;
    }
    this.advanceTo(target, Number.MAX_SAFE_INTEGER);
  }

  /** Дорассчитать до конца (для итогов, отпечатка и тестов). */
  runToEnd() {
    while (!this.state.finished) this.stepOnce();
    return this;
  }

  /** Добавить команду в текущий момент. Команда в прошлом меняет ход — это делается только новой веткой. */
  addCommand(c: Command): { ok: true } | { ok: false; reason: string } {
    if (c.t + 1e-9 < this.state.t) return { ok: false, reason: 'Команда в прошлом эпизода: продолжите новой веткой от этого момента.' };
    // Если впереди уже есть рассчитанное будущее, оно больше недействительно: удаляем снимки после t
    this.snaps = this.snaps.filter((x) => x.step * this.setup.dt <= this.state.t + 1e-9);
    this.horizon = this.state.t;
    this.commands = sortCommands([...this.commands, c]);
    return { ok: true };
  }

  fingerprint() {
    return stateFingerprint(this.state);
  }
}
