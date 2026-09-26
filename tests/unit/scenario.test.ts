import { describe, expect, test } from 'vitest';
import { EpisodeRunner } from '../../src/game/runner';
import { BranchWorld } from '../../src/scenario/branch';
import { DEMOS, demoById } from '../../src/scenario/demos';
import { addObject, commit, deleteObjects, duplicateObjects, initEditor, isDirty, markSaved, moveObjects, redo, undo, updateObjects } from '../../src/scenario/editor';
import { forkChild, newHistorical, newTestScene } from '../../src/scenario/factory';
import { REGIONS } from '../../src/scenario/geo';
import { checkScenario, parseScenario, serialize } from '../../src/scenario/schema';
import { SETTINGS_META } from '../../src/scenario/settings';
import { buildSetup } from '../../src/scenario/setup';
import type { HistoricalWorld } from '../../src/scenario/types';
import { validateScenario } from '../../src/scenario/validate';
import { dayOf } from '../../src/history/time';
import legacy from '../../src/scenario/data/legacy-sim-scenarios.json';
import { loadEngine } from './historyData';

const engine = loadEngine();
const D = (iso: string) => dayOf(iso);

describe('ветвление истории', () => {
  const eventsBefore = JSON.stringify(engine.events.map((e) => [e.id, e.ops]));

  test('ветка «ГДР сохраняется»: история не меняется, ветка пропускает прекращающие события с объяснением', () => {
    const world: HistoricalWorld = { kind: 'historical', forkDate: '1990-10-02', policy: 'compatible', edits: [{ id: 'e1', day: '1990-10-02', kind: 'preserve-entity', entity: 'gw:265' }] };
    const bw = new BranchWorld(engine, world);
    const hist = engine.stateAt(D('1990-10-05'));
    const br = bw.stateAt(D('1990-10-05'));
    expect(hist.recs.has(91)).toBe(false);
    expect(br.recs.has(91)).toBe(true);
    expect(br.gw.has('gw:265')).toBe(true);
    expect(hist.gw.has('gw:265')).toBe(false);
    const skipped = br.skipped.map((s) => s.event.id);
    expect(skipped).toContain('cs-1990-10-03');
    expect(skipped).toContain('gw-exit-265-1990-10-03');
    expect(br.skipped.find((s) => s.event.id === 'cs-1990-10-03')!.reason).toMatch(/сохранил/);
    // Совместимые события после ветвления продолжают применяться
    expect(br.applied.some((e) => e.date > '1990-10-02' && e.category === 'conflict')).toBe(true);
    // До точки ветвления ветка совпадает с историей
    expect([...bw.stateAt(D('1990-01-01')).recs].sort()).toEqual([...engine.stateAt(D('1990-01-01')).recs].sort());
    expect(JSON.stringify(engine.events.map((e) => [e.id, e.ops]))).toBe(eventsBefore);
  });

  test('удалённый субъект: его события и появление преемников не применяются', () => {
    const world: HistoricalWorld = { kind: 'historical', forkDate: '1992-06-01', policy: 'compatible', edits: [{ id: 'e1', day: '1992-06-01', kind: 'remove-entity', entity: 'gw:315' }] };
    const bw = new BranchWorld(engine, world);
    const s = bw.stateAt(D('1994-01-01'));
    const byId = new Map(s.skipped.map((x) => [x.event.id, x]));
    expect(byId.get('cs-1993-01-01')?.code).toBe('removed');
    expect(byId.get('gw-enter-316-1993-01-01')?.code).toBe('predecessor');
    expect(s.gw.has('gw:316')).toBe(false);
    expect(bw.exists(s, 'gw:315')).toBe(false);
    expect(engine.stateAt(D('1994-01-01')).gw.has('gw:316')).toBe(true);
  });

  test('режим «остановить»: после ветвления исторические события не применяются', () => {
    const bw = new BranchWorld(engine, { kind: 'historical', forkDate: '1975-01-01', policy: 'stop', edits: [] });
    const s = bw.stateAt(D('1992-06-15'));
    expect(s.applied.length).toBe(0);
    expect(s.skipped.every((x) => x.code === 'policy-stop')).toBe(true);
    expect([...s.recs].sort()).toEqual([...engine.stateAt(D('1975-01-01')).recs].sort());
  });

  test('объединение: территория поглощённого показывается как поглотившего', () => {
    const bw = new BranchWorld(engine, { kind: 'historical', forkDate: '1990-01-01', policy: 'compatible', edits: [{ id: 'm', day: '1990-01-01', kind: 'merge-entities', absorbed: 'gw:265', into: 'gw:260' }] });
    const s = bw.stateAt(D('1990-12-31'));
    const gdrRec = [...s.recs].find((f) => engine.records.get(f)!.code === 265)!;
    expect(bw.ownerOf(s, gdrRec)).toBe('gw:260');
    expect(s.skipped.some((x) => x.code === 'merged')).toBe(true);
  });

  test('новая ветка от момента эпизода не меняет исходный сценарий', () => {
    const doc = demoById('carrier')!.make('2026-09-26', null);
    doc.commands = [
      { id: 'a', t: 100, type: 'weapons', unitId: 'o3', mode: 'hold' },
      { id: 'b', t: 900, type: 'weapons', unitId: 'o3', mode: 'free' },
    ];
    const before = serialize(doc);
    const child = forkChild(doc, { atT: 500 });
    expect(serialize(doc)).toBe(before);
    expect(child.commands.map((c) => c.id)).toEqual(['a']);
    expect(child.branch.parent).toEqual({ id: doc.id, name: doc.branch.name, atT: 500 });
    expect(child.id).not.toBe(doc.id);
  });
});

