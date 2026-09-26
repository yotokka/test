import type { ReactNode } from 'react';
import { CATEGORY_RU, DATASET_RU, VERIFICATION_RU, eventTitle } from '../../history/describe';
import type { HistoryEngine } from '../../history/engine';
import { ruName } from '../../history/names-ru';
import { histSource } from '../../history/sources';
import { dayOf, fmtDay, fmtWithPrecision } from '../../history/time';
import { TREATY_STATUS_RU } from '../../history/treaties';
import type { HistEvent, Verification } from '../../history/types';
import { IconExternal, IconWarn } from '../Icons';

const STATUS_RU: Record<string, string> = {
  independent: 'независимое государство (по кодированию CShapes)',
  colony: 'колония',
  protectorate: 'протекторат',
  mandate: 'подмандатная территория',
};

export function VerificationBadge({ v }: { v: Verification }) {
  const cls = v === 'dataset-import' ? 'kind-estimate' : v === 'document-verified' ? 'kind-claim' : v === 'conflicting' ? 'kind-conflict' : 'kind-none';
  const mark = v === 'dataset-import' ? '●' : v === 'document-verified' ? '■' : v === 'conflicting' ? '◆' : '○';
  return (
    <span className={`kind ${cls}`}>
      <span aria-hidden="true">{mark}</span> {VERIFICATION_RU[v]}
    </span>
  );
}

function Gap({ children }: { children: ReactNode }) {
  return (
    <span className="gap-note">
      <span aria-hidden="true">∅ </span>
      {children}
    </span>
  );
}

function SourceLine({ id, locator }: { id: string; locator: string }) {
  const s = histSource(id);
  return (
    <li className="xs">
      <a href={s.url} target="_blank" rel="noopener noreferrer">
        {s.title}
        <span className="visually-hidden"> (откроется в новой вкладке)</span> <IconExternal size={11} />
      </a>
      <div className="muted">
        {s.version}. Место: <span className="mono">{locator}</span>
      </div>
    </li>
  );
}

