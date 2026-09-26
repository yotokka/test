import type { PostSpec, Scenario } from './types';
import { makeRelations } from './world';

/**
 * Готовые УЧЕБНЫЕ сценарии. Страны, посты, объекты, координаты и вероятности вымышлены.
 * Пользователь не выбирает цели и не задаёт траектории — всё это зафиксировано в сценарии.
 */

const kedr = (over: Partial<PostSpec> = {}): PostSpec => ({
  id: 'A1',
  name: 'Кедр',
  country: 'A',
  x: 430,
  y: 370,
  detectRadius: 250,
  engageRadius: 170,
  detectP: 0.6,
  stock: 3,
  interceptP: 0.7,
  ...over,
});

export const SCENARIOS: Scenario[] = [
  {
    id: 'basics',
    title: 'Этапы по порядку',
    summary: 'Один объект, один пост. Видны все пять этапов: появление, обнаружение, классификация, решение и условный перехват.',
    learningGoal: 'Понять, что между появлением объекта и перехватом лежит цепочка этапов, и каждый из них занимает время и может не удаться.',
    seed: 1983,
    maxTicks: 140,
    relations: makeRelations({ 'A|K': { status: 'conflict' } }),
    posts: [kedr()],
    objects: [
      { id: 'O1', label: 'О-1', profile: 'arc', origin: 'K', spawnTick: 2, from: { x: 880, y: 280 }, to: { x: 360, y: 440 }, destination: 'A' },
    ],
  },
  {
    id: 'alliance',
    title: 'Союз — ещё не перехват',
    summary: 'Пост Бореи видит объект, летящий к союзной Аврелии, но соглашения о совместной обороне нет.',
    learningGoal: 'Увидеть, что союз сам по себе не означает перехвата: без отдельного соглашения пост только передаёт данные.',
    seed: 1984,
    maxTicks: 130,
    relations: makeRelations({
      'A|B': { status: 'alliance' },
      'A|K': { status: 'conflict' },
      'B|K': { status: 'conflict' },
    }),
    posts: [
      { id: 'B1', name: 'Сосна', country: 'B', x: 560, y: 160, detectRadius: 240, engageRadius: 150, detectP: 0.6, stock: 2, interceptP: 0.7 },
      kedr({ x: 400, y: 330, detectRadius: 230, engageRadius: 160 }),
    ],
    objects: [
      { id: 'O1', label: 'О-1', profile: 'arc', origin: 'K', spawnTick: 2, from: { x: 900, y: 220 }, to: { x: 320, y: 300 }, destination: 'A' },
    ],
  },
  {
    id: 'joint',
    title: 'Совместная оборона и разрешение',
    summary: 'Два объекта летят к островному Дельмару. У Аврелии с Дельмаром есть соглашение о совместной обороне, но каждый перехват требует разрешения.',
    learningGoal: 'Понять, как соглашение создаёт основание для действий, а требование разрешения добавляет задержку и неопределённость.',
    seed: 1985,
    maxTicks: 120,
    relations: makeRelations(
      {
        'A|D': { status: 'alliance', jointDefense: true },
        'A|K': { status: 'conflict' },
        'D|K': { status: 'conflict' },
      },
      { A: true },
    ),
    posts: [
      { id: 'A2', name: 'Маяк', country: 'A', x: 620, y: 500, detectRadius: 320, engageRadius: 260, detectP: 0.6, stock: 2, interceptP: 0.7 },
    ],
    objects: [
      { id: 'O1', label: 'О-1', profile: 'arc', origin: 'K', spawnTick: 2, from: { x: 760, y: 200 }, to: { x: 830, y: 570 }, destination: 'D' },
      { id: 'O2', label: 'О-2', profile: 'arc', origin: 'K', spawnTick: 18, from: { x: 880, y: 210 }, to: { x: 800, y: 590 }, destination: 'D' },
    ],
  },
  {
    id: 'neutral',
    title: 'Нейтральный транзит и неясное происхождение',
    summary: 'Воздушное судно из нейтральной Эстравии пересекает Аврелию. С моря приближается малозаметный объект неустановленного происхождения.',
    learningGoal: 'Увидеть роль классификации и опознавания: неясность происхождения требует дополнительной проверки, а воздушное судно — только сопровождения.',
    seed: 1986,
    maxTicks: 175,
    relations: makeRelations({ 'A|E': { status: 'neutral' }, 'A|K': { status: 'neutral' } }),
    posts: [kedr({ detectP: 0.55, detectRadius: 260, engageRadius: 180 })],
    objects: [
      { id: 'O1', label: 'Б-1', profile: 'air', origin: 'E', spawnTick: 1, from: { x: 180, y: 330 }, to: { x: 700, y: 300 }, destination: 'K' },
      { id: 'O2', label: 'О-2', profile: 'low', origin: 'X', spawnTick: 8, from: { x: 520, y: 636 }, to: { x: 430, y: 420 }, destination: 'A' },
    ],
  },
  {
    id: 'saturation',
    title: 'Несколько объектов и ограниченный запас',
    summary: 'Пять объектов, два поста, ограниченный учебный запас. У Бореи есть соглашение о совместной обороне с Аврелией, но нужно разрешение.',
    learningGoal: 'Показать, что ресурс конечен, посты координируют пуски, а итог зависит от цепочки случайных событий.',
    seed: 1987,
    maxTicks: 150,
    relations: makeRelations(
      {
        'A|B': { status: 'alliance', jointDefense: true },
        'A|K': { status: 'conflict' },
        'B|K': { status: 'conflict' },
      },
      { B: true },
    ),
    posts: [
      kedr({ x: 420, y: 360 }),
      { id: 'B1', name: 'Сосна', country: 'B', x: 520, y: 150, detectRadius: 240, engageRadius: 170, detectP: 0.6, stock: 2, interceptP: 0.7 },
    ],
    objects: [
      { id: 'O1', label: 'О-1', profile: 'arc', origin: 'K', spawnTick: 2, from: { x: 900, y: 260 }, to: { x: 380, y: 420 }, destination: 'A' },
      { id: 'O2', label: 'О-2', profile: 'low', origin: 'K', spawnTick: 4, from: { x: 640, y: 300 }, to: { x: 470, y: 300 }, destination: 'A' },
      { id: 'O3', label: 'О-3', profile: 'arc', origin: 'K', spawnTick: 6, from: { x: 920, y: 300 }, to: { x: 460, y: 480 }, destination: 'A' },
      { id: 'O4', label: 'О-4', profile: 'arc', origin: 'K', spawnTick: 10, from: { x: 880, y: 200 }, to: { x: 420, y: 120 }, destination: 'B' },
      { id: 'O5', label: 'О-5', profile: 'arc', origin: 'K', spawnTick: 14, from: { x: 910, y: 340 }, to: { x: 340, y: 360 }, destination: 'A' },
    ],
  },
];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