describe('редактор: отмена, повтор, групповые изменения', () => {
  test('добавление, перемещение, отмена и повтор', () => {
    let st = initEditor(newTestScene());
    const a = addObject(st, 'g-ad-post', 'A', { x: 1, y: 2 });
    st = a.st;
    st = moveObjects(st, [a.id], 10, 5);
    expect(st.doc.objects[0].pos).toEqual({ x: 11, y: 7 });
    st = undo(st);
    expect(st.doc.objects[0].pos).toEqual({ x: 1, y: 2 });
    st = undo(st);
    expect(st.doc.objects.length).toBe(0);
    st = redo(st);
    st = redo(st);
    expect(st.doc.objects[0].pos).toEqual({ x: 11, y: 7 });
    expect(redo(st)).toBe(st);
  });

  test('дублирование и групповое изменение — по одной записи отмены', () => {
    let st = initEditor(newTestScene());
    st = addObject(st, 'g-fighter', 'A', { x: 0, y: 0 }).st;
    st = addObject(st, 'g-fighter', 'A', { x: 5, y: 0 }).st;
    const dup = duplicateObjects(st, ['o1', 'o2']);
    st = dup.st;
    expect(st.doc.objects.length).toBe(4);
    expect(new Set(st.doc.objects.map((o) => o.label)).size).toBe(4);
    st = updateObjects(st, ['o1', 'o2', 'o3', 'o4'], { speedFactor: 0.8 }, 'скорость');
    expect(st.doc.objects.every((o) => o.speedFactor === 0.8)).toBe(true);
    st = undo(st);
    expect(st.doc.objects.every((o) => o.speedFactor === undefined)).toBe(true);
    st = undo(st);
    expect(st.doc.objects.length).toBe(2);
  });

  test('несохранённые изменения отслеживаются', () => {
    let st = initEditor(newTestScene());
    expect(isDirty(st)).toBe(false);
    st = addObject(st, 'g-radar', 'A', { x: 0, y: 0 }).st;
    expect(isDirty(st)).toBe(true);
    st = markSaved(st);
    expect(isDirty(st)).toBe(false);
    st = deleteObjects(st, ['o1']);
    expect(isDirty(st)).toBe(true);
  });

  test('каждое изменение попадает в журнал изменений с происхождением', () => {
    let st = initEditor(newTestScene());
    st = commit(st, 'Допущение: погода задана вручную', () => {}, 'assumption');
    const last = st.doc.changeLog.at(-1)!;
    expect(last.prov).toBe('assumption');
  });
});

