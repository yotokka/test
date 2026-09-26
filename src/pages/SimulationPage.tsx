import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, Workspace, useAside } from '../components/Common';
import { IconInfo, IconPause, IconPlay, IconRepeat, IconReset, IconStep, IconWarn } from '../components/Icons';
import { MapLegend, SimMap, type Selection } from '../components/SimMap';
import { pad3 } from '../lib/format';
import { simulate } from '../sim/engine';
import { RULES } from '../sim/rules';
import { SCENARIOS, getScenario } from '../sim/scenarios';
import type { CountryId, Decision, LogEntry, RelationSettings, RelationStatus, SimResult, Stage } from '../sim/types';
import { ALL_PAIRS, COUNTRY_BY_ID, COUNTRIES, MODEL, PROFILES, RELATION_NAMES, cloneRelations, originName, pairKey } from '../sim/world';

export const DISCLAIMER = 'Условная учебная модель. Не прогноз реальных боевых действий.';

const SPEEDS = [0.5, 1, 2, 4];
const BASE_MS = 200;

const STAGE_LABEL: Record<Stage, string> = {
  spawn: 'Появление',
  detect: 'Обнаружение',
  track: 'Сопровождение',
  classify: 'Классификация',
  decision: 'Решение',
  permission: 'Разрешение',
  intercept: 'Перехват',
  outcome: 'Итог',
  system: 'Система',
};
const STAGE_MARK: Record<Stage, string> = {
  spawn: '◇',
  detect: '◉',
  track: '◌',
  classify: '▣',
  decision: '◆',
  permission: '✉',
  intercept: '✛',
  outcome: '■',
  system: '·',
};

const FILTERS: { id: string; label: string; stages: Stage[] | null }[] = [
  { id: 'all', label: 'Все', stages: null },
  { id: 'detect', label: 'Обнаружение', stages: ['spawn', 'detect', 'track'] },
  { id: 'classify', label: 'Классификация', stages: ['classify'] },
  { id: 'decision', label: 'Решения и правила', stages: ['decision', 'permission'] },
  { id: 'intercept', label: 'Перехват и итог', stages: ['intercept', 'outcome', 'system'] },
];

const DECISION_TEXT: Record<Decision, string> = {
  none: 'решение не принято',
  observe: 'только наблюдение',
  share: 'передача данных союзнику',
  verify: 'дополнительная проверка',
  'await-permission': 'ожидание разрешения',
  authorized: 'перехват допустим',
  denied: 'в разрешении отказано',
};

type AsideTab = 'object' | 'relations' | 'rules' | 'model';

