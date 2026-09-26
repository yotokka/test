import type { EventKind } from '../game/types';
import type { ScenarioSettings } from './types';

/**
 * Описание каждой настройки: на что влияет, в каких единицах, можно ли менять во время запуска,
 * сохраняется ли в сценарии и является ли игровым допущением. Интерфейс показывает эти сведения рядом
 * с полем, тест проверяет, что описание есть у каждой настройки.
 */

export interface SettingMeta {
  id: string;
  label: string;
  group: 'basic' | 'advanced';
  affects: string;
  unit: string;
  live: boolean;
  saved: boolean;
  assumption: boolean;
  /** Влияет ли на результат расчёта (качество отображения и скорость показа — нет) */
  affectsOutcome: boolean;
}

export const SETTINGS_META: SettingMeta[] = [
  { id: 'date', label: 'Дата и регион', group: 'basic', affects: 'Какой исторический мир показан, где действуют объекты и за какую дату запрашивается погода.', unit: 'дата ГГГГ-ММ-ДД, время UTC ЧЧ:ММ; область — градусы', live: false, saved: true, assumption: false, affectsOutcome: true },
  { id: 'participants', label: 'Участники', group: 'basic', affects: 'Стороны эпизода и их игровые отношения: союз, нейтралитет, конфликт, совместная оборона, требование разрешения.', unit: 'список сторон', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'availability', label: 'Исторический режим доступности объектов', group: 'basic', affects: 'Можно ли подписать игровой объект исторической модификацией, если эксплуатация этой стороной на дату не подтверждена источником.', unit: 'строгий / с предупреждением / свободный', live: false, saved: true, assumption: false, affectsOutcome: false },
  { id: 'policy', label: 'Правила продолжения исторических событий', group: 'basic', affects: 'Применять ли исторические события после точки ветвления и при каких условиях.', unit: 'остановить / продолжать совместимые', live: false, saved: true, assumption: true, affectsOutcome: false },
  { id: 'weather', label: 'Погода', group: 'basic', affects: 'Источник погодного контекста и игровой пресет эффектов: обнаружение, классификация, болтанка, снос ветром.', unit: 'архив / текущая / ручные условия; ветер м/с, осадки мм/ч', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'playbackSpeed', label: 'Скорость воспроизведения', group: 'basic', affects: 'Только темп показа: сколько игровых секунд проходит за секунду. На расчёт не влияет.', unit: '× (игровых секунд за секунду), от 0,25 до 60', live: true, saved: true, assumption: false, affectsOutcome: false },
  { id: 'duration', label: 'Продолжительность эпизода', group: 'basic', affects: 'Предел игрового времени эпизода.', unit: 'минуты', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'endConditions', label: 'Условия завершения', group: 'basic', affects: 'Когда эпизод останавливается: по времени, когда все объекты завершили действия, или при первом итоге.', unit: 'набор условий', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'seed', label: 'Начальное значение генератора случайности', group: 'advanced', affects: 'Последовательность жребиев. Одинаковое зерно при прочих равных даёт одинаковый журнал.', unit: 'целое число 0…4 294 967 295', live: false, saved: true, assumption: false, affectsOutcome: true },
  { id: 'awareness', label: 'Полная видимость или ограниченная осведомлённость', group: 'advanced', affects: 'Знают ли стороны обо всех объектах сразу или только об обнаруженных своими датчиками.', unit: 'полная / ограниченная', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'control', label: 'Автоматическое или ручное управление', group: 'advanced', affects: 'Ждёт ли решение «взаимодействие допустимо» подтверждения пользователя в очереди действий (П-14).', unit: 'авто / ручное', live: false, saved: true, assumption: false, affectsOutcome: true },
  { id: 'randomness', label: 'Уровень случайности', group: 'advanced', affects: 'Как вероятность сравнивается с жребием: обычная, пониженная (ближе к 0 или 1) или без случайности (порог 0,5).', unit: 'обычная / пониженная / нет', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'motionPreset', label: 'Учебный пресет движения', group: 'advanced', affects: 'Множитель к скорости поворота и ускорению всех классов.', unit: 'стандарт ×1 / плавный ×0,7 / резкий ×1,3', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'interactionPreset', label: 'Учебный пресет взаимодействий', group: 'advanced', affects: 'Время дополнительной проверки, задержка и вероятность разрешения.', unit: 'секунды, вероятность', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'resources', label: 'Ограничения игровых ресурсов', group: 'advanced', affects: 'Множитель к запасам постов и истребителей по умолчанию.', unit: 'у.е.: ×0,5 / ×1 / ×1,5', live: false, saved: true, assumption: true, affectsOutcome: true },
  { id: 'autopause', label: 'Автопаузы', group: 'advanced', affects: 'На каких типах событий воспроизведение само ставится на паузу.', unit: 'типы событий', live: true, saved: true, assumption: false, affectsOutcome: false },
  { id: 'logDetail', label: 'Подробность журнала', group: 'advanced', affects: 'Сколько записей показывать. Модель записывает всё; фильтр действует только на показ.', unit: '1 — главное, 2 — обычная, 3 — всё', live: true, saved: true, assumption: false, affectsOutcome: false },
  { id: 'checkpointEveryS', label: 'Частота сохранения состояния', group: 'advanced', affects: 'Как часто сохраняются контрольные снимки для быстрой перемотки. На результат не влияет.', unit: 'секунды игрового времени', live: false, saved: true, assumption: false, affectsOutcome: false },
  { id: 'quality', label: 'Качество отображения', group: 'advanced', affects: 'Плотность частиц погоды, длина следов, сглаживание. На исход не влияет и в расчёт не передаётся.', unit: 'низкое / среднее / высокое', live: true, saved: true, assumption: false, affectsOutcome: false },
];

export const DEFAULT_SETTINGS: ScenarioSettings = {
  availability: 'warn',
  playbackSpeed: 10,
  awareness: 'limited',
  control: 'auto',
  randomness: 'normal',
  motionPreset: 'standard',
  interactionPreset: 'standard',
  resources: 'standard',
  autopause: ['interaction', 'separation'],
  logDetail: 2,
  checkpointEveryS: 30,
  quality: 'medium',
};

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 30, 60];

export const EVENT_KIND_RU: Record<EventKind, string> = {
  spawn: 'Появление',
  phase: 'Смена фазы',
  detect: 'Обнаружение',
  classify: 'Классификация',
  decision: 'Решение',
  permission: 'Разрешение',
  launch: 'Пуск',
  separation: 'Отделение нагрузки',
  interaction: 'Взаимодействие',
  outcome: 'Итог',
  resource: 'Ресурс',
  command: 'Команда',
  weather: 'Погода',
  system: 'Система',
};
