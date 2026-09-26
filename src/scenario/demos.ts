import { pairKey } from '../game/engine';
import legacy from './data/legacy-sim-scenarios.json';
import { newTestScene, SIDE_COLORS } from './factory';
import { REGIONS, regionCenter, lonLatToKm } from './geo';
import { migrateLegacySim } from './schema';
import type { PlacedObject, ScenarioDoc } from './types';

/**
 * Готовые учебные сценарии. Боевые параметры вымышлены: действуют игровые классы. Сценарии с
 * взаимодействиями построены на испытательной сцене с вымышленными странами; сценарии на исторической
 * карте показывают ветвление, погодный контекст и перелёты без взаимодействий.
 */

export interface DemoInfo {
  id: string;
  title: string;
  summary: string;
  shows: string[];
  make: (today: string, buildId: string | null) => ScenarioDoc;
}

const rel = (d: ScenarioDoc, a: string, b: string, status: 'alliance' | 'neutral' | 'conflict', jointDefense = false) => {
  d.relations[pairKey(a, b)] = { status, jointDefense };
};
const obj = (o: Partial<PlacedObject> & Pick<PlacedObject, 'id' | 'classId' | 'side' | 'label' | 'pos'>): PlacedObject => ({ startS: 0, route: [], mission: 'none', payload: [], ...o });

function carrierDemo(): ScenarioDoc {
  const d = newTestScene('Полигон: носитель и нагрузка');
  d.description = 'Носитель Кассинии отделяет три условных крылатых объекта. У Аврелии два поста разных игровых классов и истребитель; Борея — союзник с совместной обороной и постом наблюдения.';
  d.demo = { id: 'carrier', learningGoal: 'Увидеть, что нагрузка принадлежит носителю, отделяется один раз и дальше летит сама; что совместимость задаётся игровым классом (З-λ не работает по крылатым объектам); что запас конечен.' };
  rel(d, 'A', 'K', 'conflict');
  rel(d, 'A', 'B', 'alliance', true);
  rel(d, 'B', 'K', 'conflict');
  d.seed = 2024;
  d.objects = [
    obj({ id: 'o1', classId: 'g-airfield', side: 'K', label: 'Аэ-К', pos: { x: 380, y: 60 } }),
    obj({ id: 'o2', classId: 'g-carrier', side: 'K', label: 'Н-β-1', pos: { x: 380, y: 60 }, route: [{ x: 250, y: 30 }, { x: 150, y: 10 }], mission: 'release', payload: [{ classId: 'g-cruise', count: 3, aim: { x: -80, y: -30 } }] }),
    obj({ id: 'o3', classId: 'g-ad-point', side: 'A', label: 'З-ι-1', pos: { x: -60, y: -20 } }),
    obj({ id: 'o4', classId: 'g-ad-upper', side: 'A', label: 'З-λ-1', pos: { x: -120, y: 40 } }),
    obj({ id: 'o5', classId: 'g-airfield', side: 'A', label: 'Аэ-А', pos: { x: -150, y: -60 } }),
    obj({ id: 'o6', classId: 'g-fighter', side: 'A', label: 'И-α-1', pos: { x: -150, y: -60 }, startS: 600, route: [{ x: 40, y: 0 }], mission: 'intercept-area', holdS: 1200 }),
    obj({ id: 'o7', classId: 'g-radar', side: 'B', label: 'Н-ρ-1', pos: { x: 20, y: 200 } }),
  ];
  d.weather.source = 'manual';
  d.weather.manual = { label: 'Ветрено (ручные условия)', temperature: 12, precipitation: 0, cloudCover: 40, windSpeed: 12, windDir: 270, phenomenon: 'none' };
  d.weather.effectPreset = 'windy';
  d.episode.durationS = 3600;
  return d;
}

