// Data Factory: the real-time mode. Pure logic (no Phaser), stepped by the scene every frame
// and unit-tested with node --test.
//
// Three conveyor lanes carry rows from a source to the warehouse. Each lane has 3 slots where the
// player builds stations (same rules as Data Plumber). The data mix on each lane changes over time
// ("waves"): new sources, retries, legacy boxes, compliance... Bad rows reaching the warehouse cost
// SLA; clean rows earn credits to buy stations. Stations sometimes overheat and must be repaired.

import type { StationKind } from "./sim.ts";

export const LANES = 3;
export const SLOTS = [0.28, 0.5, 0.72]; // slot positions along a lane (0 = source, 1 = warehouse)
export const COST: Record<StationKind, number> = { filter: 10, normalize: 10, parse: 15, dedup: 15, mask: 15 };
export const START_CREDITS = 40;
export const GOAL_SECONDS = 180; // story goal: survive a full 3-minute shift
const BASE_SPEED = 0.125; // lane lengths per second → 8 s from source to warehouse
const DEDUP_MEMORY = 40;
const WAREHOUSE_MEMORY = 60;

/** Probabilities for each kind of dirt a lane's source produces. */
export interface Mix {
  null?: number;
  dup?: number;
  upper?: number; // a duplicate in different case: "K4" vs "k4"
  boxed?: number;
  pii?: number;
}

export interface WaveLane {
  lane: number;
  open?: boolean;
  public?: boolean;
  mix?: Mix;
}

export interface Wave {
  at: number; // seconds
  title: string;
  text: string;
  pause: boolean; // tutorial waves pause the game with an explanation card
  lanes: WaveLane[];
  speed?: number; // multiplier
  spawn?: number; // seconds between two rows on a lane
  breakdowns?: boolean; // stations start overheating
}

export const WAVES: Wave[] = [
  {
    at: 0,
    title: "Morning traffic",
    text: "Rows arrive on lane 1 and some are empty (∅). Build a Filter on the belt: pick it below, then tap a slot.",
    pause: true,
    lanes: [{ lane: 0, open: true, mix: { null: 0.3 } }],
  },
  {
    at: 25,
    title: "Retries!",
    text: "The API retries on timeouts: lane 1 now sends the same row twice. Add a Dedup.",
    pause: true,
    lanes: [{ lane: 0, mix: { null: 0.25, dup: 0.25 } }],
  },
  {
    at: 50,
    title: "A second source",
    text: 'Lane 2 opens. Its ids come in mixed case, with copies ("K4" and "k4"). Normalize BEFORE the Dedup.',
    pause: true,
    lanes: [{ lane: 1, open: true, mix: { dup: 0.2, upper: 0.25 } }],
  },
  {
    at: 80,
    title: "The legacy system",
    text: "Lane 3 is an old system sending raw boxes, some of them empty inside. Parse, then Filter.",
    pause: true,
    lanes: [{ lane: 2, open: true, mix: { boxed: 0.5, null: 0.25 } }],
  },
  {
    at: 110,
    title: "Compliance",
    text: "Lane 1 now feeds a PUBLIC dashboard and carries personal data. Mask it — and watch out: stations start to overheat 🔥. Tap one to repair it.",
    pause: true,
    lanes: [{ lane: 0, public: true, mix: { null: 0.2, dup: 0.2, pii: 0.4 } }],
    breakdowns: true,
  },
  {
    at: 140,
    title: "BLACK FRIDAY",
    text: "Traffic ×1.5 and lane 2 starts sending empty rows too. Hold the line until the end of the shift!",
    pause: true,
    lanes: [{ lane: 1, mix: { dup: 0.2, upper: 0.2, null: 0.2 } }],
    speed: 1.5,
    spawn: 1.15,
  },
];