describe('сохранение, загрузка, схема', () => {
  test('экспорт и импорт без потери состояния', () => {
    for (const demo of DEMOS) {
      const doc = demo.make('2026-09-26', engine.data.manifest.buildId);
      doc.commands = [{ id: 'c1', t: 300, type: 'rtb', objectId: 'o2' }];
      const back = parseScenario(serialize(doc));
      expect(back.ok, `${demo.id}: ${back.errors.join('; ')}`).toBe(true);
      expect(back.doc).toEqual(doc);
    }
  });

  test('повтор загруженного сценария даёт тот же журнал', () => {
    const doc = demoById('carrier')!.make('2026-09-26', null);
    const a = new EpisodeRunner(buildSetup(doc, { engine: null }).setup).runToEnd().fingerprint();
    const loaded = parseScenario(serialize(doc)).doc!;
    const b = new EpisodeRunner(buildSetup(loaded, { engine: null }).setup).runToEnd().fingerprint();
    expect(b).toBe(a);
  });

  test('понятные ошибки: не JSON, чужой формат, более новая версия, неизвестный класс', () => {
    expect(parseScenario('{').errors[0]).toMatch(/не является JSON/);
    expect(checkScenario({ format: 'other' }).errors[0]).toMatch(/Неизвестный формат/);
    const doc = newTestScene();
    expect(checkScenario({ ...doc, formatVersion: 99 }).errors[0]).toMatch(/более новой версией/);
    const bad = structuredClone(doc);
    bad.objects.push({ id: 'z', classId: 'real-missile', side: 'A', label: 'z', pos: { x: 0, y: 0 }, startS: 0, route: [], mission: 'none', payload: [] });
    expect(checkScenario(bad).errors.join(' ')).toMatch(/неизвестный игровой класс/);
  });

  test('документированная миграция сценариев прежней учебной симуляции', () => {
    for (const l of legacy as unknown[]) {
      const r = checkScenario(structuredClone(l));
      expect(r.ok, r.errors.join('; ')).toBe(true);
      expect(r.migrated.length).toBe(1);
      expect(r.doc!.world.kind).toBe('test-scene');
      expect(r.doc!.objects.some((o) => o.classId === 'g-ad-post')).toBe(true);
    }
  });
});

