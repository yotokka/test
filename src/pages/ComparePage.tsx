import type { ReactNode } from 'react';
import type { CompareApi } from '../App';
import { DatasetNotice, EmptyState, KindBadge, SourceLink, Workspace, checkLabel } from '../components/Common';
import { IconClose, IconInfo, IconWarn } from '../components/Icons';
import { RangeChart } from '../components/RangeChart';
import { CATEGORY_SINGULAR, COUNTRY_NAMES, MISSILES, PERIOD_NAMES } from '../data/reference/missiles';
import { getSource } from '../data/reference/sources';
import type { FigureKind, Missile } from '../data/reference/types';
import { formatDateShort, formatPartialDate } from '../lib/format';
import { href, type RouteName } from '../lib/router';
import { KindLegend } from './ReferencePage';

type Nav = (name: RouteName, params?: Record<string, string | undefined>, replace?: boolean) => void;

const PRESETS: { label: string; ids: string[] }[] = [
  { label: 'Разные типы чисел: испытание, оценка, заявление', ids: ['hwasong15', 'minuteman3', 'trident-d5'] },
  { label: 'Экспортные и «внутренние» версии', ids: ['kalibr-3m14', 'club-3m14e', 'iskander-m', 'iskander-e'] },
  { label: 'Модификации одного семейства', ids: ['atacms-1', 'atacms-1a'] },
  { label: 'Зенитные системы', ids: ['s400', 'thaad', 'iron-dome', 'patriot-pac3mse'] },
];

function FiguresCell({ m, kind }: { m: Missile; kind: FigureKind }) {
  const figs = m.ranges.filter((r) => r.kind === kind);
  if (figs.length === 0) return <span className="muted small">—</span>;
  return (
    <>
      {figs.map((f) => {
        const s = getSource(f.sourceId);
        return (
          <div key={f.id} className="cell-fig">
            <div className="mono">{f.text}</div>
            <div className="xs muted">{f.context}</div>
            <div className="xs">
              <SourceLink id={f.sourceId} compact />
            </div>
            <div className="xs muted">
              Опубл.: {formatPartialDate(s.published)} · Проверено: {formatDateShort(f.check.date)} ({checkLabel(f.check.method)})
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function ComparePage({ compare, navigate }: { compare: CompareApi; navigate: Nav }) {
  const selected = compare.ids.map((id) => MISSILES.find((m) => m.id === id)).filter(Boolean) as Missile[];

  const rows: { label: string; render: (m: Missile) => ReactNode }[] = [
    { label: 'Модификация', render: (m) => <span className="mono small">{m.variant}</span> },
    { label: 'Страна', render: (m) => m.countries.map((c) => COUNTRY_NAMES[c]).join(', ') },
    { label: 'Тип', render: (m) => `${CATEGORY_SINGULAR[m.category]} · ${m.subclass}` },
    { label: 'Период', render: (m) => PERIOD_NAMES[m.period] },
    { label: 'Назначение', render: (m) => <span className="small">{m.purpose}</span> },
    {
      label: 'Заявление',
      render: (m) => <FiguresCell m={m} kind="claim" />,
    },
    {
      label: 'Результат испытаний',
      render: (m) => <FiguresCell m={m} kind="test" />,
    },
    {
      label: 'Независимая оценка',
      render: (m) => <FiguresCell m={m} kind="estimate" />,
    },
    {
      label: 'Если данных нет',
      render: (m) =>
        m.ranges.length === 0 ? (
          <>
            <KindBadge kind="none" />
            <div className="xs muted" style={{ marginTop: 6 }}>
              {m.caveats?.[0]}
            </div>
          </>
        ) : (
          <span className="muted small">—</span>
        ),
    },
    {
      label: 'Почему значения расходятся',
      render: (m) => (m.discrepancy ? <span className="small">{m.discrepancy}</span> : <span className="muted small">—</span>),
    },
  ];

  const main = (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="led led-on" aria-hidden="true" /> Справочный раздел
        </div>
        <h1>Сравнение</h1>
        <p className="lead">
          Таблица разводит заявления, результаты испытаний и независимые оценки по отдельным строкам. Числа разного статуса
          и разных условий нельзя сравнивать напрямую как «кто дальше».
        </p>
      </header>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 className="panel-title">Готовые наборы для сравнения</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn btn-sm" onClick={() => compare.set(p.ids)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {selected.length === 0 ? (
        <EmptyState title="Для сравнения ничего не выбрано">
          <p className="small">
            Отметьте системы кнопкой «Сравнить» в <a href={href('reference')}>справочнике</a> или выберите готовый набор выше.
          </p>
        </EmptyState>
      ) : (
        <>
          <div className="toolbar-meta">
            <span>
              Выбрано: <span className="mono">{selected.length}</span>
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selected.map((m) => (
                <button key={m.id} className="btn btn-sm btn-ghost" onClick={() => compare.toggle(m.id)}>
                  <IconClose size={14} /> {m.name}
                  <span className="visually-hidden"> — убрать из сравнения</span>
                </button>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => compare.set([])}>
                Очистить всё
              </button>
            </div>
          </div>

          <section className="panel" aria-labelledby="chart-h" style={{ marginBottom: 16 }}>
            <h2 id="chart-h" className="panel-title">
              Опубликованные значения · логарифмическая шкала
            </h2>
            <RangeChart missiles={selected} />
            <p className="xs muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Фигура маркера показывает статус числа, подпись — формулировку. Наведите курсор или переведите фокус на строку,
              чтобы увидеть условия и источник.
            </p>
          </section>

          <section aria-labelledby="table-h">
            <h2 id="table-h" className="visually-hidden">
              Таблица сравнения
            </h2>
            <p className="scroll-hint" aria-hidden="true">
              Таблицу можно прокручивать вбок →
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Таблица сравнения, прокручивается по горизонтали">
              <table className="table compare-table">
                <thead>
                  <tr>
                    <th scope="col">Параметр</th>
                    {selected.map((m) => (
                      <th key={m.id} scope="col">
                        <a href={href('reference', { tab: 'missiles', id: m.id })} style={{ color: 'var(--text)' }}>
                          {m.name}
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      {selected.map((m) => (
                        <td key={m.id}>{r.render(m)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );

  const aside = (
    <div className="fade-in">
      <DatasetNotice compact />
      <div style={{ height: 14 }} />
      <KindLegend />
      <div className="section-label">Как правильно читать сравнение</div>
      <ul className="small" style={{ paddingLeft: '1.1em' }}>
        <li>«Более N» — нижняя граница, а не максимум.</li>
        <li>Результат испытаний может быть получен на особой траектории и не равен максимальной дальности.</li>
        <li>Дальность зависит от нагрузки: одна и та же ракета с разной боевой частью летит на разное расстояние.</li>
        <li>Экспортные версии часто ограничены правилами экспортного контроля.</li>
      </ul>
      <div className="notice small">
        <IconWarn size={16} style={{ color: 'var(--amber)' }} />
        <p>Максимальная дальность не означает гарантированной эффективности на этом расстоянии.</p>
      </div>
      <div className="notice notice-teal small" style={{ marginTop: 12 }}>
        <IconInfo size={16} style={{ color: 'var(--teal)' }} />
        <p>
          Подробнее — в разделе <a href={href('methodology')}>«Методология и ограничения»</a>.{' '}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => navigate('reference')}>
            Вернуться в справочник
          </button>
        </p>
      </div>
    </div>
  );

  return <Workspace main={main} aside={aside} asideTitle="Как читать сравнение" />;
}
