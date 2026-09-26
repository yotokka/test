import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AsideContext, ErrorBoundary, Loading } from './components/Common';
import { BrandMark, IconBook, IconGlobe, IconLink, IconMenu, IconRadar, IconScale, IconSliders, IconTable } from './components/Icons';
import { MISSILES } from './data/reference/missiles';
import { ROUTES, href, useRoute, type RouteName } from './lib/router';
import { loadJSON, saveJSON } from './lib/storage';

const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ReferencePage = lazy(() => import('./pages/ReferencePage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const SimulationPage = lazy(() => import('./pages/SimulationPage'));
const SourcesPage = lazy(() => import('./pages/SourcesPage'));
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'));

const NAV_ICONS: Record<RouteName, JSX.Element> = {
  history: <IconGlobe />,
  reference: <IconBook />,
  compare: <IconTable />,
  simulation: <IconRadar />,
  sources: <IconLink />,
  methodology: <IconScale />,
};

export const MAX_COMPARE = 5;
const known = new Set(MISSILES.map((m) => m.id));

export interface CompareApi {
  ids: string[];
  toggle: (id: string) => void;
  set: (ids: string[]) => void;
}

export function App() {
  const [route, navigate] = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const [asideOpen, setAsideOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    loadJSON<string[]>('atlas.compare', ['hwasong15', 'minuteman3', 'trident-d5']).filter((id) => known.has(id)),
  );

  useEffect(() => saveJSON('atlas.compare', compareIds), [compareIds]);

  // Смена раздела закрывает выдвижные панели и переводит фокус к содержимому
  useEffect(() => {
    setNavOpen(false);
    setAsideOpen(false);
    const title = ROUTES.find((r) => r.name === route.name)?.label ?? '';
    document.title = `${title} — Атлас ракет и ПВО`;
  }, [route.name]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const toggle = useCallback((id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id],
    );
  }, []);
  const compare: CompareApi = useMemo(() => ({ ids: compareIds, toggle, set: setCompareIds }), [compareIds, toggle]);
  const asideCtx = useMemo(() => ({ open: asideOpen, setOpen: setAsideOpen }), [asideOpen]);
  const current = ROUTES.find((r) => r.name === route.name)!;

  return (
    <AsideContext.Provider value={asideCtx}>
      <div className="app" data-route={route.name}>
        <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
          Перейти к содержимому
        </a>

        <header className="topbar">
          <button className="btn btn-sm btn-ghost" aria-label="Открыть меню разделов" aria-expanded={navOpen} aria-controls="sidenav" onClick={() => setNavOpen(true)}>
            <IconMenu />
          </button>
          <span className="topbar-title">{current.label}</span>
          <button className="btn btn-sm aside-toggle" aria-expanded={asideOpen} onClick={() => setAsideOpen(true)}>
            <IconSliders size={16} /> Параметры
          </button>
        </header>

        <div className="nav-scrim" data-open={navOpen} onClick={() => setNavOpen(false)} aria-hidden="true" />
        <nav id="sidenav" className="sidenav" data-open={navOpen} aria-label="Разделы атласа">
          <div className="brand">
            <BrandMark />
            <div>
              <div className="brand-title">Атлас ракет и ПВО</div>
              <div className="brand-sub">учебный справочник</div>
            </div>
          </div>
          <ul className="nav-list">
            {ROUTES.map((r) => (
              <li key={r.name}>
                <a className="nav-link" href={href(r.name)} aria-current={route.name === r.name ? 'page' : undefined}>
                  {NAV_ICONS[r.name]}
                  <span className="nav-label">{r.label}</span>
                  {r.name === 'compare' && compareIds.length > 0 && (
                    <span className="chip chip-mono" aria-label={`выбрано: ${compareIds.length}`}>{compareIds.length}</span>
                  )}
                  <span className="nav-led" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <div className="nav-foot">
            <p style={{ margin: '0 0 6px' }}>Исторические факты, справочные сведения и учебная модель хранятся раздельно.</p>
            <p style={{ margin: 0 }}>
              Клавиши в симуляции: <kbd className="mono">Пробел</kbd> — пуск/пауза, <kbd className="mono">→</kbd> — шаг,{' '}
              <kbd className="mono">R</kbd> — сброс.
            </p>
          </div>
        </nav>

        <ErrorBoundary key={route.name}>
          <Suspense fallback={<main id="main" className="main"><Loading /></main>}>
            {route.name === 'history' && <HistoryPage route={route} navigate={navigate} />}
            {route.name === 'reference' && <ReferencePage route={route} navigate={navigate} compare={compare} />}
            {route.name === 'compare' && <ComparePage compare={compare} navigate={navigate} />}
            {route.name === 'simulation' && <SimulationPage />}
            {route.name === 'sources' && <SourcesPage route={route} navigate={navigate} />}
            {route.name === 'methodology' && <MethodologyPage />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </AsideContext.Provider>
  );
}