/** After the scripted waves: random "schema drift" every 30 s, a bit faster each time. */
const DRIFTS: { text: string; mix: Mix }[] = [
  { text: "now sends empty rows", mix: { null: 0.3 } },
  { text: "is retrying like crazy", mix: { dup: 0.35 } },
  { text: "switched to UPPER-CASE ids", mix: { dup: 0.15, upper: 0.3 } },
  { text: "was migrated to the legacy format", mix: { boxed: 0.5, null: 0.2 } },
  { text: "now carries personal data", mix: { pii: 0.4, null: 0.15 } },
];

export interface FBlob {
  uid: number;
  lane: number;
  id: string;
  kind: "ok" | "null";
  upper: boolean;
  boxed: boolean;
  pii: boolean;
  normalized: boolean;
  masked: boolean;
  x: number;
  next: number; // index of the next slot to reach
}

export interface Station {
  kind: StationKind;
  broken: boolean;
  memory: string[]; // dedup memory (FIFO)
}

export interface Lane {
  open: boolean;
  public: boolean;
  mix: Mix;
  slots: (Station | null)[];
  delivered: string[]; // recent ids that reached the warehouse (FIFO)
  recent: string[]; // recent clean ids emitted by the source, for duplicates
  spawnIn: number;
}

export type FEvent =
  | { type: "spawn"; blob: FBlob }
  | { type: "station"; blob: FBlob; slot: number; what: "parse" | "normalize" | "mask" }
  | { type: "drop"; blob: FBlob; slot: number; by: "filter" | "dedup" }
  | { type: "deliver"; blob: FBlob; ok: true }
  | { type: "deliver"; blob: FBlob; ok: false; reason: "NULL" | "raw box" | "duplicate" | "leak" }
  | { type: "wave"; wave: Wave; index: number }
  | { type: "break"; lane: number; slot: number }
  | { type: "goal" }
  | { type: "over" };

export interface Factory {
  t: number;
  seed: number;
  lanes: Lane[];
  blobs: FBlob[];
  credits: number;
  sla: number; // 0..100
  delivered: number;
  bad: number;
  score: number;
  waves: Wave[];
  waveIndex: number; // last started wave
  speed: number;
  spawnEvery: number;
  breakdowns: boolean;
  breakIn: number;
  nextDrift: number;
  goalReached: boolean;
  over: boolean;
  uid: number;
}

// ------------------------------------------------------------------ rng
function rand(f: Factory): number {
  f.seed = (f.seed * 16807) % 2147483647;
  return (f.seed - 1) / 2147483646;
}
const pickF = <T>(f: Factory, a: readonly T[]): T => a[Math.floor(rand(f) * a.length)];

export function createFactory(seed = Date.now(), waves: Wave[] = WAVES): Factory {
  const lanes: Lane[] = Array.from({ length: LANES }, () => ({
    open: false,
    public: false,
    mix: {},
    slots: SLOTS.map(() => null),
    delivered: [],
    recent: [],
    spawnIn: 0.5,
  }));
  return {
    t: 0,
    seed: Math.max(1, Math.floor(seed) % 2147483647),
    lanes,
    blobs: [],
    credits: START_CREDITS,
    sla: 100,
    delivered: 0,
    bad: 0,
    score: 0,
    waves,
    waveIndex: -1,
    speed: 1,
    spawnEvery: 1.6,
    breakdowns: false,
    breakIn: 14,
    nextDrift: Infinity,
    goalReached: false,
    over: false,
    uid: 0,
  };
}

// ------------------------------------------------------------------ player actions
export type PlaceResult = "ok" | "credits" | "closed";

/** Build (or replace) a station. Replacing refunds half of the old one. */
export function place(f: Factory, lane: number, slot: number, kind: StationKind): PlaceResult {
  const L = f.lanes[lane];
  if (!L.open) return "closed";
  const old = L.slots[slot];
  if (old?.kind === kind) return "ok"; // already there: keep it (and its dedup memory)
  const refund = old ? Math.floor(COST[old.kind] / 2) : 0;
  if (f.credits + refund < COST[kind]) return "credits";
  f.credits += refund - COST[kind];
  L.slots[slot] = { kind, broken: false, memory: [] };
  return "ok";
}

