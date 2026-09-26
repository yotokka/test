import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, Loading, Workspace, useAside } from '../components/Common';
import { IconInfo, IconPause, IconPlay, IconSearch, IconWarn } from '../components/Icons';
import { EntityCard, EventCard } from '../components/history/Cards';
import { HistoryMap, type Layers } from '../components/history/HistoryMap';
import { ALL_CATEGORIES, Timeline, passes, type EventFilter } from '../components/history/Timeline';
import { usePlayback } from '../components/history/usePlayback';
import { WhyDialog } from '../components/history/WhyDialog';
import type { HistoryEngine } from '../history/engine';
import { loadHistory } from '../history/load';
import { ruName } from '../history/names-ru';
import { SPEEDS, addCalendar, dayOf, fmtDay, isValidIso, isoOf } from '../history/time';
import type { HistEvent } from '../history/types';
import type { Route, RouteName } from '../lib/router';
import { loadJSON, saveJSON } from '../lib/storage';

type Nav = (name: RouteName, params?: Record<string, string | undefined>, replace?: boolean) => void;

export default function HistoryPage({ route, navigate }: { route: Route; navigate: Nav }) {
  const [engine, setEngine] = useState<HistoryEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadHistory()
      .then((e) => alive && setEngine(e))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error)
    return (
      <main id="main" className="main">
        <div className="notice notice-coral" role="alert">
          <IconWarn size={18} style={{ color: 'var(--coral)' }} />
          <div>
            <p>
              <strong>Историческую базу не удалось загрузить.</strong> Остальные разделы атласа работают.
            </p>
            <p className="small muted">Причина: {error}</p>
            <button className="btn btn-sm" onClick={() => setAttempt((a) => a + 1)}>
              Повторить загрузку
            </button>
          </div>
        </div>
      </main>
    );
  if (!engine)
    return (
      <main id="main" className="main">
        <Loading label="Загрузка исторической карты и событий…" />
      </main>
    );
  return <HistoryWorld engine={engine} route={route} navigate={navigate} />;
}

const DEFAULT_LAYERS: Layers = {
  states: true,
  dependencies: true,
  disputed: true,
  capitals: false,
  labels: true,
  land: true,
  graticule: true,
  conflicts: false,
  unverified: false,
};

const PRESETS: { label: string; date: string }[] = [
  { label: 'Объединение Германии', date: '1990-10-03' },
  { label: 'Объединение Йемена', date: '1990-05-22' },
  { label: 'Распад СССР (CShapes)', date: '1991-12-26' },
  { label: 'Распад Чехословакии', date: '1993-01-01' },
  { label: 'Независимость Южного Судана', date: '2011-07-09' },
];

interface Bookmark {
  label: string;
  date: string;
}

