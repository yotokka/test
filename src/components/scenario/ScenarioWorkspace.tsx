import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CLASS_BY_ID, PLACEABLE, isAircraft } from '../../game/classes';
import type { CommandBody, Vec } from '../../game/types';
import type { HistoryEngine } from '../../history/engine';
import { dayOf, fmtDay } from '../../history/time';
import { availability } from '../../data/reference/catalog';
import { loadJSON, saveJSON } from '../../lib/storage';
import { BranchWorld } from '../../scenario/branch';
import { addObject, canRedo, canUndo, commit, deleteObjects, duplicateObjects, isDirty, markSaved, moveObjects, previewPatch, redo, setPayload, setRoute, undo, updateObjects, type EditorState } from '../../scenario/editor';
import { forkChild } from '../../scenario/factory';
import { regionKm } from '../../scenario/geo';
import { autosave, exportFile } from '../../scenario/storage';
import type { ChangeEntry, PlacedObject, ScenarioDoc } from '../../scenario/types';
import { validateScenario, type Issue } from '../../scenario/validate';
import { EmptyState, Workspace, useAside } from '../Common';
import { IconInfo } from '../Icons';
import { BottomTabs, CalendarBar, EpisodeBar, WhyChain } from './BottomPanel';
import { ModeBar, type WorldMode } from './ModeBar';
import { defaultView, ScenarioMap, TOOL_RU, type MapLayers, type Tool, type View } from './ScenarioMap';
import { ScenarioSettings } from './SettingsPanel';
import { GroupCard, LeftPanel, ObjectCard } from './SidePanels';
import { useEpisode } from './useEpisode';
import { WeatherCanvas, weatherVisual } from './WeatherCanvas';

export const SIM_DISCLAIMER = 'Условная учебная модель. Не прогноз реальных боевых действий.';

const DEFAULT_LAYERS: MapLayers = { borders: true, labels: false, routes: true, ranges: true, trails: true, wind: true, precip: true, compare: false, grid: true };

interface Props {
  engine: HistoryEngine | null;
  editor: EditorState;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  mode: 'edit' | 'play';
  onMode: (m: WorldMode) => void;
  onNewDoc: (doc: ScenarioDoc, reason: string, mode?: 'edit' | 'play') => void;
  onOpenLibrary: () => void;
  onSaveSlot: () => void;
  savedAt: string | null;
  setSavedAt: (s: string) => void;
  toast: (s: string) => void;
}