export function EntityCard({
  engine,
  id,
  day,
  showUnverified,
  onEvent,
  onEntity,
}: {
  engine: HistoryEngine;
  id: string;
  day: number;
  showUnverified: boolean;
  onEvent: (e: HistEvent) => void;
  onEntity: (id: string) => void;
}) {
  const v = engine.entityView(id, day);
  if (!v) return <p className="small muted">Субъект не найден в базе.</p>;
  const rec = v.record;
  const composite = /\(.+\)/.test(v.name.source);
  const nameOf = (x: string, d: number) => engine.entityName(x, d).ru;
  return (
    <article className="fade-in hcard" aria-label={`Карточка: ${v.name.ru}`}>
      <div className="eyebrow">
        <span className={`led ${v.exists ? 'led-on' : ''}`} aria-hidden="true" /> на {fmtDay(day)}
      </div>
      <h3 className="detail-name">{v.name.ru}</h3>
      <div className="card-variant">В источнике: {v.name.source}</div>
      {composite && <p className="xs muted">Составное название источника относится ко всему периоду записи; дата официального переименования в использованных наборах не закодирована.</p>}
      {!v.exists && (
        <div className="notice notice-coral small" style={{ margin: '10px 0' }}>
          <IconWarn size={16} style={{ color: 'var(--coral)' }} />
          <p>На эту дату субъект отсутствует и в геометрии CShapes, и в списке GW.</p>
        </div>
      )}
      <dl className="dl" style={{ marginTop: 12 }}>
        <dt>Статус</dt>
        <dd>
          {rec ? STATUS_RU[rec.status] : v.inGw ? 'в списке независимых государств GW' : <Gap>нет записи</Gap>}
          {v.owner && (
            <div className="xs">
              владелец в наборе:{' '}
              <button className="link-btn" onClick={() => onEntity(v.owner!)}>
                {nameOf(v.owner, day)}
              </button>
            </div>
          )}
        </dd>
        <dt>Столица</dt>
        <dd>{rec ? <>{rec.cap} <span className="xs muted">(написание источника)</span></> : <Gap>нет данных — нет записи геометрии</Gap>}</dd>
        <dt>Геометрия</dt>
        <dd>
          {rec ? (
            <>
              запись CShapes <span className="mono">fid {rec.fid}</span>: {rec.start} — {rec.end === '2019-12-31' ? 'конец покрытия набора' : rec.end}
              {!v.mapCovered && <div className="xs" style={{ color: 'var(--coral)' }}>после 2019-12-31 не подтверждена</div>}
            </>
          ) : v.entity.records.length ? (
            <Gap>на эту дату записи нет (пробел кодирования или субъект ещё/уже не существует)</Gap>
          ) : (
            <Gap>в CShapes геометрии нет (например, микрогосударство)</Gap>
          )}
        </dd>
        <dt>Список GW</dt>
        <dd>
          {v.inGw ? (
            <>
              входит с {v.gwPeriod?.from}
              {v.gwPeriod?.microstate ? ', микрогосударство' : ''}
              <div className="xs muted">включение в академический список — не признание и не членство в ООН</div>
            </>
          ) : v.entity.gw.length ? (
            'не входит на эту дату'
          ) : (
            <Gap>не входит (зависимая территория или нет в списке)</Gap>
          )}
        </dd>
        <dt>Руководитель</dt>
        <dd>
          {!v.leadersCovered ? (
            <Gap>нет данных после 31.12.2015 (конец охвата Archigos)</Gap>
          ) : v.leader ? (
            <>
              {v.leader.name} <span className="xs muted">с {v.leader.start} (Archigos)</span>
            </>
          ) : (
            <Gap>не установлен в Archigos на эту дату</Gap>
          )}
        </dd>
        <dt>Конфликты</dt>
        <dd>
          {!v.conflictsCovered ? (
            <Gap>нет данных после 31.12.{new Date(engine.ucdpEnd * 86_400_000).getUTCFullYear()} (конец охвата UCDP)</Gap>
          ) : v.conflicts.length ? (
            <ul className="plain">
              {v.conflicts.map(({ ep, sides }) => (
                <li key={ep.id} className="small">
                  UCDP №{ep.conflictId}: эпизод с {ep.start}
                  {ep.endKnown ? '' : ', окончание не записано до конца охвата'} · сторона {sides.a.includes(id) ? 'A' : 'B'}
                  <span className="xs muted"> (по записи {new Date(day * 86_400_000).getUTCFullYear()} г.)</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="small">активных эпизодов в UCDP нет</span>
          )}
        </dd>
        <dt>Договоры</dt>
        <dd>
          {v.treaties.length === 0 ? (
            <Gap>нет проверенных данных</Gap>
          ) : showUnverified ? (
            <ul className="plain">
              {v.treaties.map(({ treaty, status }) => (
                <li key={treaty.id} className="small">
                  {treaty.ru}: {TREATY_STATUS_RU[status ?? 'none']} <span className="kind kind-none">требует проверки</span>
                </li>
              ))}
            </ul>
          ) : (
            <Gap>
              подтверждённых нет; {v.treaties.length} записей требуют проверки (включите «Показывать требующее проверки»)
            </Gap>
          )}
        </dd>
        <dt>Организации</dt>
        <dd>
          <Gap>не установлено — нет проверенного источника</Gap>
        </dd>
        <dt>Дипотношения</dt>
        <dd>
          <Gap>не установлено — нет проверенного источника</Gap>
        </dd>
        <dt>Флаг</dt>
        <dd>
          <Gap>не показывается — нет проверенного набора</Gap>
        </dd>
      </dl>

      {(v.entity.predecessors.length > 0 || v.entity.successors.length > 0) && (
        <>
          <div className="section-label">Преемственность (по пересечению геометрий)</div>
          <ul className="plain small">
            {v.entity.predecessors.map((p) => (
              <li key={`p${p.id}${p.on}`}>
                ← <button className="link-btn" onClick={() => onEntity(p.id)}>{nameOf(p.id, dayOf(p.on) - 1)}</button> <span className="xs muted">({p.on}, общая площадь ≈ {p.overlapKm2.toLocaleString('ru-RU')} км²)</span>
              </li>
            ))}
            {v.entity.successors.map((p) => (
              <li key={`s${p.id}${p.on}`}>
                → <button className="link-btn" onClick={() => onEntity(p.id)}>{nameOf(p.id, dayOf(p.on))}</button> <span className="xs muted">({p.on})</span>
              </li>
            ))}
          </ul>
          <p className="xs muted">Связь вычислена по геометрии CShapes и не является юридической оценкой правопреемства.</p>
        </>
      )}

      <div className="section-label">Ближайшие события</div>
      {v.prevEvents.length + v.nextEvents.length === 0 ? (
        <p className="small muted">Событий с участием субъекта в базе нет.</p>
      ) : (
        <ul className="plain">
          {[...v.prevEvents.map((e) => ['←', e] as const), ...v.nextEvents.map((e) => ['→', e] as const)]
            .filter(([, e]) => showUnverified || e.verification !== 'needs-check')
            .map(([arrow, e]) => (
              <li key={e.id} className="small">
                <button className="link-btn" onClick={() => onEvent(e)}>
                  {arrow} {fmtWithPrecision(e.date, e.precision).text}: {eventTitle(e, engine)}
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="section-label">Источники карточки</div>
      <ul className="plain">
        {rec && <SourceLine id="cshapes-gw" locator={`fid ${rec.fid}`} />}
        {v.entity.gw.length > 0 && <SourceLine id="gw-states" locator={`gwcode ${v.entity.code}`} />}
        {v.leader && <SourceLine id="archigos" locator={`obsid ${v.leader.id}`} />}
      </ul>
    </article>
  );
}

export function EventCard({ engine, event, onEntity, onGo }: { engine: HistoryEngine; event: HistEvent; onEntity: (id: string) => void; onGo: (e: HistEvent) => void }) {
  const when = fmtWithPrecision(event.date, event.precision);
  const d = dayOf(event.date);
  return (
    <article className="fade-in hcard" aria-label="Карточка события">
      <div className="eyebrow">
        <span className="led led-amber" aria-hidden="true" /> {CATEGORY_RU[event.category]} · {DATASET_RU[event.dataset] ?? event.dataset}
      </div>
      <h3 className="detail-name">{eventTitle(event, engine)}</h3>
      <dl className="dl" style={{ marginTop: 10 }}>
        <dt>Когда</dt>
        <dd>
          <span className="mono">{when.text}</span>
          <div className="xs muted">{when.note}</div>
        </dd>
        <dt>Статус</dt>
        <dd>
          <VerificationBadge v={event.verification} />
        </dd>
        <dt>Участники</dt>
        <dd>
          {event.entities.length === 0 ? (
            <span className="small muted">многосторонний; состав не импортирован</span>
          ) : (
            event.entities.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <button className="link-btn" onClick={() => onEntity(id)}>
                  {ruName(engine.entityName(id, d).source)}
                </button>
              </span>
            ))
          )}
        </dd>
        <dt>Ключевое</dt>
        <dd className="small">{event.key ? 'да — по критериям методологии' : 'нет'}</dd>
      </dl>
      {(event.conflict || event.conflicts) && (
        <div className="notice notice-coral small" style={{ marginTop: 12 }}>
          <IconWarn size={16} style={{ color: 'var(--coral)' }} />
          <div>
            <p>
              <strong>Источники расходятся.</strong>
            </p>
            {event.conflict && <p>{event.conflict.note}</p>}
            {event.conflicts?.map((c) => (
              <p key={c.entity}>
                {ruName(engine.entityName(c.entity, d).source)}: {c.note}
              </p>
            ))}
            <p className="xs">Атлас хранит обе версии: карта следует датам CShapes, членство в списке — датам GW.</p>
          </div>
        </div>
      )}
      <div className="section-label">Что изменилось в атласе</div>
      <ul className="plain small">
        {event.changes.map((c, i) => (
          <li key={i}>
            {c.entity && <strong>{ruName(engine.entityName(c.entity, d - (c.kind === 'disappear' ? 1 : 0)).source)}: </strong>}
            {c.text}
          </li>
        ))}
      </ul>
      {event.noGeometry && <p className="xs muted">Геометрии этого субъекта в CShapes нет — на карте изменение не отражается.</p>}
      <div className="section-label">Источники</div>
      <ul className="plain">
        {event.sources.map((s, i) => (
          <SourceLine key={i} id={s.id} locator={s.locator} />
        ))}
      </ul>
      <p className="xs muted">
        Добавлено в базу: {event.recordedAt}, сборка {engine.data.manifest.buildId}. Технический порядок применения в этот день: {event.tech}.
      </p>
      <button className="btn btn-sm" onClick={() => onGo(event)}>
        Перейти к дате события
      </button>
    </article>
  );
}
