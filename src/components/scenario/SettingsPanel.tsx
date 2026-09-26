import { useMemo, useState } from 'react';
import { pairKey } from '../../game/engine';
import { GAME_PRESETS } from '../../game/weatherEffects';
import type { EndCondition, EventKind } from '../../game/types';
import type { HistoryEngine } from '../../history/engine';
import { eventTitle } from '../../history/describe';
import { ruName } from '../../history/names-ru';
import { dayOf, fmtDay, isValidIso } from '../../history/time';
import { BranchWorld, EDIT_RU, POLICY_RU, type BranchState } from '../../scenario/branch';
import { SIDE_COLORS } from '../../scenario/factory';
import { REGIONS, regionCenter } from '../../scenario/geo';
import { EVENT_KIND_RU, PLAYBACK_SPEEDS, SETTINGS_META } from '../../scenario/settings';
import type { HistoricalWorld, Participant, ScenarioDoc, WorldEdit } from '../../scenario/types';
import { effectsFor, centerValues } from '../../weather/effects';
import { ERA5_DELAY_DAYS, WMO_RU, WeatherError, fetchArchive, fetchCurrent } from '../../weather/openMeteo';
import { VAR_RU, WEATHER_VARS, type ManualWeather, type WeatherSnapshot, type WeatherSource } from '../../weather/types';
import { loadJSON, saveJSON } from '../../lib/storage';
import { IconExternal } from '../Icons';

type Commit = (label: string, fn: (d: ScenarioDoc) => void, prov?: 'user' | 'assumption') => void;

function Meta({ id }: { id: string }) {
  const m = SETTINGS_META.find((x) => x.id === id)!;
  return (
    <details className="sc-meta">
      <summary className="xs">Что это меняет?</summary>
      <dl className="xs">
        <dt>Влияет на</dt>
        <dd>{m.affects}</dd>
        <dt>Единицы</dt>
        <dd>{m.unit}</dd>
        <dt>Во время запуска</dt>
        <dd>{m.live ? 'можно менять' : 'нельзя: только новой веткой'}</dd>
        <dt>В сценарии</dt>
        <dd>{m.saved ? 'сохраняется' : 'не сохраняется'}</dd>
        <dt>Игровое допущение</dt>
        <dd>{m.assumption ? 'да' : 'нет'}</dd>
        <dt>Влияет на исход</dt>
        <dd>{m.affectsOutcome ? 'да' : 'нет'}</dd>
      </dl>
    </details>
  );
}

function Row({ id, children, locked }: { id: string; children: React.ReactNode; locked: boolean }) {
  const m = SETTINGS_META.find((x) => x.id === id)!;
  const disabled = locked && !m.live;
  return (
    <fieldset className="sc-set" disabled={disabled}>
      <legend className="sc-set-title">
        {m.label}
        {m.assumption && <span className="chip sc-chip-assume">игровое допущение</span>}
        {!m.live && locked && <span className="chip">меняется новой веткой</span>}
      </legend>
      {children}
      <Meta id={id} />
    </fieldset>
  );
}

