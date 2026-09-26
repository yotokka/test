/**
 * Детерминированная математика игровой модели.
 *
 * Math.sin/cos/atan2 в разных браузерах могут давать разные последние биты, а игровая модель обязана
 * давать одинаковый журнал везде. Поэтому расчёт использует только сложение, умножение, деление и
 * квадратный корень (они округляются по IEEE 754 одинаково) и собственные многочлены для синуса и косинуса.
 * Math.atan2 применяется только в отрисовке (ориентация значка) и на результат не влияет.
 */

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
export const DEG = PI / 180;

/** Приведение угла (рад) к [-π, π] без Math.floor-зависимых особенностей. */
function wrap(a: number): number {
  let x = a;
  while (x > PI) x -= TWO_PI;
  while (x < -PI) x += TWO_PI;
  return x;
}

/** Синус многочленом (Тейлор до 15-й степени после приведения к [-π/2, π/2]); ошибка < 1e-9. */
export function dsin(a: number): number {
  let x = wrap(a);
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const x2 = x * x;
  // Схема Горнера
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))))
  );
}

export function dcos(a: number): number {
  return dsin(a + PI / 2);
}

export function hypot2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Единичный вектор курса по метеорологическому/навигационному углу: 0° — север, 90° — восток. */
export function headingVec(deg: number): [number, number] {
  const a = deg * DEG;
  return [dsin(a), dcos(a)];
}

/**
 * Поворот единичного вектора h к желаемому d не больше чем на maxRad за шаг.
 * Возвращает новый вектор (нормированный). Без atan2: направление поворота — знак векторного произведения.
 */
export function turnToward(hx: number, hy: number, dx: number, dy: number, maxRad: number): [number, number] {
  const dl = hypot2(dx, dy);
  if (dl === 0) return [hx, hy];
  const ux = dx / dl;
  const uy = dy / dl;
  const dot = hx * ux + hy * uy;
  const c = dcos(maxRad);
  if (dot >= c) return [ux, uy];
  const cross = hx * uy - hy * ux; // >0 — желаемое направление левее (против часовой в осях x-восток, y-север)
  const s = dsin(maxRad) * (cross >= 0 ? 1 : -1);
  // Поворот на ±maxRad против часовой стрелки
  const nx = hx * c - hy * s;
  const ny = hx * s + hy * c;
  const nl = hypot2(nx, ny);
  return [nx / nl, ny / nl];
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Сближение значения с целью не быстрее rate за шаг. */
export function approach(v: number, target: number, rateUp: number, rateDown: number = rateUp): number {
  if (v < target) return Math.min(target, v + rateUp);
  if (v > target) return Math.max(target, v - rateDown);
  return v;
}

/** Округление для отпечатков: одинаковое текстовое представление во всех движках. */
export const r3 = (v: number) => Math.round(v * 1000) / 1000;
