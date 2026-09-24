// Exhaustive solver: enumerates every legal pipe and every legal station placement.
// Used by the tests (to prove a level is solvable and how hard it is) and by the
// level generator script. Pure logic, no Phaser.

import { canExtend, canPlace, isComplete, key, same, simulate, type Cell, type Level, type StationKind } from "./sim.ts";

export interface Solution {
  path: Cell[];
  placed: Map<string, StationKind>;
}

/** Every complete pipe (source → sink) allowed by walls, conveyors and the pipe budget. */
export function allPaths(level: Level, limit = 200_000): Cell[][] {
  const out: Cell[][] = [];
  const max = level.maxPipe ?? level.cols * level.rows;
  const path: Cell[] = [level.source];
  const dist = (c: Cell) => Math.abs(c.x - level.sink.x) + Math.abs(c.y - level.sink.y);
  const walk = () => {
    if (out.length >= limit) return;
    const last = path[path.length - 1];
    if (same(last, level.sink)) {
      out.push([...path]);
      return;
    }
    if (path.length + dist(last) > max) return; // cannot reach the sink within budget
    for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
      const n = { x: last.x + dx, y: last.y + dy };
      if (canExtend(level, path, n)) {
        path.push(n);
        walk();
        path.pop();
      }
    }
  };
  walk();
  return out.filter((p) => isComplete(level, p));
}

/** All winning station placements on a given pipe (each inventory item used at most once). */
export function winningPlacements(level: Level, path: Cell[], stopAtFirst = false): Map<string, StationKind>[] {
  const kinds: StationKind[] = [];
  for (const [k, n] of Object.entries(level.inventory)) for (let i = 0; i < (n ?? 0); i++) kinds.push(k as StationKind);
  const slots = path.slice(1, -1).filter((c) => canPlace(level, c));
  const wins: Map<string, StationKind>[] = [];
  const placed = new Map<string, StationKind>();
  const assign = (i: number) => {
    if (stopAtFirst && wins.length) return;
    if (i === kinds.length) {
      if (simulate(level, path, placed).success) wins.push(new Map(placed));
      return;
    }
    assign(i + 1); // the player may also leave this station unused
    for (const c of slots) {
      const k = key(c);
      if (placed.has(k) || !canPlace(level, c, kinds[i])) continue;
      // identical station kinds: keep them in path order to avoid duplicate work
      if (i > 0 && kinds[i - 1] === kinds[i]) {
        const prev = [...placed.entries()].find(([, v]) => v === kinds[i]);
        if (prev && slots.findIndex((s) => key(s) === prev[0]) > slots.indexOf(c)) continue;
      }
      placed.set(k, kinds[i]);
      assign(i + 1);
      placed.delete(k);
    }
  };
  assign(0);
  return wins;
}

export interface Difficulty {
  totalPaths: number;
  winningPaths: number;
  winningLayouts: number;
  shortestWin: number | null;
  shortestAny: number | null;
  randomWinRate: number; // over random (legal path, legal placement) pairs
}

export function analyse(level: Level, samples = 3000): Difficulty {
  const paths = allPaths(level);
  let winningPaths = 0;
  let winningLayouts = 0;
  let shortestWin: number | null = null;
  for (const p of paths) {
    const w = winningPlacements(level, p);
    if (w.length) {
      winningPaths++;
      winningLayouts += w.length;
      shortestWin = Math.min(shortestWin ?? Infinity, p.length);
    }
  }
  // random play: a random legal pipe, then stations on random legal slots
  let wins = 0;
  const kinds: StationKind[] = Object.entries(level.inventory).flatMap(([k, n]) => Array(n ?? 0).fill(k as StationKind));
  for (let t = 0; t < samples && paths.length; t++) {
    const p = paths[Math.floor(Math.random() * paths.length)];
    const slots = p.slice(1, -1).filter((c) => canPlace(level, c)).sort(() => Math.random() - 0.5);
    const placed = new Map<string, StationKind>();
    for (const k of kinds.sort(() => Math.random() - 0.5)) {
      const c = slots.find((s) => !placed.has(key(s)) && canPlace(level, s, k));
      if (c) placed.set(key(c), k);
    }
    if (simulate(level, p, placed).success) wins++;
  }
  return {
    totalPaths: paths.length,
    winningPaths,
    winningLayouts,
    shortestWin,
    shortestAny: paths.length ? Math.min(...paths.map((p) => p.length)) : null,
    randomWinRate: paths.length ? wins / samples : 0,
  };
}