export function ScenarioSettings({ doc, commit, locked, engine, bw, bs, onNewBranch }: { doc: ScenarioDoc; commit: Commit; locked: boolean; engine: HistoryEngine | null; bw: BranchWorld | null; bs: BranchState | null; onNewBranch: () => void }) {
  const [tab, setTab] = useState<'basic' | 'advanced'>('basic');
  const s = doc.settings;
  const set = <K extends keyof ScenarioDoc['settings']>(k: K, v: ScenarioDoc['settings'][K], label: string) => commit(`Настройка «${label}»: ${String(v)}`, (d) => void (d.settings[k] = v));
  const [seedText, setSeedText] = useState(String(doc.seed));

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Настройки сценария" style={{ marginBottom: 12 }}>
        <button role="tab" className="tab" aria-selected={tab === 'basic'} onClick={() => setTab('basic')}>
          Основные
        </button>
        <button role="tab" className="tab" aria-selected={tab === 'advanced'} onClick={() => setTab('advanced')}>
          Расширенные
        </button>
      </div>
      {locked && (
        <div className="notice" role="note" style={{ marginBottom: 12 }}>
          <div className="small">
            Идёт воспроизведение. Можно менять скорость, автопаузы, подробность журнала и качество. Остальное — новое начальное состояние:{' '}
            <button className="link-btn" onClick={onNewBranch}>
              продолжить новой веткой для изменений
            </button>
            .
          </div>
        </div>
      )}
      {tab === 'basic' ? (
        <>
          <Row id="date" locked={locked}>
            <DateRegion doc={doc} commit={commit} />
          </Row>
          <Row id="participants" locked={locked}>
            <Participants doc={doc} commit={commit} engine={engine} bw={bw} bs={bs} />
          </Row>
          <Row id="availability" locked={locked}>
            {(['strict', 'warn', 'free'] as const).map((v) => (
              <label key={v} className="check small">
                <input type="radio" name="avail" checked={s.availability === v} onChange={() => set('availability', v, 'доступность')} />
                {{ strict: 'Строгий: только подтверждённая источником эксплуатация стороной на дату', warn: 'С предупреждением: неподтверждённое помечается как допущение', free: 'Свободный: подписи без проверки (всё — допущение)' }[v]}
              </label>
            ))}
          </Row>
          {doc.world.kind === 'historical' && (
            <Row id="policy" locked={locked}>
              {(['stop', 'compatible'] as const).map((v) => (
                <label key={v} className="check small">
                  <input type="radio" name="policy" checked={(doc.world as HistoricalWorld).policy === v} onChange={() => commit(`Правило продолжения истории: ${POLICY_RU[v]}`, (d) => void ((d.world as HistoricalWorld).policy = v), 'assumption')} />
                  {POLICY_RU[v][0].toUpperCase() + POLICY_RU[v].slice(1)}
                </label>
              ))}
              {engine && bw && <WorldEdits doc={doc} commit={commit} engine={engine} bw={bw} />}
            </Row>
          )}
          <Row id="weather" locked={locked}>
            <WeatherPanel doc={doc} commit={commit} />
          </Row>
          <Row id="playbackSpeed" locked={locked}>
            <select className="select" value={s.playbackSpeed} onChange={(e) => set('playbackSpeed', Number(e.target.value), 'скорость')} aria-label="Скорость воспроизведения">
              {PLAYBACK_SPEEDS.map((v) => (
                <option key={v} value={v}>
                  ×{String(v).replace('.', ',')} — {v} игр. с за 1 с
                </option>
              ))}
            </select>
          </Row>
          <Row id="duration" locked={locked}>
            <label className="field small">
              <span className="field-label">Минут</span>
              <input className="input mono" type="number" min={1} max={360} value={Math.round(doc.episode.durationS / 60)} onChange={(e) => commit('Продолжительность эпизода', (d) => void (d.episode.durationS = Math.max(60, Math.min(21600, Number(e.target.value) * 60 || 60))), 'assumption')} />
            </label>
          </Row>
          <Row id="endConditions" locked={locked}>
            {(['duration', 'all-finished', 'first-outcome'] as EndCondition[]).map((c) => (
              <label key={c} className="check small">
                <input
                  type="checkbox"
                  checked={doc.episode.endConditions.includes(c)}
                  disabled={c === 'duration'}
                  onChange={(e) => commit('Условия завершения', (d) => void (d.episode.endConditions = e.target.checked ? [...d.episode.endConditions, c] : d.episode.endConditions.filter((x) => x !== c)))}
                />
                {{ duration: 'Истекло время (всегда действует)', 'all-finished': 'Все подвижные объекты завершили действия', 'first-outcome': 'Первый итог взаимодействия' }[c]}
              </label>
            ))}
          </Row>
        </>
      ) : (
        <>
          <Row id="seed" locked={locked}>
            <form
              className="transport"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Math.abs(Math.trunc(Number(seedText))) >>> 0;
                if (Number.isFinite(Number(seedText))) commit(`Зерно генератора: ${v}`, (d) => void (d.seed = v));
              }}
            >
              <input className="input mono" style={{ width: 140 }} value={seedText} onChange={(e) => setSeedText(e.target.value)} aria-label="Зерно генератора" />
              <button className="btn btn-sm" type="submit">
                Применить
              </button>
            </form>
          </Row>
          <Row id="awareness" locked={locked}>
            <Radio name="aw" value={s.awareness} options={{ limited: 'Ограниченная: только обнаруженное', full: 'Полная видимость' }} onChange={(v) => set('awareness', v, 'осведомлённость')} />
          </Row>
          <Row id="control" locked={locked}>
            <Radio name="ctl" value={s.control} options={{ auto: 'Автоматическое', manual: 'Ручное: решения в очереди действий' }} onChange={(v) => set('control', v, 'управление')} />
          </Row>
          <Row id="randomness" locked={locked}>
            <Radio name="rnd" value={s.randomness} options={{ normal: 'Обычная', low: 'Пониженная', none: 'Без случайности' }} onChange={(v) => set('randomness', v, 'случайность')} />
          </Row>
          <Row id="motionPreset" locked={locked}>
            <Radio name="mp" value={s.motionPreset} options={{ standard: 'Стандарт', smooth: 'Плавный', agile: 'Резкий' }} onChange={(v) => set('motionPreset', v, 'пресет движения')} />
          </Row>
          <Row id="interactionPreset" locked={locked}>
            <Radio name="ip" value={s.interactionPreset} options={{ standard: 'Стандарт', cautious: 'Осторожный', permissive: 'Быстрый' }} onChange={(v) => set('interactionPreset', v, 'пресет взаимодействий')} />
          </Row>
          <Row id="resources" locked={locked}>
            <Radio name="rs" value={s.resources} options={{ scarce: 'Скудные', standard: 'Стандартные', ample: 'Щедрые' }} onChange={(v) => set('resources', v, 'ресурсы')} />
          </Row>
          <Row id="autopause" locked={locked}>
            <div className="sc-checks">
              {(Object.keys(EVENT_KIND_RU) as EventKind[]).filter((k) => !['system', 'weather', 'phase'].includes(k)).map((k) => (
                <label key={k} className="check small">
                  <input type="checkbox" checked={s.autopause.includes(k)} onChange={(e) => set('autopause', e.target.checked ? [...s.autopause, k] : s.autopause.filter((x) => x !== k), 'автопаузы')} />
                  {EVENT_KIND_RU[k]}
                </label>
              ))}
            </div>
          </Row>
          <Row id="logDetail" locked={locked}>
            <Radio name="ld" value={String(s.logDetail)} options={{ '1': 'Главное', '2': 'Обычная', '3': 'Всё' }} onChange={(v) => set('logDetail', Number(v) as 1 | 2 | 3, 'подробность журнала')} />
          </Row>
          <Row id="checkpointEveryS" locked={locked}>
            <Radio name="cp" value={String(s.checkpointEveryS)} options={{ '10': 'каждые 10 с', '30': 'каждые 30 с', '120': 'каждые 2 мин' }} onChange={(v) => set('checkpointEveryS', Number(v), 'частота снимков')} />
          </Row>
          <Row id="quality" locked={locked}>
            <Radio name="q" value={s.quality} options={{ low: 'Низкое', medium: 'Среднее', high: 'Высокое' }} onChange={(v) => set('quality', v, 'качество')} />
          </Row>
        </>
      )}
    </div>
  );
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="sc-radio" role="radiogroup">
      {(Object.keys(options) as T[]).map((k) => (
        <label key={k} className="check small">
          <input type="radio" name={name} checked={value === k} onChange={() => onChange(k)} />
          {options[k]}
        </label>
      ))}
    </div>
  );
}

