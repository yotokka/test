/**
 * Реестр источников исторического режима.
 * accessed — дата, когда файл был фактически получен и прочитан; published — дата публикации самого
 * материала. Страницы, которые из среды сборки открыть не удалось, помечены opened: false.
 */
export interface HistSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** Страница проекта или правообладателя, если отличается от файла загрузки. */
  homepage?: string;
  published: string | null;
  accessed: string | null;
  opened: boolean;
  version: string;
  /** Где в источнике искать подтверждение. */
  locatorHint: string;
  license: string;
  method: 'dataset-import' | 'search-index' | 'not-used';
  notes: string;
  included: boolean;
}

const ACCESSED = '2026-09-26';

export const HIST_SOURCES: HistSource[] = [
  {
    id: 'cshapes-gw',
    title: 'CShapes 2.0 — cshapes_2_gw.topojson.xz (вариант Gleditsch & Ward)',
    publisher: 'ETH Zürich / Universität Konstanz: N. B. Weidmann, G. Schvitz, L. Girardin; распространяется в R-пакете cshapes 2.0',
    url: 'https://raw.githubusercontent.com/cran/cshapes/master/inst/extdata/cshapes_2_gw.topojson.xz',
    homepage: 'https://icr.ethz.ch/data/cshapes/',
    published: '2021-06-05',
    accessed: ACCESSED,
    opened: true,
    version: '2.0 (MD5 файла e6ff39608681467328607490a8bd4bc2 совпадает с манифестом пакета)',
    locatorHint: 'Запись по полю fid; поля start/end (включительно, см. R/cshp.R), status, owner, capname, gwcode.',
    license:
      'Файл DESCRIPTION пакета: GPL (≥ 2). По сведениям страницы проекта (из среды не открывалась) данные распространяются на условиях CC BY-NC-SA 4.0. Атлас применяет более строгие условия: указание авторства, некоммерческое использование, распространение производных данных на тех же условиях.',
    method: 'dataset-import',
    notes: 'Покрытие 1886-01-01…2019-12-31 (журнал изменений, R/cshp.R). Страница проекта недоступна из среды сборки; использован файл из CRAN-пакета, опубликованного авторами.',
    included: true,
  },
  {
    id: 'cshapes-changelog',
    title: 'CShapes — журнал изменений пакета (Changelog)',
    publisher: 'Авторы пакета cshapes',
    url: 'https://raw.githubusercontent.com/cran/cshapes/master/Changelog',
    published: '2021-05-31',
    accessed: ACCESSED,
    opened: true,
    version: '2.0',
    locatorHint: 'Запись «2011-05-03 (0.2-9)» — кодирование Западной Сахары; «2021-05-31 (2.0)» — охват до 2019-12-31.',
    license: 'Часть пакета cshapes (GPL ≥ 2).',
    method: 'dataset-import',
    notes: 'Используется как документация решений кодирования набора.',
    included: true,
  },
  {
    id: 'gw-states',
    title: 'Gleditsch & Ward — список независимых государств (gwstates)',
    publisher: 'K. S. Gleditsch, M. D. Ward; распространяется в R-пакете states (A. Beger)',
    url: 'https://raw.githubusercontent.com/cran/states/master/data/gwstates.rda',
    homepage: 'http://ksgleditsch.com/data-4.html',
    published: '2025-08-25',
    accessed: ACCESSED,
    opened: true,
    version: 'R-пакет states 0.3.3',
    locatorHint: 'Строка по gwcode; поля start/end (дата 9999-12-31 означает «продолжается»), microstate.',
    license: 'Пакет states — MIT (файл LICENSE). Условия исходного списка на сайте авторов не проверены (сайт недоступен); при использовании требуется ссылка на Gleditsch & Ward (1999).',
    method: 'dataset-import',
    notes: 'Дата публикации пакета используется как последняя дата подтверждения открытых периодов; дата актуализации самих данных в пакете не указана.',
    included: true,
  },
  {
    id: 'ucdp-acd',
    title: 'UCDP Armed Conflict Dataset — подмножество ucdp_acd',
    publisher: 'Uppsala Conflict Data Program; подмножество в R-пакете peacesciencer 1.2.0 (S. Miller)',
    url: 'https://raw.githubusercontent.com/cran/peacesciencer/master/data/ucdp_acd.rda',
    homepage: 'https://ucdp.uu.se/downloads/',
    published: '2025-07-17',
    accessed: ACCESSED,
    opened: true,
    version: '25.1 по описанию набора (man/ucdp_acd.Rd); таблица версий пакета указывает 20.1; фактический охват — до 2024 г.',
    locatorHint: 'Строка по conflict_id и year; поля start_date2/start_prec2 (эпизод), ep_end/ep_end_date.',
    license: 'Условия UCDP на сайте программы не проверены (сайт недоступен). Пакет-посредник — GPL-2.',
    method: 'dataset-import',
    notes: 'Единица наблюдения — конфликт-год. Названия негосударственных сторон в подмножестве отсутствуют. Коды точности дат показаны без расшифровки.',
    included: true,
  },
  {
    id: 'archigos',
    title: 'Archigos 4.1 — политические руководители (подмножество)',
    publisher: 'H. E. Goemans, K. S. Gleditsch, G. Chiozza; подмножество в R-пакете peacesciencer 1.2.0',
    url: 'https://raw.githubusercontent.com/cran/peacesciencer/master/data/archigos.rda',
    published: '2025-07-17',
    accessed: ACCESSED,
    opened: true,
    version: '4.1',
    locatorHint: 'Строка по obsid; поля startdate/enddate, entry/exit.',
    license: 'Условия правообладателя не проверены. Пакет-посредник — GPL-2. Имена с диакритикой в подмножестве упрощены (см. man/archigos.Rd).',
    method: 'dataset-import',
    notes: 'Охват — до 2015-12-31.',
    included: true,
  },
  {
    id: 'natural-earth-land',
    title: 'Natural Earth 1:110m land (land-110m.json)',
    publisher: 'Natural Earth; переупаковка в npm-пакете world-atlas 2.0.2 (M. Bostock)',
    url: 'https://www.npmjs.com/package/world-atlas/v/2.0.2',
    homepage: 'https://www.naturalearthdata.com/about/',
    published: '2019-09-05',
    accessed: ACCESSED,
    opened: true,
    version: 'Natural Earth 4.1.0 (по README world-atlas)',
    locatorHint: 'Объект land в land-110m.json.',
    license: 'Natural Earth заявляет public domain (страница из среды не открывалась); world-atlas — ISC.',
    method: 'dataset-import',
    notes: 'Только физическая подложка суши, без политических границ и подписей.',
    included: true,
  },
  {
    id: 'reference-agreements',
    title: 'Соглашения из справочника атласа',
    publisher: 'Справочный раздел атласа (данные сверены только по поисковой выдаче)',
    url: '#/sources',
    published: null,
    accessed: ACCESSED,
    opened: false,
    version: 'Демонстрационный набор справочника',
    locatorHint: 'Ссылки на первоисточники указаны у каждой даты договора.',
    license: 'См. условия каждого первоисточника.',
    method: 'search-index',
    notes: 'Статус «требует проверки»: такие записи не меняют основное историческое состояние, пока не включён показ непроверенного.',
    included: true,
  },
  {
    id: 'atop',
    title: 'ATOP — Alliance Treaty Obligations and Provisions',
    publisher: 'B. A. Leeds и соавт.',
    url: 'https://www.atopdata.org/data.html',
    published: null,
    accessed: null,
    opened: false,
    version: 'Подмножество 5.1 доступно в peacesciencer (atop_alliance, диада-год, 1815–2018)',
    locatorHint: '—',
    license: 'Не проверены: сайт ATOP недоступен из среды сборки.',
    method: 'not-used',
    notes: 'Не включён: условия распространения не удалось проверить, а подмножество не содержит названий и дат договоров (только годовые признаки обязательств).',
    included: false,
  },
  {
    id: 'cow-alliances',
    title: 'Correlates of War: Formal Alliances v4.1',
    publisher: 'Correlates of War Project',
    url: 'https://correlatesofwar.org/data-sets/formal-alliances/',
    published: null,
    accessed: null,
    opened: false,
    version: '4.1 (охват до 2012 г.)',
    locatorHint: '—',
    license: 'Не проверены; по требованиям заказчика исходные файлы не включаются в репозиторий без разрешения.',
    method: 'not-used',
    notes: 'Не использован.',
    included: false,
  },
  {
    id: 'untc',
    title: 'United Nations Treaty Collection',
    publisher: 'United Nations',
    url: 'https://treaties.un.org/',
    published: null,
    accessed: null,
    opened: false,
    version: '—',
    locatorHint: '—',
    license: '—',
    method: 'not-used',
    notes: 'Сайт недоступен из среды сборки. Договоры, требующие сверки по UNTC, остаются в статусе «требует проверки».',
    included: false,
  },
];

export const histSource = (id: string) => {
  const s = HIST_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Неизвестный источник: ${id}`);
  return s;
};
