// Pure game rules: no Phaser here, so everything can be unit-tested with `node --test`.

export interface Cell {
  x: number;
  y: number;
}

/**
 * A row of data travelling through the pipe.
 * - kind "null": an empty row, must never reach the warehouse.
 * - id: the row key. Two rows with the same lower-cased id are duplicates.
 * - upper: the id arrives in UPPER case ("A" vs "a"): Dedup only spots it after Normalize.
 * - boxed: raw, unparsed payload. Filter and Dedup cannot look inside a box; Parse opens it.
 * - pii: carries personal data. It must be Masked before entering a public zone.
 * - keyPii: the id itself is personal (an email). Once masked it reads "***", so a Dedup
 *   placed after the Mask can no longer tell rows apart.
 */
export interface BlobSpec {
  id: string;
  kind: "ok" | "null";
  dup?: boolean;
  upper?: boolean;
  boxed?: boolean;
  pii?: boolean;
  keyPii?: boolean;
}

export type StationKind = "parse" | "filter" | "normalize" | "dedup" | "mask";

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** A build pad. `only` restricts it to one station type. */
export interface Pad extends Cell {
  only?: StationKind;
}

export interface FixedStation {
  cell: Cell;
  kind: StationKind;
}

export interface Level {
  id: string;
  title: string;
  brief: string;
  lesson: { title: string; text: string };
  introduces?: StationKind[]; // stations presented in a pop-up at level start
  boss?: "mini" | "final";
  cols: number;
  rows: number;
  source: Cell;
  sink: Cell;
  walls: Cell[];
  publicZone?: Cell[];
  fixed?: FixedStation[];
  inventory: Partial<Record<StationKind, number>>;
  maxPipe?: number; // max number of cells in the pipe (source and sink included)
  pads?: Pad[]; // if set, stations can only be built on these cells
  arrows?: { cell: Cell; dir: Dir }[]; // one-way conveyors: must be crossed in that direction
  parLength?: number; // pipe length for the 2nd star when the shortest path isn't a valid solution
  blobs: BlobSpec[];
}

export const key = (c: Cell): string => `${c.x},${c.y}`;
export const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
export const displayId = (b: BlobSpec): string => (b.upper ? b.id.toUpperCase() : b.id);

export function isWalkable(level: Level, c: Cell): boolean {
  const inside = c.x >= 0 && c.y >= 0 && c.x < level.cols && c.y < level.rows;
  return inside && !level.walls.some((w) => same(w, c));
}

export function fixedAt(level: Level, c: Cell): StationKind | undefined {
  return level.fixed?.find((f) => same(f.cell, c))?.kind;
}

/** Where can the player build a station? (on the pipe, not on a fixed station, on a pad if pads exist) */
export function canPlace(level: Level, c: Cell, kind?: StationKind): boolean {
  if (same(c, level.source) || same(c, level.sink) || fixedAt(level, c)) return false;
  if (!level.pads) return true;
  const pad = level.pads.find((p) => same(p, c));
  return !!pad && (!pad.only || !kind || pad.only === kind);
}

export function padAt(level: Level, c: Cell): Pad | undefined {
  return level.pads?.find((p) => same(p, c));
}

export function arrowAt(level: Level, c: Cell): Dir | undefined {
  return level.arrows?.find((a) => same(a.cell, c))?.dir;
}

/** One-way conveyors: leave an arrow cell in its direction, enter it from behind. */
export function stepOk(level: Level, from: Cell, to: Cell): boolean {
  const d = { x: to.x - from.x, y: to.y - from.y };
  const out = arrowAt(level, from);
  if (out && (DIRS[out].x !== d.x || DIRS[out].y !== d.y)) return false;
  const inn = arrowAt(level, to);
  if (inn && (DIRS[inn].x !== d.x || DIRS[inn].y !== d.y)) return false;
  return true;
}

export function inPublicZone(level: Level, c: Cell): boolean {
  return level.publicZone?.some((z) => same(z, c)) ?? false;
}

/** Can `next` extend the path currently ending at its last cell? */
export function canExtend(level: Level, path: Cell[], next: Cell): boolean {
  const last = path[path.length - 1];
  if (!last || same(last, level.sink)) return false;
  if (level.maxPipe && path.length >= level.maxPipe) return false;
  if (!adjacent(last, next) || !isWalkable(level, next) || same(next, level.source)) return false;
  if (!stepOk(level, last, next)) return false;
  return !path.some((c) => same(c, next));
}