export function ScenarioWorkspace({ engine, editor, setEditor, mode, onMode, onNewDoc, onOpenLibrary, onSaveSlot, savedAt, setSavedAt, toast }: Props) {
  const { doc } = editor;
  const { setOpen } = useAside();
  const [tool, setToolRaw] = useState<Tool>('select');
  const [addClassId, setAddClassId] = useState<string | null>(null);
  const [addSide, setAddSide] = useState(doc.participants[0]?.id ?? '');
  const [selection, setSelection] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string | null>(null);
  const [layers, setLayersRaw] = useState<MapLayers>(() => ({ ...DEFAULT_LAYERS, ...loadJSON<Partial<MapLayers>>('atlas.scenario.layers', {}) }));
  const [view, setView] = useState<View>(() => defaultView(doc));
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string | null; pos: Vec } | null>(null);
  const [why, setWhy] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const mapBox = useRef<HTMLDivElement>(null);
  const setLayers = (l: MapLayers) => {
    setLayersRaw(l);
    saveJSON('atlas.scenario.layers', l);
  };

  // Новый сценарий — новый вид и сброс выделения
  const docId = doc.id;
  useEffect(() => {
    setView(defaultView(doc));
    setSelection([]);
    setPinned(null);
    setWhy(null);
    setAddSide(doc.participants[0]?.id ?? '');
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!doc.participants.some((p) => p.id === addSide)) setAddSide(doc.participants[0]?.id ?? '');
  }, [doc.participants, addSide]);

  const setTool = (t: Tool) => {
    if (mode === 'play' && t !== 'select') return;
    setToolRaw(t);
    if (t === 'add') setCursor((c) => c ?? { x: view.cx, y: view.cy });
    else setCursor(null);
    if (t !== 'add') setAddClassId(null);
  };

  const commitDoc = useCallback((label: string, fn: (d: ScenarioDoc) => void, prov: ChangeEntry['prov'] = 'user') => setEditor((st) => (st ? commit(st, label, fn, prov) : st)), [setEditor]);
  const apply = (f: (st: EditorState) => EditorState) => setEditor((st) => (st ? f(st) : st));

  // Автосохранение с задержкой
  useEffect(() => {
    const t = setTimeout(() => {
      autosave(doc);
      setSavedAt(new Date().toISOString());
    }, 700);
    return () => clearTimeout(t);
  }, [doc, setSavedAt]);

  const bw = useMemo(() => (doc.world.kind === 'historical' && engine ? new BranchWorld(engine, doc.world) : null), [engine, JSON.stringify(doc.world)]); // eslint-disable-line react-hooks/exhaustive-deps
  const bs = useMemo(() => (bw ? bw.stateAt(dayOf(doc.episode.date)) : null), [bw, doc.episode.date]);
  const ep = useEpisode(doc, engine, mode === 'play');

  const today = new Date().toISOString().slice(0, 10);
  const issues: Issue[] = useMemo(() => {
    const reg = doc.frame ? regionKm(doc.region, doc.frame) : null;
    return validateScenario(doc, {
      today,
      entityExists: bw && bs ? (id) => bw.exists(bs, id) : undefined,
      availability: (ref, ent, date) => availability(ref, ent, date),
      inRegion: reg ? (x, y) => x >= reg.x0 - 50 && x <= reg.x1 + 50 && y >= reg.y0 - 50 && y <= reg.y1 + 50 : (x, y) => Math.abs(x) <= 520 && Math.abs(y) <= 340,
    });
  }, [doc, bw, bs, today]);
  const errors = issues.filter((i) => i.level === 'error');

  const start = () => {
    if (errors.length) {
      toast(`Запуск невозможен: ошибок в проверке — ${errors.length}. Откройте вкладку «Проверка».`);
      return;
    }
    onMode('play');
  };

  /* ———— Действия редактора ———— */

  const place = (pos: Vec, classId = addClassId) => {
    if (!classId || mode !== 'edit') return;
    if (!addSide) return toast('Сначала добавьте участника в основных настройках.');
    let newId = '';
    setEditor((st) => {
      if (!st) return st;
      const r = addObject(st, classId, addSide, pos);
      newId = r.id;
      return r.st;
    });
    setTimeout(() => newId && setSelection([newId]), 0);
    toast(`Добавлен ${CLASS_BY_ID[classId].code}. Esc — завершить добавление.`);
  };
  const del = (ids = selection) => {
    if (mode !== 'edit' || !ids.length) return;
    apply((st) => deleteObjects(st, ids));
    setSelection([]);
    if (pinned && ids.includes(pinned)) setPinned(null);
  };
  const dup = (ids = selection) => {
    if (mode !== 'edit' || !ids.length) return;
    let created: string[] = [];
    setEditor((st) => {
      if (!st) return st;
      const r = duplicateObjects(st, ids);
      created = r.ids;
      return r.st;
    });
    setTimeout(() => setSelection(created), 0);
  };
  const select = (ids: string[], m: 'replace' | 'toggle' | 'add') => {
    setSelection((cur) => (m === 'replace' ? ids : m === 'add' ? [...new Set([...cur, ...ids])] : ids.reduce((acc, id) => (acc.includes(id) ? acc.filter((x) => x !== id) : [...acc, id]), cur)));
    // На сенсорном экране панель открывается после завершения касания, иначе «щелчок» касания попадёт в затемнение и закроет её
    if (ids.length && window.matchMedia('(max-width: 1279px)').matches && m === 'replace') setTimeout(() => setOpen(true), 120);
  };
  const goto = (id: string, t?: number) => {
    setSelection([id]);
    setFocusId(null);
    setTimeout(() => setFocusId(id), 0);
    if (mode === 'play' && t !== undefined && Math.abs(t - ep.t) > 1) ep.seek(t);
  };
  const branchHere = () => {
    const child = forkChild(doc, { atT: mode === 'play' ? ep.t : null, name: mode === 'play' ? `Ветка от ${Math.floor(ep.t / 60)} мин эпизода` : undefined });
    onNewDoc(child, `Создана новая ветка «${child.branch.name}». Прежняя сохранена в списке.`, mode === 'play' ? 'play' : 'edit');
  };
  const command = (body: CommandBody) => {
    const ok = ep.canCommandNow();
    if (!ok.ok) {
      toast(ok.reason);
      return;
    }
    const c = ep.newCommand(body);
    commitDoc(`Команда в ${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')}: ${body.type}`, (d) => void d.commands.push(c));
  };

  /* ———— Клавиатура ———— */

  const keyState = useRef({ selection, tool, mode, view, cursor, ep, place, del, dup, editor });
  keyState.current = { selection, tool, mode, view, cursor, ep, place, del, dup, editor };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable || t.closest('dialog')) return;
      const k = keyState.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const step = e.shiftKey ? 25 : 5;
      const moveKey = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key] as [number, number] | undefined;
      if (ctrl && (e.key === 'z' || e.key === 'я') && !e.shiftKey && k.mode === 'edit') {
        e.preventDefault();
        apply(undo);
      } else if (ctrl && ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Z') && k.mode === 'edit') {
        e.preventDefault();
        apply(redo);
      } else if (ctrl && (e.key === 'd' || e.key === 'в')) {
        e.preventDefault();
        k.dup();
      } else if (ctrl && (e.key === 'a' || e.key === 'ф')) {
        e.preventDefault();
        setSelection(k.mode === 'play' ? k.ep.ents.map((x) => x.id) : k.editor.doc.objects.map((o) => o.id));
      } else if (ctrl && (e.key === 's' || e.key === 'ы')) {
        e.preventDefault();
        onSaveSlot();
      } else if (ctrl) return;
      else if (e.key === ' ' && k.mode === 'play' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        k.ep.toggle();
      } else if (e.key === '.' && k.mode === 'play') k.ep.stepOnce();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && k.mode === 'edit') {
        e.preventDefault();
        k.del();
      } else if (e.key === 'Escape') {
        setMenu(null);
        setWhy(null);
        if (k.tool !== 'select') setTool('select');
        else setSelection([]);
      } else if (moveKey) {
        if (t.tagName === 'BUTTON' && !t.closest('.sc-map')) return;
        e.preventDefault();
        if (k.tool === 'add' && k.cursor) setCursor({ x: k.cursor.x + moveKey[0] * step, y: k.cursor.y + moveKey[1] * step });
        else if (k.tool === 'edit' && k.selection.length && k.mode === 'edit') apply((st) => moveObjects(st, k.selection, moveKey[0] * step, moveKey[1] * step));
        else setView((v) => ({ ...v, cx: v.cx + moveKey[0] * v.span * 0.08, cy: v.cy + moveKey[1] * v.span * 0.08 }));
      } else if (e.key === 'Enter' && k.tool === 'add' && k.cursor && t.tagName !== 'BUTTON') {
        e.preventDefault();
        k.place(k.cursor);
      } else if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, span: Math.max(20, v.span / 1.4) }));
      else if (e.key === '-' || e.key === '_') setView((v) => ({ ...v, span: Math.min(12000, v.span * 1.4) }));
      else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        const r = mapBox.current?.getBoundingClientRect();
        if (r) setMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2, id: k.selection[0] ?? null, pos: { x: k.view.cx, y: k.view.cy } });
      } else if (e.key === '?') setHelp((h) => !h);
      else if (k.mode === 'edit' && ['v', 'м'].includes(e.key.toLowerCase())) setTool('select');
      else if (k.mode === 'edit' && ['a', 'ф'].includes(e.key.toLowerCase())) setTool('add');
      else if (k.mode === 'edit' && ['e', 'у'].includes(e.key.toLowerCase())) setTool('edit');
      else if (k.mode === 'edit' && ['r', 'к'].includes(e.key.toLowerCase()) && k.selection.length === 1) setTool('route');
      else if (['p', 'з'].includes(e.key.toLowerCase()) && k.selection[0]) setPinned((p) => (p === k.selection[0] ? null : k.selection[0]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Во время запуска инструменты правки выключены
  useEffect(() => {
    if (mode === 'play') {
      setToolRaw('select');
      setCursor(null);
    }
  }, [mode]);

  /* ———— Перетаскивание из каталога ———— */

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('text/x-atlas-class');
    if (!id || mode !== 'edit') return;
    e.preventDefault();
    const svg = mapBox.current?.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const spanH = (view.span * r.height) / r.width;
    const x = view.cx - view.span / 2 + ((e.clientX - r.left) / r.width) * view.span;
    const y = view.cy + spanH / 2 - ((e.clientY - r.top) / r.height) * spanH;
    place({ x, y }, id);
  };

  /* ———— Данные для панелей ———— */

  const runtimeOf = (id: string) => ep.ents.find((e) => e.id === id) ?? null;
  const wx = useMemo(() => weatherVisual(doc.weather, doc.frame), [doc.weather, doc.frame]);
  const dirty = isDirty(editor);

  const card = (id: string, isPinned: boolean) => {
    const o = doc.objects.find((x) => x.id === id) ?? null;
    const rt = mode === 'play' ? runtimeOf(id) : null;
    if (!o && !rt) return null;
    return (
      <ObjectCard
        key={`${id}-${isPinned}`}
        doc={doc}
        o={o}
        runtime={rt}
        mode={mode}
        pinned={pinned === id}
        onPin={() => setPinned(pinned === id ? null : id)}
        onPatch={(patch, what) => apply((st) => updateObjects(st, [id], patch, what))}
        onRoute={(route, what) => apply((st) => setRoute(st, id, route, what))}
        onPayload={(p) => apply((st) => setPayload(st, id, p))}
        onTool={(t) => {
          setSelection([id]);
          setTool(t);
        }}
        onCommand={command}
        onWhy={(seq) => {
          setWhy(seq);
          setOpen(true);
        }}
        commandBlock={mode === 'play' ? (() => {
          const c = ep.canCommandNow();
          return c.ok ? null : c.reason;
        })() : null}
      />
    );
  };

  const aside = (
    <div>
      {why !== null && ep.log.length > 0 && <WhyChain log={ep.log} seq={why} onClose={() => setWhy(null)} onGoto={goto} />}
      {pinned && !selection.includes(pinned) && (
        <div className="sc-pinned">
          <div className="section-label" style={{ marginTop: 0 }}>
            Закреплённая карточка
          </div>
          {card(pinned, true)}
        </div>
      )}
      {selection.length === 1 ? (
        card(selection[0], false)
      ) : selection.length > 1 && mode === 'edit' ? (
        <GroupCard doc={doc} ids={selection} onPatch={(patch, what) => apply((st) => updateObjects(st, selection, patch, what))} preview={(patch) => previewPatch(doc, selection, patch)} />
      ) : selection.length > 1 ? (
        <EmptyState title={`Выделено объектов: ${selection.length}`}>
          <p className="small">Во время запуска групповое изменение недоступно: это новое начальное состояние.</p>
        </EmptyState>
      ) : (
        <ScenarioSettings doc={doc} commit={commitDoc} locked={mode === 'play'} engine={engine} bw={bw} bs={bs} onNewBranch={branchHere} />
      )}
    </div>
  );

  const main = (
    <div className="sc-world" data-mode={mode}>
      <header className="sc-top panel">
        <ModeBar mode={mode} onMode={(m) => (m === 'play' ? start() : onMode(m))} hasScenario scenarioTitle={doc.title} />
        <div className="sc-top-row">
          <div className="sc-title">
            <label className="visually-hidden" htmlFor="sc-title">
              Название сценария
            </label>
            <input id="sc-title" className="input sc-title-input" defaultValue={doc.title} key={doc.id + doc.title} onBlur={(e) => e.target.value.trim() && e.target.value !== doc.title && commitDoc(`Название: ${e.target.value.trim()}`, (d) => void (d.title = e.target.value.trim()))} />
            <div className="xs muted">
              ⎇ {doc.branch.name}
              {doc.branch.parent ? ` · от «${doc.branch.parent.name}»${doc.branch.parent.atT !== null ? ` (${Math.floor(doc.branch.parent.atT / 60)} мин эпизода)` : ''}` : ''} · {doc.world.kind === 'historical' ? `ветвление ${fmtDay(dayOf(doc.world.forkDate))}` : 'испытательная сцена (вымышленная)'} · эпизод {fmtDay(dayOf(doc.episode.date))} {doc.episode.startTime} UTC
            </div>
          </div>
          <div className="sc-save xs" role="status" aria-live="polite">
            <span className={`led ${dirty ? 'led-amber' : 'led-on'}`} aria-hidden="true" /> {dirty ? 'Есть изменения, не сохранённые в списке' : 'Сохранено в списке'}
            {savedAt && <span className="muted"> · автосохранение {savedAt.slice(11, 19)}</span>}
          </div>
        </div>
        <div className="sc-toolbar" role="toolbar" aria-label="Инструменты">
          {mode === 'edit' ? (
            <>
              <div className="speed-group" role="group" aria-label="Инструмент">
                {(['select', 'add', 'edit'] as Tool[]).map((t) => (
                  <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)} aria-keyshortcuts={t === 'select' ? 'V' : t === 'add' ? 'A' : 'E'} title={`${TOOL_RU[t]} (${t === 'select' ? 'V' : t === 'add' ? 'A' : 'E'})`}>
                    {TOOL_RU[t]}
                  </button>
                ))}
                {(tool === 'route' || tool === 'aim') && <button aria-pressed>{TOOL_RU[tool]}</button>}
              </div>
              <button className="btn btn-sm" onClick={() => apply(undo)} disabled={!canUndo(editor)} aria-keyshortcuts="Control+Z" title="Отменить (Ctrl+Z)">
                ↶ Отменить
              </button>
              <button className="btn btn-sm" onClick={() => apply(redo)} disabled={!canRedo(editor)} aria-keyshortcuts="Control+Shift+Z" title="Повторить (Ctrl+Shift+Z)">
                ↷ Повторить
              </button>
              <button className="btn btn-sm" onClick={() => dup()} disabled={!selection.length} title="Дублировать (Ctrl+D)">
                Дублировать
              </button>
              <button className="btn btn-sm" onClick={() => del()} disabled={!selection.length} title="Удалить (Del)">
                Удалить
              </button>
              <button className="btn btn-primary" onClick={start} title="Проверить сценарий и запустить эпизод">
                ▶ Проверить и запустить
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => onMode('edit')}>
                ← К редактированию
              </button>
              <span className="xs muted">Правка состава и настроек — только новой веткой: немедленные команды доступны в карточке объекта.</span>
            </>
          )}
          <span className="sc-toolbar-sep" />
          <button className="btn btn-sm" onClick={onSaveSlot} title="Сохранить в список сценариев (Ctrl+S)">
            Сохранить
          </button>
          <button className="btn btn-sm" onClick={onOpenLibrary}>
            Открыть…
          </button>
          <button className="btn btn-sm" onClick={() => exportFile(doc)}>
            Экспорт
          </button>
          <button className="btn btn-sm" onClick={branchHere} title="Новая ветка от текущего сценария; прежний сохраняется в списке">
            ⎇ Новая ветка
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help} aria-keyshortcuts="?">
            Клавиши
          </button>
        </div>
        {help && <Hotkeys />}
        <div className="sim-disclaimer small" role="note">
          <IconInfo size={14} /> {SIM_DISCLAIMER} Игровые классы и параметры вымышлены.
        </div>
      </header>

      <div className="sc-body">
        <LeftPanel
          doc={doc}
          mode={mode}
          selection={selection}
          addClassId={addClassId}
          addSide={addSide}
          setAddSide={setAddSide}
          onPickClass={(id) => {
            setAddClassId(id);
            setTool(id ? 'add' : 'select');
            if (id) setCursor({ x: view.cx, y: view.cy });
          }}
          onSelect={(ids, m) => {
            select(ids, m);
            if (ids[0]) {
              setFocusId(null);
              setTimeout(() => setFocusId(ids[0]), 0);
            }
          }}
          layers={layers}
          setLayers={setLayers}
          runtime={mode === 'play' ? ep.ents : null}
        />
        <div className="sc-center" ref={mapBox} onDragOver={(e) => mode === 'edit' && e.preventDefault()} onDrop={onDrop}>
          {tool !== 'select' && mode === 'edit' && (
            <div className="sc-toolhint xs" role="status">
              {tool === 'add' && (addClassId ? `Добавление: ${CLASS_BY_ID[addClassId].code} ${CLASS_BY_ID[addClassId].name}. Щелчок по карте или стрелки + Enter. Esc — выход.` : 'Выберите класс в каталоге слева.')}
              {tool === 'edit' && 'Редактирование: перетаскивайте объекты и точки маршрута; стрелки сдвигают выделенное на 5 км (Shift — 25 км).'}
              {tool === 'route' && 'Маршрут: щёлкайте по карте, чтобы добавить точки. Esc — готово.'}
              {tool === 'aim' && 'Щелчок задаёт условную область назначения нагрузки. Esc — готово.'}
            </div>
          )}
          <ScenarioMap
            doc={doc}
            engine={engine}
            bw={bw}
            bs={bs}
            tool={tool}
            addClassId={addClassId}
            selection={selection}
            pinned={pinned}
            layers={layers}
            play={mode === 'play' ? { ents: ep.ents, t: ep.displayT } : null}
            view={view}
            setView={setView}
            cursor={cursor}
            focusId={focusId}
            quality={doc.settings.quality}
            onSelect={select}
            onPlace={(pos) => place(pos)}
            onMove={(ids, dx, dy) => apply((st) => moveObjects(st, ids, dx, dy))}
            onWaypoint={(id, idx, pos) => {
              const o = doc.objects.find((x) => x.id === id);
              if (o) apply((st) => setRoute(st, id, o.route.map((w, i) => (i === idx ? { ...w, x: pos.x, y: pos.y } : w)), `точка маршрута ${idx + 1} перемещена`));
            }}
            onAddWaypoint={(id, pos) => {
              const o = doc.objects.find((x) => x.id === id);
              if (!o || !isAircraft(CLASS_BY_ID[o.classId].kind)) return toast('Маршрут задаётся самолёту или беспилотнику.');
              apply((st) => setRoute(st, id, [...o.route, { x: pos.x, y: pos.y }], `добавлена точка маршрута ${o.route.length + 1}`));
            }}
            onAim={(id, idx, pos) => {
              const o = doc.objects.find((x) => x.id === id);
              if (!o || !o.payload[idx]) return toast('У объекта нет нагрузки: добавьте её в свойствах.');
              apply((st) => setPayload(st, id, o.payload.map((p, i) => (i === idx ? { ...p, aim: pos } : p))));
            }}
            onContext={(x, y, id, pos) => {
              if (id && !selection.includes(id)) setSelection([id]);
              setMenu({ x, y, id, pos });
            }}
            overlay={<WeatherCanvas visual={wx} view={view} wind={layers.wind} precip={layers.precip} quality={doc.settings.quality} />}
          />
          {wx && (layers.wind || layers.precip) && <div className="sc-wx-note xs">Погода: {wx.label}</div>}
          {menu && (
            <ContextMenu
              menu={menu}
              doc={doc}
              mode={mode}
              onClose={() => setMenu(null)}
              actions={{
                dup: () => dup(menu.id ? [menu.id] : selection),
                del: () => del(menu.id ? [menu.id] : selection),
                pin: () => menu.id && setPinned(pinned === menu.id ? null : menu.id),
                route: () => menu.id && (setSelection([menu.id]), setTool('route')),
                center: () => setView((v) => ({ ...v, cx: menu.pos.x, cy: menu.pos.y })),
                why: () => {
                  const e = menu.id ? runtimeOf(menu.id) : null;
                  if (e) {
                    setWhy(e.outcomeSeq || e.causeSeq);
                    setOpen(true);
                  }
                },
                add: (classId: string) => place(menu.pos, classId),
                props: () => setOpen(true),
              }}
            />
          )}
        </div>
      </div>

      <section className="sc-bottom panel" aria-label="Время, очередь действий и журнал">
        {mode === 'play' ? (
          <EpisodeBar doc={doc} ep={ep} onBranchHere={branchHere} onSpeed={(v) => commitDoc(`Скорость показа ×${v}`, (d) => void (d.settings.playbackSpeed = v))} />
        ) : (
          <CalendarBar doc={doc} bs={bs} onDate={(iso) => commitDoc(`Дата эпизода: ${iso}`, (d) => void (d.episode.date = iso))} />
        )}
        <BottomTabs
          doc={doc}
          mode={mode}
          ep={mode === 'play' ? ep : null}
          engine={engine}
          bs={bs}
          issues={issues}
          onWhy={(seq) => {
            setWhy(seq);
            setOpen(true);
          }}
          onGoto={goto}
          onAuthorize={(side, objectId, ok) => command({ type: ok ? 'authorize' : 'deny', unitSide: side, objectId })}
          onFixIssue={(i) => {
            if (i.objectId) goto(i.objectId);
            else {
              setSelection([]);
              setOpen(true);
            }
          }}
        />
      </section>
    </div>
  );

  return <Workspace main={main} aside={aside} asideTitle={selection.length ? 'Свойства объекта' : 'Настройки сценария'} />;
}

