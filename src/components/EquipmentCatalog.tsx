import { useMemo, useState } from 'react';
import { availability, CAT_RU, CATALOG, coverageTable, OPERATOR_RU, reachedBy, type CatCategory, type CatalogFamily, type CountValue, type OperatorPeriod } from '../data/reference/catalog';
import { MILESTONE_RU } from '../data/reference/missiles';
import type { Milestone } from '../data/reference/types';
import { formatPartialDate } from '../lib/format';
import { EmptyState, SourceLink, checkLabel } from './Common';

/**
 * Каталог техники: семейство → модификация → страна происхождения → эксплуатанты с периодами.
 * Реальные сведения только справочные: в игровой расчёт они не передаются.
 */

const count = (label: string, c: CountValue | null) => (
  <>
    <dt>{label}</dt>
    <dd>
      {c ? (
        <>
          {c.qualifier === 'about' ? 'около ' : c.qualifier === 'more-than' ? 'более ' : c.qualifier === 'up-to' ? 'до ' : ''}
          {c.value} {c.asOf ? `на ${formatPartialDate(c.asOf)}` : '(дата не указана)'} · <SourceLink id={c.sourceId} compact />
          {c.note && <div className="xs muted">{c.note}</div>}
        </>
      ) : (
        <span className="muted">не установлено</span>
      )}
    </dd>
  </>
);

function Operator({ o }: { o: OperatorPeriod }) {
  return (
    <div className="figure">
      <strong>{OPERATOR_RU[o.operator] ?? o.operator}</strong>{' '}
      <span className="mono small">
        {o.from ? formatPartialDate(o.from) : 'начало не установлено'} — {o.to ? formatPartialDate(o.to) : o.confirmedUntil ? `подтверждено до ${formatPartialDate(o.confirmedUntil)}` : 'окончание не установлено'}
      </span>
      <dl className="figure-meta">
        <dt>Источник</dt>
        <dd>
          <SourceLink id={o.sourceId} compact />
        </dd>
        <dt>Проверено</dt>
        <dd>
          <span className="mono">{o.check.date}</span> · {checkLabel(o.check.method)}
        </dd>
        {count('Заказано', o.ordered)}
        {count('Поставлено', o.delivered)}
        {count('В строю', o.inService)}
        <dt>Историческая база</dt>
        <dd>{o.entityIds.length ? o.entityIds.join(', ') : 'субъекта нет в базе с 1970 г.'}</dd>
      </dl>
      <div className="figure-note">{o.uncertainty}</div>
    </div>
  );
}

const MS = (m: Milestone) => (
  <li key={m.kind + m.date} className="small">
    <span className="mono">{formatPartialDate(m.date)}</span> — {MILESTONE_RU[m.kind]}
    {m.note ? ` (${m.note})` : ''} · <SourceLink id={m.sourceId} compact />
  </li>
);

