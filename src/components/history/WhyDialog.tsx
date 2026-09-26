import { useEffect, useRef } from 'react';
import type { HistoryEngine } from '../../history/engine';
import { ruName } from '../../history/names-ru';
import { HIST_SOURCES, histSource } from '../../history/sources';
import { dayOf, fmtDay, isoOf } from '../../history/time';
import { IconClose, IconExternal } from '../Icons';

/** «Почему карта выглядит так?» — источники геометрии, спорные участки и пробелы на выбранную дату. */
export function WhyDialog({ engine, day, open, onClose }: { engine: HistoryEngine; day: number; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const iso = isoOf(day);
  const cs = engine.data.manifest.datasets['cshapes-gw'] as unknown as { version: string; md5?: string; simplification: { quantile: number; protectedPoints: number; fullyProtectedArcs: number } };
  const state = engine.stateAt(day);
  const disputed = engine.disputedAt(day);
  const noGeom = [...state.gw].filter((id) => !engine.entities.get(id)!.records.some((f) => state.recs.has(f)));
  const near = engine.events.filter((e) => e.verification === 'conflicting' && Math.abs(dayOf(e.date) - day) <= 45);
  const deps = [...state.recs].map((f) => engine.records.get(f)!).filter((r) => r.status !== 'independent');

  return (
    <dialog ref={ref} className="hdialog" aria-labelledby="why-h" onClose={onClose} onCancel={onClose}>
      <div className="hdialog-head">
        <h2 id="why-h">Почему карта выглядит так на {fmtDay(day)}?</h2>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          <IconClose size={16} /> Закрыть
        </button>
      </div>
      <div className="hdialog-body prose">
        <h3>Геометрия государств и зависимых территорий</h3>
        <p>
          Источник — <strong>CShapes 2.0</strong>, вариант кодирования <strong>Gleditsch &amp; Ward</strong> с зависимыми территориями
          ({cs.version}; MD5 {cs.md5}). На эту дату действует записей: <span className="mono">{state.recs.size}</span>, из них зависимых
          территорий: <span className="mono">{deps.length}</span> (показаны лавандовой штриховкой).
        </p>
        {day > engine.mapEnd ? (
          <p className="warn-line">
            Дата позже конца покрытия набора (31.12.2019). Контуры — последний снимок CShapes; они не подтверждены для этой даты и
            показаны пунктиром без заливки.
          </p>
        ) : (
          <p>Границы меняются дискретно в даты записей набора и не интерполируются между ними.</p>
        )}
        <p>
          Геометрия упрощена для обзорной карты (Visvalingam, квантиль {cs.simplification.quantile}; защищено {cs.simplification.protectedPoints}{' '}
          опорных точек, {cs.simplification.fullyProtectedArcs} дуг сохранены полностью, чтобы не потерять острова). Проекция Natural Earth I.
          Это обзорная карта: по ней нельзя измерять расстояния или определять точное прохождение границы.
        </p>

        <h3>Спорные участки на эту дату</h3>
        {disputed.length === 0 ? (
          <p>Размеченных спорных участков на эту дату нет. Это не означает, что спорных территорий нет: в этой сборке размечены только три участка, где CShapes меняет принадлежность территории (Западная Сахара, Восточный Тимор, Крым).</p>
        ) : (
          disputed.map((d) => (
            <div key={d.id} className="figure" style={{ marginBottom: 10 }}>
              <strong>
                {d.ru} <span className="xs muted">· коралловая штриховка · с {d.from}</span>
              </strong>
              <ul>
                {d.positions.map((p) => (
                  <li key={p.date + p.text} className="small">
                    <span className="mono">{p.date}</span> — {p.text} <span className="xs muted">(позиция: {histSource(p.source).title})</span>
                  </li>
                ))}
              </ul>
              <p className="small">{d.status}</p>
              <p className="xs muted">
                Контур участка: {d.geometrySource}. Площадь ≈ {d.areaKm2.toLocaleString('ru-RU')} км².
              </p>
            </div>
          ))
        )}
        <p className="small">
          Слой «фактический контроль» недоступен: для него нет отдельного подходящего набора. Другие территориальные претензии (например, в
          Кашмире) в этой сборке не размечены.
        </p>

        <h3>Пробелы и расхождения рядом с этой датой</h3>
        {near.length === 0 ? (
          <p className="small">Расхождений дат между CShapes и списком GW в пределах 45 дней нет.</p>
        ) : (
          <ul>
            {near.map((e) => (
              <li key={e.id} className="small">
                <span className="mono">{e.date}</span>: {e.conflict?.note ?? e.conflicts?.map((c) => `${ruName(engine.entityName(c.entity, dayOf(e.date)).source)} — ${c.note}`).join(' ')}
              </li>
            ))}
          </ul>
        )}
        {noGeom.length > 0 && (
          <p className="small">
            В списке GW на эту дату есть субъекты без геометрии в CShapes ({noGeom.length}): {noGeom.slice(0, 12).map((id) => ruName(engine.entityName(id, day).source)).join(', ')}
            {noGeom.length > 12 ? ' и др.' : ''}. На карте они не отображаются; включение в академический список не означает признания.
          </p>
        )}
        <p className="small">
          В отдельные дни территория может не входить ни в одну запись (например, 03–11.06.2006 для Черногории, 21–25.12.1991 для части бывшего
          СССР): тогда видна только нейтральная подложка суши.
        </p>

        <h3>Физическая подложка</h3>
        <p className="small">
          Natural Earth 1:110m land (4.1.0) — современная суша без политических границ и подписей. Это не реконструкция береговой линии
          прошлых лет; на побережьях возможны несовпадения с контурами CShapes.
        </p>

        <h3>Условия использования</h3>
        <ul>
          {HIST_SOURCES.filter((s) => s.included && s.method === 'dataset-import').map((s) => (
            <li key={s.id} className="small">
              <a href={s.homepage ?? s.url} target="_blank" rel="noopener noreferrer">
                {s.title} <IconExternal size={11} />
              </a>
              : {s.license}
            </li>
          ))}
        </ul>
        <p className="xs muted">
          Сборка данных {engine.data.manifest.buildId}, импорт {engine.data.manifest.importedAt}. Объединённый набор нельзя считать свободным для
          любого использования: действуют условия каждого источника, в том числе некоммерческие условия CShapes. Дата: {iso}.
        </p>
      </div>
    </dialog>
  );
}