/* ———————————————— Контекстное меню ———————————————— */

function ContextMenu({
  menu,
  doc,
  mode,
  onClose,
  actions,
}: {
  menu: { x: number; y: number; id: string | null; pos: Vec };
  doc: ScenarioDoc;
  mode: 'edit' | 'play';
  onClose: () => void;
  actions: Record<'dup' | 'del' | 'pin' | 'route' | 'center' | 'why' | 'props', () => void> & { add: (classId: string) => void };
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [onClose]);
  const o: PlacedObject | undefined = menu.id ? doc.objects.find((x) => x.id === menu.id) : undefined;
  const item = (label: string, fn: () => void, hint?: string) => (
    <li key={label}>
      <button
        role="menuitem"
        onClick={() => {
          fn();
          onClose();
        }}
      >
        {label}
        {hint && <span className="xs muted">{hint}</span>}
      </button>
    </li>
  );
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return (
    <ul
      ref={ref}
      className="sc-menu"
      role="menu"
      aria-label="Действия"
      style={{ left: Math.min(menu.x, vw - 240), top: Math.min(menu.y, vh - 300) }}
      onKeyDown={(e) => {
        const items = [...(ref.current?.querySelectorAll('button') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
        else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
        else if (e.key === 'Escape') onClose();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {menu.id ? (
        <>
          <li className="sc-menu-title xs">{o?.label ?? menu.id}</li>
          {item('Свойства', actions.props)}
          {item('Закрепить карточку', actions.pin, 'P')}
          {item('Центрировать карту', actions.center)}
          {mode === 'edit' && o && isAircraft(CLASS_BY_ID[o.classId].kind) && item('Добавить точки маршрута', actions.route, 'R')}
          {mode === 'edit' && item('Дублировать', actions.dup, 'Ctrl+D')}
          {mode === 'edit' && item('Удалить', actions.del, 'Del')}
          {mode === 'play' && item('Почему?', actions.why)}
        </>
      ) : (
        <>
          <li className="sc-menu-title xs">Здесь</li>
          {item('Центрировать карту', actions.center)}
          {mode === 'edit' && PLACEABLE.slice(0, 6).map((c) => item(`Добавить ${c.code} — ${c.name.replace('Условный ', '').replace('Условная ', '')}`, () => actions.add(c.id)))}
        </>
      )}
    </ul>
  );
}

function Hotkeys() {
  const rows: [string, string][] = [
    ['V / A / E', 'инструменты «Выбор», «Добавление», «Редактирование»'],
    ['R', 'точки маршрута выделенного самолёта'],
    ['Стрелки', 'сдвиг вида; в «Редактировании» — сдвиг выделенного на 5 км (Shift — 25 км); в «Добавлении» — курсор'],
    ['Enter', 'поставить объект в точку курсора'],
    ['Shift + перетаскивание', 'выделение рамкой (инструмент «Выбор»)'],
    ['Shift/Ctrl + щелчок', 'добавить к выделению'],
    ['Ctrl+A', 'выделить все'],
    ['Ctrl+D / Del', 'дублировать / удалить'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'отменить / повторить'],
    ['Ctrl+S', 'сохранить в список'],
    ['Пробел / .', 'запуск и пауза / шаг модели'],
    ['+ / −, колесо', 'масштаб (объекты не сдвигаются)'],
    ['Shift+F10, долгое нажатие', 'контекстное меню'],
    ['P', 'закрепить карточку'],
    ['Esc', 'выйти из инструмента, снять выделение'],
  ];
  return (
    <table className="table xs sc-keys">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row" className="mono">
              {k}
            </th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { markSaved };
