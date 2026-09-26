import { useMemo, useState } from 'react';
import { DatasetNotice, EmptyState, Workspace, checkLabel, useAside } from '../components/Common';
import { IconExternal, IconInfo } from '../components/Icons';
import { AGREEMENTS } from '../data/reference/agreements';
import { MISSILES } from '../data/reference/missiles';
import { DATASET, SOURCES } from '../data/reference/sources';
import type { Source } from '../data/reference/types';
import { formatDateShort, formatPartialDate } from '../lib/format';
import { href, type Route, type RouteName } from '../lib/router';

type Nav = (name: RouteName, params?: Record<string, string | undefined>, replace?: boolean) => void;

const TYPE_NAMES: Record<Source['sourceType'], string> = {
  official: 'Официальный',
  manufacturer: 'Производитель',
  research: 'Исследовательский',
  museum: 'Музей',
  'treaty-text': 'Текст договора',
  media: 'Вторичный / СМИ / энциклопедия',
};

/** Где используется источник: числа, исторические справки, соглашения. */
function usages(id: string) {
  const figures = MISSILES.flatMap((m) =>
    m.ranges.filter((r) => r.sourceId === id || r.check.corroboratedBy === id).map((r) => ({ m, r })),
  );
  const history = MISSILES.filter((m) => m.historySourceIds.includes(id) || m.serviceYearSourceId === id);
  const agreements = AGREEMENTS.filter((a) => a.events.some((e) => e.sourceId === id));
  return { figures, history, agreements };
}

export default function SourcesPage({ route, navigate }: { route: Route; navigate: Nav }) {
  const [type, setType] = useState<'all' | Source['sourceType']>('all');
  const [q, setQ] = useState('');
  const selectedId = route.params.get('id');
  const selected = SOURCES.find((s) => s.id === selectedId);
  const { setOpen } = useAside();

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return SOURCES.filter((s) => (type === 'all' || s.sourceType === type) && (!query || `${s.title} ${s.publisher}`.toLowerCase().includes(query)));
  }, [type, q]);

  const main = (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="led led-on" aria-hidden="true" /> Справочный раздел
        </div>
        <h1>Источники</h1>
        <p className="lead">
          Все публикации, на которые опирается справочник. Дата публикации и дата проверки показаны отдельно: новая дата
          проверки не делает саму публикацию новой.
        </p>
      </header>
      <DatasetNotice />
      <div className="toolbar" style={{ gridTemplateColumns: 'minmax(200px,2fr) minmax(160px,1fr)', marginTop: 16 }}>
        <label className="field">
          <span className="field-label">Поиск по названию или издателю</span>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, CSIS" />
        </label>
        <label className="field">
          <span className="field-label">Тип источника</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">Все типы</option>
            {Object.entries(TYPE_NAMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar-meta">
        <span role="status" aria-live="polite">
          Источников: <span className="mono">{list.length}</span> из <span className="mono">{SOURCES.length}</span>
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Источники не найдены">
          <button className="btn btn-sm" onClick={() => { setQ(''); setType('all'); }}>
            Сбросить фильтры
          </button>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Публикация</th>
                <th scope="col">Тип</th>
                <th scope="col">Опубликовано</th>
                <th scope="col">Проверено</th>
                <th scope="col">Использование</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const u = usages(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                        <span className="visually-hidden"> (откроется в новой вкладке)</span>{' '}
                        <IconExternal size={12} />
                      </a>
                      <div className="xs muted">{s.publisher}</div>
                    </td>
                    <td data-label="Тип" className="small">
                      {TYPE_NAMES[s.sourceType]}
                    </td>
                    <td data-label="Опубликовано" className="small">
                      {formatPartialDate(s.published)}
                    </td>
                    <td data-label="Проверено" className="small">
                      <span className="mono">{formatDateShort(DATASET.builtAt)}</span>
                      <div className="xs muted">{checkLabel('search-index')}</div>
                    </td>
                    <td data-label="Использование" className="small">
                      <button
                        className="link-btn"
                        onClick={() => {
                          navigate('sources', { id: s.id }, true);
                          setOpen(true);
                        }}
                      >
                        {u.figures.length} знач. · {u.history.length + u.agreements.length} справ.
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const aside = selected ? (
    <SourceDetail s={selected} />
  ) : (
    <div className="fade-in small">
      <div className="section-label">Как устроена проверка</div>
      <p>
        В этой сборке страницы источников были недоступны из среды разработки. Поэтому каждое число помечено способом
        проверки «по поисковой выдаче»: ссылка и значение взяты из результатов поиска, но текст страницы не сверялся
        полностью.
      </p>
      <p>Чтобы перевести значение в статус «сверено с первоисточником», откройте ссылку, найдите формулировку и обновите запись в файле данных.</p>
      <div className="notice notice-teal">
        <IconInfo size={16} style={{ color: 'var(--teal)' }} />
        <p>Выберите «Использование» в строке таблицы, чтобы увидеть, какие значения опираются на источник.</p>
      </div>
    </div>
  );

  return <Workspace main={main} aside={aside} asideTitle="Сведения об источнике" />;
}

function SourceDetail({ s }: { s: Source }) {
  const u = usages(s.id);
  return (
    <div className="fade-in" key={s.id}>
      <h3 className="detail-name">{s.title}</h3>
      <dl className="dl">
        <dt>Издатель</dt>
        <dd>{s.publisher}</dd>
        <dt>Тип</dt>
        <dd>{TYPE_NAMES[s.sourceType]}</dd>
        <dt>Опубликовано</dt>
        <dd>{formatPartialDate(s.published)}</dd>
        {s.publishedNote && (
          <>
            <dt>О дате</dt>
            <dd className="small">{s.publishedNote}</dd>
          </>
        )}
        <dt>Проверено</dt>
        <dd>
          <span className="mono">{formatDateShort(DATASET.builtAt)}</span> · {checkLabel('search-index')}
        </dd>
      </dl>
      <p style={{ marginTop: 12 }}>
        <a className="btn btn-sm" href={s.url} target="_blank" rel="noopener noreferrer">
          Открыть источник <IconExternal size={14} />
        </a>
      </p>
      <div className="section-label">Числовые значения ({u.figures.length})</div>
      {u.figures.length === 0 ? (
        <p className="small muted">Не используется для чисел.</p>
      ) : (
        <ul className="small" style={{ paddingLeft: '1.1em' }}>
          {u.figures.map(({ m, r }) => (
            <li key={r.id}>
              <a href={href('reference', { tab: 'missiles', id: m.id })}>{m.name}</a> — <span className="mono">{r.text}</span>
            </li>
          ))}
        </ul>
      )}
      {(u.history.length > 0 || u.agreements.length > 0) && (
        <>
          <div className="section-label">Справки и даты</div>
          <ul className="small" style={{ paddingLeft: '1.1em' }}>
            {u.history.map((m) => (
              <li key={m.id}>
                <a href={href('reference', { tab: 'missiles', id: m.id })}>{m.name}</a> — история
              </li>
            ))}
            {u.agreements.map((a) => (
              <li key={a.id}>
                <a href={href('reference', { tab: 'agreements' })}>{a.shortName}</a> — даты
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