export default function SimulationPage() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = getScenario(scenarioId);
  const [seed, setSeed] = useState(scenario.seed);
  const [seedText, setSeedText] = useState(String(scenario.seed));
  const [relations, setRelations] = useState<RelationSettings>(() => cloneRelations(scenario.relations));
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  const [asideTab, setAsideTab] = useState<AsideTab>('object');
  const [highlightRule, setHighlightRule] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [replay, setReplay] = useState<{ fp: string; match: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { setOpen } = useAside();
  const mapScrollRef = useRef<HTMLDivElement>(null);
  // На телефоне карта шире экрана: изначально показываем её середину
  useEffect(() => {
    const el = mapScrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [scenarioId]);

  const result: SimResult | null = useMemo(() => {
    try {
      return simulate({ scenario, seed, relations });
    } catch {
      return null;
    }
  }, [scenario, seed, relations]);

  const last = result ? result.frames.length - 1 : 0;
  const frame = result?.frames[Math.min(frameIdx, last)];

  // Воспроизведение: скорость меняет только темп показа уже рассчитанных тактов.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setFrameIdx((i) => Math.min(i + 1, last)), BASE_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, last]);
  useEffect(() => {
    if (playing && frameIdx >= last) setPlaying(false);
  }, [playing, frameIdx, last]);

  const restart = useCallback((msg?: string) => {
    setPlaying(false);
    setFrameIdx(0);
    setReplay(null);
    setNotice(msg ?? null);
  }, []);

  const changeScenario = (id: string) => {
    const s = getScenario(id);
    setScenarioId(id);
    setSeed(s.seed);
    setSeedText(String(s.seed));
    setRelations(cloneRelations(s.relations));
    setSelection(null);
    restart();
  };

  const togglePlay = useCallback(() => {
    if (!result) return;
    if (!playing && frameIdx >= last) setFrameIdx(0);
    setNotice(null);
    setPlaying((p) => !p);
  }, [playing, frameIdx, last, result]);

  const stepOnce = useCallback(() => {
    setPlaying(false);
    setFrameIdx((i) => Math.min(i + 1, last));
  }, [last]);

  const doReplay = useCallback(() => {
    if (!result) return;
    // Новый независимый прогон с теми же начальными условиями — проверка воспроизводимости.
    const again = simulate({ scenario, seed, relations });
    setReplay({ fp: again.fingerprint, match: again.fingerprint === result.fingerprint });
    setNotice(null);
    setFrameIdx(0);
    setPlaying(true);
  }, [result, scenario, seed, relations]);

  // Клавиатура
  const keyState = useRef({ togglePlay, stepOnce, restart });
  keyState.current = { togglePlay, stepOnce, restart };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault();
        keyState.current.togglePlay();
      } else if (e.key === 'ArrowRight' && tag !== 'BUTTON') {
        e.preventDefault();
        keyState.current.stepOnce();
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        keyState.current.restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const applySeed = () => {
    const n = Number(seedText);
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) {
      setNotice('Зерно должно быть целым числом от 0 до 4 294 967 295.');
      return;
    }
    setSeed(n);
    restart(`Установлено зерно ${n}. Сценарий начат заново.`);
  };

  const updateRelations = (next: RelationSettings) => {
    setRelations(next);
    restart('Настройки отношений изменены — сценарий пересчитан и начат с первого такта.');
  };

  const selectFromMap = useCallback(
    (s: Selection) => {
      setSelection(s);
      setAsideTab('object');
      setOpen(true);
    },
    [setOpen],
  );

  const openRule = (rule: string) => {
    setHighlightRule(rule.split(',')[0].trim());
    setAsideTab('rules');
    setOpen(true);
  };

  const visibleLog = useMemo(() => {
    if (!result || !frame) return [];
    const stages = FILTERS.find((f) => f.id === filter)?.stages;
    return result.log.slice(0, frame.logCount).filter((e) => !stages || stages.includes(e.stage)).reverse();
  }, [result, frame, filter]);

  const latestImportant = useMemo(() => {
    if (!result || !frame) return '';
    const e = [...result.log.slice(0, frame.logCount)].reverse().find((x) => x.stage === 'decision' || x.stage === 'outcome' || x.stage === 'system');
    return e ? `Такт ${e.tick}: ${e.title}` : '';
  }, [result, frame]);

  const relationsChanged = JSON.stringify(relations) !== JSON.stringify(scenario.relations);

  const main = (
    <>
      <div className="sim-disclaimer" role="note">
        <IconWarn size={18} style={{ color: 'var(--coral)', flex: 'none' }} />
        <strong>{DISCLAIMER}</strong>
      </div>
      <header className="page-head">
        <div className="eyebrow">
          <span className="led led-amber" aria-hidden="true" /> Учебный раздел · вымышленные данные
        </div>
        <h1>Учебная симуляция</h1>
        <p className="lead">
          Страны, карта и все параметры вымышлены. Абстрактные этапы: появление объекта, обнаружение, классификация, решение
          и условный перехват. Случайные события
          показывают неопределённость; одинаковые начальные условия всегда дают одинаковый результат.
        </p>
      </header>

      <div className="sim-toolbar">
        <label className="field">
          <span className="field-label">Учебный сценарий</span>
          <select className="select" value={scenarioId} onChange={(e) => changeScenario(e.target.value)}>
            {SCENARIOS.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Зерно генератора</span>
          <input
            className="input mono"
            inputMode="numeric"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && applySeed()}
            aria-describedby="seed-help"
          />
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={applySeed} disabled={seedText === String(seed)}>
            Применить
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSeedText(String(scenario.seed));
              setSeed(scenario.seed);
              restart(`Возвращено зерно сценария (${scenario.seed}).`);
            }}
            disabled={seed === scenario.seed}
            title="Вернуть исходное зерно сценария"
          >
            Исходное
          </button>
        </div>
      </div>
      <p id="seed-help" className="xs muted" style={{ marginTop: -4 }}>
        Зерно задаёт последовательность псевдослучайных чисел. Сценарий + зерно + настройки отношений однозначно определяют
        весь ход модели.
      </p>

      <div className="panel" style={{ marginBottom: 14, padding: 14 }}>
        <div className="small">
          <strong>{scenario.title}.</strong> {scenario.summary}
        </div>
        <div className="xs muted" style={{ marginTop: 4 }}>
          Учебная цель: {scenario.learningGoal}
        </div>
        {relationsChanged && (
          <div className="xs" style={{ marginTop: 6, color: 'var(--amber)' }}>
            ◆ Отношения изменены относительно исходного сценария.
          </div>
        )}
      </div>

      {!result || !frame ? (
        <div className="notice notice-coral" role="alert">
          <IconWarn size={18} style={{ color: 'var(--coral)' }} />
          <div>
            <p>Модель не удалось рассчитать с текущими настройками.</p>
            <button className="btn btn-sm" onClick={() => changeScenario(scenario.id)}>
              Вернуть настройки сценария
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="map-hint" aria-hidden="true">
            Карту можно прокручивать вбок →
          </p>
          <div className="map-frame">
            <div className="map-scroll" ref={mapScrollRef}>
              <SimMap scenario={scenario} frame={frame} selection={selection} onSelect={selectFromMap} />
            </div>
            <div className="map-corner tl">Условная карта · у.е.</div>
            <div className="map-corner br">Учебная модель</div>
          </div>
          <MapLegend />

          <section className="timepanel panel" aria-label="Панель времени">
            <div className="transport">
              <button className="btn btn-primary" onClick={togglePlay} aria-keyshortcuts="Space">
                {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
                {playing ? 'Пауза' : frameIdx >= last ? 'Запустить снова' : frameIdx > 0 ? 'Продолжить' : 'Запуск'}
              </button>
              <button className="btn" onClick={stepOnce} disabled={frameIdx >= last} aria-keyshortcuts="ArrowRight">
                <IconStep size={16} /> Шаг
              </button>
              <button className="btn" onClick={() => restart()} aria-keyshortcuts="R">
                <IconReset size={16} /> Сброс
              </button>
              <button className="btn" onClick={doReplay}>
                <IconRepeat size={16} /> Повтор сценария
              </button>
              <span className="clock" aria-label={`Такт ${frame.tick} из ${last}`}>
                T+{pad3(frame.tick)} / {pad3(last)}
              </span>
              <span className="led-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className={`led ${playing ? 'led-on' : ''}`} aria-hidden="true" />
                <span className="xs muted">{playing ? 'идёт' : frameIdx >= last ? 'завершено' : 'пауза'}</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="field-label" id="speed-label">
                Скорость показа
              </span>
              <div className="speed-group" role="group" aria-labelledby="speed-label">
                {SPEEDS.map((s) => (
                  <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <span className="xs muted">Скорость показа не влияет на результат модели.</span>
            </div>
            <label className="field">
              <span className="field-label">Шкала времени (такты)</span>
              <input
                className="scrub"
                type="range"
                min={0}
                max={last}
                value={Math.min(frameIdx, last)}
                aria-valuetext={`Такт ${frame.tick} из ${last}`}
                onChange={(e) => {
                  setPlaying(false);
                  setFrameIdx(Number(e.target.value));
                }}
              />
            </label>
            <div className="fp">
              <span>
                Отпечаток журнала: <span className="mono" style={{ color: 'var(--text)' }}>{result.fingerprint}</span>
              </span>
              {replay && (
                <span role="status" style={{ color: replay.match ? 'var(--teal)' : 'var(--coral)' }}>
                  {replay.match ? '✓ Повторный прогон дал тот же отпечаток' : '✗ Отпечаток отличается — сообщите об ошибке'} ({replay.fp})
                </span>
              )}
              {frameIdx >= last && (
                <span>
                  Итог: условно перехвачено <span className="mono">{result.summary.intercepted}</span>, достигли области
                  назначения <span className="mono">{result.summary.arrived}</span>.
                </span>
              )}
            </div>
            {notice && (
              <div className="notice notice-teal small" role="status">
                <IconInfo size={16} style={{ color: 'var(--teal)' }} />
                <p>{notice}</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="log-h" style={{ marginTop: 14 }}>
            <h2 id="log-h" className="panel-title">
              Журнал событий · новые сверху
            </h2>
            <div className="visually-hidden" aria-live="polite">
              {latestImportant}
            </div>
            <div className="filter-row" role="group" aria-label="Фильтр журнала">
              {FILTERS.map((f) => (
                <button key={f.id} className="btn btn-sm" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {visibleLog.length === 0 ? (
              <EmptyState title={frame.tick === 0 && filter === 'all' ? 'Сценарий ещё не запущен' : 'Нет событий этого типа'}>
                <p className="small">Нажмите «Запуск» или клавишу Пробел.</p>
              </EmptyState>
            ) : (
              <ol className="log" aria-label="События">
                {visibleLog.map((e) => (
                  <LogItem key={e.seq} e={e} onRule={openRule} onObject={(id) => selectFromMap({ kind: 'obj', id })} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );

  const aside = (
    <div>
      <div className="tabs" role="tablist" aria-label="Панель параметров" style={{ marginBottom: 14 }}>
        {(
          [
            ['object', 'Объект'],
            ['relations', 'Отношения'],
            ['rules', 'Правила'],
            ['model', 'Параметры'],
          ] as [AsideTab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" className="tab" aria-selected={asideTab === id} onClick={() => setAsideTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tag-fiction" style={{ marginBottom: 12 }}>
        учебные данные · вымышлено
      </div>
      {asideTab === 'object' && result && frame && (
        <ObjectPanel scenarioId={scenario.id} result={result} frameIdx={Math.min(frameIdx, last)} selection={selection} onSelect={setSelection} />
      )}
      {asideTab === 'relations' && (
        <RelationsEditor
          value={relations}
          onChange={updateRelations}
          onReset={() => updateRelations(cloneRelations(scenario.relations))}
          changed={relationsChanged}
        />
      )}
      {asideTab === 'rules' && <RulesPanel highlight={highlightRule} />}
      {asideTab === 'model' && <ModelPanel scenarioId={scenario.id} />}
    </div>
  );

  return <Workspace main={main} aside={aside} asideTitle="Параметры симуляции" />;
}

function LogItem({ e, onRule, onObject }: { e: LogEntry; onRule: (r: string) => void; onObject: (id: string) => void }) {
  return (
    <li className="log-entry" data-stage={e.stage}>
      <span className="log-tick">T+{pad3(e.tick)}</span>
      <div className="log-title">
        <span className="stage">
          <span aria-hidden="true">{STAGE_MARK[e.stage]}</span> {STAGE_LABEL[e.stage]}
        </span>
        {e.objectId ? (
          <button className="link-btn" onClick={() => onObject(e.objectId!)} title="Показать объект">
            {e.title}
          </button>
        ) : (
          <span>{e.title}</span>
        )}
        {e.rule && (
          <button className="rule-chip" onClick={() => onRule(e.rule!)} title="Показать текст учебного правила">
            {e.rule}
            <span className="visually-hidden"> — открыть текст правила</span>
          </button>
        )}
      </div>
      <div className="log-reason">{e.reason}</div>
    </li>
  );
}

/* ———————————————— Панель «Объект» ———————————————— */

function ObjectPanel({
  scenarioId,
  result,
  frameIdx,
  selection,
  onSelect,
}: {
  scenarioId: string;
  result: SimResult;
  frameIdx: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const scenario = getScenario(scenarioId);
  const frame = result.frames[frameIdx];
  const value = selection ? `${selection.kind}:${selection.id}` : '';
  const postName = (id: string) => scenario.posts.find((p) => p.id === id)?.name ?? id;

  let body: JSX.Element;
  if (!selection) {
    body = (
      <p className="small muted">
        Выберите объект или пост в списке выше или щёлкните по нему на карте. Здесь появятся его учебные параметры и
        состояние на текущем такте.
      </p>
    );
  } else if (selection.kind === 'post') {
    const p = scenario.posts.find((x) => x.id === selection.id)!;
    const stock = frame.posts.find((x) => x.id === p.id)?.stock ?? p.stock;
    body = (
      <>
        <h3 className="detail-name">Пост «{p.name}»</h3>
        <dl className="dl">
          <dt>Страна</dt>
          <dd>{COUNTRY_BY_ID[p.country].name}</dd>
          <dt>Зона обнаружения</dt>
          <dd className="mono">{p.detectRadius} у.е.</dd>
          <dt>Зона перехвата</dt>
          <dd className="mono">{p.engageRadius} у.е.</dd>
          <dt>Обнаружение за такт</dt>
          <dd className="mono">{p.detectP.toFixed(2)} × заметность</dd>
          <dt>Условный перехват</dt>
          <dd className="mono">{p.interceptP.toFixed(2)} × множитель профиля</dd>
          <dt>Учебный запас</dt>
          <dd className="mono">
            {stock} из {p.stock}
          </dd>
          <dt>Нужно разрешение</dt>
          <dd>{scenario.relations.permissionRequired[p.country] ? 'по сценарию — да' : 'по сценарию — нет'}</dd>
        </dl>
      </>
    );
  } else {
    const spec = scenario.objects.find((o) => o.id === selection.id)!;
    const st = frame.objects.find((o) => o.id === selection.id)!;
    const prof = PROFILES[spec.profile];
    const events = result.log.slice(0, frame.logCount).filter((e) => e.objectId === spec.id);
    body = (
      <>
        <h3 className="detail-name">Объект {spec.label}</h3>
        <dl className="dl">
          <dt>Профиль</dt>
          <dd>
            {prof.name} <span className="muted small">— {prof.analog}</span>
          </dd>
          <dt>Происхождение</dt>
          <dd>{originName(spec.origin)}</dd>
          <dt>Обл. назначения</dt>
          <dd>{COUNTRY_BY_ID[spec.destination].name} (задана сценарием)</dd>
          <dt>Появление</dt>
          <dd className="mono">T+{pad3(spec.spawnTick)}</dd>
          <dt>Состояние</dt>
          <dd>
            {st.status === 'pending'
              ? 'ещё не появился'
              : st.status === 'intercepted'
                ? 'условно перехвачен'
                : st.status === 'arrived'
                  ? 'достиг области назначения'
                  : 'в полёте'}
          </dd>
          <dt>Сопровождают</dt>
          <dd>{st.detectedBy.length ? st.detectedBy.map(postName).map((n) => `«${n}»`).join(', ') : '—'}</dd>
          <dt>Решение</dt>
          <dd>{DECISION_TEXT[st.decision]}</dd>
        </dl>
        <div className="section-label">События объекта</div>
        {events.length === 0 ? (
          <p className="small muted">Пока событий нет.</p>
        ) : (
          <ol className="log" style={{ maxHeight: 320 }}>
            {[...events].reverse().map((e) => (
              <li key={e.seq} className="log-entry" data-stage={e.stage} style={{ gridTemplateColumns: '1fr' }}>
                <div className="log-title">
                  <span className="log-tick">T+{pad3(e.tick)}</span>
                  <span className="stage">{STAGE_LABEL[e.stage]}</span>
                </div>
                <div className="small">{e.title}</div>
              </li>
            ))}
          </ol>
        )}
      </>
    );
  }

  return (
    <div className="fade-in">
      <label className="field" style={{ marginBottom: 14 }}>
        <span className="field-label">Выбранный элемент</span>
        <select
          className="select"
          value={value}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':');
            onSelect(kind ? { kind: kind as 'obj' | 'post', id } : null);
          }}
        >
          <option value="">— не выбрано —</option>
          <optgroup label="Объекты">
            {scenario.objects.map((o) => (
              <option key={o.id} value={`obj:${o.id}`}>
                {o.label} · {PROFILES[o.profile].name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Посты">
            {scenario.posts.map((p) => (
              <option key={p.id} value={`post:${p.id}`}>
                «{p.name}» · {COUNTRY_BY_ID[p.country].name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {body}
    </div>
  );
}

/* ———————————————— Отношения ———————————————— */

function RelationsEditor({
  value,
  onChange,
  onReset,
  changed,
}: {
  value: RelationSettings;
  onChange: (v: RelationSettings) => void;
  onReset: () => void;
  changed: boolean;
}) {
  const setPair = (a: CountryId, b: CountryId, patch: { status?: RelationStatus; jointDefense?: boolean }) => {
    const next = cloneRelations(value);
    const k = pairKey(a, b);
    next.pairs[k] = { ...next.pairs[k], ...patch };
    onChange(next);
  };
  const setPerm = (c: CountryId, v: boolean) => {
    const next = cloneRelations(value);
    next.permissionRequired[c] = v;
    onChange(next);
  };

  return (
    <div className="fade-in">
      <p className="small muted">
        Это условные учебные настройки между вымышленными странами. Реальные дипломатические отношения на модель не влияют.
        Любое изменение пересчитывает сценарий с первого такта.
      </p>
      <div className="notice small" style={{ marginBottom: 12 }}>
        <IconInfo size={16} style={{ color: 'var(--amber)' }} />
        <p>Союз не означает перехвата, а конфликт — автоматического пуска. Какое правило сработало, видно в журнале.</p>
      </div>
      <div className="section-label">Пары стран</div>
      <div className="rel-grid">
        {ALL_PAIRS.map(([a, b]) => {
          const rel = value.pairs[pairKey(a, b)];
          const id = `rel-${a}${b}`;
          return (
            <div key={id} className="rel-row">
              <div className="rel-pair">
                <span>{COUNTRY_BY_ID[a].name}</span>
                <span className="muted">↔</span>
                <span>{COUNTRY_BY_ID[b].name}</span>
              </div>
              <div className="rel-controls">
                <label className="visually-hidden" htmlFor={id}>
                  Отношение: {COUNTRY_BY_ID[a].name} и {COUNTRY_BY_ID[b].name}
                </label>
                <select id={id} className="select" value={rel.status} onChange={(e) => setPair(a, b, { status: e.target.value as RelationStatus })}>
                  {(Object.keys(RELATION_NAMES) as RelationStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {RELATION_NAMES[s]}
                    </option>
                  ))}
                </select>
                <label className="check small">
                  <input type="checkbox" checked={rel.jointDefense} onChange={(e) => setPair(a, b, { jointDefense: e.target.checked })} />
                  Совместная оборона
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="section-label">Необходимость разрешения на перехват</div>
      <div className="rel-grid">
        {COUNTRIES.map((c) => (
          <label key={c.id} className="check small rel-row" style={{ display: 'flex' }}>
            <input type="checkbox" checked={value.permissionRequired[c.id]} onChange={(e) => setPerm(c.id, e.target.checked)} />
            {c.name}: каждый перехват требует разрешения
          </label>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-sm" onClick={onReset} disabled={!changed}>
          Вернуть настройки сценария
        </button>
      </div>
    </div>
  );
}

function RulesPanel({ highlight }: { highlight: string | null }) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (highlight) refs.current[highlight]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlight]);
  return (
    <div className="fade-in">
      <p className="small muted">
        Упрощённые условности модели. Реальные правила применения обычно не публикуются, и эти правила их не описывают.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {RULES.map((r) => (
          <div
            key={r.id}
            ref={(el) => {
              refs.current[r.id] = el;
            }}
            className="figure"
            style={highlight === r.id ? { borderColor: 'rgba(170,160,200,0.7)' } : undefined}
            aria-current={highlight === r.id ? 'true' : undefined}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="rule-chip" style={{ cursor: 'default' }}>
                {r.id}
              </span>
              <strong className="small">{r.title}</strong>
            </div>
            <span className="small muted">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelPanel({ scenarioId }: { scenarioId: string }) {
  const scenario = getScenario(scenarioId);
  return (
    <div className="fade-in">
      <div className="notice notice-coral small" style={{ marginBottom: 12 }}>
        <IconWarn size={16} style={{ color: 'var(--coral)' }} />
        <p>
          Все значения ниже придуманы для наглядности и не связаны со справочной базой реальных систем. Единицы — условные
          (у.е., такты).
        </p>
      </div>
      <div className="section-label">Профили объектов</div>
      <div className="table-wrap">
        <table className="table param-table">
          <thead>
            <tr>
              <th scope="col">Профиль</th>
              <th scope="col">Скор., у.е./такт</th>
              <th scope="col">Заметность</th>
              <th scope="col">Неоднозн.</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(PROFILES).map((p) => (
              <tr key={p.name}>
                <th scope="row" style={{ fontWeight: 400 }}>
                  {p.name}
                  <div className="xs muted">{p.analog}</div>
                </th>
                <td className="mono">{p.speed}</td>
                <td className="mono">{p.visibility}</td>
                <td className="mono">{p.ambiguity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-label">Посты сценария</div>
      <div className="table-wrap">
        <table className="table param-table">
          <thead>
            <tr>
              <th scope="col">Пост</th>
              <th scope="col">Обнар., у.е.</th>
              <th scope="col">Перехв., у.е.</th>
              <th scope="col">Запас</th>
            </tr>
          </thead>
          <tbody>
            {scenario.posts.map((p) => (
              <tr key={p.id}>
                <th scope="row" style={{ fontWeight: 400 }}>
                  «{p.name}»<div className="xs muted">{COUNTRY_BY_ID[p.country].name}</div>
                </th>
                <td className="mono">{p.detectRadius}</td>
                <td className="mono">{p.engageRadius}</td>
                <td className="mono">{p.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-label">Общие константы</div>
      <dl className="dl small">
        <dt>Скорость перехватчика</dt>
        <dd className="mono">{MODEL.interceptorSpeed} у.е./такт</dd>
        <dt>Задержка разрешения</dt>
        <dd className="mono">
          {MODEL.permissionDelayMin}–{MODEL.permissionDelayMin + MODEL.permissionDelaySpread - 1} такта
        </dd>
        <dt>Вероятность разрешения</dt>
        <dd className="mono">{MODEL.permissionGrantP}</dd>
        <dt>Доп. проверка</dt>
        <dd className="mono">{MODEL.verifyTicks} такта</dd>
      </dl>
      <div className="section-label">Как устроена случайность</div>
      <p className="small">
        Каждое вероятностное событие — сравнение учебной вероятности p с псевдослучайным числом r из генератора Mulberry32:
        событие наступает, если r &lt; p. Порядок обращений к генератору фиксирован, поэтому ход модели полностью
        воспроизводим.
      </p>
    </div>
  );
}
