import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canExtend,
  fixedAt,
  inPublicZone,
  isComplete,
  key,
  shortestLength,
  simulate,
  starsFor,
  type Cell,
  type Level,
  type StationKind,
} from "../src/core/sim.ts";
import { BOSS_TRAPS, LEVELS, SOLUTIONS, TRAPS, type Layout } from "../src/data/levels.ts";
import { canPlace } from "../src/core/sim.ts";

/** Shortest source→sink pipe by breadth-first search. */
function shortestPath(level: Level): Cell[] {
  const prev = new Map<string, Cell | null>([[key(level.source), null]]);
  const queue: Cell[] = [level.source];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === level.sink.x && cur.y === level.sink.y) {
      const path: Cell[] = [];
      for (let c: Cell | null = cur; c; c = prev.get(key(c)) ?? null) path.unshift(c);
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cur.x + dx, y: cur.y + dy };
      if (!prev.has(key(next)) && canExtend({ ...level, maxPipe: undefined }, [cur], next)) {
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
  }
  throw new Error(`${level.id}: no path`);
}

/** Put stations, in order, on the earliest free pipe cells (not fixed, not in the public zone). */
function place(level: Level, path: Cell[], order: StationKind[]): Map<string, StationKind> {
  const placed = new Map<string, StationKind>();
  let i = 1;
  for (const kind of order) {
    while (fixedAt(level, path[i]) || inPublicZone(level, path[i])) i++;
    assert.ok(i < path.length - 1, `${level.id}: not enough room for ${kind}`);
    placed.set(key(path[i]), kind);
    i++;
  }
  return placed;
}

const inventoryMatches = (level: Level, order: StationKind[]) => {
  const count: Partial<Record<StationKind, number>> = {};
  order.forEach((k) => (count[k] = (count[k] ?? 0) + 1));
  return Object.entries(count).every(([k, n]) => (level.inventory[k as StationKind] ?? 0) >= n);
};

function solutionOf(level: Level): { path: Cell[]; placed: Map<string, StationKind>; order: StationKind[] } {
  const sol = SOLUTIONS[level.id];
  if (Array.isArray(sol)) {
    const path = shortestPath(level);
    return { path, placed: place(level, path, sol), order: sol };
  }
  const layout = sol as Layout;
  const path = layout.path.map(([x, y]) => ({ x, y }));
  const placed = new Map<string, StationKind>(layout.stations.map(([[x, y], k]) => [key({ x, y }), k]));
  return { path, placed, order: layout.stations.map(([, k]) => k) };
}

for (const level of LEVELS) {
  test(`${level.id}: the reference solution wins with 3 stars`, () => {
    const { path, placed, order } = solutionOf(level);
    assert.ok(isComplete(level, path), "solution pipe is not valid");
    assert.ok(inventoryMatches(level, order), "solution uses more stations than the inventory");
    for (const k of placed.keys()) {
      const [x, y] = k.split(",").map(Number);
      assert.ok(canPlace(level, { x, y }), `station not allowed at ${k}`);
      assert.ok(path.some((c) => key(c) === k), `station at ${k} is not on the pipe`);
    }
    const r = simulate(level, path, placed);
    assert.equal(r.success, true, `${r.problems.join(" ")} ${r.hints.join(" ")}`);
    assert.equal(starsFor(r, 1), 3);
  });

  test(`${level.id}: an empty pipe fails (unless it's the tutorial)`, () => {
    const { path } = solutionOf(level);
    const r = simulate(level, path, new Map());
    assert.equal(r.success, (SOLUTIONS[level.id] as StationKind[]).length === 0);
  });

  for (const trap of TRAPS[level.id] ?? []) {
    test(`${level.id}: the wrong order [${trap.join(" → ")}] fails with a hint`, () => {
      const path = shortestPath(level);
      const r = simulate(level, path, place(level, path, trap));
      assert.equal(r.success, false);
      assert.ok(r.hints.length > 0, "a failure should explain itself");
    });
  }
}

test("two-roads: the top road doesn't have enough pads", () => {
  const level = LEVELS.find((l) => l.id === "two-roads")!;
  const top = [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1], [7, 2], [8, 2]].map(
    ([x, y]) => ({ x, y }),
  );
  assert.ok(isComplete(level, top));
  const pads = top.filter((c) => canPlace(level, c));
  assert.equal(pads.length, 3);
});

test("pads: stations can only be built on pads when a level has them", () => {
  const level = LEVELS.find((l) => l.id === "privacy-zone")!;
  assert.equal(canPlace(level, { x: 1, y: 0 }), true);
  assert.equal(canPlace(level, { x: 3, y: 0 }), false);
});

test("masking inside the public zone is too late", () => {
  const level = LEVELS.find((l) => l.id === "privacy-zone")!;
  const { path } = solutionOf(level);
  const placed = new Map<string, StationKind>([
    [key({ x: 1, y: 0 }), "filter"],
    [key({ x: 6, y: 2 }), "mask"], // after the zone: too late
  ]);
  const r = simulate(level, path, placed);
  assert.equal(r.success, false);
  assert.match(r.hints.join(" "), /BEFORE the pipe enters/);
});

test("the pipe budget blocks long detours", () => {
  const level = LEVELS.find((l) => l.id === "legacy-trap")!;
  const path = [level.source];
  // walk right as far as allowed, then check the budget is enforced
  let steps = 0;
  while (path.length < level.maxPipe!) {
    const last = path[path.length - 1];
    const next = [{ x: last.x + 1, y: last.y }, { x: last.x, y: last.y + 1 }, { x: last.x, y: last.y - 1 }].find((c) =>
      canExtend(level, path, c),
    );
    if (!next) break;
    path.push(next);
    steps++;
  }
  const last = path[path.length - 1];
  if (path.length === level.maxPipe) {
    assert.equal(canExtend(level, path, { x: last.x + 1, y: last.y }), false);
  }
  assert.ok(steps > 0);
});

test("stars: first-try bonus and short-pipe bonus", () => {
  const level = LEVELS[0];
  const r = simulate(level, shortestPath(level), new Map());
  assert.equal(starsFor(r, 1), 3);
  assert.equal(starsFor(r, 2), 2);
});

for (const [name, layout] of Object.entries(BOSS_TRAPS)) {
  test(`boss trap fails with a hint: ${name}`, () => {
    const level = LEVELS.find((l) => l.id === "black-friday")!;
    const path = layout.path.map(([x, y]) => ({ x, y }));
    assert.ok(isComplete(level, path), "trap pipe should be a legal pipe");
    const placed = new Map<string, StationKind>(layout.stations.map(([[x, y], k]) => [key({ x, y }), k]));
    for (const k of placed.keys()) {
      const [x, y] = k.split(",").map(Number);
      assert.ok(canPlace(level, { x, y }), `trap uses a non-pad cell ${k}`);
    }
    const r = simulate(level, path, placed);
    assert.equal(r.success, false);
    assert.ok(r.hints.length > 0, r.problems.join(" "));
  });
}
