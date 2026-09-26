import { useMemo, useState } from 'react';
import { CATEGORY_RU, eventTitle } from '../../history/describe';
import type { HistoryEngine } from '../../history/engine';
import { dayOf, fmtDay, fmtWithPrecision, isoOf } from '../../history/time';
import type { EventCategory, HistEvent } from '../../history/types';
import type { JournalEntry } from './usePlayback';
import { VerificationBadge } from './Cards';

export interface EventFilter {
  categories: Set<EventCategory>;
  keyOnly: boolean;
  showUnverified: boolean;
}

export const ALL_CATEGORIES: EventCategory[] = ['statehood', 'border', 'capital', 'conflict', 'leader', 'treaty'];

export function passes(f: EventFilter, e: HistEvent) {
  if (!f.categories.has(e.category)) return false;
  if (f.keyOnly && !e.key) return false;
  if (!f.showUnverified && e.verification === 'needs-check') return false;
  return true;
}

export function Timeline({
  engine,
  day,
  filter,
  setFilter,
  onSeek,
  onEvent,
  selectedEvent,
  journal,
  journalTotal,
  clearJournal,
}: {
  engine: HistoryEngine;
  day: number;
  filter: EventFilter;
  setFilter: (f: EventFilter) => void;
  onSeek: (day: number) => void;
  onEvent: (e: HistEvent) => void;
  selectedEvent: string | null;
  journal: JournalEntry[];
  journalTotal: number;
  clearJournal: () => void;
}) {
  const [tab, setTab] = useState<'near' | 'journal'>('near');
  const span = engine.end - engine.start;
  const pct = (d: number) => ((d - engine.start) / span) * 1000;
  const filtered = useMemo(() => engine.events.filter((e) => passes(filter, e)), [engine, filter]);
  const ticks = useMemo(() => filtered.map((e) => ({ x: pct(dayOf(e.date)), cat: e.category, key: e.key })), [filtered]); // eslint-disable-line react-hooks/exhaustive-deps
  const years: number[] = [];
  for (let y = 1970; y <= new Date(engine.end * 86_400_000).getUTCFullYear(); y += 5) years.push(y);
  const cov = engine.coverage().filter((r) => r.included);

  const near = useMemo(() => {
    const idx = filtered.findIndex((e) => dayOf(e.date) > day);
    const cut = idx === -1 ? filtered.length : idx;
    return { before: filtered.slice(Math.max(0, cut - 6), cut).reverse(), after: filtered.slice(cut, cut + 6) };
  }, [filtered, day]);

  const toggleCat = (c: EventCategory) => {
    const next = new Set(filter.categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setFilter({ ...filter, categories: next });
  };

  const row = (e: HistEvent, where: string) => {
    const when = fmtWithPrecision(e.date, e.precision);
    return (
      <li key={`${where}${e.id}`} className="tl-item" data-selected={selectedEvent === e.id} data-cat={e.category}>
        <span className="log-tick" title={when.note}>
          {when.text}
        </span>
        <div>
          <button className="link-btn" onClick={() => onEvent(e)}>
            {eventTitle(e, engine)}
          </button>
          <div className="tl-meta">
            <span className="stage">{CATEGORY_RU[e.category]}</span>
            {e.verification !== 'dataset-import' && <VerificationBadge v={e.verification} />}
            {e.key && <span className="xs muted">ключевое</span>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="panel htl" aria-label="Временная шкала и события">
      <div className="htl-track">
        <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="htl-svg" aria-hidden="true">
          {years.map((y) => (
            <line key={y} x1={pct(dayOf(`${y}-01-01`))} x2={pct(dayOf(`${y}-01-01`))} y1={0} y2={64} stroke="rgba(167,178,191,0.15)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {cov.map((r, i) => (
            <g key={r.id}>
              <rect x={0} y={4 + i * 7} width={1000} height={4} fill="url(#tl-gap)" />
              <rect x={pct(r.from ?? engine.start)} y={4 + i * 7} width={pct((r.to ?? engine.end) + 1) - pct(r.from ?? engine.start)} height={4} fill={['#83B8AE', '#AAA0C8', '#D58D86', '#D5AD75'][i % 4]} fillOpacity={0.55} />
            </g>
          ))}
          <defs>
            <pattern id="tl-gap" width="6" height="4" patternUnits="userSpaceOnUse">
              <rect width="6" height="4" fill="#1C2330" />
              <line x1="0" y1="4" x2="4" y2="0" stroke="#A7B2BF" strokeOpacity="0.35" />
            </pattern>
          </defs>
          {ticks.map((t, i) => (
            <line key={i} x1={t.x} x2={t.x} y1={36} y2={t.key ? 60 : 52} stroke={t.cat === 'conflict' ? '#D58D86' : t.cat === 'leader' ? '#AAA0C8' : t.cat === 'treaty' ? '#D5AD75' : '#83B8AE'} strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={pct(day)} x2={pct(day)} y1={0} y2={64} stroke="#D5AD75" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <label className="visually-hidden" htmlFor="htl-range">
          Историческая дата на шкале
        </label>
        <input
          id="htl-range"
          className="htl-range"
          type="range"
          min={engine.start}
          max={engine.end}
          value={day}
          aria-valuetext={fmtDay(day)}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>
      <div className="htl-years" aria-hidden="true">
        {years.map((y) => (
          <span key={y} style={{ left: `${pct(dayOf(`${y}-01-01`)) / 10}%` }}>
            {y}
          </span>
        ))}
      </div>
      <div className="htl-cov xs" aria-label="Покрытие наборов на шкале">
        {cov.map((r, i) => (
          <span key={r.id}>
            <i style={{ background: ['#83B8AE', '#AAA0C8', '#D58D86', '#D5AD75'][i % 4] }} aria-hidden="true" /> {r.label}: {r.from !== null ? isoOf(r.from) : '—'} … {r.to !== null ? isoOf(r.to) : '—'}
          </span>
        ))}
        <span>
          <i className="htl-gapkey" aria-hidden="true" /> штриховка — нет данных
        </span>
      </div>

      <div className="filter-row" role="group" aria-label="Фильтры событий" style={{ marginTop: 12 }}>
        {ALL_CATEGORIES.map((c) => (
          <button key={c} className="btn btn-sm" aria-pressed={filter.categories.has(c)} onClick={() => toggleCat(c)}>
            {CATEGORY_RU[c]}
          </button>
        ))}
        <label className="check small" style={{ marginLeft: 6 }}>
          <input type="checkbox" checked={filter.keyOnly} onChange={(e) => setFilter({ ...filter, keyOnly: e.target.checked })} />
          Только ключевые
        </label>
      </div>

      <div className="tabs" role="tablist" aria-label="Список событий" style={{ marginBottom: 10 }}>
        <button role="tab" className="tab" aria-selected={tab === 'near'} onClick={() => setTab('near')}>
          Рядом с датой
        </button>
        <button role="tab" className="tab" aria-selected={tab === 'journal'} onClick={() => setTab('journal')}>
          Журнал сеанса{journalTotal ? ` · ${journalTotal}` : ''}
        </button>
      </div>
      {tab === 'near' ? (
        <div className="htl-lists">
          <div>
            <div className="section-label" style={{ marginTop: 0 }}>
              До {fmtDay(day)} включительно
            </div>
            {near.before.length ? <ol className="tl-list">{near.before.map((e) => row(e, 'b'))}</ol> : <p className="small muted">Нет событий по фильтру.</p>}
          </div>
          <div>
            <div className="section-label" style={{ marginTop: 0 }}>
              Далее
            </div>
            {near.after.length ? <ol className="tl-list">{near.after.map((e) => row(e, 'a'))}</ol> : <p className="small muted">Нет событий по фильтру до конца шкалы.</p>}
          </div>
        </div>
      ) : (
        <div>
          <p className="xs muted" style={{ marginTop: 0 }}>
            Все события, пройденные при воспроизведении и переходах, включая промежуточные при больших скачках. «↺» — событие
            отменено перемоткой назад.{' '}
            {journalTotal > journal.length && `Показаны последние ${journal.length} из ${journalTotal}.`}{' '}
            {journal.length > 0 && (
              <button className="link-btn" onClick={clearJournal}>
                Очистить журнал
              </button>
            )}
          </p>
          {journal.length === 0 ? (
            <p className="small muted">Журнал пуст: запустите время или перейдите к другой дате.</p>
          ) : (
            <ol className="tl-list">
              {journal
                .filter((j) => passes(filter, j.event))
                .slice(0, 150)
                .map((j) => (
                  <li key={j.seq} className="tl-item" data-cat={j.event.category}>
                    <span className="log-tick">
                      {j.dir === 1 ? '→' : '↺'} {fmtWithPrecision(j.event.date, j.event.precision).text}
                    </span>
                    <button className="link-btn" onClick={() => onEvent(j.event)}>
                      {eventTitle(j.event, engine)}
                    </button>
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