export function EquipmentCatalog({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [cat, setCat] = useState<CatCategory | ''>('');
  const [origin, setOrigin] = useState('');
  const [year, setYear] = useState('');
  const [stage, setStage] = useState<Milestone['kind']>('service');
  const [opEntity, setOpEntity] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'coverage'>('list');
  const origins = [...new Set(CATALOG.map((f) => f.origin))];
  const y = Number(year);
  const list = useMemo(
    () =>
      CATALOG.filter((f) => {
        if (cat && f.category !== cat) return false;
        if (origin && f.origin !== origin) return false;
        if (q.trim() && !`${f.name} ${(f.altNames ?? []).join(' ')} ${f.variants.map((v) => v.name).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
        if (year && y > 1900 && !f.variants.some((v) => reachedBy(v, stage, y))) return false;
        if (opEntity && !f.variants.some((v) => v.operators.some((o) => o.operator === opEntity))) return false;
        return true;
      }),
    [cat, origin, q, year, y, stage, opEntity],
  );
  return (
    <div>
      <p className="small muted">
        Семейство, модификация, страна происхождения и эксплуатант хранятся раздельно. Наличие в каталоге не означает наличия у страны: принадлежность — только как период эксплуатации с источником и неопределённостью. Сведения сверены по поисковой выдаче.
      </p>
      <div className="tabs" role="tablist" aria-label="Вид каталога" style={{ marginBottom: 12 }}>
        <button role="tab" className="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>
          Семейства
        </button>
        <button role="tab" className="tab" aria-selected={view === 'coverage'} onClick={() => setView('coverage')}>
          Таблица покрытия
        </button>
      </div>
      {view === 'coverage' ? (
        <Coverage />
      ) : (
        <>
          <div className="toolbar">
            <label className="field field-search">
              <span className="field-label">Поиск</span>
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, Vulcan" />
            </label>
            <label className="field">
              <span className="field-label">Категория</span>
              <select className="select" value={cat} onChange={(e) => setCat(e.target.value as CatCategory | '')}>
                <option value="">Все</option>
                {(Object.keys(CAT_RU) as CatCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CAT_RU[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Страна происхождения</span>
              <select className="select" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">Все</option>
                {origins.map((o) => (
                  <option key={o} value={o}>
                    {OPERATOR_RU[o] ?? o}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Эксплуатант (подтверждённый период)</span>
              <select className="select" value={opEntity} onChange={(e) => setOpEntity(e.target.value)}>
                <option value="">Любой или не установлен</option>
                {Object.keys(OPERATOR_RU).map((o) => (
                  <option key={o} value={o}>
                    {OPERATOR_RU[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Достигла этапа к году</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <select className="select" style={{ minWidth: 130 }} value={stage} onChange={(e) => setStage(e.target.value as Milestone["kind"])} aria-label="Этап">
                  <option value="development">разработка</option>
                  <option value="test">испытание</option>
                  <option value="service">служба</option>
                </select>
                <input className="input mono" style={{ width: 90 }} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="год" aria-label="Год" />
              </span>
            </label>
          </div>
          <div className="toolbar-meta small muted" role="status">
            Найдено семейств: {list.length} из {CATALOG.length}
            {year ? ` · этап «${MILESTONE_RU[stage]}» не позднее ${year} г. (без записи этапа модификация не проходит фильтр)` : ''}
          </div>
          {list.length === 0 ? (
            <EmptyState title="Ничего не найдено">
              <p className="small">Измените фильтры. Отсутствие в каталоге не означает, что системы не существовало.</p>
            </EmptyState>
          ) : (
            <ul className="eq-list">
              {list.map((f) => (
                <li key={f.id}>
                  <button className="eq-item" aria-current={selected === f.id ? 'true' : undefined} onClick={() => onSelect(f.id)}>
                    <span>
                      <strong>{f.name}</strong>
                      {f.historicalTerm && <span className="xs muted"> · «{f.historicalTerm}»</span>}
                      <span className="xs muted" style={{ display: 'block' }}>
                        {CAT_RU[f.category]} · {OPERATOR_RU[f.origin] ?? f.origin} · модификаций: {f.variants.length}
                      </span>
                    </span>
                    <span className="xs muted">{f.variants.some((v) => v.operators.length) ? 'есть период эксплуатации' : 'эксплуатант не установлен'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Coverage() {
  const t = coverageTable();
  const countries = Object.keys(t.byCountry);
  return (
    <div>
      <p className="small">
        Число модификаций по категориям и десятилетиям первого известного этапа (в скобках — из них с периодом эксплуатации). Пустая клетка означает «в каталоге нет записей», а не «такой техники не было». Каталог расширяется
        по источникам; пробелы не заполняются выдуманными записями.
      </p>
      <div className="table-wrap">
        <table className="table xs">
          <thead>
            <tr>
              <th scope="col">Категория</th>
              {t.decades.map((d) => (
                <th key={d} scope="col">
                  {d === 1940 ? '≤1940-е' : `${d}-е`}
                </th>
              ))}
              <th scope="col">без даты</th>
            </tr>
          </thead>
          <tbody>
            {t.cats.map((c) => (
              <tr key={c}>
                <th scope="row">{CAT_RU[c]}</th>
                {t.decades.map((d) => {
                  const cell = t.byCat[c][d];
                  return <td key={d} className="mono">{cell.variants ? `${cell.variants} (${cell.withOperator})` : '·'}</td>;
                })}
                <td className="mono">{t.undated[c] || '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-label">Страна происхождения × категория (модификаций)</div>
      <div className="table-wrap">
        <table className="table xs">
          <thead>
            <tr>
              <th scope="col">Страна</th>
              {t.cats.map((c) => (
                <th key={c} scope="col">
                  {CAT_RU[c].split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map((o) => (
              <tr key={o}>
                <th scope="row">{OPERATOR_RU[o] ?? o}</th>
                {t.cats.map((c) => (
                  <td key={c} className="mono">
                    {t.byCountry[o][c] || '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xs muted">Известные пробелы: нет советских и российских бомбардировщиков, авиационных ракет и беспилотников; нет техники КНР, Индии, Израиля вне ракет; нет экспортных эксплуатантов (реестр SIPRI в этой сборке недоступен).</p>
    </div>
  );
}

export function EquipmentAside({ id }: { id: string | null }) {
  const f: CatalogFamily | undefined = CATALOG.find((x) => x.id === id);
  if (!f)
    return (
      <EmptyState title="Семейство не выбрано">
        <p className="small">Выберите семейство в списке, чтобы увидеть модификации, этапы, эксплуатантов и источники.</p>
      </EmptyState>
    );
  return (
    <div className="fade-in">
      <div className="eyebrow">{CAT_RU[f.category]}</div>
      <h2 className="detail-name">{f.name}</h2>
      {f.altNames && <p className="xs muted">Также: {f.altNames.join(', ')}</p>}
      {f.historicalTerm && <p className="small">Исторический термин: «{f.historicalTerm}».</p>}
      <p className="small">{f.description}</p>
      <p className="xs">Страна происхождения: {OPERATOR_RU[f.origin] ?? f.origin}. Это не перечень эксплуатантов.</p>
      {f.variants.map((v) => (
        <section key={v.id} style={{ marginTop: 14 }}>
          <div className="section-label">Модификация: {v.name}</div>
          {v.designation && <p className="xs muted">{v.designation}</p>}
          {v.milestones.length ? <ul className="plain">{v.milestones.map(MS)}</ul> : <p className="small muted">Этапы в источниках этой сборки не установлены.</p>}
          {v.operators.length ? v.operators.map((o, i) => <Operator key={i} o={o} />) : <p className="small muted">Эксплуатанты с периодами не установлены.</p>}
          {v.note && <p className="xs muted">{v.note}</p>}
          {v.operators.some((o) => o.entityIds.length) && (
            <p className="xs muted">
              Пример проверки для редактора сценариев: на 01.01.1990 — {availability(v.id, v.operators.find((o) => o.entityIds.length)!.entityIds[0], '1990-01-01').text}
            </p>
          )}
        </section>
      ))}
      <p className="xs muted">Реальные характеристики в игровой расчёт не передаются: в редакторе такое название — только подпись к условному игровому профилю.</p>
    </div>
  );
}
