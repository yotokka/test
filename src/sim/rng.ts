/**
 * Детерминированный генератор псевдослучайных чисел Mulberry32.
 * Состояние — одно 32-битное число, поэтому его легко хранить в состоянии модели.
 * Одно и то же зерно всегда даёт одну и ту же последовательность.
 */
export function nextRandom(state: number): [value: number, nextState: number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Нормализует введённое пользователем зерно в 32-битное беззнаковое целое. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.abs(Math.trunc(seed)) >>> 0;
}

/** FNV-1a: короткий «отпечаток» журнала для проверки воспроизводимости. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
}