/* ———— Дата и регион ———— */

function DateRegion({ doc, commit }: { doc: ScenarioDoc; commit: Commit }) {
  const [date, setDate] = useState(doc.episode.date);
  const [time, setTime] = useState(doc.episode.startTime);
  const hist = doc.world.kind === 'historical' ? doc.world : null;
  const err = !isValidIso(date) ? 'Дата — ГГГГ-ММ-ДД' : hist && date < hist.forkDate ? `Не раньше даты ветвления ${hist.forkDate}` : !/^\d{2}:\d{2}$/.test(time) ? 'Время — ЧЧ:ММ' : '';
  return (
    <div>
      {hist && (
        <p className="xs">
          Точка ветвления: <strong className="mono">{fmtDay(dayOf(hist.forkDate))}</strong> — последний день, совпадающий с историей. Сборка исторических данных:{' '}
          <span className="mono">{doc.historyBuildId}</span>.
        </p>
      )}
      <div className="sc-grid2">
        <label className="field small">
          <span className="field-label">Дата эпизода</span>
          <input className="input mono" type="date" min={hist?.forkDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field small">
          <span className="field-label">Начало, UTC</span>
          <input className="input mono" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {err && <p className="xs" style={{ color: 'var(--coral)' }}>{err}</p>}
      <button className="btn btn-sm" disabled={!!err || (date === doc.episode.date && time === doc.episode.startTime)} onClick={() => commit(`Дата эпизода: ${date} ${time} UTC`, (d) => void (d.episode = { ...d.episode, date, startTime: time }))}>
        Применить дату
      </button>
      {hist && (
        <label className="field small" style={{ marginTop: 8 }}>
          <span className="field-label">Область карты</span>
          <select className="select" value={doc.region.id} onChange={(e) =>
              commit(`Область карты: ${REGIONS.find((r) => r.id === e.target.value)?.label}`, (d) => {
                d.region = structuredClone(REGIONS.find((r) => r.id === e.target.value)!);
                // Пока объектов нет, система координат переносится в центр новой области
                if (!d.objects.length) d.frame = regionCenter(d.region);
              })
            }>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="xs muted">{doc.objects.length ? 'Объекты уже размещены: смена области меняет только вид карты и сетку погоды, а не их положение.' : 'Пока объектов нет, система координат переносится в центр новой области.'}</span>
        </label>
      )}
    </div>
  );
}

/* ———— Участники и отношения ———— */

function Participants({ doc, commit, engine, bw, bs }: { doc: ScenarioDoc; commit: Commit; engine: HistoryEngine | null; bw: BranchWorld | null; bs: BranchState | null }) {
  const [q, setQ] = useState('');
  const [fictional, setFictional] = useState('');
  const candidates = useMemo(() => {
    if (!engine || !bw || !bs) return [];
    const ids = new Set<string>();
    for (const f of bs.recs) {
      const o = bw.ownerOf(bs, f);
      if (o) ids.add(o);
    }
    for (const g of bs.gw) if (bw.exists(bs, g)) ids.add(g);
    return [...ids].map((id) => ({ id, name: ruName(engine.entityName(id, bs.day).source) })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [engine, bw, bs]);
  const shown = q.trim() ? candidates.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()) && !doc.participants.some((p) => p.entityId === c.id)).slice(0, 8) : [];
  const add = (p: Omit<Participant, 'id' | 'color'>) =>
    commit(`Добавлен участник «${p.name}»`, (d) => {
      let n = 1;
      while (d.participants.some((x) => x.id === `p${n}`)) n++;
      d.participants.push({ ...p, id: `p${n}`, color: SIDE_COLORS[d.participants.length % SIDE_COLORS.length] });
    });
  const pairs: [Participant, Participant][] = [];
  for (let i = 0; i < doc.participants.length; i++) for (let j = i + 1; j < doc.participants.length; j++) pairs.push([doc.participants[i], doc.participants[j]]);
  return (
    <div>
      <ul className="sc-parts">
        {doc.participants.map((p) => {
          const used = doc.objects.some((o) => o.side === p.id);
          return (
            <li key={p.id} className="small">
              <i className="sc-dot" style={{ background: p.color }} aria-hidden="true" />
              <div>
                {p.name} <span className="xs muted">{p.entityId ? `исторический субъект ${p.entityId}` : p.unknown ? 'происхождение не установлено' : 'вымышленная сторона'}</span>
              </div>
              <label className="check xs" style={{ marginLeft: 6 }}>
                <input type="checkbox" checked={!!doc.permissionRequired[p.id]} onChange={(e) => commit(`${p.name}: требование разрешения ${e.target.checked ? 'включено' : 'выключено'}`, (d) => void (d.permissionRequired[p.id] = e.target.checked), 'assumption')} />
                нужно разрешение (П-8)
              </label>
              {!used && (
                <button className="link-btn xs" onClick={() => commit(`Удалён участник «${p.name}»`, (d) => void (d.participants = d.participants.filter((x) => x.id !== p.id)))}>
                  убрать
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {doc.world.kind === 'historical' && (
        <label className="field small">
          <span className="field-label">Добавить исторический субъект, существующий в ветке на {doc.episode.date}</span>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, Франция" />
          {shown.length > 0 && (
            <ul className="hresults">
              {shown.map((c) => (
                <li key={c.id}>
                  <button className="hresult" onClick={() => (add({ name: c.name, entityId: c.id }), setQ(''))}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
      )}
      <form
        className="transport"
        onSubmit={(e) => {
          e.preventDefault();
          if (fictional.trim()) add({ name: fictional.trim(), entityId: null });
          setFictional('');
        }}
      >
        <input className="input" value={fictional} onChange={(e) => setFictional(e.target.value)} placeholder="Вымышленная сторона" aria-label="Название вымышленной стороны" />
        <button className="btn btn-sm" type="submit">
          Добавить
        </button>
      </form>
      {pairs.length > 0 && (
        <>
          <div className="section-label">Игровые отношения (не исторические данные)</div>
          <div className="rel-grid">
            {pairs.map(([a, b]) => {
              const k = pairKey(a.id, b.id);
              const r = doc.relations[k] ?? { status: 'neutral', jointDefense: false };
              return (
                <div key={k} className="rel-row">
                  <span className="rel-pair small">
                    {a.name} — {b.name}
                  </span>
                  <div className="rel-controls">
                    <select className="select" value={r.status} aria-label={`Отношение ${a.name} и ${b.name}`} onChange={(e) => commit(`Отношение ${a.name} — ${b.name}: ${e.target.value}`, (d) => void (d.relations[k] = { ...r, status: e.target.value as typeof r.status, jointDefense: e.target.value === 'alliance' ? r.jointDefense : false }), 'assumption')}>
                      <option value="neutral">нейтралитет</option>
                      <option value="alliance">союз</option>
                      <option value="conflict">игровой конфликт</option>
                    </select>
                    <label className="check xs">
                      <input type="checkbox" checked={r.jointDefense} disabled={r.status !== 'alliance'} onChange={(e) => commit(`Совместная оборона ${a.name} — ${b.name}: ${e.target.checked ? 'да' : 'нет'}`, (d) => void (d.relations[k] = { ...r, jointDefense: e.target.checked }), 'assumption')} />
                      совместная оборона
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="xs muted">Отношение по умолчанию — нейтралитет. Исторические отношения не подставляются: в исторической базе нет проверенного набора союзов (см. «Покрытие данных»).</p>
        </>
      )}
    </div>
  );
}

/* ———— Изменения мира ветки ———— */

function WorldEdits({ doc, commit, engine, bw }: { doc: ScenarioDoc; commit: Commit; engine: HistoryEngine; bw: BranchWorld }) {
  const world = doc.world as HistoricalWorld;
  const [kind, setKind] = useState<WorldEdit['kind']>('preserve-entity');
  const [ent, setEnt] = useState('');
  const [into, setInto] = useState('');
  const [ev, setEv] = useState('');
  const [text, setText] = useState('');
  const fork = dayOf(world.forkDate);
  const forkState = bw.stateAt(fork);
  const ents = useMemo(() => {
    const ids = new Set<string>();
    for (const f of forkState.recs) {
      const o = bw.ownerOf(forkState, f);
      if (o) ids.add(o);
    }
    return [...ids].map((id) => ({ id, name: ruName(engine.entityName(id, fork).source) })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [bw, forkState, engine, fork]);
  const events = useMemo(() => engine.events.filter((e) => e.date > world.forkDate && (e.category === 'statehood' || e.category === 'border') && dayOf(e.date) <= fork + 3650).slice(0, 200), [engine, world.forkDate, fork]);
  const draft: WorldEdit | null =
    kind === 'assumption'
      ? text.trim()
        ? { id: 'draft', day: world.forkDate, kind, text: text.trim() }
        : null
      : kind === 'suppress-event'
        ? ev
          ? { id: 'draft', day: world.forkDate, kind, eventId: ev }
          : null
        : kind === 'merge-entities'
          ? ent && into && ent !== into
            ? { id: 'draft', day: world.forkDate, kind, absorbed: ent, into }
            : null
          : ent
            ? { id: 'draft', day: world.forkDate, kind, entity: ent }
            : null;
  // Предварительный просмотр последствий: сколько событий будет пропущено на дату эпизода
  const preview = useMemo(() => {
    if (!draft) return null;
    const epDay = dayOf(doc.episode.date);
    const now = bw.stateAt(epDay);
    const next = new BranchWorld(engine, { ...world, edits: [...world.edits, draft] }).stateAt(epDay);
    const was = new Set(now.skipped.map((s) => s.event.id));
    return next.skipped.filter((s) => !was.has(s.event.id));
  }, [draft, bw, engine, world, doc.episode.date]);
  const name = (id: string) => ents.find((e) => e.id === id)?.name ?? id;
  const describe = (e: WorldEdit) =>
    e.kind === 'assumption' ? e.text : e.kind === 'merge-entities' ? `${name(e.absorbed)} → ${name(e.into)}` : e.kind === 'suppress-event' ? e.eventId : name(e.entity);

  return (
    <div style={{ marginTop: 10 }}>
      <div className="section-label">Изменения мира в ветке ({world.edits.length})</div>
      <ul className="xs sc-edits">
        {world.edits.map((e) => (
          <li key={e.id}>
            <span className={`sc-prov sc-prov-${e.kind === 'assumption' ? 'assumption' : 'user'}`}>{e.kind === 'assumption' ? 'допущение' : 'пользователь'}</span> {EDIT_RU[e.kind]}: {describe(e)}{' '}
            <button className="link-btn" onClick={() => commit(`Отменено изменение мира: ${EDIT_RU[e.kind]}`, (d) => void ((d.world as HistoricalWorld).edits = (d.world as HistoricalWorld).edits.filter((x) => x.id !== e.id)))}>
              убрать
            </button>
          </li>
        ))}
      </ul>
      <label className="field small">
        <span className="field-label">Новое изменение (с даты ветвления)</span>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as WorldEdit['kind'])}>
          {(Object.keys(EDIT_RU) as WorldEdit['kind'][]).map((k) => (
            <option key={k} value={k}>
              {EDIT_RU[k]}
            </option>
          ))}
        </select>
      </label>
      {(kind === 'remove-entity' || kind === 'preserve-entity' || kind === 'merge-entities') && (
        <label className="field small">
          <span className="field-label">{kind === 'merge-entities' ? 'Поглощаемый субъект' : 'Субъект'}</span>
          <select className="select" value={ent} onChange={(e) => setEnt(e.target.value)}>
            <option value="">— выберите —</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'merge-entities' && (
        <label className="field small">
          <span className="field-label">С кем объединить</span>
          <select className="select" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">— выберите —</option>
            {ents.filter((e) => e.id !== ent).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'suppress-event' && (
        <label className="field small">
          <span className="field-label">Историческое событие после ветвления (государства и границы, 10 лет)</span>
          <select className="select" value={ev} onChange={(e) => setEv(e.target.value)}>
            <option value="">— выберите —</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.date}: {eventTitle(e, engine)}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'assumption' && <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: в этой ветке переговоры сорваны" aria-label="Текст допущения" />}
      {preview && (
        <div className="sc-preview-box xs" role="status">
          <strong>Предварительный просмотр:</strong>{' '}
          {preview.length ? `на дату эпизода дополнительно будет пропущено исторических событий — ${preview.length}.` : 'на дату эпизода новых пропусков исторических событий нет.'}
          <ul>
            {preview.slice(0, 5).map((s) => (
              <li key={s.event.id}>
                {s.event.date}: {eventTitle(s.event, engine)} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        className="btn btn-sm btn-primary"
        disabled={!draft}
        onClick={() => {
          if (!draft) return;
          commit(`Изменение мира: ${EDIT_RU[draft.kind]} — ${describe(draft)}`, (d) => {
            const w = d.world as HistoricalWorld;
            let n = 1;
            while (w.edits.some((x) => x.id === `e${n}`)) n++;
            w.edits.push({ ...draft, id: `e${n}` });
          }, draft.kind === 'assumption' ? 'assumption' : 'user');
          setEnt('');
          setInto('');
          setEv('');
          setText('');
        }}
      >
        Применить к ветке
      </button>
    </div>
  );
}

/* ———— Погода ———— */

const CACHE = 'atlas.weather.snapshots';
function cachedSnapshots(): WeatherSnapshot[] {
  return loadJSON<WeatherSnapshot[]>(CACHE, []);
}
function cacheSnapshot(s: WeatherSnapshot) {
  saveJSON(CACHE, [s, ...cachedSnapshots().filter((x) => x.id !== s.id)].slice(0, 12));
}

const fmtVal = (v: number | null, unit: string) => (v === null ? 'нет данных' : `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`);

export function WeatherPanel({ doc, commit }: { doc: ScenarioDoc; commit: Commit }) {
  const w = doc.weather;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const fictional = doc.world.kind === 'test-scene';
  const hour = Number(doc.episode.startTime.slice(0, 2));
  const fallback = cachedSnapshots().find((s) => w.source !== 'manual' && s.source === w.source && (s.source === 'current' ? s.validTime.startsWith(today) : s.validTime.startsWith(`${doc.episode.date}T${String(hour).padStart(2, '0')}`)));
  const ex = effectsFor(w);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const snap = w.source === 'archive' ? await fetchArchive(doc.region.bbox, doc.episode.date, hour, 4) : await fetchCurrent(doc.region.bbox, 4);
      cacheSnapshot(snap);
      commit(`Погодный снимок загружен: ${snap.source === 'archive' ? 'архив ERA5' : 'текущая погода'}, ${snap.validTime} (Open-Meteo, CC BY 4.0)`, (d) => void (d.weather.snapshot = snap));
    } catch (e) {
      setErr(e instanceof WeatherError ? e.message : `Не удалось получить данные: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const setSource = (src: WeatherSource) =>
    commit(`Источник погоды: ${{ archive: 'архив на дату', current: 'текущая', manual: 'ручные условия' }[src]}`, (d) => {
      d.weather.source = src;
      if (d.weather.snapshot && d.weather.snapshot.source !== src) d.weather.snapshot = null; // архив и текущая не подменяют друг друга
    });
  const setManual = (patch: Partial<ManualWeather>) => commit('Ручные погодные условия', (d) => void (d.weather.manual = { ...d.weather.manual, ...patch }), 'assumption');
  const vals = w.snapshot && w.source !== 'manual' ? centerValues(w.snapshot) : null;

  return (
    <div className="sc-wx-panel">
      <div className="sc-radio" role="radiogroup" aria-label="Источник погоды">
        <label className="check small">
          <input type="radio" name="wxsrc" checked={w.source === 'archive'} disabled={fictional} onChange={() => setSource('archive')} />
          Архивная погода на {doc.episode.date} (ERA5)
        </label>
        <label className="check small">
          <input type="radio" name="wxsrc" checked={w.source === 'current'} disabled={fictional || doc.episode.date !== today} onChange={() => setSource('current')} />
          Текущая погода {doc.episode.date !== today ? '(только для сценария с сегодняшней датой)' : ''}
        </label>
        <label className="check small">
          <input type="radio" name="wxsrc" checked={w.source === 'manual'} onChange={() => setSource('manual')} />
          Ручные условия (не исторические)
        </label>
      </div>
      {fictional && <p className="xs muted">Испытательная сцена вымышлена: у неё нет реальной погоды, доступны только ручные условия.</p>}

      {w.source !== 'manual' && (
        <div>
          <button className="btn btn-sm" disabled={busy} onClick={load}>
            {busy ? 'Загрузка…' : w.snapshot ? 'Загрузить снимок заново' : 'Загрузить снимок Open-Meteo'}
          </button>
          {w.source === 'archive' && <span className="xs muted"> ERA5 обновляется с задержкой около {ERA5_DELAY_DAYS} дней.</span>}
          {err && (
            <div className="notice notice-coral" role="alert" style={{ marginTop: 8 }}>
              <div className="small">
                <strong>Погода не загружена.</strong> {err}
                <div className="transport" style={{ marginTop: 6 }}>
                  {fallback && (
                    <button className="btn btn-sm" onClick={() => commit(`Использован сохранённый снимок от ${fallback.fetchedAt}`, (d) => void (d.weather.snapshot = fallback))}>
                      Сохранённый снимок ({fallback.validTime})
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => setSource('manual')}>
                    Ручные условия
                  </button>
                </div>
                <p className="xs muted" style={{ margin: '6px 0 0' }}>
                  {w.source === 'archive' ? 'Текущая погода вместо архивной не подставляется.' : 'Архивная погода вместо текущей не подставляется.'} Без снимка эпизод пойдёт с игровым пресетом.
                </p>
              </div>
            </div>
          )}
          {w.snapshot && vals && (
            <div className="sc-wx-data">
              <table className="table xs">
                <tbody>
                  {WEATHER_VARS.filter((v) => v !== 'wind_direction_10m' && v !== 'wind_direction_100m').map((v) => (
                    <tr key={v}>
                      <th scope="row">{VAR_RU[v]}</th>
                      <td className="mono">
                        {v === 'weather_code'
                          ? vals.weather_code === null
                            ? 'нет данных'
                            : `${vals.weather_code} — ${WMO_RU[vals.weather_code] ?? 'код не описан'}`
                          : v.startsWith('wind_speed')
                            ? `${fmtVal(vals[v], 'м/с')}${vals[v.replace('speed', 'direction') as typeof v] !== null ? `, из ${vals[v.replace('speed', 'direction') as typeof v]}°` : ''}`
                            : fmtVal(vals[v], w.snapshot!.units[v] ?? '')}
                      </td>
                    </tr>
                  ))}
                  {w.snapshot.upper?.map((u) => (
                    <tr key={u.hPa}>
                      <th scope="row">Ветер {u.hPa} гПа{u.heightM !== null ? ` (≈${Math.round(u.heightM)} м)` : ''}</th>
                      <td className="mono">
                        {fmtVal(u.windSpeed, 'м/с')}
                        {u.windDir !== null ? `, из ${u.windDir}°` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="xs muted">
                Источник: {w.snapshot.provider}, модель <span className="mono">{w.snapshot.model}</span>. {w.snapshot.modelNote} Время данных: <span className="mono">{w.snapshot.validTime}</span>; получено{' '}
                <span className="mono">{w.snapshot.fetchedAt.slice(0, 16).replace('T', ' ')}</span> UTC. Центр области; сетка {w.snapshot.gridSize}×{w.snapshot.gridSize}. {w.snapshot.attribution}.
                {w.snapshot.synthetic && ' Учебный синтетический снимок — не данные источника.'}
              </p>
              <p className="xs muted">
                Для сравнения можно открыть{' '}
                <a href="https://www.ventusky.com/" target="_blank" rel="noopener noreferrer">
                  Ventusky <IconExternal size={11} />
                </a>{' '}
                и вручную выбрать дату и точку {w.snapshot.center.lat}° с. ш., {w.snapshot.center.lon}° в. д. Данные Ventusky в сценарий не попадают.
              </p>
            </div>
          )}
        </div>
      )}

      {w.source === 'manual' && (
        <div className="sc-grid2" style={{ marginTop: 8 }}>
          <label className="field small" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">Название ручных условий</span>
            <input className="input" defaultValue={w.manual.label} key={w.manual.label} onBlur={(e) => e.target.value.trim() && setManual({ label: e.target.value.trim() })} />
          </label>
          <label className="field small">
            <span className="field-label">Явление</span>
            <select className="select" value={w.manual.phenomenon} onChange={(e) => setManual({ phenomenon: e.target.value as ManualWeather['phenomenon'] })}>
              <option value="none">без явлений</option>
              <option value="rain">дождь</option>
              <option value="snow">снег</option>
              <option value="storm">гроза</option>
              <option value="fog">туман</option>
            </select>
          </label>
          <ManualNum label="Ветер у земли, м/с" value={w.manual.windSpeed} onCommit={(v) => setManual({ windSpeed: v })} max={60} />
          <ManualNum label="Откуда дует, °" value={w.manual.windDir} onCommit={(v) => setManual({ windDir: v })} max={360} />
          <ManualNum label="Осадки, мм/ч" value={w.manual.precipitation} onCommit={(v) => setManual({ precipitation: v })} max={100} />
          <ManualNum label="Облачность, %" value={w.manual.cloudCover} onCommit={(v) => setManual({ cloudCover: v })} max={100} />
          <ManualNum label="Температура, °C" value={w.manual.temperature} onCommit={(v) => setManual({ temperature: v })} min={-80} max={60} />
          <p className="xs muted" style={{ gridColumn: '1 / -1' }}>Пустое поле означает «не задано», а не ноль.</p>
        </div>
      )}

      <div className="section-label">Игровые эффекты погоды</div>
      <label className="field small">
        <span className="field-label">Игровой пресет</span>
        <select className="select" value={w.effectPreset} onChange={(e) => commit(`Игровой погодный пресет: ${e.target.value}`, (d) => void (d.weather.effectPreset = e.target.value), 'assumption')}>
          <option value="auto">Автоматически по данным (документированные пороги)</option>
          {GAME_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="check small">
        <input type="checkbox" checked={w.useDataWind} onChange={(e) => commit(`Ветер игровых слоёв из данных: ${e.target.checked ? 'да' : 'нет'}`, (d) => void (d.weather.useDataWind = e.target.checked), 'assumption')} />
        Брать ветер игровых слоёв из данных, где источник его даёт
      </label>
      <ul className="xs sc-wx-lines">
        {ex.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
        <li>
          Множители: обнаружение ×{ex.effects.detectFactor}, время классификации ×{ex.effects.classifyFactor}, болтанка {ex.effects.turbulence} град/с. Это игровые эффекты, а не физические поправки для какого-либо оружия.
        </li>
      </ul>
      <p className="xs muted">Для повтора сценарий использует сохранённый снимок, а не новый запрос к API.</p>
    </div>
  );
}

function ManualNum({ label, value, onCommit, min = 0, max }: { label: string; value: number | null; onCommit: (v: number | null) => void; min?: number; max: number }) {
  return (
    <label className="field small">
      <span className="field-label">{label}</span>
      <input
        className="input mono"
        inputMode="decimal"
        defaultValue={value ?? ''}
        key={String(value)}
        placeholder="не задано"
        onBlur={(e) => {
          const t = e.target.value.trim().replace(',', '.');
          if (t === '') return value !== null && onCommit(null);
          const v = Number(t);
          if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v);
        }}
      />
    </label>
  );
}

export { SIDE_COLORS };
