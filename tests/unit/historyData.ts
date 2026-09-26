import { readFileSync } from 'node:fs';
import { HistoryEngine, type HistoryData } from '../../src/history/engine';

const read = (f: string) => JSON.parse(readFileSync(`src/history/data/${f}`, 'utf8'));

let engine: HistoryEngine | null = null;
export function loadEngine(): HistoryEngine {
  engine ??= new HistoryEngine({
    geo: read('geo.topo.json'),
    land: read('land.topo.json'),
    entities: read('entities.json'),
    events: read('events.json'),
    conflicts: read('conflicts.json'),
    leaders: read('leaders.json'),
    disputed: read('disputed.json'),
    manifest: read('manifest.json'),
  } as HistoryData);
  return engine;
}