function motionDemo(): ScenarioDoc {
  const d = newTestScene('Испытательная сцена: ветер и манёвр');
  d.description = 'Три условных самолёта и беспилотник летят по ломаным маршрутам при сильном игровом ветре. Взаимодействий нет.';
  d.demo = { id: 'motion', learningGoal: 'Проверить игровую кинематику: плавный разгон, ограниченную скорость поворота, набор высоты, поправку курса на снос и согласованность следа с ориентацией значка. Это проверка движка, а не модель реальных самолётов.' };
  d.seed = 7;
  d.settings.awareness = 'full';
  d.objects = [
    obj({ id: 'o1', classId: 'g-airfield', side: 'A', label: 'Аэ-1', pos: { x: -200, y: -150 } }),
    obj({ id: 'o2', classId: 'g-support', side: 'A', label: 'В-κ-1', pos: { x: -200, y: -150 }, route: [{ x: -50, y: -150 }, { x: 50, y: 0 }, { x: -100, y: 60 }], mission: 'transit' }),
    obj({ id: 'o3', classId: 'g-fighter', side: 'A', label: 'И-α-1', pos: { x: -200, y: -150 }, startS: 120, route: [{ x: 0, y: -200 }, { x: 150, y: -100 }, { x: 0, y: 0 }], mission: 'patrol', holdS: 600 }),
    obj({ id: 'o4', classId: 'g-uav', side: 'A', label: 'Д-ζ-1', pos: { x: -200, y: -150 }, route: [{ x: -150, y: -60 }], mission: 'patrol', holdS: 1800 }),
    obj({ id: 'o5', classId: 'g-recon', side: 'A', label: 'Р-ε-1', pos: { x: -200, y: -150 }, startS: 300, route: [{ x: 200, y: 100 }], mission: 'recon', holdS: 900 }),
  ];
  d.weather.source = 'manual';
  d.weather.manual = { label: 'Шторм (ручные условия)', temperature: 8, precipitation: 6, cloudCover: 100, windSpeed: 18, windDir: 250, phenomenon: 'storm' };
  d.weather.effectPreset = 'auto';
  d.episode.durationS = 2700;
  d.episode.endConditions = ['duration'];
  return d;
}

function manualDemo(): ScenarioDoc {
  const d = newTestScene('Полигон: категории ПВО и ручное управление');
  d.description = 'Пусковая Кассинии выпускает два условных баллистических объекта и один крылатый. У Аврелии универсальный пост и пост верхнего рубежа; управление ручное, нужно разрешение.';
  d.demo = { id: 'manual', learningGoal: 'Увидеть, как игровые правила совместимости распределяют категории между классами постов, и как ручной режим ставит решения в очередь действий.' };
  rel(d, 'A', 'K', 'conflict');
  d.permissionRequired.A = true;
  d.settings.control = 'manual';
  d.settings.autopause = ['decision', 'interaction'];
  d.seed = 1987;
  d.objects = [
    obj({ id: 'o1', classId: 'g-launcher', side: 'K', label: 'П-μ-1', pos: { x: 330, y: 20 }, startS: 60, mission: 'launch', payload: [{ classId: 'g-ballistic', count: 2, aim: { x: -90, y: -60 } }, { classId: 'g-cruise', count: 1, aim: { x: -40, y: 10 } }] }),
    obj({ id: 'o2', classId: 'g-ad-post', side: 'A', label: 'З-θ-1', pos: { x: -40, y: -20 } }),
    obj({ id: 'o3', classId: 'g-ad-upper', side: 'A', label: 'З-λ-1', pos: { x: -110, y: -40 } }),
  ];
  d.weather.source = 'manual';
  d.weather.manual = { label: 'Осадки (ручные условия)', temperature: 5, precipitation: 3, cloudCover: 95, windSpeed: 7, windDir: 200, phenomenon: 'rain' };
  d.episode.durationS = 1800;
  return d;
}

function gdrDemo(today: string, buildId: string | null): ScenarioDoc {
  const region = REGIONS.find((r) => r.id === 'central-europe')!;
  const frame = regionCenter(region);
  const d = newTestScene('Ветка 1990: ГДР сохраняется');
  d.world = { kind: 'historical', forkDate: '1990-10-02', policy: 'compatible', edits: [
    { id: 'e1', day: '1990-10-02', kind: 'preserve-entity', entity: 'gw:265', note: 'Допущение: объединения не происходит.' },
    { id: 'e2', day: '1990-10-02', kind: 'assumption', text: 'В этой ветке ГДР продолжает существовать; причины не моделируются.' },
  ] };
  d.region = region;
  d.frame = frame;
  d.historyBuildId = buildId;
  d.episode = { date: '1990-10-05', startTime: '09:00', durationS: 5400, endConditions: ['duration', 'all-finished'] };
  d.description = 'Точка ветвления — 02.10.1990. Пользователь «сохраняет» ГДР: исторические события, которые её прекращают, в ветке пропускаются с объяснением. Совместимые события продолжаются.';
  d.demo = { id: 'gdr', learningGoal: 'Сравнить ветку с историей: 03.10.1990 в истории ГДР исчезает, в ветке — остаётся; журнал объясняет, какие события пропущены и почему. Погода на 05.10.1990 — архив ERA5, если сеть доступна.' };
  d.participants = [
    { id: 'p1', name: 'ГДР', entityId: 'gw:265', color: SIDE_COLORS[0] },
    { id: 'p2', name: 'ФРГ', entityId: 'gw:260', color: SIDE_COLORS[3] },
  ];
  const at = (lon: number, lat: number) => lonLatToKm(frame, lon, lat);
  d.objects = [
    obj({ id: 'o1', classId: 'g-airfield', side: 'p1', label: 'Аэродром (условно у Берлина)', pos: at(13.4, 52.4) }),
    obj({ id: 'o2', classId: 'g-support', side: 'p1', label: 'В-κ-1', pos: at(13.4, 52.4), route: [at(12.4, 51.4)], mission: 'transit' }),
    obj({ id: 'o3', classId: 'g-airfield', side: 'p2', label: 'Аэродром (условно у Бонна)', pos: at(7.1, 50.8) }),
    obj({ id: 'o4', classId: 'g-support', side: 'p2', label: 'В-κ-2', pos: at(7.1, 50.8), startS: 600, route: [at(10.0, 53.5)], mission: 'transit' }),
  ];
  d.weather.source = today === d.episode.date ? 'current' : 'archive';
  d.weather.effectPreset = 'auto';
  d.seed = 19901002;
  return d;
}