describe('проверка сценария', () => {
  test('несовместимые настройки дают понятные ошибки', () => {
    let st = initEditor(newTestScene());
    st = addObject(st, 'g-carrier', 'A', { x: 0, y: 0 }).st; // задача «отделение», нагрузки нет
    st = updateObjects(st, ['o1'], { payload: [{ classId: 'g-ballistic', count: 9, aim: { x: 1, y: 1 } }] }, 'нагрузка');
    const doc = st.doc;
    doc.weather.source = 'archive';
    const issues = validateScenario(doc, { today: '2026-09-26' });
    const text = issues.filter((i) => i.level === 'error').map((i) => i.text).join('\n');
    expect(text).toMatch(/несовместима с классом/);
    expect(text).toMatch(/вмещает 6/);
    expect(text).toMatch(/нет реальной погоды/);
  });

  test('архивная и текущая погода не подменяют друг друга', () => {
    const doc = newHistorical({ buildId: 'x', date: '1990-10-05', region: REGIONS[0] });
    doc.participants = [{ id: 'p', name: 'ФРГ', entityId: 'gw:260', color: '#fff' }];
    doc.weather.source = 'current';
    expect(validateScenario(doc, { today: '2026-09-26' }).some((i) => i.level === 'error' && /сегодняшней датой/.test(i.text))).toBe(true);
    doc.weather.source = 'archive';
    doc.weather.snapshot = { id: 's', source: 'current', provider: 'Open-Meteo', request: '', model: 'best_match', modelNote: '', fetchedAt: '2026-09-26T10:00:00Z', validTime: '2026-09-26T10:00Z', center: { lat: 0, lon: 0 }, gridSize: 1, grid: [], units: {}, upper: null, attribution: '' };
    expect(validateScenario(doc, { today: '2026-09-26' }).some((i) => i.level === 'error' && /нельзя подменять/.test(i.text))).toBe(true);
  });

  test('участник, которого нет в ветке на дату эпизода, — ошибка', () => {
    const doc = demoById('gdr')!.make('2026-09-26', 'x');
    doc.participants.push({ id: 'p3', name: 'Чехия', entityId: 'gw:316', color: '#fff' });
    const bw = new BranchWorld(engine, doc.world as HistoricalWorld);
    const s = bw.stateAt(D(doc.episode.date));
    const issues = validateScenario(doc, { today: '2026-09-26', entityExists: (id) => bw.exists(s, id) });
    expect(issues.some((i) => i.level === 'error' && i.text.includes('Чехия'))).toBe(true);
    expect(issues.some((i) => i.text.includes('ГДР'))).toBe(false);
  });
});

describe('настройки', () => {
  test('у каждой настройки есть назначение, единицы и признаки', () => {
    for (const m of SETTINGS_META) {
      expect(m.affects.length).toBeGreaterThan(10);
      expect(m.unit.length).toBeGreaterThan(0);
      expect(typeof m.live).toBe('boolean');
      expect(typeof m.saved).toBe('boolean');
      expect(typeof m.assumption).toBe('boolean');
    }
    expect(SETTINGS_META.filter((m) => m.group === 'basic').length).toBe(8);
    expect(SETTINGS_META.filter((m) => m.group === 'advanced').length).toBe(11);
  });

  test('качество отображения и скорость показа не влияют на исход', () => {
    const doc = demoById('carrier')!.make('2026-09-26', null);
    const fp = (q: 'low' | 'high', speed: number) => {
      const d = structuredClone(doc);
      d.settings.quality = q;
      d.settings.playbackSpeed = speed;
      const { setup } = buildSetup(d, { engine: null });
      expect(JSON.stringify(setup)).not.toMatch(/quality|playbackSpeed/);
      return new EpisodeRunner(setup).runToEnd().fingerprint();
    };
    expect(fp('low', 1)).toBe(fp('high', 60));
  });

  test('владелец области назначения на исторической карте определяется по ветке', () => {
    const doc = demoById('gdr')!.make('2026-09-26', 'x');
    const { setup } = buildSetup(doc, { engine });
    const gdrFlight = setup.objects.find((o) => o.id === 'o2')!;
    expect(gdrFlight.destinationOwner).toBe('p1'); // Лейпциг — ГДР в ветке
  });
});

describe('готовые сценарии', () => {
  test('все готовые сценарии проходят проверку и доигрываются до конца', () => {
    for (const demo of DEMOS) {
      const doc = demo.make('2026-09-26', engine.data.manifest.buildId);
      let ctx = {};
      if (doc.world.kind === 'historical') {
        const bw = new BranchWorld(engine, doc.world);
        const s = bw.stateAt(D(doc.episode.date));
        ctx = { entityExists: (id: string) => bw.exists(s, id) };
      }
      const errors = validateScenario(doc, { today: '2026-09-26', ...ctx }).filter((i) => i.level === 'error');
      expect(errors, demo.id).toEqual([]);
      const r = new EpisodeRunner(buildSetup(doc, { engine }).setup).runToEnd();
      expect(r.finished).toBe(true);
    }
  });
});
