import type { ClassKind, MissionKind, Outcome, Phase } from '../game/types';

export const MISSION_RU: Record<MissionKind, string> = {
  transit: 'перелёт с посадкой в конечной точке',
  patrol: 'патрулирование',
  recon: 'разведка',
  release: 'отделение нагрузки',
  'intercept-area': 'перехват в зоне',
  launch: 'пуск по времени',
  none: 'нет задачи',
};

export const MISSIONS_FOR: Partial<Record<ClassKind, MissionKind[]>> = {
  fighter: ['intercept-area', 'patrol', 'transit'],
  bomber: ['release', 'patrol', 'transit'],
  recon: ['recon', 'patrol', 'transit'],
  support: ['transit', 'patrol'],
  uav: ['patrol', 'recon', 'transit'],
  launcher: ['launch'],
};

export const PHASE_RU: Record<Phase, string> = {
  pending: 'ожидает появления',
  prep: 'подготовка',
  flight: 'полёт',
  action: 'выполнение сценарного действия',
  return: 'возвращение',
  done: 'завершение',
};
export const GROUND_PHASE_RU = { pending: 'ожидает', flight: 'действует', done: 'выведен' } as Record<string, string>;

export const OUTCOME_RU: Record<Outcome, string> = {
  none: '—',
  arrived: 'достиг условной области назначения',
  completed: 'задача выполнена',
  landed: 'посадка',
  intercepted: 'условно выведен из эпизода',
  fuel: 'игровое топливо исчерпано',
  expired: 'эпизод закончился раньше',
  missed: 'снаряд не достиг цели',
};

/** Происхождение записи — четыре явно различаемых вида. */
export type Prov = 'fact' | 'user' | 'model' | 'assumption';
export const PROV_RU: Record<Prov, string> = {
  fact: 'Исторический факт',
  user: 'Действие пользователя',
  model: 'Последствие игровой модели',
  assumption: 'Допущение сценария',
};
export const PROV_SHORT: Record<Prov, string> = { fact: 'факт', user: 'пользователь', model: 'модель', assumption: 'допущение' };
