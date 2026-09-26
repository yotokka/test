import { useDeferredValue, useMemo, useState } from 'react';
import type { CompareApi } from '../App';
import { MAX_COMPARE } from '../App';
import { DatasetNotice, EmptyState, FigureBlock, KindBadge, SourceLink, Workspace, useAside } from '../components/Common';
import { IconBallistic, IconCheck, IconCruise, IconInfo, IconPlus, IconSam, IconSearch, IconWarn } from '../components/Icons';
import { AGREEMENTS, AGREEMENT_TYPE_NAMES } from '../data/reference/agreements';
import { DEFENSE_CHAIN, DEFENSE_CLASSES, THREAT_DIFFERENCES } from '../data/reference/airDefense';
import { CATEGORY_NAMES, CATEGORY_SINGULAR, COUNTRY_NAMES, MILESTONES, MILESTONE_RU, MISSILES, PERIOD_NAMES, reachedStage } from '../data/reference/missiles';
import type { Missile } from '../data/reference/types';
import { formatPartialDate } from '../lib/format';
import { EquipmentAside, EquipmentCatalog } from '../components/EquipmentCatalog';
import type { Route, RouteName } from '../lib/router';

type Nav = (name: RouteName, params?: Record<string, string | undefined>, replace?: boolean) => void;

