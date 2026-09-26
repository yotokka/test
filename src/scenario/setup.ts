import { CLASS_BY_ID } from '../game/classes';
import { DEFAULT_DT } from '../game/engine';
import { sceneOwner } from '../game/testScene';
import type { EpisodeSetup, ObjectSetup, Vec } from '../game/types';
import type { HistoryEngine } from '../history/engine';
import { dayOf } from '../history/time';
import { effectsFor } from '../weather/effects';
import { BranchWorld } from './branch';
import { kmToLonLat, recordAt } from './geo';
import type { ScenarioDoc } from './types';

/**
 * Сборка начального состояния эпизода из сценария. Здесь сценарий (с историческим миром и погодой)
 * переводится в чистые игровые данные: движок не знает ни дат, ни стран, ни справочника.
 */

export interface SetupContext {
  engine: HistoryEngine | null;
}

export function episodeDay(doc: ScenarioDoc) {
  return dayOf(doc.episode.date);
}

/** Чья территория в точке (км): id участника, либо null, если территория не принадлежит участнику. */
export function makeOwnerFn(doc: ScenarioDoc, ctx: SetupContext): (p: Vec) => { participant: string | null; entity: string | null } {
  if (doc.world.kind === 'test-scene') {
    return (p) => {
      const c = sceneOwner(p.x, p.y);
      const part = doc.participants.find((x) => x.id === c) ?? null;
      return { participant: part?.id ?? null, entity: c };
    };
  }
  const engine = ctx.engine;
  if (!engine || !doc.frame) return () => ({ participant: null, entity: null });
  const bw = new BranchWorld(engine, doc.world);
  const st = bw.stateAt(episodeDay(doc));
  const frame = doc.frame;
  return (p) => {
    const [lon, lat] = kmToLonLat(frame, p.x, p.y);
    const fid = recordAt(engine, st.recs, lon, lat);
    const ent = fid === null ? null : bw.ownerOf(st, fid);
    const part = ent ? doc.participants.find((x) => x.entityId === ent) : undefined;
    return { participant: part?.id ?? null, entity: ent };
  };
}

export function buildSetup(doc: ScenarioDoc, ctx: SetupContext): { setup: EpisodeSetup; weatherLines: string[] } {
  const owner = makeOwnerFn(doc, ctx);
  const objects: ObjectSetup[] = doc.objects.map((o) => {
    const last = o.route[o.route.length - 1];
    const dest = o.payload.length ? o.payload[0].aim : last ?? o.pos;
    return {
      id: o.id,
      classId: o.classId,
      side: o.side,
      label: o.label,
      pos: { ...o.pos },
      alt: o.alt ?? undefined,
      startS: Math.max(0, o.startS),
      route: o.route.map((w) => ({ ...w })),
      mission: o.mission,
      holdS: o.holdS,
      payload: o.payload.map((p) => ({ classId: p.classId, count: Math.max(0, Math.floor(p.count)), aim: { ...p.aim } })),
      payloadOwners: o.payload.map((p) => owner(p.aim).participant),
      speedFactor: o.speedFactor,
      stock: o.stock ?? undefined,
      destinationOwner: owner(dest).participant,
    };
  });
  const wx = effectsFor(doc.weather);
  const setup: EpisodeSetup = {
    seed: doc.seed,
    dt: DEFAULT_DT,
    durationS: doc.episode.durationS,
    endConditions: doc.episode.endConditions.length ? doc.episode.endConditions : ['duration'],
    sides: doc.participants.map((p) => ({ id: p.id, name: p.name, unknown: p.unknown })),
    relations: structuredClone(doc.relations),
    permissionRequired: { ...doc.permissionRequired },
    objects,
    classes: CLASS_BY_ID,
    weather: wx.effects,
    awareness: doc.settings.awareness,
    control: doc.settings.control,
    randomness: doc.settings.randomness,
    motionPreset: doc.settings.motionPreset,
    interactionPreset: doc.settings.interactionPreset,
    resources: doc.settings.resources,
    checkpointEveryS: doc.settings.checkpointEveryS,
  };
  return { setup, weatherLines: wx.lines };
}

/** Дата и время эпизода в момент t (с): согласованы с исторической датой сценария. */
export function episodeClock(doc: ScenarioDoc, t: number): { iso: string; date: string; time: string } {
  const start = Date.parse(`${doc.episode.date}T${doc.episode.startTime}:00Z`);
  const d = new Date(start + Math.round(t * 1000));
  const iso = d.toISOString();
  return { iso, date: iso.slice(0, 10), time: iso.slice(11, 19) };
}