export function isComplete(level: Level, path: Cell[]): boolean {
  if (path.length < 2 || !same(path[0], level.source) || !same(path[path.length - 1], level.sink)) return false;
  if (level.maxPipe && path.length > level.maxPipe) return false;
  const seen = new Set<string>();
  return path.every((c, i) => {
    if (seen.has(key(c)) || !isWalkable(level, c)) return false;
    seen.add(key(c));
    return i === 0 || (adjacent(path[i - 1], c) && stepOk(level, path[i - 1], c));
  });
}

/** Length (in cells) of the shortest possible pipe — the 2nd star target. */
export function shortestLength(level: Level): number | null {
  const dist = new Map<string, number>([[key(level.source), 1]]);
  const queue: Cell[] = [level.source];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur))!;
    if (same(cur, level.sink)) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (!dist.has(key(n)) && isWalkable(level, n) && !same(n, level.source) && stepOk(level, cur, n)) {
        dist.set(key(n), d + 1);
        queue.push(n);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ simulation

export type TraceEvent =
  | { step: number; type: "move" }
  | { step: number; type: "parse" | "normalize" | "mask" }
  | { step: number; type: "drop"; by: "filter" | "dedup" }
  | { step: number; type: "leak" }
  | { step: number; type: "deliver"; verdict: "ok" | "null" | "boxed" | "duplicate" };

export interface BlobRun {
  blob: BlobSpec;
  events: TraceEvent[]; // in path order; one "move" per cell, plus what happened there
}

export interface Result {
  runs: BlobRun[];
  success: boolean;
  shortPipe: boolean;
  delivered: { ok: number; bad: number; expected: number };
  problems: string[];
  hints: string[];
}

export function stationsOnPath(level: Level, path: Cell[], placed: Map<string, StationKind>): (StationKind | undefined)[] {
  return path.map((c, i) => (i === 0 || i === path.length - 1 ? undefined : fixedAt(level, c) ?? placed.get(key(c))));
}

export function simulate(level: Level, path: Cell[], placed: Map<string, StationKind>): Result {
  const onPath = stationsOnPath(level, path, placed);
  const dedupMemory = new Map<number, Set<string>>();
  const deliveredIds = new Set<string>();
  const counts = { null: 0, boxed: 0, duplicate: 0, leak: 0 };
  const runs: BlobRun[] = [];

  for (const blob of level.blobs) {
    let boxed = !!blob.boxed;
    let normalized = false;
    let masked = !blob.pii;
    let leaked = false;
    const events: TraceEvent[] = [];
    let dropped = false;

    for (let i = 1; i < path.length && !dropped; i++) {
      events.push({ step: i, type: "move" });
      // Entering a public zone with unmasked personal data is a leak (checked before
      // the station on that cell: masking inside the zone is already too late).
      if (!masked && !leaked && inPublicZone(level, path[i])) {
        leaked = true;
        counts.leak++;
        events.push({ step: i, type: "leak" });
      }
      const st = onPath[i];
      if (st === "parse" && boxed) {
        boxed = false;
        events.push({ step: i, type: "parse" });
      } else if (st === "normalize" && !boxed && blob.upper && !normalized) {
        normalized = true;
        events.push({ step: i, type: "normalize" });
      } else if (st === "mask" && !masked && !boxed) {
        masked = true;
        events.push({ step: i, type: "mask" });
      } else if (st === "filter" && !boxed && blob.kind === "null") {
        events.push({ step: i, type: "drop", by: "filter" });
        dropped = true;
      } else if (st === "dedup" && !boxed && blob.kind === "ok") {
        const seen = dedupMemory.get(i) ?? new Set<string>();
        dedupMemory.set(i, seen);
        const k = blob.keyPii && masked && blob.pii ? "***" : normalized ? blob.id.toLowerCase() : displayId(blob);
        if (seen.has(k)) {
          events.push({ step: i, type: "drop", by: "dedup" });
          dropped = true;
        } else seen.add(k);
      }
    }
    if (!dropped) {
      let verdict: "ok" | "null" | "boxed" | "duplicate" = "ok";
      if (boxed) verdict = "boxed";
      else if (blob.kind === "null") verdict = "null";
      else if (deliveredIds.has(blob.id.toLowerCase())) verdict = "duplicate";
      if (verdict === "ok") deliveredIds.add(blob.id.toLowerCase());
      if (verdict !== "ok") counts[verdict]++;
      events.push({ step: path.length - 1, type: "deliver", verdict });
    }
    runs.push({ blob, events });
  }

  const expected = new Set(level.blobs.filter((b) => b.kind === "ok").map((b) => b.id.toLowerCase())).size;
  const deliveredOk = deliveredIds.size;
  const problems: string[] = [];
  const hints: string[] = [];
  const idx = (k: StationKind) => onPath.indexOf(k);
  // With typed pads, a route can make a station impossible to build at all.
  const inner = path.slice(1, -1);
  const routeLacks = (k: StationKind) =>
    !!level.pads?.some((pd) => pd.only) && idx(k) < 0 && !inner.some((c) => canPlace(level, c, k));
  const skipped = (k: StationKind) =>
    `This route never crosses a ${k[0].toUpperCase() + k.slice(1)} pad — you can't build one here. Find another road.`;
  const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

  if (counts.boxed) {
    problems.push(`${plural(counts.boxed, "raw box")} reached the warehouse unopened.`);
    hints.push("Warehouses can't load raw payloads: put a Parse on the pipe.");
  }
  if (counts.null) {
    problems.push(`${plural(counts.null, "empty (NULL) row")} got through.`);
    const boxedNull = level.blobs.some((b) => b.boxed && b.kind === "null");
    if (routeLacks("filter")) hints.push(skipped("filter"));
    else if (idx("filter") < 0) hints.push("A Filter removes empty rows.");
    else if (boxedNull && (idx("parse") < 0 || idx("parse") > idx("filter")))
      hints.push("A Filter can't see inside a box: Parse must come BEFORE the Filter.");
  }
  if (counts.duplicate) {
    problems.push(`${plural(counts.duplicate, "duplicate")} landed in the warehouse.`);
    const hasUpper = level.blobs.some((b) => b.upper);
    if (routeLacks("dedup")) hints.push(skipped("dedup"));
    else if (idx("dedup") < 0) hints.push("A Dedup drops rows whose id it has already seen.");
    else if (hasUpper && (idx("normalize") < 0 || idx("normalize") > onPath.lastIndexOf("dedup")))
      hints.push('Dedup compares ids exactly: "A" ≠ "a". Normalize them BEFORE the Dedup.');
    else if (level.blobs.some((b) => b.boxed && b.dup) && (idx("parse") < 0 || idx("parse") > onPath.lastIndexOf("dedup")))
      hints.push("Dedup can't read the id of a boxed row: Parse first.");
    else if (level.blobs.some((b) => b.keyPii) && idx("mask") >= 0 && idx("mask") < onPath.lastIndexOf("dedup"))
      hints.push("Some copies were masked and others not, so their ids no longer match: Parse, then Dedup, then Mask.");
  }
  if (counts.leak) {
    problems.push(`${plural(counts.leak, "row")} with personal data entered the public zone unmasked.`);
    const maskAt = idx("mask");
    const zoneAt = path.findIndex((c) => inPublicZone(level, c));
    if (maskAt >= 0 && level.blobs.some((b) => b.pii && b.boxed) && (idx("parse") < 0 || idx("parse") > maskAt))
      hints.push("Mask can't redact inside a raw box: Parse before you Mask.");
    else if (maskAt < 0 && zoneAt >= 0 && !path.slice(1, zoneAt).some((c) => canPlace(level, c)))
      hints.push("This pipe enters the public zone before you could build anything: try another route.");
    else hints.push("Mask personal data BEFORE the pipe enters the striped public zone.");
  }
  if (deliveredOk < expected) {
    problems.push(`${plural(expected - deliveredOk, "valid row")} never arrived.`);
    const maskIdx = onPath.indexOf("mask");
    if (level.blobs.some((b) => b.keyPii) && maskIdx >= 0 && onPath.lastIndexOf("dedup") > maskIdx)
      hints.push('Mask turned the email ids into "***": the Dedup after it thinks different rows are copies. Deduplicate BEFORE masking.');
  }

  const best = level.parLength ?? shortestLength(level) ?? path.length;
  return {
    runs,
    success: problems.length === 0,
    shortPipe: path.length <= best,
    delivered: { ok: deliveredOk, bad: counts.boxed + counts.null + counts.duplicate, expected },
    problems,
    hints,
  };
}

/** 1 star for a clean delivery, +1 for the shortest pipe, +1 when it works on the first run. */
export function starsFor(result: Result, attempts: number): 0 | 1 | 2 | 3 {
  if (!result.success) return 0;
  return (1 + (result.shortPipe ? 1 : 0) + (attempts <= 1 ? 1 : 0)) as 1 | 2 | 3;
}