function HistoryWorld({ engine, route, navigate }: { engine: HistoryEngine; route: Route; navigate: Nav }) {
  const { setOpen } = useAside();
  const initialDay = useMemo(() => {
    const d = route.params.get('d');
    return d && isValidIso(d) ? Math.max(engine.start, Math.min(engine.end, dayOf(d))) : dayOf('1990-10-03');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [selection, setSelection] = useState<{ kind: 'entity' | 'event'; id: string } | null>(() => {
    const s = route.params.get('sel');
    if (!s) return { kind: 'entity', id: 'gw:260' };
    return s.startsWith('ev:') ? { kind: 'event', id: s.slice(3) } : { kind: 'entity', id: s };
  });
  const [layers, setLayers] = useState<Layers>(() => ({ ...DEFAULT_LAYERS, ...loadJSON<Partial<Layers>>('atlas.history.layers', {}) }));
  const [filter, setFilter] = useState<EventFilter>({ categories: new Set(ALL_CATEGORIES.filter((c) => c !== 'leader')), keyOnly: true, showUnverified: false });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadJSON<Bookmark[]>('atlas.history.bookmarks', []));
  const [whyOpen, setWhyOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dateText, setDateText] = useState(isoOf(initialDay));
  const [announce, setAnnounce] = useState('');

  useEffect(() => saveJSON('atlas.history.layers', layers), [layers]);
  useEffect(() => saveJSON('atlas.history.bookmarks', bookmarks), [bookmarks]);
  useEffect(() => setFilter((f) => ({ ...f, showUnverified: layers.unverified })), [layers.unverified]);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const isKey = useCallback((e: HistEvent) => e.key && passes(filterRef.current, e), []);
  const onStop = useCallback((e: HistEvent) => {
    setSelection({ kind: 'event', id: e.id });
    setAnnounce(`Остановка на ключевом событии: ${e.date}`);
  }, []);
  const pb = usePlayback(engine, initialDay, isKey, onStop);
  const day = pb.day;

  // Состояние мира на выбранный день — единый источник для карты, карточек, договоров и журнала
  const state = engine.stateAt(day);
  const recs = useMemo(() => [...state.recs].sort((a, b) => a - b), [state]);
  const recsKey = recs.join(',');
  const disputedIds = engine.disputedAt(day).map((d) => d.id);
  const conflictEntities = useMemo(
    () =>
      day <= engine.ucdpEnd
        ? [...new Set([...state.eps].flatMap((id) => {
            const s = engine.sidesOn(engine.episodes.get(id)!, day);
            return [...s.a, ...s.b];
          }))]
        : [],
    [state, engine, day],
  );
  const mapCovered = day <= engine.mapEnd;

  // Адрес страницы: дата и выбор. Во время воспроизведения обновляется не чаще раза в секунду.
  const lastHash = useRef('');
  const lastWrite = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (pb.playing && now - lastWrite.current < 1000) return;
    lastWrite.current = now;
    const sel = selection ? (selection.kind === 'event' ? `ev:${selection.id}` : selection.id) : undefined;
    const params = { d: isoOf(day), sel };
    lastHash.current = `${params.d}|${sel ?? ''}`;
    navigate('history', params, true);
    if (!pb.playing) setDateText(isoOf(day));
  }, [day, selection, pb.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Внешний переход по ссылке или закладке браузера
  useEffect(() => {
    const d = route.params.get('d');
    const sel = route.params.get('sel') ?? '';
    if (!d || `${d}|${sel}` === lastHash.current || !isValidIso(d)) return;
    pb.setPlaying(false);
    pb.seekDay(dayOf(d));
    if (sel) setSelection(sel.startsWith('ev:') ? { kind: 'event', id: sel.slice(3) } : { kind: 'entity', id: sel });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (d: number) => {
    pb.setPlaying(false);
    pb.seekDay(d);
  };
  const stepUnit = (unit: 'day' | 'month' | 'year', n: number) => jump(addCalendar(day, unit, n));
  const toEvent = (which: 'prev' | 'next') => {
    const e = which === 'next' ? engine.nextEvent(day, (x) => passes(filter, x)) : engine.prevEvent(day, (x) => passes(filter, x));
    if (e) {
      jump(dayOf(e.date));
      setSelection({ kind: 'event', id: e.id });
    } else setAnnounce(which === 'next' ? 'Дальше событий по фильтру нет' : 'Раньше событий по фильтру нет');
  };
  const selectEntity = (id: string) => {
    setSelection({ kind: 'entity', id });
    setOpen(true);
  };
  const selectEvent = (e: HistEvent) => {
    setSelection({ kind: 'event', id: e.id });
    setOpen(true);
  };

  // Клавиатура: пробел — пуск/пауза; ←/→ — день; Shift+←/→ — месяц; PageUp/PageDown — год; [ ] — события
  const keys = useRef({ pb, stepUnit, toEvent });
  keys.current = { pb, stepUnit, toEvent };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable || t.closest('dialog')) return;
      const k = keys.current;
      if (e.key === ' ' && t.tagName !== 'BUTTON' && t.tagName !== 'A') {
        e.preventDefault();
        k.pb.toggle();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (t.tagName === 'BUTTON') return;
        e.preventDefault();
        k.stepUnit(e.shiftKey ? 'month' : 'day', e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        k.stepUnit('year', e.key === 'PageDown' ? 1 : -1);
      } else if (e.key === ']') k.toEvent('next');
      else if (e.key === '[') k.toEvent('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = useMemo(() => engine.activeEntities(day), [engine, day]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = active.map((a) => ({ ...a, name: engine.entityName(a.id, day) }));
    const f = q ? list.filter((a) => `${a.name.ru} ${a.name.source}`.toLowerCase().includes(q)) : list;
    return f.sort((a, b) => a.name.ru.localeCompare(b.name.ru, 'ru'));
  }, [active, query, engine, day]);

  const selectedEvent = selection?.kind === 'event' ? engine.events.find((e) => e.id === selection.id) ?? null : null;
  const time = new Date(pb.ms).toISOString().slice(11, 19);
  const coverageNow = engine.coverage().filter((r) => r.included);

  const addBookmark = () => {
    const iso = isoOf(day);
    if (bookmarks.some((b) => b.date === iso)) return;
    const label = selection?.kind === 'entity' ? `${ruName(engine.entityName(selection.id, day).source)}, ${fmtDay(day)}` : fmtDay(day);
    setBookmarks([...bookmarks, { label, date: iso }]);
    setAnnounce('Закладка добавлена');
  };

  const main = (
    <div className="hworld">
      <header className="htop panel" aria-label="Дата и управление временем">
        <div className="htop-date">
          <div className="eyebrow" style={{ marginBottom: 2 }}>
            <span className={`led ${pb.playing ? 'led-on' : ''}`} aria-hidden="true" /> Исторический мир · {pb.playing ? (pb.dir === 1 ? 'идёт вперёд' : 'идёт назад') : 'пауза'}
          </div>
          <div className="hclock" aria-live="off">
            <span className="hclock-date">{fmtDay(day)}</span>
            <span className="hclock-time" title="Техническая шкала воспроизведения: источники дают даты не точнее дня">
              {time} UTC
            </span>
          </div>
          <div className="xs muted">время суток — техническая шкала; даты источников не точнее дня</div>
        </div>
        <div className="htop-controls">
          <div className="transport" role="group" aria-label="Переходы по времени">
            <button className="btn btn-sm" onClick={() => toEvent('prev')} aria-keyshortcuts="[" title="Предыдущее событие ([)">
              ⏮ Событие
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('year', -1)} aria-keyshortcuts="PageUp">
              −год
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('month', -1)} aria-keyshortcuts="Shift+ArrowLeft">
              −мес
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('day', -1)} aria-keyshortcuts="ArrowLeft">
              −день
            </button>
            <button className="btn btn-primary" onClick={pb.toggle} aria-keyshortcuts="Space">
              {pb.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
              {pb.playing ? 'Пауза' : 'Пуск'}
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('day', 1)} aria-keyshortcuts="ArrowRight">
              +день
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('month', 1)} aria-keyshortcuts="Shift+ArrowRight">
              +мес
            </button>
            <button className="btn btn-sm" onClick={() => stepUnit('year', 1)} aria-keyshortcuts="PageDown">
              +год
            </button>
            <button className="btn btn-sm" onClick={() => toEvent('next')} aria-keyshortcuts="]" title="Следующее событие (])">
              Событие ⏭
            </button>
          </div>
          <div className="transport" style={{ marginTop: 8 }}>
            <div className="speed-group" role="group" aria-label="Скорость времени">
              {SPEEDS.map((s) => (
                <button key={s.id} aria-pressed={pb.speed === s.id} onClick={() => pb.setSpeed(s.id)} title={s.hint}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="speed-group" role="group" aria-label="Направление">
              <button aria-pressed={pb.dir === 1} onClick={() => pb.setDir(1)}>
                Вперёд
              </button>
              <button aria-pressed={pb.dir === -1} onClick={() => pb.setDir(-1)}>
                Назад
              </button>
            </div>
            <label className="check small">
              <input type="checkbox" checked={pb.stopAtKey} onChange={(e) => pb.setStopAtKey(e.target.checked)} />
              Останавливаться на ключевых событиях
            </label>
          </div>
          <div className="transport" style={{ marginTop: 8 }}>
            <form
              className="hdate-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (isValidIso(dateText)) jump(dayOf(dateText));
                else setAnnounce('Введите дату в формате ГГГГ-ММ-ДД');
              }}
            >
              <label className="visually-hidden" htmlFor="hdate">
                Дата
              </label>
              <input id="hdate" className="input mono" type="date" min={isoOf(engine.start)} max={isoOf(engine.end)} value={dateText} onChange={(e) => setDateText(e.target.value)} />
              <button className="btn btn-sm" type="submit">
                Перейти
              </button>
            </form>
            <button className="btn btn-sm" onClick={addBookmark}>
              ☆ В закладки
            </button>
            <label className="visually-hidden" htmlFor="hbook">
              Закладки
            </label>
            <select
              id="hbook"
              className="select hbook"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('del:')) setBookmarks(bookmarks.filter((b) => b.date !== v.slice(4)));
                else if (v) jump(dayOf(v));
              }}
            >
              <option value="">Закладки ({bookmarks.length})</option>
              <optgroup label="Контрольные переходы">
                {PRESETS.map((p) => (
                  <option key={p.date} value={p.date}>
                    {p.label} — {p.date}
                  </option>
                ))}
              </optgroup>
              {bookmarks.length > 0 && (
                <optgroup label="Мои закладки">
                  {bookmarks.map((b) => (
                    <option key={b.date} value={b.date}>
                      {b.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {bookmarks.length > 0 && (
                <optgroup label="Удалить закладку">
                  {bookmarks.map((b) => (
                    <option key={`d${b.date}`} value={`del:${b.date}`}>
                      ✕ {b.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button className="btn btn-sm" onClick={() => setWhyOpen(true)}>
              <IconInfo size={14} /> Почему карта выглядит так?
            </button>
          </div>
          <div className="visually-hidden" aria-live="polite">
            {announce}
          </div>
        </div>
      </header>

      <div className="hbody">
        <aside className="hleft panel" aria-label="Слои и поиск страны">
          <details open className="hleft-block">
            <summary className="panel-title">Поиск страны на {fmtDay(day)}</summary>
            <label className="field">
              <span className="visually-hidden">Название страны или территории</span>
              <span style={{ position: 'relative', display: 'block' }}>
                <IconSearch size={15} style={{ position: 'absolute', left: 9, top: 11, color: 'var(--text-2)' }} />
                <input className="input" style={{ paddingLeft: 30 }} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, Германия" />
              </span>
            </label>
            <div className="xs muted" role="status" style={{ margin: '6px 0' }}>
              {results.length} из {active.length} на эту дату
            </div>
            {results.length === 0 ? (
              <p className="small muted">На эту дату таких субъектов нет в CShapes и списке GW.</p>
            ) : (
              <ul className="hresults">
                {results.slice(0, 60).map((r) => (
                  <li key={r.id}>
                    <button className="hresult" aria-current={selection?.kind === 'entity' && selection.id === r.id ? 'true' : undefined} onClick={() => selectEntity(r.id)}>
                      <span>{r.name.ru}</span>
                      <span className="xs muted">{r.fid === null ? 'нет геометрии' : r.status === 'independent' ? '' : 'завис. терр.'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details open className="hleft-block">
            <summary className="panel-title">Слои</summary>
            <div className="hlayers">
              {(
                [
                  ['states', 'Государства (CShapes)'],
                  ['dependencies', 'Зависимые территории'],
                  ['disputed', 'Спорные участки'],
                  ['capitals', 'Столицы'],
                  ['labels', 'Подписи'],
                  ['conflicts', 'Стороны конфликтов (UCDP)'],
                  ['land', 'Физическая подложка'],
                  ['graticule', 'Координатная сетка'],
                  ['unverified', 'Показывать требующее проверки'],
                ] as [keyof Layers, string][]
              ).map(([k, label]) => (
                <label key={k} className="check small">
                  <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
              <label className="check small" title="Нет подходящего набора данных">
                <input type="checkbox" disabled checked={false} readOnly />
                <span className="muted">Фактический контроль — нет данных</span>
              </label>
            </div>
          </details>
          <details open className="hleft-block">
            <summary className="panel-title">Легенда</summary>
            <ul className="hlegend small">
              <li>
                <i className="sw sw-state" aria-hidden="true" /> государство по CShapes
              </li>
              <li>
                <i className="sw sw-dep" aria-hidden="true" /> зависимая территория (лавандовая штриховка)
              </li>
              <li>
                <i className="sw sw-disp" aria-hidden="true" /> спорный участок (коралловая штриховка, пунктир)
              </li>
              <li>
                <i className="sw sw-land" aria-hidden="true" /> суша без записи в CShapes
              </li>
              <li>
                <i className="sw sw-gap" aria-hidden="true" /> вне покрытия: контур не подтверждён
              </li>
              <li>
                <i className="sw sw-cap" aria-hidden="true" /> столица
              </li>
            </ul>
          </details>
          <details className="hleft-block">
            <summary className="panel-title">Покрытие данных</summary>
            <ul className="hcov small">
              {engine.coverage().map((r) => {
                const on = r.included && r.from !== null && r.to !== null && day >= r.from && day <= r.to;
                return (
                  <li key={r.id}>
                    <span className={`kind ${on ? 'kind-estimate' : 'kind-none'}`}>{on ? '● есть' : r.included ? '○ вне охвата' : '∅ нет'}</span> {r.label}
                    <div className="xs muted">
                      {r.included && r.from !== null && r.to !== null ? `${isoOf(r.from)} — ${isoOf(r.to)}. ` : ''}
                      {r.note}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </aside>

        <div className="hcenter">
          <HistoryMap
            engine={engine}
            recs={recs}
            recsKey={recsKey}
            disputedIds={layers.disputed ? disputedIds : []}
            conflictEntities={conflictEntities}
            selectedEntity={selection?.kind === 'entity' ? selection.id : null}
            layers={layers}
            mapCovered={mapCovered}
            dayLabel={fmtDay(day)}
            onSelect={selectEntity}
          />
          <div className="hstatus xs">
            {coverageNow.map((r) => {
              const on = r.from !== null && r.to !== null && day >= r.from && day <= r.to;
              return (
                <span key={r.id} className={on ? '' : 'off'}>
                  {on ? '●' : '○'} {r.label.split(':')[0]}
                  {!on && ' — нет данных на эту дату'}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <Timeline
        engine={engine}
        day={day}
        filter={filter}
        setFilter={setFilter}
        onSeek={(d) => jump(d)}
        onEvent={(e) => {
          jump(dayOf(e.date));
          selectEvent(e);
        }}
        selectedEvent={selectedEvent?.id ?? null}
        journal={pb.journal}
        journalTotal={pb.journalTotal}
        clearJournal={pb.clearJournal}
      />
      <WhyDialog engine={engine} day={day} open={whyOpen} onClose={() => setWhyOpen(false)} />
    </div>
  );

  const aside = selectedEvent ? (
    <EventCard engine={engine} event={selectedEvent} onEntity={selectEntity} onGo={(e) => jump(dayOf(e.date))} />
  ) : selection?.kind === 'entity' ? (
    <EntityCard engine={engine} id={selection.id} day={day} showUnverified={layers.unverified} onEvent={selectEvent} onEntity={selectEntity} />
  ) : (
    <EmptyState title="Ничего не выбрано">
      <p className="small">Выберите страну на карте или в поиске слева либо событие на шкале.</p>
    </EmptyState>
  );

  return <Workspace main={main} aside={aside} asideTitle={selectedEvent ? 'Событие' : 'Страна на выбранную дату'} />;
}
