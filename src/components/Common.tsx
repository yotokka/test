import { Component, createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { DATASET, getSource } from '../data/reference/sources';
import type { FigureKind, RangeFigure } from '../data/reference/types';
import { formatDateShort, formatPartialDate } from '../lib/format';
import { IconClose, IconExternal, IconInfo, IconWarn, KindShape } from './Icons';

/* ———————— Раскладка: центр + правая панель ———————— */

interface AsideCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}
export const AsideContext = createContext<AsideCtx>({ open: false, setOpen: () => {} });
export const useAside = () => useContext(AsideContext);

export function Workspace({ main, aside, asideTitle }: { main: ReactNode; aside: ReactNode; asideTitle: string }) {
  const { open, setOpen } = useAside();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    // На узких экранах переводим фокус в открывшуюся панель
    if (window.matchMedia('(max-width: 1279px)').matches) closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  return (
    <>
      <main id="main" className="main" tabIndex={-1}>
        {main}
      </main>
      <div className="scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="inspector" data-open={open} aria-label={asideTitle}>
        <div className="inspector-head">
          <h2 className="inspector-title">{asideTitle}</h2>
          <button ref={closeRef} className="btn btn-sm btn-ghost inspector-close" onClick={() => setOpen(false)}>
            <IconClose size={16} /> Закрыть
          </button>
        </div>
        {aside}
      </aside>
    </>
  );
}

/* ———————— Статус характеристики ———————— */

const KIND_LABEL: Record<FigureKind, string> = {
  claim: 'Заявление',
  test: 'Результат испытаний',
  estimate: 'Оценка',
};

export function KindBadge({ kind }: { kind: FigureKind | 'none' }) {
  if (kind === 'none')
    return (
      <span className="kind kind-none">
        <KindShape kind="none" /> Нет надёжных данных
      </span>
    );
  return (
    <span className={`kind kind-${kind}`}>
      <KindShape kind={kind} /> {KIND_LABEL[kind]}
    </span>
  );
}

export const kindLabel = (k: FigureKind) => KIND_LABEL[k];

/* ———————— Ссылка на источник ———————— */

export function SourceLink({ id, compact = false }: { id: string; compact?: boolean }) {
  const s = getSource(id);
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={compact ? 'small' : undefined}>
      {s.title}
      <span className="visually-hidden"> (откроется в новой вкладке)</span>{' '}
      <IconExternal size={12} style={{ verticalAlign: '-1px' }} />
    </a>
  );
}

const ROLE_LABEL = {
  primary: 'первичный (автор числа)',
  secondary: 'вторичный (пересказ)',
  tertiary: 'третичный (энциклопедия)',
};

export function checkLabel(method: 'direct' | 'search-index'): string {
  return method === 'direct' ? 'сверено с первоисточником' : 'по поисковой выдаче';
}

/** Полный блок одного числового параметра: значение, статус, источник, даты, оговорки. */
export function FigureBlock({ f }: { f: RangeFigure }) {
  const s = getSource(f.sourceId);
  return (
    <div className="figure">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <KindBadge kind={f.kind} />
      </div>
      <div className="figure-value">{f.text}</div>
      <div className="small">{f.context}</div>
      <dl className="figure-meta">
        <dt>Источник</dt>
        <dd>
          <SourceLink id={f.sourceId} compact /> <span className="muted">· {s.publisher}</span>
        </dd>
        <dt>Роль источника</dt>
        <dd>{ROLE_LABEL[f.sourceRole]}</dd>
        <dt>Опубликовано</dt>
        <dd>{formatPartialDate(s.published)}</dd>
        <dt>Проверено</dt>
        <dd>
          <span className="mono">{formatDateShort(f.check.date)}</span> · {checkLabel(f.check.method)}
        </dd>
      </dl>
      {f.check.note && <div className="figure-note">{f.check.note}</div>}
      {f.check.corroboratedBy && (
        <div className="figure-note">
          Пересказ, по которому сверялась формулировка: <SourceLink id={f.check.corroboratedBy} compact />
        </div>
      )}
    </div>
  );
}

/* ———————— Состояния ———————— */

export function DatasetNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="notice" role="note">
      <IconWarn size={18} style={{ color: 'var(--amber)' }} />
      <div>
        <strong>{DATASET.label}.</strong> {compact ? 'Значения не сверены с первоисточниками напрямую.' : DATASET.summary}
        {!compact && (
          <>
            {' '}
            Дата сборки: <span className="mono">{formatDateShort(DATASET.builtAt)}</span>. Дата проверки означает, когда
            значение сверялось, а не когда вышла публикация.
          </>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <IconInfo size={22} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Loading({ label = 'Загрузка раздела…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="led led-on" /> {label}
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main id="main" className="main">
          <div className="notice notice-coral" role="alert">
            <IconWarn size={18} style={{ color: 'var(--coral)' }} />
            <div>
              <p>
                <strong>Раздел не удалось показать.</strong> Остальные разделы атласа продолжают работать.
              </p>
              <p className="small muted">Техническая причина: {this.state.error.message}</p>
              <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
                Попробовать снова
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