function stopDemo(today: string, buildId: string | null): ScenarioDoc {
  const region = REGIONS.find((r) => r.id === 'europe')!;
  const frame = regionCenter(region);
  const d = newTestScene('Ветка 1975: история остановлена');
  d.world = { kind: 'historical', forkDate: '1975-01-01', policy: 'stop', edits: [{ id: 'e1', day: '1975-01-01', kind: 'assumption', text: 'После 01.01.1975 карта мира в ветке не меняется: исторические события не применяются.' }] };
  d.region = region;
  d.frame = frame;
  d.historyBuildId = buildId;
  d.episode = { date: '1992-06-15', startTime: '11:00', durationS: 5400, endConditions: ['duration', 'all-finished'] };
  d.description = 'Правило «остановить исторические изменения после точки ветвления»: в июне 1992 г. в ветке всё ещё существуют СССР, ГДР, Югославия и Чехословакия.';
  d.demo = { id: 'stop', learningGoal: 'Увидеть разницу между режимами продолжения истории и то, что историческая база при этом не меняется (кнопка «Сравнить с историей»).' };
  d.participants = [{ id: 'p1', name: 'Франция', entityId: 'gw:220', color: SIDE_COLORS[0] }];
  const at = (lon: number, lat: number) => lonLatToKm(frame, lon, lat);
  d.objects = [
    obj({ id: 'o1', classId: 'g-airfield', side: 'p1', label: 'Аэродром (условно у Парижа)', pos: at(2.35, 48.85) }),
    obj({ id: 'o2', classId: 'g-support', side: 'p1', label: 'В-κ-1', pos: at(2.35, 48.85), route: [at(5.4, 43.3)], mission: 'transit' }),
  ];
  d.weather.source = today === d.episode.date ? 'current' : 'archive';
  d.seed = 1975;
  return d;
}

type Legacy = Parameters<typeof migrateLegacySim>[0];

export const DEMOS: DemoInfo[] = [
  { id: 'carrier', title: 'Полигон: носитель и нагрузка', summary: 'Отделение нагрузки, совместимость классов ПВО, истребитель в зоне, ветер.', shows: ['носитель', 'крылатые объекты', 'совместимость', 'ресурсы'], make: () => carrierDemo() },
  { id: 'manual', title: 'Полигон: категории ПВО и ручное управление', summary: 'Баллистическая и крылатая категории, разрешение, очередь действий.', shows: ['баллистическая категория', 'ручное управление', 'автопауза'], make: () => manualDemo() },
  { id: 'motion', title: 'Испытательная сцена: ветер и манёвр', summary: 'Проверка игровой кинематики при сильном ветре: снос, поворот, высота, следы.', shows: ['движение', 'ветер', 'гроза'], make: () => motionDemo() },
  { id: 'gdr', title: 'Ветка 1990: ГДР сохраняется', summary: 'Ветвление истории, совместимые события и пропуски с объяснением, архивная погода.', shows: ['ветвление', 'журнал пропусков', 'архивная погода'], make: (t, b) => gdrDemo(t, b) },
  { id: 'stop', title: 'Ветка 1975: история остановлена', summary: 'Режим «остановить исторические изменения», сравнение с историей.', shows: ['ветвление', 'сравнение с историей'], make: (t, b) => stopDemo(t, b) },
  ...(legacy as Legacy[]).map((l) => ({
    id: `legacy-${String(l.id)}`,
    title: `Полигон: ${String(l.title)}`,
    summary: `${String(l.summary)} (Перенесено из прежней учебной симуляции.)`,
    shows: ['правила П-1…П-10', 'отношения сторон'],
    make: () => {
      const d = migrateLegacySim(structuredClone(l));
      d.title = `Полигон: ${String(l.title)}`;
      return d;
    },
  })),
];

export const demoById = (id: string) => DEMOS.find((d) => d.id === id);