const TABS = [
  { id: 'missiles', label: 'Ракеты' },
  { id: 'defense', label: 'ПВО: принципы' },
  { id: 'equipment', label: 'Каталог техники' },
  { id: 'agreements', label: 'Соглашения и союзы' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export const CategoryIcon = ({ c, size = 18 }: { c: Missile['category']; size?: number }) =>
  c === 'ballistic' ? <IconBallistic size={size} /> : c === 'cruise' ? <IconCruise size={size} /> : <IconSam size={size} />;

export default function ReferencePage({ route, navigate, compare }: { route: Route; navigate: Nav; compare: CompareApi }) {
  const tab = (TABS.find((t) => t.id === route.params.get('tab'))?.id ?? 'missiles') as Tab;
  const selectedId = route.params.get('id') ?? undefined;
  const selected = MISSILES.find((m) => m.id === selectedId);
  const { setOpen } = useAside();

  const select = (id: string) => {
    navigate('reference', { tab: 'missiles', id }, true);
    setOpen(true);
  };

  const main = (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="led led-on" aria-hidden="true" /> Справочный раздел · реальные системы и документы
        </div>
        <h1>Справочник</h1>
        <p className="lead">
          Опубликованные сведения о ракетах, общие принципы ПВО и документированные соглашения. Каждое число сопровождается
          статусом, источником, датой публикации и датой проверки.
        </p>
      </header>
      <div className="tabs" role="tablist" aria-label="Разделы справочника">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => navigate('reference', { tab: t.id }, true)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'missiles' && <MissileCatalog selectedId={selectedId} onSelect={select} compare={compare} />}
        {tab === 'defense' && <DefenseGuide />}
        {tab === 'agreements' && <AgreementsList />}
        {tab === 'equipment' && (
          <EquipmentCatalog
            selected={route.params.get('fam')}
            onSelect={(id) => {
              navigate('reference', { tab: 'equipment', fam: id }, true);
              setOpen(true);
            }}
          />
        )}
      </div>
    </>
  );

  const aside =
    tab === 'missiles' ? (
      selected ? (
        <MissileDetail m={selected} compare={compare} />
      ) : (
        <div className="fade-in">
          <EmptyState title="Система не выбрана">
            <p className="small">Выберите карточку в каталоге, чтобы увидеть все опубликованные значения, источники и даты.</p>
          </EmptyState>
          <div style={{ marginTop: 16 }}>
            <KindLegend />
          </div>
        </div>
      )
    ) : tab === 'equipment' ? (
      <EquipmentAside id={route.params.get('fam')} />
    ) : tab === 'defense' ? (
      <DefenseAside />
    ) : (
      <AgreementsAside />
    );

  return <Workspace main={main} aside={aside} asideTitle={tab === 'missiles' ? 'Параметры системы' : tab === 'equipment' ? 'Семейство' : 'Пояснения'} />;
}

/* ———————————————— Каталог ракет ———————————————— */

type DataFilter = 'any' | 'claim' | 'test' | 'estimate' | 'multi' | 'none';

function MissileCatalog({ selectedId, onSelect, compare }: { selectedId?: string; onSelect: (id: string) => void; compare: CompareApi }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('all');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<DataFilter>('any');
  const [byYear, setByYear] = useState('');
  const [stage, setStage] = useState<'service' | 'test' | 'development'>('service');
  const year = /^\d{4}$/.test(byYear) ? Number(byYear) : null;
  const query = useDeferredValue(q.trim().toLowerCase());

  const countries = useMemo(() => [...new Set(MISSILES.flatMap((m) => m.countries))], []);

  const results = useMemo(
    () =>
      MISSILES.filter((m) => {
        if (country !== 'all' && !m.countries.includes(country)) return false;
        if (category !== 'all' && m.category !== category) return false;
        if (period !== 'all' && m.period !== period) return false;
        if (data === 'none' && m.ranges.length > 0) return false;
        if (year !== null && !reachedStage(m.id, stage, year)) return false;
        if (data === 'multi' && m.ranges.length < 2) return false;
        if ((data === 'claim' || data === 'test' || data === 'estimate') && !m.ranges.some((r) => r.kind === data)) return false;
        if (!query) return true;
        const hay = [m.name, m.variant, m.subclass, ...(m.altNames ?? []), ...m.countries.map((c) => COUNTRY_NAMES[c])]
          .join(' ')
          .toLowerCase();
        return query.split(/\s+/).every((w) => hay.includes(w));
      }),
    [query, country, category, period, data, year, stage],
  );

  const filtersActive = q || country !== 'all' || category !== 'all' || period !== 'all' || data !== 'any' || byYear !== '';
  const reset = () => {
    setQ('');
    setCountry('all');
    setCategory('all');
    setPeriod('all');
    setData('any');
    setByYear('');
  };

  return (
    <section aria-label="Каталог ракет">
      <DatasetNotice compact />
      <div style={{ height: 14 }} />
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="field field-search">
          <span className="field-label">Поиск</span>
          <span style={{ position: 'relative', display: 'block' }}>
            <IconSearch size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-2)' }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название, модификация, страна…"
            />
          </span>
        </label>
        <label className="field">
          <span className="field-label">Страна</span>
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="all">Все страны</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Тип</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Все типы</option>
            {Object.entries(CATEGORY_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Период</span>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">Все периоды</option>
            {Object.entries(PERIOD_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Данные о дальности</span>
          <select className="select" value={data} onChange={(e) => setData(e.target.value as DataFilter)}>
            <option value="any">Любые</option>
            <option value="claim">Есть заявление</option>
            <option value="test">Есть результат испытаний</option>
            <option value="estimate">Есть оценка</option>
            <option value="multi">Несколько значений</option>
            <option value="none">Нет надёжных данных</option>
          </select>
        </label>
      </form>
      <div className="toolbar-year">
        <label className="field">
          <span className="field-label">Существовала к году</span>
          <input className="input mono" inputMode="numeric" maxLength={4} placeholder="например, 1985" value={byYear} onChange={(e) => setByYear(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span className="field-label">Этап не позднее этого года</span>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
            <option value="service">принятие на вооружение / применение</option>
            <option value="test">хотя бы испытание</option>
            <option value="development">хотя бы начало разработки</option>
          </select>
        </label>
        <p className="xs muted" style={{ margin: 0, alignSelf: 'end' }}>
          Даты этапов сверены только по поисковой выдаче (требуют проверки). Системы без записанного этапа при фильтре по году скрываются: дата не
          домысливается. Более поздняя модификация не считается существовавшей раньше своей даты.
          {year !== null && ` Без записанных этапов: ${MISSILES.filter((m) => !MILESTONES[m.id]).length}.`}
        </p>
      </div>

      <div className="toolbar-meta">
        <span role="status" aria-live="polite">
          Найдено: <span className="mono">{results.length}</span> из <span className="mono">{MISSILES.length}</span>
          {' · '}к сравнению выбрано: <span className="mono">{compare.ids.length}/{MAX_COMPARE}</span>
        </span>
        {filtersActive && (
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            Сбросить фильтры
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState title="Ничего не найдено">
          <p className="small">Попробуйте изменить запрос или сбросить фильтры.</p>
          <button className="btn btn-sm" onClick={reset}>
            Сбросить фильтры
          </button>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {results.map((m) => (
            <MissileCard
              key={m.id}
              m={m}
              selected={m.id === selectedId}
              onSelect={() => onSelect(m.id)}
              inCompare={compare.ids.includes(m.id)}
              compareFull={compare.ids.length >= MAX_COMPARE}
              onToggleCompare={() => compare.toggle(m.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MissileCard(props: {
  m: Missile;
  selected: boolean;
  onSelect: () => void;
  inCompare: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
}) {
  const { m } = props;
  return (
    <article className="card" data-selected={props.selected} aria-labelledby={`card-${m.id}`}>
      <div className="card-head">
        <div className="card-icon" title={CATEGORY_NAMES[m.category]}>
          <CategoryIcon c={m.category} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 className="card-title" id={`card-${m.id}`}>
            <button className="card-open" onClick={props.onSelect} aria-describedby={`var-${m.id}`}>
              {m.name}
            </button>
          </h3>
          <div className="card-variant" id={`var-${m.id}`}>
            {m.variant}
          </div>
        </div>
      </div>
      <div className="card-meta">
        {m.countries.map((c) => (
          <span key={c} className="chip">
            {COUNTRY_NAMES[c]}
          </span>
        ))}
        <span className="chip">{CATEGORY_SINGULAR[m.category]}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {m.subclass}
      </p>
      <ul className="card-ranges" aria-label="Опубликованная дальность">
        {m.ranges.length === 0 ? (
          <li>
            <span className="muted">Нет надёжных открытых данных</span>
            <KindBadge kind="none" />
          </li>
        ) : (
          m.ranges.slice(0, 3).map((r) => (
            <li key={r.id}>
              <span className="val">{shortText(r.text)}</span>
              <KindBadge kind={r.kind} />
            </li>
          ))
        )}
      </ul>
      <div className="card-foot">
        <span className="xs muted">{m.ranges.length > 1 ? 'Несколько значений — см. пояснение' : PERIOD_NAMES[m.period].split(' (')[0]}</span>
        <button
          className="btn btn-sm"
          aria-pressed={props.inCompare}
          disabled={!props.inCompare && props.compareFull}
          onClick={props.onToggleCompare}
          title={!props.inCompare && props.compareFull ? `Можно сравнить не более ${MAX_COMPARE} систем` : undefined}
        >
          {props.inCompare ? <IconCheck size={14} /> : <IconPlus size={14} />}
          {props.inCompare ? 'В сравнении' : 'Сравнить'}
          <span className="visually-hidden"> {m.name}, {m.variant}</span>
        </button>
      </div>
    </article>
  );
}

/** Сокращает формулировку для карточки: оставляет часть до скобок/знака «≈». */
function shortText(t: string): string {
  const cut = t.split(' ≈ ').pop()!;
  return cut.replace(/\s*\(.*\)$/, '');
}

export function MissileDetail({ m, compare }: { m: Missile; compare?: CompareApi }) {
  return (
    <article className="fade-in" key={m.id}>
      <div className="eyebrow">
        <CategoryIcon c={m.category} size={16} /> {CATEGORY_NAMES[m.category]}
      </div>
      <h3 className="detail-name">{m.name}</h3>
      <div className="card-variant" style={{ marginBottom: 12 }}>
        Модификация: {m.variant}
      </div>
      <dl className="dl">
        <dt>Страна</dt>
        <dd>{m.countries.map((c) => COUNTRY_NAMES[c]).join(', ')}</dd>
        <dt>Класс</dt>
        <dd>{m.subclass}</dd>
        <dt>Период</dt>
        <dd>{PERIOD_NAMES[m.period]}</dd>
        <dt>Начало службы</dt>
        <dd>
          {m.serviceYear ? (
            <>
              <span className="mono">{m.serviceYear}</span>{' '}
              {m.serviceYearSourceId && (
                <span className="small">
                  (<SourceLink id={m.serviceYearSourceId} compact />)
                </span>
              )}
            </>
          ) : (
            <span className="muted">не указано в проверенных источниках</span>
          )}
        </dd>
        {m.altNames && (
          <>
            <dt>Другие названия</dt>
            <dd>{m.altNames.join(', ')}</dd>
          </>
        )}
      </dl>

      <div className="section-label">Назначение</div>
      <p className="small">{m.purpose}</p>
      <div className="section-label">Краткая история</div>
      <p className="small">{m.history}</p>
      <p className="xs muted">
        Источники справки:{' '}
        {m.historySourceIds.map((id, i) => (
          <span key={id}>
            {i > 0 && '; '}
            <SourceLink id={id} compact />
          </span>
        ))}
      </p>

      <div className="section-label">Этапы (разработка, испытание, служба)</div>
      {MILESTONES[m.id] ? (
        <ul className="plain small">
          {MILESTONES[m.id].map((x) => (
            <li key={x.kind + x.date}>
              <span className="mono">{x.date}</span> — {MILESTONE_RU[x.kind]}
              {x.note ? ` (${x.note})` : ''} · <SourceLink id={x.sourceId} compact /> <span className="kind kind-none">требует проверки</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Даты этапов для этой модификации в справочнике не записаны.</p>
      )}
      <div className="section-label">Опубликованная дальность</div>
      {m.ranges.length === 0 ? (
        <div className="figure">
          <KindBadge kind="none" />
          <div className="figure-value">Нет надёжных открытых данных</div>
          {m.caveats?.map((c) => (
            <div key={c} className="figure-note">
              {c}
            </div>
          ))}
        </div>
      ) : (
        m.ranges.map((r) => <FigureBlock key={r.id} f={r} />)
      )}

      {m.discrepancy && (
        <>
          <div className="section-label">Почему значения расходятся</div>
          <div className="notice notice-teal small">
            <IconInfo size={16} style={{ color: 'var(--teal)' }} />
            <p>{m.discrepancy}</p>
          </div>
        </>
      )}
      {m.ranges.length > 0 && m.caveats && (
        <>
          <div className="section-label">Оговорки</div>
          {m.caveats.map((c) => (
            <p key={c} className="small figure-note">
              {c}
            </p>
          ))}
        </>
      )}
      <div className="notice small" style={{ marginTop: 16 }}>
        <IconWarn size={16} style={{ color: 'var(--amber)' }} />
        <p>
          Максимальная дальность — это граница при определённых условиях, а не гарантия результата на любом расстоянии.
        </p>
      </div>
      {compare && (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn"
            aria-pressed={compare.ids.includes(m.id)}
            disabled={!compare.ids.includes(m.id) && compare.ids.length >= MAX_COMPARE}
            onClick={() => compare.toggle(m.id)}
          >
            {compare.ids.includes(m.id) ? <IconCheck size={16} /> : <IconPlus size={16} />}
            {compare.ids.includes(m.id) ? 'Убрать из сравнения' : 'Добавить к сравнению'}
          </button>
        </div>
      )}
    </article>
  );
}

export function KindLegend() {
  return (
    <div className="panel">
      <h3 className="panel-title">Как читать статусы</h3>
      <div style={{ display: 'grid', gap: 10 }} className="small">
        <div>
          <KindBadge kind="claim" /> — число опубликовал разработчик, производитель или государство.
        </div>
        <div>
          <KindBadge kind="test" /> — что фактически показано в конкретном испытании. Это не обязательно максимум.
        </div>
        <div>
          <KindBadge kind="estimate" /> — расчёт или вывод независимых исследователей.
        </div>
        <div>
          <KindBadge kind="none" /> — числа нет: мы не заполняем пробелы догадками.
        </div>
      </div>
    </div>
  );
}

/* ———————————————— ПВО: принципы ———————————————— */

function DefenseGuide() {
  return (
    <div className="fade-in">
      <section className="panel" aria-labelledby="chain-h">
        <h2 id="chain-h" className="panel-title">
          Цепочка этапов противовоздушной обороны
        </h2>
        <p className="small muted">
          Любая система ПВО — это не одна ракета, а цепочка: датчики, связь, люди, правила и средства перехвата. Сбой или
          задержка на любом этапе влияет на результат.
        </p>
        <ol className="chain">
          {DEFENSE_CHAIN.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <span className="muted">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel" aria-labelledby="classes-h">
        <h2 id="classes-h" className="panel-title">
          Классы систем и их назначение
        </h2>
        <div className="grid-3">
          {DEFENSE_CLASSES.map((c) => (
            <div key={c.title} className="figure">
              <strong>{c.title}</strong>
              <span className="small muted">{c.text}</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Реальная оборона обычно эшелонирована: разные классы дополняют друг друга, а не заменяют.
        </p>
      </section>

      <section className="panel" aria-labelledby="diff-h">
        <h2 id="diff-h" className="panel-title">
          Самолёты, крылатые и баллистические ракеты: в чём разница для обороны
        </h2>
        <div className="grid-3">
          {THREAT_DIFFERENCES.map((t) => (
            <div key={t.id} className="figure">
              <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {t.id === 'ballistic' ? <IconBallistic size={16} /> : t.id === 'cruise' ? <IconCruise size={16} /> : <IconSam size={16} />}
                {t.title}
              </strong>
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1em' }}>
                {t.points.map((p) => (
                  <li key={p} style={{ marginBottom: 6 }}>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DefenseAside() {
  return (
    <div className="fade-in">
      <div className="notice notice-coral small">
        <IconWarn size={16} style={{ color: 'var(--coral)' }} />
        <div>
          <p>
            <strong>Что здесь намеренно не показано</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
            <li>актуальные позиции батарей и зоны реального покрытия;</li>
            <li>готовность подразделений;</li>
            <li>уязвимости конкретных систем;</li>
            <li>расчёты эффективности против конкретных современных систем.</li>
          </ul>
        </div>
      </div>
      <div className="section-label">Почему «дальность» зенитной ракеты — условное число</div>
      <p className="small">
        Граница зоны поражения зависит от высоты, скорости и манёвра цели, от датчиков и от того, как далеко ракета может
        лететь с достаточным запасом энергии. Одна и та же ракета имеет очень разные границы против самолёта и против
        баллистической цели — см. карточку С-400 в каталоге.
      </p>
      <div className="section-label">Хотите посмотреть этапы в движении?</div>
      <p className="small">
        Раздел <a href="#/history?mode=edit&scn=demo:legacy-basics">«Мир и сценарии»</a> (режим редактора) показывает те же этапы на вымышленной карте с вымышленными
        параметрами.
      </p>
    </div>
  );
}

/* ———————————————— Соглашения ———————————————— */

function AgreementsList() {
  return (
    <div className="fade-in">
      <div className="notice notice-teal" role="note" style={{ marginBottom: 16 }}>
        <IconInfo size={18} style={{ color: 'var(--teal)' }} />
        <p>
          Здесь собраны документы и даты. Участие в союзе не означает автоматического перехвата, а конфликт — автоматического
          открытия огня. Реальные решения зависят от обстоятельств, полномочий и правил применения, которые публикуются
          не всегда.
        </p>
      </div>
      <div className="grid-2">
        {AGREEMENTS.map((a) => (
          <article key={a.id} className="card" aria-labelledby={`ag-${a.id}`}>
            <div>
              <span className="chip">{AGREEMENT_TYPE_NAMES[a.type]}</span>
            </div>
            <h3 className="card-title" id={`ag-${a.id}`}>
              {a.shortName}
            </h3>
            <div className="small muted">{a.name}</div>
            <div className="xs muted">Стороны: {a.parties}</div>
            <ol className="timeline" aria-label="Даты">
              {a.events.map((e) => (
                <li key={e.label}>
                  <span className="mono">{formatPartialDate(e.date)}</span> — {e.label}.{' '}
                  <span className="xs">
                    <SourceLink id={e.sourceId} compact />
                  </span>
                </li>
              ))}
            </ol>
            <p className="small" style={{ margin: 0 }}>
              {a.summary}
            </p>
            <div className="figure-note">
              <strong>Чего документ не означает: </strong>
              {a.notImplies}
            </div>
            {a.statusNote && (
              <div className="notice small">
                <IconWarn size={16} style={{ color: 'var(--amber)' }} />
                <p>{a.statusNote}</p>
              </div>
            )}
            <div className="xs muted">Даты сверены по поисковой выдаче 26.09.2026.</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AgreementsAside() {
  return (
    <div className="fade-in small">
      <div className="section-label">Документ и действие — разные вещи</div>
      <p>
        Договор определяет обязательства сторон, но конкретные действия ПВО зависят от национальных решений, полномочий,
        правил применения, опознавания объекта и обстановки.
      </p>
      <div className="section-label">Как это отражено в симуляции</div>
      <p>
        В учебной модели отношения между вымышленными странами — отдельные настройки: союз, нейтралитет, конфликт,
        соглашение о совместной обороне и требование разрешения на перехват. Реальные соглашения из этого раздела на
        модель не влияют.
      </p>
      <div className="section-label">Откуда даты</div>
      <p className="xs muted">
        Даты взяты из официальных текстов и справок, найденных в поисковой выдаче. Страницы источников из среды сборки
        не открывались, поэтому перед цитированием даты стоит сверить по ссылкам.
      </p>
    </div>
  );
}

