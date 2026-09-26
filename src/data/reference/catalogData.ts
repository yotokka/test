import type { CatalogFamily } from './catalog';

/**
 * Дополнительные семейства каталога по категориям, которых нет в справочнике ракет.
 * Каждая запись — только из источников реестра sources.ts; незаполненное — явно пустое.
 */
export const CATALOG_FAMILIES_EXTRA: CatalogFamily[] = [];
