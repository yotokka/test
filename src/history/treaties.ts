import { SOURCES } from '../data/reference/sources';
import type { Treaty } from './types';

/**
 * Договоры и организации для исторической шкалы. Даты взяты из справочного раздела, где они сверены
 * только по поисковой выдаче, поэтому у всех записей статус «требует проверки».
 * Подписание, вступление в силу и прекращение хранятся отдельными датами.
 */
const src = (id: string) => {
  const s = SOURCES.find((x) => x.id === id)!;
  return { sourceUrl: s.url, sourceTitle: `${s.title} — ${s.publisher}` };
};

export const TREATIES: Treaty[] = [
  {
    id: 'nato',
    ru: 'Североатлантический договор (НАТО)',
    kind: 'alliance',
    parties: 'Многосторонний; состав участников по датам в этой сборке не импортирован',
    partyEntities: [],
    events: [
      { date: '1949-04-04', precision: 'day', status: 'signed', label: 'подписан', ...src('nato-treaty') },
      { date: '1949-08-24', precision: 'day', status: 'in-force', label: 'вступил в силу', ...src('nato-treaty') },
    ],
    verification: 'needs-check',
    note: 'Членство конкретных государств по датам не импортировано: нет проверенного источника в этой сборке.',
  },
  {
    id: 'warsaw',
    ru: 'Варшавский договор (ОВД)',
    kind: 'alliance',
    parties: 'СССР и государства Восточной Европы; состав по датам не импортирован',
    partyEntities: ['gw:365'],
    events: [
      { date: '1955-05-14', precision: 'day', status: 'signed-eif-unknown', label: 'подписан', ...src('enrs-warsaw') },
      { date: '1991-02-25', precision: 'day', status: 'partially-ended', label: 'соглашение о прекращении военного сотрудничества', ...src('enrs-warsaw') },
      { date: '1991-07-01', precision: 'day', status: 'terminated', label: 'роспуск политических структур', ...src('enrs-warsaw') },
    ],
    verification: 'needs-check',
    note: 'Дата вступления в силу в справочнике не указана, поэтому после подписания статус показан как «подписан; дата вступления в силу не установлена».',
  },
  {
    id: 'abm',
    ru: 'Договор по ПРО',
    kind: 'treaty',
    parties: 'США и СССР (затем Россия)',
    partyEntities: ['gw:2', 'gw:365'],
    events: [
      { date: '1972-05-26', precision: 'day', status: 'signed', label: 'подписан', ...src('aca-abm') },
      { date: '1972-10-03', precision: 'day', status: 'in-force', label: 'вступил в силу', ...src('aca-abm') },
      { date: '2002-06-13', precision: 'day', status: 'terminated', label: 'выход США вступил в силу', ...src('aca-abm') },
    ],
    verification: 'needs-check',
    note: '',
  },
  {
    id: 'inf',
    ru: 'Договор о РСМД',
    kind: 'treaty',
    parties: 'США и СССР (затем Россия)',
    partyEntities: ['gw:2', 'gw:365'],
    events: [
      { date: '1987-12-08', precision: 'day', status: 'signed', label: 'подписан', ...src('state-inf') },
      { date: '1988-06-01', precision: 'day', status: 'in-force', label: 'вступил в силу', ...src('state-inf') },
      { date: '2019-08-02', precision: 'day', status: 'terminated', label: 'выход США вступил в силу', ...src('state-inf-withdrawal') },
    ],
    verification: 'needs-check',
    note: '',
  },
  {
    id: 'mtcr',
    ru: 'Режим контроля за ракетной технологией (РКРТ)',
    kind: 'regime',
    parties: 'Неформальное объединение; учреждён семью государствами',
    partyEntities: [],
    events: [{ date: '1987-04-01', precision: 'month', status: 'established', label: 'учреждён', ...src('state-mtcr-faq') }],
    verification: 'needs-check',
    note: 'Известен только месяц; техническая привязка к 1-му числу не означает дату учреждения.',
  },
  {
    id: 'newstart',
    ru: 'Договор СНВ-III (New START)',
    kind: 'treaty',
    parties: 'США и Россия',
    partyEntities: ['gw:2', 'gw:365'],
    events: [
      { date: '2010-04-08', precision: 'day', status: 'signed', label: 'подписан', ...src('state-newstart') },
      { date: '2011-02-05', precision: 'day', status: 'in-force', label: 'вступил в силу', ...src('state-newstart') },
      { date: '2026-02-01', precision: 'month', status: 'expired', label: 'окончание продлённого срока (источники расходятся: 4 или 5 февраля)', ...src('state-newstart') },
    ],
    verification: 'needs-check',
    note: 'Дата окончания известна с точностью до месяца: формулировки источников расходятся. Статус после этой даты не проверялся.',
  },
  {
    id: 'japan-us',
    ru: 'Японо-американский договор о взаимном сотрудничестве и безопасности',
    kind: 'alliance',
    parties: 'Япония и США',
    partyEntities: ['gw:740', 'gw:2'],
    events: [
      { date: '1960-01-19', precision: 'day', status: 'signed', label: 'подписан', ...src('mofa-japan-us') },
      { date: '1960-06-23', precision: 'day', status: 'in-force', label: 'вступил в силу', ...src('mofa-japan-us') },
    ],
    verification: 'needs-check',
    note: '',
  },
  {
    id: 'csto',
    ru: 'Договор о коллективной безопасности / ОДКБ',
    kind: 'alliance',
    parties: 'Ряд государств СНГ; состав по датам не импортирован',
    partyEntities: ['gw:365'],
    events: [
      { date: '1992-05-15', precision: 'day', status: 'signed', label: 'договор подписан', ...src('csto-history') },
      { date: '1994-04-20', precision: 'day', status: 'in-force', label: 'договор вступил в силу', ...src('csto-history') },
    ],
    verification: 'needs-check',
    note: 'Устав Организации утверждён 2002-10-07 (по справочнику); это отдельный документ, на статус договора 1992 г. он не влияет.',
  },
];

export const TREATY_STATUS_RU: Record<string, string> = {
  none: 'ещё не подписан',
  signed: 'подписан, не вступил в силу',
  'signed-eif-unknown': 'подписан; дата вступления в силу не установлена',
  'in-force': 'действует',
  established: 'учреждён',
  'partially-ended': 'военное сотрудничество прекращено',
  terminated: 'прекращён',
  expired: 'срок действия истёк',
};
