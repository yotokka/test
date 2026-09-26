/**
 * Условная испытательная сцена: вымышленные страны и масштаб. Нужна для проверки игрового движка и
 * визуального поведения, а не реального оружия. Контуры перенесены из прежней учебной симуляции;
 * 1 условная единица = 1 км игровой плоскости (x — восток, y — север).
 */

export const SCENE_W = 1000;
export const SCENE_H = 640;

export interface SceneCountry {
  id: string;
  name: string;
  short: string;
  /** Контур в координатах экрана прежней карты (y вниз). */
  poly: [number, number][];
  labelAt: [number, number];
}

const parse = (d: string): [number, number][] =>
  d
    .replace(/[MLZ]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number]);

export const SCENE_COUNTRIES: SceneCountry[] = [
  { id: 'B', name: 'Борея', short: 'БОР', poly: parse('M40,40 L300,28 L520,46 L700,34 L880,60 L905,150 L820,176 L690,168 L600,196 L470,188 L360,206 L250,192 L130,210 L52,176 Z'), labelAt: [470, 110] },
  { id: 'E', name: 'Эстравия', short: 'ЭСТ', poly: parse('M52,176 L130,210 L250,192 L262,300 L240,420 L262,540 L200,600 L96,590 L44,470 L60,330 Z'), labelAt: [150, 390] },
  { id: 'A', name: 'Аврелия', short: 'АВР', poly: parse('M250,192 L360,206 L470,188 L600,196 L618,300 L596,400 L640,470 L580,560 L440,600 L320,590 L262,540 L240,420 L262,300 Z'), labelAt: [430, 330] },
  { id: 'K', name: 'Кассиния', short: 'КАС', poly: parse('M600,196 L690,168 L820,176 L905,150 L960,230 L948,360 L900,450 L790,470 L640,470 L596,400 L618,300 Z'), labelAt: [790, 310] },
  { id: 'D', name: 'Дельмар', short: 'ДЕЛ', poly: parse('M760,540 L840,516 L920,534 L944,590 L880,618 L790,610 L748,578 Z'), labelAt: [850, 572] },
];

/** Экранные координаты прежней карты → плоские км (y вверх, начало в центре сцены). */
export const sceneToKm = (sx: number, sy: number) => ({ x: sx - SCENE_W / 2, y: SCENE_H / 2 - sy });
export const kmToScene = (x: number, y: number): [number, number] => [x + SCENE_W / 2, SCENE_H / 2 - y];

function inPoly(px: number, py: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Какой вымышленной стране принадлежит точка (км) — или null (море). */
export function sceneOwner(x: number, y: number): string | null {
  const [sx, sy] = kmToScene(x, y);
  return SCENE_COUNTRIES.find((c) => inPoly(sx, sy, c.poly))?.id ?? null;
}