/** Sell a station for half its price. */
export function sell(f: Factory, lane: number, slot: number): number {
  const st = f.lanes[lane].slots[slot];
  if (!st) return 0;
  const refund = Math.floor(COST[st.kind] / 2);
  f.credits += refund;
  f.lanes[lane].slots[slot] = null;
  return refund;
}

export function repair(f: Factory, lane: number, slot: number): boolean {
  const st = f.lanes[lane].slots[slot];
  if (!st?.broken) return false;
  st.broken = false;
  return true;
}

// ------------------------------------------------------------------ simulation
function applyWave(f: Factory, w: Wave): void {
  for (const wl of w.lanes) {
    const L = f.lanes[wl.lane];
    if (wl.open !== undefined) L.open = wl.open;
    if (wl.public !== undefined) L.public = wl.public;
    if (wl.mix) L.mix = wl.mix;
  }
  if (w.speed) f.speed = w.speed;
  if (w.spawn) f.spawnEvery = w.spawn;
  if (w.breakdowns) f.breakdowns = true;
}

function newId(f: Factory): string {
  return `${pickF(f, "abcdefghjkmnpqrstuvwxyz".split(""))}${Math.floor(rand(f) * 10)}`;
}

function spawn(f: Factory, lane: number): FBlob {
  const L = f.lanes[lane];
  const m = L.mix;
  const b: FBlob = { uid: ++f.uid, lane, id: newId(f), kind: "ok", upper: false, boxed: false, pii: false, normalized: false, masked: false, x: 0, next: 0 };
  const r = rand(f);
  let acc = 0;
  const hit = (p = 0) => r < (acc += p);
  if (hit(m.null)) b.kind = "null";
  else if (L.recent.length && hit(m.dup)) b.id = pickF(f, L.recent);
  else if (L.recent.length && hit(m.upper)) {
    b.id = pickF(f, L.recent);
    b.upper = true;
  } else {
    // a fresh id that isn't already on this lane's recent list or in the warehouse
    while (L.recent.includes(b.id) || L.delivered.includes(b.id)) b.id = newId(f);
    L.recent.push(b.id);
    if (L.recent.length > 8) L.recent.shift();
  }
  if (rand(f) < (m.boxed ?? 0)) b.boxed = true;
  if (b.kind === "ok" && rand(f) < (m.pii ?? 0)) b.pii = true;
  f.blobs.push(b);
  return b;
}

const display = (b: FBlob): string => (b.upper ? b.id.toUpperCase() : b.id);
export const tagOf = (b: FBlob): string => (b.kind === "null" ? "∅" : b.normalized ? b.id : display(b));

function atStation(f: Factory, b: FBlob, slot: number, st: Station, ev: FEvent[]): boolean {
  if (st.broken) return false;
  switch (st.kind) {
    case "parse":
      if (b.boxed) {
        b.boxed = false;
        ev.push({ type: "station", blob: b, slot, what: "parse" });
      }
      return false;
    case "normalize":
      if (!b.boxed && b.upper && !b.normalized) {
        b.normalized = true;
        ev.push({ type: "station", blob: b, slot, what: "normalize" });
      }
      return false;
    case "mask":
      if (!b.boxed && b.pii && !b.masked) {
        b.masked = true;
        ev.push({ type: "station", blob: b, slot, what: "mask" });
      }
      return false;
    case "filter":
      if (!b.boxed && b.kind === "null") {
        ev.push({ type: "drop", blob: b, slot, by: "filter" });
        return true;
      }
      return false;
    case "dedup": {
      if (b.boxed || b.kind !== "ok") return false;
      const k = b.normalized ? b.id : display(b);
      if (st.memory.includes(k)) {
        ev.push({ type: "drop", blob: b, slot, by: "dedup" });
        return true;
      }
      st.memory.push(k);
      if (st.memory.length > DEDUP_MEMORY) st.memory.shift();
      return false;
    }
  }
}

