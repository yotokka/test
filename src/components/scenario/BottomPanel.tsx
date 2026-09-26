import { useEffect, useMemo, useState } from 'react';
import { whyChain } from '../../game/engine';
import { RULE_BY_ID } from '../../game/rules';
import type { GameEvent } from '../../game/types';
import type { HistoryEngine } from '../../history/engine';
import { eventTitle } from '../../history/describe';
import { addCalendar, dayOf, fmtDay, isoOf } from '../../history/time';
import type { BranchState } from '../../scenario/branch';
import { EDIT_RU } from '../../scenario/branch';
import { PROV_RU, PROV_SHORT, type Prov } from '../../scenario/labels';
import { EVENT_KIND_RU, PLAYBACK_SPEEDS } from '../../scenario/settings';
import { episodeClock } from '../../scenario/setup';
import type { ScenarioDoc } from '../../scenario/types';
import type { Issue } from '../../scenario/validate';
import { IconPause, IconPlay, IconRepeat } from '../Icons';
import type { Episode } from './useEpisode';

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function ProvBadge({ p }: { p: Prov }) {
  return (
    <span className={`sc-prov sc-prov-${p}`} title={PROV_RU[p]}>
      {PROV_SHORT[p]}
    </span>
  );
}

/* ———— Шкала эпизода (секунды и минуты) ———— */

