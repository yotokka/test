import { useCallback, useEffect, useState } from 'react';

export type RouteName = 'history' | 'reference' | 'compare' | 'simulation' | 'sources' | 'methodology';

export const ROUTES: { name: RouteName; label: string }[] = [
  { name: 'history', label: 'Исторический мир' },
  { name: 'reference', label: 'Справочник' },
  { name: 'compare', label: 'Сравнение' },
  { name: 'simulation', label: 'Учебная симуляция' },
  { name: 'sources', label: 'Источники' },
  { name: 'methodology', label: 'Методология и ограничения' },
];

export interface Route {
  name: RouteName;
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const name = (ROUTES.find((r) => r.name === path)?.name ?? 'history') as RouteName;
  return { name, params: new URLSearchParams(query) };
}

export function href(name: RouteName, params?: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
  const s = q.toString();
  return `#/${name}${s ? `?${s}` : ''}`;
}

/** Минимальный хеш-маршрутизатор: работает на любом статическом хостинге без настройки сервера. */
export function useRoute(): [Route, (name: RouteName, params?: Record<string, string | undefined>, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((name: RouteName, params?: Record<string, string | undefined>, replace = false) => {
    const next = href(name, params);
    if (replace) {
      window.history.replaceState(null, '', next);
      setRoute(parse(next));
    } else {
      window.location.hash = next;
    }
  }, []);
  return [route, navigate];
}
