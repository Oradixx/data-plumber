// Pure game logic: no Phaser here, so it can be unit-tested with `node --test`.

export interface Cell {
  x: number;
  y: number;
}

/** ok = valid row · null = empty row · dup = the same row sent twice (same id as an ok blob). */
export type BlobKind = "ok" | "null" | "dup";
export interface BlobSpec {
  id: string;
  kind: BlobKind;
}

export type StationKind = "filter" | "dedup";

export interface Level {
  id: string;
  title: string;
  brief: string; // what the player must do
  lesson: { title: string; text: string }; // knowledge card shown after a win
  cols: number;
  rows: number;
  source: Cell;
  sink: Cell;
  walls: Cell[];
  blobs: BlobSpec[];
  tools: StationKind[];
  parStations: number; // minimum stations needed
  parLength: number; // shortest possible path length (cells, source and sink included)
}

export const key = (c: Cell): string => `${c.x},${c.y}`;
export const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function isWalkable(level: Level, c: Cell): boolean {
  const inside = c.x >= 0 && c.y >= 0 && c.x < level.cols && c.y < level.rows;
  return inside && !level.walls.some((w) => same(w, c));
}

/** Can `next` extend the path currently ending at the last cell? */
export function canExtend(level: Level, path: Cell[], next: Cell): boolean {
  const last = path[path.length - 1];
  if (!last || same(last, level.sink)) return false;
  if (!adjacent(last, next) || !isWalkable(level, next)) return false;
  if (same(next, level.source)) return false;
  return !path.some((c) => same(c, next));
}

/** A complete path goes from the source to the sink, one orthogonal step at a time. */
export function isComplete(level: Level, path: Cell[]): boolean {
  if (path.length < 2 || !same(path[0], level.source) || !same(path[path.length - 1], level.sink)) {
    return false;
  }
  const seen = new Set<string>();
  return path.every((c, i) => {
    if (seen.has(key(c)) || !isWalkable(level, c)) return false;
    seen.add(key(c));
    return i === 0 || adjacent(path[i - 1], c);
  });
}

export interface BlobOutcome {
  blob: BlobSpec;
  /** Index in the path where the blob was removed, or null if it reached the sink. */
  removedAt: number | null;
  removedBy: StationKind | null;
}

export interface Result {
  outcomes: BlobOutcome[];
  delivered: { ok: number; bad: number };
  success: boolean;
  stars: 0 | 1 | 2 | 3;
  problems: string[]; // human-readable reasons for a failure
}

/**
 * Run every blob through the path. Stations sit on path cells:
 * - filter drops NULL rows;
 * - dedup drops a row whose id it has already let through (like a primary-key check).
 */
export function simulate(level: Level, path: Cell[], stations: Map<string, StationKind>): Result {
  const seenByDedup = new Map<string, Set<string>>();
  const outcomes: BlobOutcome[] = level.blobs.map((blob) => {
    for (let i = 1; i < path.length - 1; i++) {
      const station = stations.get(key(path[i]));
      if (station === "filter" && blob.kind === "null") {
        return { blob, removedAt: i, removedBy: "filter" };
      }
      if (station === "dedup") {
        const seen = seenByDedup.get(key(path[i])) ?? new Set<string>();
        seenByDedup.set(key(path[i]), seen);
        if (seen.has(blob.id)) return { blob, removedAt: i, removedBy: "dedup" };
        seen.add(blob.id);
      }
    }
    return { blob, removedAt: null, removedBy: null };
  });

  const arrived = outcomes.filter((o) => o.removedAt === null);
  const expectedOk = new Set(level.blobs.filter((b) => b.kind === "ok").map((b) => b.id)).size;
  const deliveredOk = arrived.filter((o) => o.blob.kind === "ok").length;
  const nulls = arrived.filter((o) => o.blob.kind === "null").length;
  const dups = arrived.filter((o) => o.blob.kind === "dup").length;

  const problems: string[] = [];
  if (nulls) problems.push(`${nulls} empty (NULL) row${nulls > 1 ? "s" : ""} reached the warehouse.`);
  if (dups) problems.push(`${dups} duplicate row${dups > 1 ? "s" : ""} reached the warehouse.`);
  if (deliveredOk < expectedOk) problems.push(`${expectedOk - deliveredOk} valid row(s) never arrived.`);

  const success = problems.length === 0;
  let stars: Result["stars"] = 0;
  if (success) {
    stars = 1;
    if (stations.size <= level.parStations) stars += 1;
    if (path.length <= level.parLength) stars += 1;
  }
  return { outcomes, delivered: { ok: deliveredOk, bad: nulls + dups }, success, stars: stars as Result["stars"], problems };
}