export function EpisodeBar({ doc, ep, onBranchHere, onSpeed }: { doc: ScenarioDoc; ep: Episode; onBranchHere: () => void; onSpeed: (v: number) => void }) {
  const dur = doc.episode.durationS;
  const ticks = ep.log.filter((e) => e.detail === 1 && ['interaction', 'separation', 'launch', 'outcome', 'decision'].includes(e.kind));
  const clock = episodeClock(doc, ep.displayT);
  return (
    <div className="sc-timebar" aria-label="Время эпизода">
      <div className="sc-clock">
        <span className="hclock-date">{clock.time}</span>
        <span className="xs muted mono">
          {fmtDay(dayOf(clock.date))} UTC · t = {mmss(ep.displayT)} из {mmss(dur)}
        </span>
      </div>
      <div className="transport" role="group" aria-label="Управление эпизодом">
        <button className="btn btn-primary" onClick={ep.toggle} aria-keyshortcuts="Space">
          {ep.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          {ep.playing ? 'Пауза' : ep.finished ? 'Сначала' : 'Запуск'}
        </button>
        <button className="btn btn-sm" onClick={ep.stepOnce} disabled={ep.finished} title="Один шаг модели (0,5 с)" aria-keyshortcuts=".">
          Шаг 0,5 с
        </button>
        <button className="btn btn-sm" onClick={() => ep.seek(ep.t + 10)} disabled={ep.finished}>
          +10 с
        </button>
        <button className="btn btn-sm" onClick={() => ep.seek(ep.t - 10)} disabled={ep.t <= 0}>
          −10 с
        </button>
        <button className="btn btn-sm" onClick={ep.replay} title="Повтор с тем же начальным состоянием, зерном, погодой и командами">
          <IconRepeat size={14} /> Повтор
        </button>
        <button className="btn btn-sm" onClick={onBranchHere} title="Новая ветка: команды до этого момента сохраняются, дальше — новые решения">
          ⎇ Новая ветка отсюда
        </button>
        <label className="xs muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Скорость показа
          <select className="select" style={{ width: 'auto', minHeight: 32, padding: '2px 28px 2px 8px' }} value={doc.settings.playbackSpeed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Скорость показа эпизода">
            {PLAYBACK_SPEEDS.map((v) => (
              <option key={v} value={v}>
                ×{String(v).replace('.', ',')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sc-scrub">
        <svg viewBox="0 0 1000 18" preserveAspectRatio="none" aria-hidden="true" className="sc-scrub-svg">
          <rect x={0} y={7} width={1000} height={4} fill="#2D3948" />
          <rect x={0} y={7} width={(ep.horizon / dur) * 1000} height={4} fill="#83B8AE" fillOpacity={0.35} />
          {ticks.map((e) => (
            <line key={e.seq} x1={(e.t / dur) * 1000} x2={(e.t / dur) * 1000} y1={2} y2={16} stroke={e.kind === 'interaction' || e.kind === 'outcome' ? '#D58D86' : e.kind === 'separation' || e.kind === 'launch' ? '#D5AD75' : '#AAA0C8'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={(ep.displayT / dur) * 1000} x2={(ep.displayT / dur) * 1000} y1={0} y2={18} stroke="#D5AD75" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <label className="visually-hidden" htmlFor="sc-scrub">
          Момент эпизода, секунды
        </label>
        <input id="sc-scrub" className="htl-range" type="range" min={0} max={dur} step={0.5} value={ep.displayT} aria-valuetext={`${mmss(ep.displayT)} от начала`} onChange={(e) => ep.seek(Number(e.target.value))} />
      </div>
      <div className="xs muted">
        Перемотка идёт по сохранённому журналу: состояние восстанавливается из контрольного снимка и тех же команд. Скорость показа (×{String(doc.settings.playbackSpeed).replace('.', ',')}) на расчёт не влияет
        {ep.behind ? ' — показ замедлен: расчёт не успевает за выбранной скоростью, шаги не пропускаются' : ''}.
        {ep.stopped && <span style={{ color: 'var(--amber)' }}> Автопауза: {EVENT_KIND_RU[ep.stopped.kind].toLowerCase()} — «{ep.stopped.title}».</span>}
        {ep.finished && <span> Эпизод завершён: {ep.finishReason}.</span>}
      </div>
      {ep.replayCheck && (
        <div className={`notice ${ep.replayCheck.a === ep.replayCheck.b ? 'notice-teal' : 'notice-coral'} xs`} role="status">
          Повтор с тем же начальным состоянием: отпечаток журнала <span className="mono">{ep.replayCheck.a}</span> {ep.replayCheck.a === ep.replayCheck.b ? '— совпал.' : `≠ ${ep.replayCheck.b}`}{' '}
          <button className="link-btn" onClick={ep.clearReplayCheck}>
            скрыть
          </button>
        </div>
      )}
    </div>
  );
}

/* ———— Календарь ветки (дни, месяцы, годы) ———— */

export function CalendarBar({ doc, onDate, bs }: { doc: ScenarioDoc; onDate: (iso: string) => void; bs: BranchState | null }) {
  const day = dayOf(doc.episode.date);
  const fork = doc.world.kind === 'historical' ? dayOf(doc.world.forkDate) : null;
  const go = (unit: 'day' | 'month' | 'year', n: number) => {
    const d = addCalendar(day, unit, n);
    if (fork !== null && d < fork) return;
    onDate(isoOf(d));
  };
  return (
    <div className="sc-timebar" aria-label="Календарь ветки">
      <div className="sc-clock">
        <span className="hclock-date">{fmtDay(day)}</span>
        <span className="xs muted mono">{doc.episode.startTime} UTC — начало эпизода</span>
      </div>
      {doc.world.kind === 'historical' ? (
        <>
          <div className="transport" role="group" aria-label="Дата эпизода в ветке">
            <button className="btn btn-sm" onClick={() => go('year', -1)} disabled={fork !== null && addCalendar(day, 'year', -1) < fork}>
              −год
            </button>
            <button className="btn btn-sm" onClick={() => go('month', -1)} disabled={fork !== null && addCalendar(day, 'month', -1) < fork}>
              −мес
            </button>
            <button className="btn btn-sm" onClick={() => go('day', -1)} disabled={fork !== null && day - 1 < fork}>
              −день
            </button>
            <button className="btn btn-sm" onClick={() => go('day', 1)}>
              +день
            </button>
            <button className="btn btn-sm" onClick={() => go('month', 1)}>
              +мес
            </button>
            <button className="btn btn-sm" onClick={() => go('year', 1)}>
              +год
            </button>
          </div>
          <div className="xs muted">
            Исторический календарь ветки: точка ветвления {fmtDay(fork!)}; с неё применено исторических событий — {bs?.applied.length ?? 0}, пропущено — {bs?.skipped.length ?? 0}. Воздушный эпизод идёт в секундах и минутах в режиме «Воспроизведение сценария»: календарное ускорение к нему не применяется.
          </div>
        </>
      ) : (
        <div className="xs muted">Испытательная сцена вне исторического календаря: дата нужна только для подписи эпизода.</div>
      )}
    </div>
  );
}

/* ———— Журналы и очередь ———— */

type Tab = 'log' | 'queue' | 'branch' | 'check' | 'changes';

export function BottomTabs({
  doc,
  mode,
  ep,
  engine,
  bs,
  issues,
  onWhy,
  onGoto,
  onAuthorize,
  onFixIssue,
}: {
  doc: ScenarioDoc;
  mode: 'edit' | 'play';
  ep: Episode | null;
  engine: HistoryEngine | null;
  bs: BranchState | null;
  issues: Issue[];
  onWhy: (seq: number) => void;
  onGoto: (objectId: string, t?: number) => void;
  onAuthorize: (side: string, objectId: string, ok: boolean) => void;
  onFixIssue: (i: Issue) => void;
}) {
  const [tab, setTab] = useState<Tab>(mode === 'play' ? 'log' : 'check');
  useEffect(() => setTab(mode === 'play' ? 'log' : 'check'), [mode]);
  const [provF, setProvF] = useState<Set<Prov>>(new Set(['fact', 'user', 'model', 'assumption']));
  const [q, setQ] = useState('');
  const errors = issues.filter((i) => i.level === 'error').length;
  const pending = ep?.pending ?? [];
  const detail = doc.settings.logDetail;
  const log = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (ep?.log ?? []).filter((e) => e.detail <= detail && provF.has(e.prov) && (!qq || `${e.title} ${e.reason}`.toLowerCase().includes(qq)));
  }, [ep?.log, ep?.log.length, detail, provF, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleProv = (p: Prov) => {
    const n = new Set(provF);
    if (n.has(p)) n.delete(p);
    else n.add(p);
    setProvF(n);
  };
  const tabs: [Tab, string][] = [
    ['log', `Журнал эпизода${ep ? ` · ${ep.log.length}` : ''}`],
    ['queue', `Очередь действий${pending.length ? ` · ${pending.length}` : ''}`],
    ['branch', 'Ветка и история'],
    ['check', `Проверка${errors ? ` · ${errors} ош.` : ''}`],
    ['changes', `Изменения · ${doc.changeLog.length}`],
  ];
  const name = (id: string) => doc.participants.find((p) => p.id === id)?.name ?? id;
  const objLabel = (id: string) => ep?.ents.find((e) => e.id === id)?.label ?? doc.objects.find((o) => o.id === id)?.label ?? id;

  return (
    <section className="sc-bottom-tabs" aria-label="Журнал, очередь действий и проверка">
      <div className="tabs" role="tablist" aria-label="Нижняя панель">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sc-legend xs" aria-label="Происхождение записей">
        {(['fact', 'user', 'model', 'assumption'] as Prov[]).map((p) => (
          <span key={p}>
            <ProvBadge p={p} /> {PROV_RU[p]}
          </span>
        ))}
      </div>

      {tab === 'log' &&
        (!ep ? (
          <p className="small muted">Журнал эпизода появится после запуска («Воспроизведение сценария»).</p>
        ) : (
          <>
            <div className="filter-row" style={{ margin: '6px 0' }}>
              {(['user', 'model', 'assumption'] as Prov[]).map((p) => (
                <button key={p} className="btn btn-sm" aria-pressed={provF.has(p)} onClick={() => toggleProv(p)}>
                  {PROV_RU[p]}
                </button>
              ))}
              <input className="input" style={{ maxWidth: 220 }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в журнале" aria-label="Поиск в журнале" />
              <span className="xs muted">подробность: {['', 'главное', 'обычная', 'всё'][detail]}</span>
            </div>
            <ol className="sc-log" aria-live="off">
              {log
                .slice(-300)
                .reverse()
                .map((e) => (
                  <LogRow key={e.seq} e={e} onWhy={onWhy} onGoto={onGoto} label={objLabel} />
                ))}
            </ol>
            {log.length === 0 && <p className="small muted">Записей по фильтру нет.</p>}
          </>
        ))}

      {tab === 'queue' && (
        <div>
          {doc.settings.control === 'auto' && <p className="xs muted">Управление автоматическое: решения не ждут подтверждения. Ручной режим включается в расширенных настройках.</p>}
          {pending.length === 0 ? (
            <p className="small muted">Очередь пуста.</p>
          ) : (
            <ul className="sc-queue">
              {pending.map((p) => (
                <li key={`${p.side}-${p.objectId}`}>
                  <span className="small">
                    {name(p.side)} → {objLabel(p.objectId)} <span className="xs muted">ждёт с {mmss(p.since)}</span>
                  </span>
                  <span className="transport">
                    <button className="btn btn-sm btn-primary" onClick={() => onAuthorize(p.side, p.objectId, true)}>
                      Разрешить
                    </button>
                    <button className="btn btn-sm" onClick={() => onAuthorize(p.side, p.objectId, false)}>
                      Отклонить
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => onWhy(p.decisionSeq)}>
                      Почему?
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="section-label">Команды, записанные в сценарии ({doc.commands.length})</div>
          <ol className="xs sc-cmds">
            {doc.commands.map((c) => (
              <li key={c.id}>
                <span className="mono">{mmss(c.t)}</span> <ProvBadge p="user" /> {c.type} · {'objectId' in c ? objLabel(c.objectId) : 'unitId' in c ? objLabel(c.unitId) : ''}
              </li>
            ))}
          </ol>
          <p className="xs muted">Немедленные команды (возврат, ожидание, высота, скорость, отделение, режим поста, разрешение) применяются в текущий момент. Состав объектов, погода и настройки — изменения начального состояния: для них нужна пауза и новая ветка.</p>
        </div>
      )}

      {tab === 'branch' && <BranchTab doc={doc} engine={engine} bs={bs} />}

      {tab === 'check' && (
        <div>
          {issues.length === 0 ? (
            <p className="small">Проверка пройдена: несовместимых настроек нет.</p>
          ) : (
            <ul className="sc-issues">
              {issues.map((i, n) => (
                <li key={n} className={`sc-issue sc-issue-${i.level}`}>
                  <span className="xs">{i.level === 'error' ? 'Ошибка' : i.level === 'warn' ? 'Предупреждение' : 'Подсказка'}</span> {i.text}{' '}
                  {(i.objectId || i.field) && (
                    <button className="link-btn xs" onClick={() => onFixIssue(i)}>
                      показать
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'changes' && (
        <ol className="xs sc-changes">
          {[...doc.changeLog].reverse().slice(0, 200).map((c, i) => (
            <li key={i}>
              <span className="mono muted">{c.at.slice(0, 19).replace('T', ' ')}</span> <ProvBadge p={c.prov} /> {c.label}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LogRow({ e, onWhy, onGoto, label }: { e: GameEvent; onWhy: (seq: number) => void; onGoto: (id: string, t?: number) => void; label: (id: string) => string }) {
  const target = e.objectId ?? e.unitId;
  return (
    <li className="sc-log-row" data-kind={e.kind}>
      <span className="log-tick mono">{mmss(e.t)}</span>
      <ProvBadge p={e.prov} />
      <div>
        <div className="small">
          {e.title} {e.rule && <span className="rule-chip">{e.rule}</span>}
        </div>
        <div className="xs muted">{e.reason}</div>
        <div className="transport" style={{ gap: 4 }}>
          {(e.causes.length > 0 || e.conditions?.length) && (
            <button className="link-btn xs" onClick={() => onWhy(e.seq)}>
              Почему?
            </button>
          )}
          {target && (
            <button className="link-btn xs" onClick={() => onGoto(target, e.t)}>
              К объекту {label(target)}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function BranchTab({ doc, engine, bs }: { doc: ScenarioDoc; engine: HistoryEngine | null; bs: BranchState | null }) {
  if (doc.world.kind !== 'historical' || !engine || !bs)
    return <p className="small muted">Испытательная сцена не связана с исторической хронологией: здесь нет исторических фактов, только действия пользователя, игровая модель и допущения.</p>;
  const w = doc.world;
  return (
    <div className="sc-branch">
      <p className="xs">
        Ветка «{doc.branch.name}»{doc.branch.parent ? ` от «${doc.branch.parent.name}»` : ''}. Точка ветвления {w.forkDate}, правило:{' '}
        {w.policy === 'stop' ? 'исторические изменения после точки ветвления остановлены' : 'продолжаются совместимые исторические события'}. Сборка исторических данных{' '}
        <span className="mono">{doc.historyBuildId}</span>. Историческая база не изменяется: для сравнения включите слой «Сравнить с историей» или откройте режим «Историческое воспроизведение».
      </p>
      <div className="htl-lists">
        <div>
          <div className="section-label" style={{ marginTop: 0 }}>
            Изменения пользователя и допущения
          </div>
          <ol className="tl-list">
            {w.edits.map((e) => (
              <li key={e.id} className="tl-item">
                <span className="log-tick mono">{e.day}</span>
                <div className="small">
                  <ProvBadge p={e.kind === 'assumption' ? 'assumption' : 'user'} /> {EDIT_RU[e.kind]}
                  {e.kind === 'assumption' ? `: ${e.text}` : ''}
                  {'entity' in e ? `: ${engine.entityName(e.entity, dayOf(e.day)).ru}` : ''}
                  {e.kind === 'merge-entities' ? `: ${engine.entityName(e.absorbed, dayOf(e.day)).ru} → ${engine.entityName(e.into, dayOf(e.day)).ru}` : ''}
                </div>
              </li>
            ))}
            {w.edits.length === 0 && <li className="small muted">Изменений нет.</li>}
          </ol>
          <div className="section-label">Применённые исторические события ({bs.applied.length})</div>
          <ol className="tl-list">
            {bs.applied.slice(-40).reverse().map((e) => (
              <li key={e.id} className="tl-item">
                <span className="log-tick mono">{e.date}</span>
                <div className="small">
                  <ProvBadge p="fact" /> {eventTitle(e, engine)}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="section-label" style={{ marginTop: 0 }}>
            Пропущенные в ветке исторические события ({bs.skipped.length})
          </div>
          <ol className="tl-list">
            {bs.skipped.slice(0, 60).map((s) => (
              <li key={s.event.id} className="tl-item">
                <span className="log-tick mono">{s.event.date}</span>
                <div className="small">
                  <ProvBadge p="model" /> {eventTitle(s.event, engine)}
                  <div className="xs muted">Не применено: {s.reason}</div>
                </div>
              </li>
            ))}
            {bs.skipped.length > 60 && <li className="xs muted">…и ещё {bs.skipped.length - 60}.</li>}
            {bs.skipped.length === 0 && <li className="small muted">Пропусков нет.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ———— «Почему?» ———— */

export function WhyChain({ log, seq, onClose, onGoto }: { log: readonly GameEvent[]; seq: number; onClose: () => void; onGoto: (id: string, t?: number) => void }) {
  const chain = whyChain(log, seq);
  return (
    <div className="sc-why" role="dialog" aria-modal="false" aria-labelledby="why-title">
      <div className="hdialog-head">
        <h3 id="why-title" style={{ margin: 0 }}>
          Почему? Цепочка игровых событий
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <ol className="sc-chain">
        {chain.map((e) => (
          <li key={e.seq}>
            <div className="small">
              <span className="mono xs">{mmss(e.t)}</span> <ProvBadge p={e.prov} /> <strong>{EVENT_KIND_RU[e.kind]}</strong>: {e.title}
            </div>
            <div className="xs muted">{e.reason}</div>
            {e.rule &&
              e.rule.split(',').map((r) => r.trim()).map((r) => (
                <div key={r} className="xs">
                  <span className="rule-chip">{r}</span> {RULE_BY_ID[r]?.title}: {RULE_BY_ID[r]?.text}
                </div>
              ))}
            {e.conditions && (
              <table className="table xs">
                <tbody>
                  {e.conditions.map((c) => (
                    <tr key={c.label}>
                      <th scope="row">{c.label}</th>
                      <td>
                        {c.value}
                        {c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(e.objectId || e.unitId) && (
              <button className="link-btn xs" onClick={() => onGoto((e.objectId ?? e.unitId)!, e.t)}>
                перейти к объекту
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="xs muted">Игровые правила и вероятности условны: цепочка объясняет расчёт модели, а не реальные процедуры.</p>
    </div>
  );
}
