import type { Topology } from 'topojson-specification';
import { HistoryEngine, type HistoryData } from './engine';

/**
 * Загрузка исторической базы. Файлы входят в сборку как отдельные фрагменты с хешем в имени,
 * поэтому открытый сеанс продолжает работать с той версией данных, с которой начал (buildId в манифесте).
 */
let pending: Promise<HistoryEngine> | null = null;

export function loadHistory(): Promise<HistoryEngine> {
  pending ??= Promise.all([
    import('./data/geo.topo.json'),
    import('./data/land.topo.json'),
    import('./data/entities.json'),
    import('./data/events.json'),
    import('./data/conflicts.json'),
    import('./data/leaders.json'),
    import('./data/disputed.json'),
    import('./data/manifest.json'),
  ])
    .then(([geo, land, entities, events, conflicts, leaders, disputed, manifest]) => {
      const data = {
        geo: geo.default as unknown as Topology,
        land: land.default as unknown as Topology,
        entities: entities.default,
        events: events.default,
        conflicts: conflicts.default,
        leaders: leaders.default,
        disputed: disputed.default,
        manifest: manifest.default,
      } as unknown as HistoryData;
      return new HistoryEngine(data);
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
