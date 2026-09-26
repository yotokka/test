import { useEffect, useState, type DragEvent } from 'react';
import { CATEGORY_RU, CLASS_BY_ID, KIND_RU, PLACEABLE, isAircraft } from '../../game/classes';
import { cmdTitle } from '../../game/engine';
import type { CommandBody, GameClass } from '../../game/types';
import { availability, CAT_RU, VARIANTS, type CatCategory } from '../../data/reference/catalog';
import type { EditorState } from '../../scenario/editor';
import { kmToLonLat } from '../../scenario/geo';
import { GROUND_PHASE_RU, MISSION_RU, MISSIONS_FOR, OUTCOME_RU, PHASE_RU } from '../../scenario/labels';
import type { PlacedObject, ScenarioDoc } from '../../scenario/types';
import type { MapLayers } from './ScenarioMap';
import type { DisplayEnt } from './useEpisode';

/* ———————————————— Левая панель: каталог, дерево, слои ———————————————— */

const GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: 'air', label: 'Самолёты', kinds: ['fighter', 'bomber', 'recon', 'support'] },
  { id: 'uav', label: 'Беспилотники', kinds: ['uav'] },
  { id: 'ad', label: 'ПВО и наблюдение', kinds: ['ad-post', 'radar'] },
  { id: 'ground', label: 'Наземные', kinds: ['airfield', 'launcher'] },
];

