import type { HistoryEngine } from './engine';
import { TREATIES } from './treaties';
import { dayOf } from './time';
import type { EventCategory, HistEvent, Verification } from './types';

/** Человекочитаемые подписи событий. Имена берутся на дату события. */

export const CATEGORY_RU: Record<EventCategory, string> = {
  statehood: 'Государства и статус',
  border: 'Границы',
  capital: 'Столицы',
  conflict: 'Вооружённые конфликты',
  leader: 'Руководители',
  treaty: 'Договоры',
};

export const VERIFICATION_RU: Record<Verification, string> = {
  'document-verified': 'проверено по документу',
  'dataset-import': 'импортировано из документированного набора',
  'needs-check': 'требует проверки',
  conflicting: 'источники расходятся',
};

export const DATASET_RU: Record<string, string> = {
  'cshapes-gw': 'CShapes 2.0',
  'gw-states': 'список GW',
  'ucdp-acd': 'UCDP ACD',
  archigos: 'Archigos 4.1',
  'reference-agreements': 'справочник атласа',
};

const UCDP_TYPE: Record<string, string> = {
  interstate: 'межгосударственный',
  intrastate: 'внутригосударственный',
  II: 'интернационализированный внутригосударственный',
  extrasystemic: 'внесистемный',
};

export function eventTitle(e: HistEvent, H: HistoryEngine): string {
  const day = dayOf(e.date);
  // Для исчезающих субъектов берём название накануне
  const nm = (id: string) => H.entityName(id, day).ru || H.entityName(id, day - 1).ru;
  switch (e.dataset) {
    case 'cshapes-gw': {
      const appear = e.changes.filter((c) => c.kind === 'appear').map((c) => nm(c.entity!));
      const gone = e.changes.filter((c) => c.kind === 'disappear').map((c) => H.entityName(c.entity!, day - 1).ru);
      const status = e.changes.filter((c) => c.kind === 'status').map((c) => nm(c.entity!));
      const caps = e.changes.filter((c) => c.kind === 'capital').map((c) => nm(c.entity!));
      const geo = e.changes.filter((c) => c.kind === 'geometry').map((c) => nm(c.entity!));
      const parts: string[] = [];
      if (gone.length) parts.push(`прекращение: ${gone.join(', ')}`);
      if (appear.length) parts.push(`появление: ${appear.join(', ')}`);
      if (status.length) parts.push(`смена статуса: ${status.join(', ')}`);
      if (caps.length) parts.push(`столица: ${caps.join(', ')}`);
      const rest = geo.filter((g) => !status.includes(g) && !caps.includes(g));
      if (rest.length && parts.length < 3) parts.push(`границы: ${rest.slice(0, 4).join(', ')}${rest.length > 4 ? ' и др.' : ''}`);
      return `Карта — ${parts.join('; ')}`;
    }
    case 'gw-states': {
      const id = e.entities[0];
      const enter = e.changes[0].kind === 'gw-enter';
      return enter ? `Список GW: ${nm(id)} — независимое государство` : `Список GW: ${H.entityName(id, day - 1).ru} исключается`;
    }
    case 'ucdp-acd': {
      const ep = [...H.episodes.values()].find((c) => e.id.startsWith(c.id));
      const s = ep ? H.sidesOn(ep, day) : { a: e.entities, b: [] };
      const sides = [...s.a, ...s.b].map(nm).join(' — ');
      const start = e.changes[0].kind === 'conflict-start';
      return `${start ? 'Начало' : 'Окончание'} эпизода конфликта №${e.ucdp?.conflictId} (${UCDP_TYPE[e.ucdp?.type ?? ''] ?? e.ucdp?.type}): ${sides}${s.b.length === 0 ? ' — негосударственная сторона' : ''}`;
    }
    case 'archigos': {
      const l = H.leaderById.get(e.id.replace(/^arch-/, ''));
      return `Руководитель: ${l?.name ?? '?'} (${nm(e.entities[0])})`;
    }
    case 'reference-agreements': {
      const t = TREATIES.find((x) => x.id === e.treaty);
      return e.changes[0].text || t?.ru || e.id;
    }
    default:
      return e.changes.map((c) => c.text).join('; ');
  }
}