function deliver(f: Factory, b: FBlob, ev: FEvent[]): void {
  const L = f.lanes[b.lane];
  let reason: "NULL" | "raw box" | "duplicate" | "leak" | null = null;
  if (b.boxed) reason = "raw box";
  else if (b.kind === "null") reason = "NULL";
  else if (L.public && b.pii && !b.masked) reason = "leak";
  else if (L.delivered.includes(b.id)) reason = "duplicate";
  if (reason) {
    f.bad++;
    f.sla = Math.max(0, f.sla - (reason === "leak" ? 15 : 10));
    ev.push({ type: "deliver", blob: b, ok: false, reason });
  } else {
    f.delivered++;
    f.score += 10;
    f.credits += 2;
    f.sla = Math.min(100, f.sla + 0.5);
    L.delivered.push(b.id);
    if (L.delivered.length > WAREHOUSE_MEMORY) L.delivered.shift();
    ev.push({ type: "deliver", blob: b, ok: true });
  }
}

/**
 * Advance the factory by `dt` seconds. Returns what happened, for the animations.
 * A wave with `pause: true` is returned as an event: the scene shows its card and simply
 * stops calling step() until the player closes it.
 */
export function step(f: Factory, dt: number): FEvent[] {
  const ev: FEvent[] = [];
  if (f.over) return ev;
  // waves
  const nextWave = f.waves[f.waveIndex + 1];
  if (nextWave && f.t >= nextWave.at) {
    f.waveIndex++;
    applyWave(f, nextWave);
    ev.push({ type: "wave", wave: nextWave, index: f.waveIndex });
    if (f.waveIndex === f.waves.length - 1) f.nextDrift = nextWave.at + 30;
    if (nextWave.pause) return ev; // the game pauses on this card
  }
  if (f.t >= f.nextDrift) drift(f, ev);
  f.t += dt;

  // sources
  f.lanes.forEach((L, i) => {
    if (!L.open) return;
    L.spawnIn -= dt;
    if (L.spawnIn <= 0) {
      L.spawnIn += f.spawnEvery * (0.8 + rand(f) * 0.4);
      ev.push({ type: "spawn", blob: spawn(f, i) });
    }
  });

  // belts
  const dx = dt * BASE_SPEED * f.speed;
  const gone = new Set<number>();
  for (const b of f.blobs) {
    b.x += dx;
    while (b.next < SLOTS.length && b.x >= SLOTS[b.next]) {
      const st = f.lanes[b.lane].slots[b.next];
      const slot = b.next++;
      if (st && atStation(f, b, slot, st, ev)) {
        gone.add(b.uid);
        break;
      }
    }
    if (!gone.has(b.uid) && b.x >= 1) {
      deliver(f, b, ev);
      gone.add(b.uid);
    }
  }
  if (gone.size) f.blobs = f.blobs.filter((b) => !gone.has(b.uid));

  // breakdowns
  if (f.breakdowns) {
    f.breakIn -= dt;
    if (f.breakIn <= 0) {
      f.breakIn = 12 + rand(f) * 10;
      const working: [number, number][] = [];
      f.lanes.forEach((L, li) => L.slots.forEach((s, si) => s && !s.broken && working.push([li, si])));
      if (working.length) {
        const [li, si] = pickF(f, working);
        f.lanes[li].slots[si]!.broken = true;
        ev.push({ type: "break", lane: li, slot: si });
      }
    }
  }

  if (!f.goalReached && f.t >= GOAL_SECONDS) {
    f.goalReached = true;
    ev.push({ type: "goal" });
  }
  if (f.sla <= 0) {
    f.over = true;
    ev.push({ type: "over" });
  }
  return ev;
}

function drift(f: Factory, ev: FEvent[]): void {
  const lane = Math.floor(rand(f) * LANES);
  const d = pickF(f, DRIFTS);
  f.speed = Math.min(2.6, f.speed + 0.12);
  f.nextDrift = f.t + 30;
  const L = f.lanes[lane];
  L.mix = d.mix;
  if (d.mix.pii) L.public = true;
  const wave: Wave = { at: f.t, title: "Schema drift", text: `Lane ${lane + 1} ${d.text}!`, pause: false, lanes: [] };
  ev.push({ type: "wave", wave, index: f.waveIndex });
}