export function LeftPanel({
  doc,
  mode,
  selection,
  addClassId,
  addSide,
  setAddSide,
  onPickClass,
  onSelect,
  layers,
  setLayers,
  runtime,
}: {
  doc: ScenarioDoc;
  mode: 'edit' | 'play';
  selection: string[];
  addClassId: string | null;
  addSide: string;
  setAddSide: (s: string) => void;
  onPickClass: (id: string | null) => void;
  onSelect: (ids: string[], mode: 'replace' | 'toggle') => void;
  layers: MapLayers;
  setLayers: (l: MapLayers) => void;
  runtime: DisplayEnt[] | null;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [treeQ, setTreeQ] = useState('');
  const classes = PLACEABLE.filter((c) => (!group || GROUPS.find((g) => g.id === group)!.kinds.includes(c.kind)) && `${c.code} ${c.name} ${KIND_RU[c.kind]}`.toLowerCase().includes(q.trim().toLowerCase()));
  const items = runtime
    ? runtime.filter((e) => e.kind !== 'air-missile' && e.kind !== 'sam-missile').map((e) => ({ id: e.id, label: e.label, classId: e.classId, side: e.side, status: e.kind === 'ad-post' || e.kind === 'radar' || e.kind === 'airfield' || e.kind === 'launcher' ? GROUND_PHASE_RU[e.phase] ?? e.phase : e.phase === 'done' ? OUTCOME_RU[e.outcome] : PHASE_RU[e.phase] }))
    : doc.objects.map((o) => ({ id: o.id, label: o.label, classId: o.classId, side: o.side, status: '' }));
  const tq = treeQ.trim().toLowerCase();
  const filtered = tq ? items.filter((i) => `${i.label} ${CLASS_BY_ID[i.classId].name} ${CLASS_BY_ID[i.classId].code} ${doc.participants.find((p) => p.id === i.side)?.name ?? ''}`.toLowerCase().includes(tq)) : items;

  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/x-atlas-class', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <section className="sc-left panel" aria-label="Каталог, объекты сценария и слои">
      <details open={mode === 'edit'} className="hleft-block">
        <summary className="panel-title">Каталог игровых объектов</summary>
        {mode === 'play' ? (
          <p className="xs muted">Во время запуска состав сценария не меняется: это новое начальное состояние. Поставьте на паузу и продолжите новой веткой.</p>
        ) : (
          <>
            <label className="field">
              <span className="visually-hidden">Поиск по каталогу</span>
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: истребитель, З-θ…" />
            </label>
            <div className="filter-row" role="group" aria-label="Фильтр каталога" style={{ margin: '8px 0' }}>
              {GROUPS.map((g) => (
                <button key={g.id} className="btn btn-sm" aria-pressed={group === g.id} onClick={() => setGroup(group === g.id ? null : g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <label className="field small">
              <span className="field-label">Сторона новых объектов</span>
              <select className="select" value={addSide} onChange={(e) => setAddSide(e.target.value)}>
                {doc.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ul className="sc-catalog" aria-label="Игровые классы">
              {classes.map((c) => (
                <li key={c.id}>
                  <button
                    className="sc-cat-item"
                    draggable
                    onDragStart={(e) => onDragStart(e, c.id)}
                    aria-pressed={addClassId === c.id}
                    onClick={() => onPickClass(addClassId === c.id ? null : c.id)}
                    title={`${c.description} Перетащите на карту или нажмите и выберите место (клавиатура: стрелки и Enter).`}
                  >
                    <span className="mono sc-code">{c.code}</span>
                    <span>
                      {c.name}
                      <span className="xs muted" style={{ display: 'block' }}>
                        {KIND_RU[c.kind]}
                        {c.weapon ? ` · совместим: ${Object.keys(c.weapon.compat).map((k) => CATEGORY_RU[k]).join(', ')}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {classes.length === 0 && <p className="small muted">Ничего не найдено.</p>}
            <p className="xs muted">Все классы — игровые профили с вымышленными параметрами. Историческое название можно добавить к объекту в свойствах.</p>
          </>
        )}
      </details>
      <details open className="hleft-block">
        <summary className="panel-title">Объекты сценария ({items.length})</summary>
        <label className="field">
          <span className="visually-hidden">Поиск по сценарию</span>
          <input className="input" type="search" value={treeQ} onChange={(e) => setTreeQ(e.target.value)} placeholder="Поиск по сценарию" />
        </label>
        {doc.participants.map((p) => {
          const list = filtered.filter((i) => i.side === p.id);
          if (!list.length) return null;
          return (
            <div key={p.id} className="sc-tree-group">
              <div className="xs sc-tree-side">
                <i style={{ background: p.color }} aria-hidden="true" /> {p.name}
              </div>
              <ul className="hresults" role="listbox" aria-multiselectable="true" aria-label={`Объекты стороны ${p.name}`}>
                {list.map((i) => (
                  <li key={i.id} role="option" aria-selected={selection.includes(i.id)}>
                    <button className="hresult" aria-current={selection.includes(i.id) ? 'true' : undefined} onClick={(e) => onSelect([i.id], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}>
                      <span>
                        {!i.label.startsWith(CLASS_BY_ID[i.classId].code) && <span className="mono xs">{CLASS_BY_ID[i.classId].code} </span>}
                        {i.label}
                      </span>
                      <span className="xs muted">{i.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="small muted">{items.length ? 'По запросу ничего нет.' : 'Объектов пока нет: выберите класс в каталоге.'}</p>}
      </details>
      <details className="hleft-block">
        <summary className="panel-title">Слои карты</summary>
        <div className="hlayers">
          {(
            [
              ['borders', 'Границы'],
              ['labels', 'Подписи (постоянные)'],
              ['routes', 'Маршруты и области назначения'],
              ['ranges', 'Радиусы выделенного'],
              ['trails', 'Следы'],
              ['wind', 'Погода: линии ветра'],
              ['precip', 'Погода: осадки, туман'],
              ['compare', 'Сравнить с историей'],
              ['grid', 'Сетка км'],
            ] as [keyof MapLayers, string][]
          ).map(([k, label]) => (
            <label key={k} className="check small">
              <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} disabled={k === 'compare' && doc.world.kind !== 'historical'} />
              {label}
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}

/* ———————————————— Свойства объекта ———————————————— */

const CAT_FOR_KIND: Partial<Record<string, CatCategory[]>> = {
  fighter: ['fighter'],
  bomber: ['bomber'],
  recon: ['recon-support'],
  support: ['recon-support'],
  uav: ['uav'],
  'ad-post': ['sam'],
  launcher: ['ballistic', 'cruise'],
};

function Num({ label, value, onCommit, unit, min, max, step = 1, disabled, hint }: { label: string; value: number | null | undefined; onCommit: (v: number | null) => void; unit: string; min?: number; max?: number; step?: number; disabled?: boolean; hint?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const [err, setErr] = useState('');
  useEffect(() => setText(value === null || value === undefined ? '' : String(value)), [value]);
  const commitText = () => {
    if (text.trim() === '') return onCommit(null);
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max)) {
      setErr(`Допустимо: ${min ?? '−∞'}…${max ?? '∞'} ${unit}`);
      return;
    }
    setErr('');
    onCommit(v);
  };
  return (
    <label className="field small">
      <span className="field-label">
        {label}, {unit}
      </span>
      <input className="input mono" inputMode="decimal" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && commitText()} step={step} aria-invalid={!!err} />
      {hint && <span className="xs muted">{hint}</span>}
      {err && <span className="xs" style={{ color: 'var(--coral)' }}>{err}</span>}
    </label>
  );
}

export function ObjectCard({
  doc,
  o,
  runtime,
  mode,
  pinned,
  onPin,
  onPatch,
  onRoute,
  onPayload,
  onTool,
  onCommand,
  onWhy,
  commandBlock,
}: {
  doc: ScenarioDoc;
  o: PlacedObject | null;
  runtime: DisplayEnt | null;
  mode: 'edit' | 'play';
  pinned: boolean;
  onPin: () => void;
  onPatch: (patch: Partial<PlacedObject>, what: string) => void;
  onRoute: (route: PlacedObject['route'], what: string) => void;
  onPayload: (p: PlacedObject['payload']) => void;
  onTool: (t: 'route' | 'aim') => void;
  onCommand: (c: CommandBody) => void;
  onWhy: (seq: number) => void;
  commandBlock: string | null;
}) {
  const classId = o?.classId ?? runtime!.classId;
  const c: GameClass = CLASS_BY_ID[classId];
  const label = o?.label ?? runtime!.label;
  const side = doc.participants.find((p) => p.id === (o?.side ?? runtime!.side));
  const editable = mode === 'edit' && !!o;
  const lonlat = o && doc.frame ? kmToLonLat(doc.frame, o.pos.x, o.pos.y) : null;
  const cats = CAT_FOR_KIND[c.kind] ?? [];
  const variants = VARIANTS.filter((v) => cats.includes(v.family.category));
  const avail = o?.histRef ? availability(o.histRef, side?.entityId ?? null, doc.episode.date) : null;
  const hist = o?.histRef ? VARIANTS.find((v) => v.id === o.histRef) : null;

  return (
    <div className="sc-card">
      <div className="sc-card-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>
            {c.code} · {KIND_RU[c.kind]}
          </div>
          <h3 style={{ margin: 0 }}>{label}</h3>
          <div className="xs muted">
            <i className="sc-dot" style={{ background: side?.color }} aria-hidden="true" /> {side?.name}
          </div>
        </div>
        <button className="btn btn-sm" aria-pressed={pinned} onClick={onPin} title="Закреплённая карточка остаётся на экране при выборе других объектов">
          {pinned ? '📌 Закреплено' : 'Закрепить'}
        </button>
      </div>
      <p className="xs muted" style={{ margin: '6px 0 10px' }}>
        Игровой профиль «{c.name}»: параметры вымышлены. {c.description}
      </p>
      {hist && (
        <div className={`sc-hist ${avail?.status === 'confirmed' ? '' : 'sc-hist-warn'}`}>
          <div className="xs">Историческая подпись: <strong>{hist.name}</strong> ({hist.family.name})</div>
          <div className="xs">{avail?.status === 'confirmed' ? 'Эксплуатация стороной на дату подтверждена справочником' : 'Допущение сценария'}: {avail?.text}</div>
          <div className="xs muted">Параметры в игре — игровой профиль {c.code}, а не характеристики «{hist.name}».</div>
        </div>
      )}

      {mode === 'play' && runtime && <RuntimeBlock doc={doc} e={runtime} onCommand={onCommand} onWhy={onWhy} block={commandBlock} />}

      {editable && o && (
        <div className="sc-form">
          <label className="field small">
            <span className="field-label">Подпись</span>
            <input className="input" defaultValue={o.label} key={`l${o.id}${o.label}`} onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && onPatch({ label: e.target.value.trim() }, 'подпись')} />
          </label>
          <label className="field small">
            <span className="field-label">Сторона</span>
            <select className="select" value={o.side} onChange={(e) => onPatch({ side: e.target.value }, 'сторона')}>
              {doc.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {variants.length > 0 && (
            <label className="field small">
              <span className="field-label">Историческое название (подпись к игровому профилю)</span>
              <select className="select" value={o.histRef ?? ''} onChange={(e) => onPatch({ histRef: e.target.value || null }, 'историческая подпись')}>
                <option value="">— без исторической подписи —</option>
                {cats.map((cat) => (
                  <optgroup key={cat} label={CAT_RU[cat]}>
                    {variants
                      .filter((v) => v.family.category === cat)
                      .map((v) => {
                        const a = availability(v.id, side?.entityId ?? null, doc.episode.date);
                        return (
                          <option key={v.id} value={v.id} disabled={doc.settings.availability === 'strict' && a.status !== 'confirmed'}>
                            {v.name}
                            {a.status === 'confirmed' ? ' ✓' : ' — не подтверждено'}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
              <span className="xs muted">✓ — эксплуатация этой стороной на {doc.episode.date} подтверждена источником. Режим доступности: {doc.settings.availability === 'strict' ? 'строгий' : doc.settings.availability === 'warn' ? 'с предупреждением' : 'свободный'}.</span>
            </label>
          )}
          <div className="sc-grid2">
            <Num label="x (восток)" unit="км" value={o.pos.x} onCommit={(v) => v !== null && onPatch({ pos: { ...o.pos, x: v } }, 'положение')} />
            <Num label="y (север)" unit="км" value={o.pos.y} onCommit={(v) => v !== null && onPatch({ pos: { ...o.pos, y: v } }, 'положение')} />
          </div>
          {lonlat && <div className="xs muted mono">≈ {lonlat[1].toFixed(2)}° с. ш., {lonlat[0].toFixed(2)}° в. д.</div>}
          <Num label="Появление в эпизоде" unit="с" value={o.startS} min={0} max={doc.episode.durationS} onCommit={(v) => onPatch({ startS: v ?? 0 }, 'время появления')} hint={`${Math.floor(o.startS / 60)} мин ${o.startS % 60} с от начала`} />
          {isAircraft(c.kind) && (
            <>
              <label className="field small">
                <span className="field-label">Сценарное действие</span>
                <select className="select" value={o.mission} onChange={(e) => onPatch({ mission: e.target.value as PlacedObject['mission'] }, 'задача')}>
                  {(MISSIONS_FOR[c.kind] ?? []).map((m) => (
                    <option key={m} value={m}>
                      {MISSION_RU[m]}
                    </option>
                  ))}
                </select>
              </label>
              {['patrol', 'recon', 'intercept-area'].includes(o.mission) && <Num label="Продолжительность действия" unit="с" min={60} max={14400} value={o.holdS ?? 600} onCommit={(v) => onPatch({ holdS: v ?? 600 }, 'продолжительность действия')} />}
              <div className="sc-grid2">
                <Num label="Начальная высота" unit="м" min={0} max={c.motion?.maxAlt} value={o.alt ?? 0} onCommit={(v) => onPatch({ alt: v }, 'высота')} hint="0 — взлёт с земли" />
                <Num label="Скорость" unit="× крейсерской" min={0.5} max={1.2} step={0.05} value={o.speedFactor ?? 1} onCommit={(v) => onPatch({ speedFactor: v ?? 1 }, 'скорость')} />
              </div>
              <div className="section-label">Маршрут ({o.route.length} точек)</div>
              <ol className="sc-route">
                {o.route.map((w, i) => (
                  <li key={i} className="xs mono">
                    {i + 1}. {w.x.toFixed(0)}, {w.y.toFixed(0)} км{w.alt ? `, ${w.alt} м` : ''}
                    <button className="link-btn" onClick={() => onRoute(o.route.filter((_, j) => j !== i), `удалена точка маршрута ${i + 1}`)} aria-label={`Удалить точку ${i + 1}`}>
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
              <div className="transport">
                <button className="btn btn-sm" onClick={() => onTool('route')} title="Щёлкайте по карте, чтобы добавить точки (R)">
                  + Точки маршрута
                </button>
                {o.route.length > 0 && (
                  <button className="btn btn-sm btn-ghost" onClick={() => onRoute([], 'маршрут очищен')}>
                    Очистить
                  </button>
                )}
              </div>
            </>
          )}
          {c.payloadClasses && <PayloadEditor o={o} c={c} onPayload={onPayload} onTool={onTool} />}
          {c.weapon && (
            <Num label="Условный запас" unit="у.е." min={0} max={99} value={o.stock ?? c.weapon.stock} onCommit={(v) => onPatch({ stock: v === null ? null : Math.floor(v) }, 'запас')} hint={`По умолчанию класса: ${c.weapon.stock} у.е.; множитель ресурсов — в расширенных настройках.`} />
          )}
          {o.note && <p className="xs muted">{o.note}</p>}
        </div>
      )}
      <dl className="dl xs sc-params">
        {c.motion && (
          <>
            <dt>Игровая скорость</dt>
            <dd>{c.motion.cruiseSpeed} м/с (макс. {c.motion.maxSpeed})</dd>
            {c.motion.turnRate > 0 && (
              <>
                <dt>Поворот</dt>
                <dd>{c.motion.turnRate} град/с</dd>
              </>
            )}
          </>
        )}
        {c.sensor && (
          <>
            <dt>Условный датчик</dt>
            <dd>{c.sensor.rangeKm} км</dd>
          </>
        )}
        {c.weapon && (
          <>
            <dt>Игровой рубеж</dt>
            <dd>{c.weapon.rangeKm} км, задержка {c.weapon.cooldownS} с</dd>
            <dt>Совместимость</dt>
            <dd>{Object.entries(c.weapon.compat).map(([k, v]) => `${CATEGORY_RU[k]} ×${v}`).join('; ')}</dd>
          </>
        )}
        {c.enduranceS && (
          <>
            <dt>Игровое топливо</dt>
            <dd>{Math.round(c.enduranceS / 60)} мин полёта</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function PayloadEditor({ o, c, onPayload, onTool }: { o: PlacedObject; c: GameClass; onPayload: (p: PlacedObject['payload']) => void; onTool: (t: 'aim') => void }) {
  const total = o.payload.reduce((a, p) => a + p.count, 0);
  const last = o.route[o.route.length - 1] ?? o.pos;
  return (
    <div>
      <div className="section-label">
        Нагрузка: {total} из {c.payloadMax}
      </div>
      {o.payload.map((p, i) => (
        <div key={i} className="sc-grid2" style={{ alignItems: 'end' }}>
          <label className="field small">
            <span className="field-label">Класс</span>
            <select className="select" value={p.classId} onChange={(e) => onPayload(o.payload.map((q, j) => (j === i ? { ...q, classId: e.target.value } : q)))}>
              {c.payloadClasses!.map((id) => (
                <option key={id} value={id}>
                  {CLASS_BY_ID[id].code} — {CLASS_BY_ID[id].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field small">
            <span className="field-label">Количество</span>
            <input className="input mono" type="number" min={0} max={c.payloadMax} value={p.count} onChange={(e) => onPayload(o.payload.map((q, j) => (j === i ? { ...q, count: Math.max(0, Number(e.target.value) || 0) } : q)))} />
          </label>
          <div className="xs mono muted" style={{ gridColumn: '1 / -1' }}>
            условная область назначения: {p.aim.x.toFixed(0)}, {p.aim.y.toFixed(0)} км{' '}
            <button className="link-btn" onClick={() => onPayload(o.payload.filter((_, j) => j !== i))}>
              убрать
            </button>
          </div>
        </div>
      ))}
      <div className="transport">
        <button className="btn btn-sm" disabled={total >= (c.payloadMax ?? 0)} onClick={() => onPayload([...o.payload, { classId: c.payloadClasses![0], count: 1, aim: { x: last.x - 50, y: last.y } }])}>
          + Нагрузка
        </button>
        {o.payload.length > 0 && (
          <button className="btn btn-sm" onClick={() => onTool('aim')} title="Щелчок по карте задаёт условную область назначения первой нагрузки">
            Задать область на карте
          </button>
        )}
      </div>
      <p className="xs muted">Нагрузка принадлежит этому объекту и отделяется один раз (П-16). Дальше отделившийся объект существует самостоятельно.</p>
    </div>
  );
}

function RuntimeBlock({ doc, e, onCommand, onWhy, block }: { doc: ScenarioDoc; e: DisplayEnt; onCommand: (c: CommandBody) => void; onWhy: (seq: number) => void; block: string | null }) {
  const c = CLASS_BY_ID[e.classId];
  const air = isAircraft(e.kind) && (e.phase === 'flight' || e.phase === 'action' || e.phase === 'return');
  const ground = e.kind === 'ad-post' || e.kind === 'radar' || e.kind === 'airfield' || e.kind === 'launcher';
  const gs = Math.hypot(e.gvx, e.gvy);
  const hdg = ((Math.atan2(e.hx, e.hy) * 180) / Math.PI + 360) % 360;
  const trk = gs > 1 ? ((Math.atan2(e.gvx, e.gvy) * 180) / Math.PI + 360) % 360 : hdg;
  const cmd = (b: CommandBody) => () => onCommand(b);
  return (
    <div className="sc-runtime">
      <dl className="dl xs">
        <dt>Состояние</dt>
        <dd>{ground ? GROUND_PHASE_RU[e.phase] : PHASE_RU[e.phase]}{e.phase === 'done' ? ` — ${OUTCOME_RU[e.outcome]}` : ''}</dd>
        {!ground && (
          <>
            <dt>Высота</dt>
            <dd className="mono">{Math.round(e.dalt)} м</dd>
            <dt>Воздушная / путевая скорость</dt>
            <dd className="mono">
              {Math.round(e.spd)} / {Math.round(gs)} м/с
            </dd>
            <dt>Курс / путь</dt>
            <dd className="mono">
              {Math.round(hdg)}° / {Math.round(trk)}°{Math.abs(((trk - hdg + 540) % 360) - 180) > 1 ? ' (снос ветром)' : ''}
            </dd>
          </>
        )}
        {c.enduranceS && (
          <>
            <dt>Игровое топливо</dt>
            <dd className="mono">{Math.round(e.fuel / 60)} мин</dd>
          </>
        )}
        {c.weapon && (
          <>
            <dt>Запас</dt>
            <dd className="mono">{e.stock} у.е.{e.weaponsFree ? '' : ' · пуски запрещены'}</dd>
          </>
        )}
        {e.payload.length > 0 && (
          <>
            <dt>Нагрузка</dt>
            <dd className="mono">{e.payload.reduce((a, p) => a + p.count, 0)} шт.</dd>
          </>
        )}
        {e.parentId && (
          <>
            <dt>Выпущен</dt>
            <dd>{doc.objects.find((x) => x.id === e.parentId)?.label ?? e.parentId}</dd>
          </>
        )}
      </dl>
      {(e.outcomeSeq > 0 || e.causeSeq > 0) && (
        <button className="btn btn-sm" onClick={() => onWhy(e.outcomeSeq || e.causeSeq)}>
          Почему?
        </button>
      )}
      {(air || c.weapon || e.payload.some((p) => p.count > 0)) && (
        <div style={{ marginTop: 10 }}>
          <div className="section-label">Немедленные команды</div>
          {block && <p className="xs" style={{ color: 'var(--amber)' }}>{block}</p>}
          <div className="transport">
            {air && (
              <>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'rtb', objectId: e.id })}>
                  {cmdTitle({ type: 'rtb', objectId: e.id })}
                </button>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'hold', objectId: e.id, seconds: 300 })}>
                  Ожидание 5 мин
                </button>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'set-alt', objectId: e.id, alt: Math.round(e.alt / 500) * 500 + 1000 })}>
                  Выше на 1000 м
                </button>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'set-alt', objectId: e.id, alt: Math.max(200, Math.round(e.alt / 500) * 500 - 1000) })}>
                  Ниже на 1000 м
                </button>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'set-speed', objectId: e.id, factor: 0.8 })}>
                  Скорость ×0,8
                </button>
                <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'set-speed', objectId: e.id, factor: 1.1 })}>
                  Скорость ×1,1
                </button>
              </>
            )}
            {e.payload.some((p) => p.count > 0) && air && (
              <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'release', objectId: e.id })}>
                Отделить нагрузку сейчас
              </button>
            )}
            {c.weapon && ground && (
              <button className="btn btn-sm" disabled={!!block} onClick={cmd({ type: 'weapons', unitId: e.id, mode: e.weaponsFree ? 'hold' : 'free' })}>
                {e.weaponsFree ? 'Запретить пуски' : 'Разрешить пуски'}
              </button>
            )}
          </div>
          <p className="xs muted">Команда применяется ровно один раз в текущий момент эпизода и сохраняется в сценарии для повтора.</p>
        </div>
      )}
    </div>
  );
}

/* ———————————————— Групповое редактирование ———————————————— */

export function GroupCard({ doc, ids, onPatch, preview }: { doc: ScenarioDoc; ids: string[]; onPatch: (patch: Partial<PlacedObject>, what: string) => void; preview: (patch: Partial<PlacedObject>) => string[] }) {
  const objs = doc.objects.filter((o) => ids.includes(o.id));
  const [side, setSide] = useState('');
  const [startS, setStartS] = useState('');
  const [speed, setSpeed] = useState('');
  const patch: Partial<PlacedObject> = {};
  if (side) patch.side = side;
  if (startS !== '' && Number.isFinite(Number(startS))) patch.startS = Math.max(0, Number(startS));
  if (speed !== '' && Number.isFinite(Number(speed))) patch.speedFactor = Math.max(0.5, Math.min(1.2, Number(speed)));
  const diff = preview(patch);
  return (
    <div className="sc-card">
      <h3>Выделено объектов: {objs.length}</h3>
      <ul className="xs" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
        {objs.slice(0, 12).map((o) => (
          <li key={o.id}>
            {o.label} <span className="muted">({CLASS_BY_ID[o.classId].code})</span>
          </li>
        ))}
        {objs.length > 12 && <li>…и ещё {objs.length - 12}</li>}
      </ul>
      <div className="section-label">Групповое изменение</div>
      <label className="field small">
        <span className="field-label">Сторона</span>
        <select className="select" value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">— не менять —</option>
          {doc.participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field small">
        <span className="field-label">Появление в эпизоде, с</span>
        <input className="input mono" inputMode="numeric" value={startS} onChange={(e) => setStartS(e.target.value)} placeholder="не менять" />
      </label>
      <label className="field small">
        <span className="field-label">Скорость, × крейсерской (0,5…1,2)</span>
        <input className="input mono" inputMode="decimal" value={speed} onChange={(e) => setSpeed(e.target.value.replace(',', '.'))} placeholder="не менять" />
      </label>
      <div className="section-label">Предварительный просмотр</div>
      {diff.length ? (
        <ul className="xs mono sc-preview">
          {diff.slice(0, 20).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : (
        <p className="xs muted">Изменений нет.</p>
      )}
      <button
        className="btn btn-primary btn-sm"
        disabled={!diff.length}
        onClick={() => {
          onPatch(patch, Object.keys(patch).join(', '));
          setSide('');
          setStartS('');
          setSpeed('');
        }}
      >
        Применить к {objs.length}
      </button>
    </div>
  );
}

export type { EditorState };
