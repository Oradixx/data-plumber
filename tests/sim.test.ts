import { test } from "node:test";
import assert from "node:assert/strict";

import { canExtend, isComplete, key, simulate, type Cell, type Level, type StationKind } from "../src/core/sim.ts";
import { LEVELS } from "../src/data/levels.ts";

/** Shortest source→sink path by breadth-first search (used to check level data). */
function shortestPath(level: Level): Cell[] | null {
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
      if (!prev.has(key(next)) && canExtend(level, [cur], next)) {
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
  }
  return null;
}

for (const level of LEVELS) {
  test(`${level.id}: solvable, par values are exact, 3 stars reachable`, () => {
    const found = shortestPath(level);
    assert.ok(found, "no path from source to sink");
    const path: Cell[] = found;
    assert.equal(path.length, level.parLength, "parLength should equal the shortest path");
    assert.ok(isComplete(level, path));

    const stations = new Map<string, StationKind>();
    level.tools.forEach((tool, i) => stations.set(key(path[1 + i]), tool));
    const result = simulate(level, path, stations);
    assert.equal(result.success, true, result.problems.join(" "));
    assert.equal(result.stars, 3);
    assert.equal(stations.size, level.parStations);
  });
}

test("without a filter, NULL rows reach the warehouse", () => {
  const level = LEVELS[1];
  const path = shortestPath(level)!;
  const result = simulate(level, path, new Map());
  assert.equal(result.success, false);
  assert.equal(result.delivered.bad, 2);
  assert.match(result.problems[0], /NULL/);
});

test("dedup lets the first copy through and drops the second", () => {
  const level = LEVELS[2];
  const path = shortestPath(level)!;
  const stations = new Map<string, StationKind>([[key(path[1]), "dedup"]]);
  const result = simulate(level, path, stations);
  const a = result.outcomes.filter((o) => o.blob.id === "a");
  assert.equal(a[0].removedAt, null);
  assert.equal(a[1].removedBy, "dedup");
  assert.equal(result.success, false); // NULLs still get through
});

test("a detour still wins but loses the short-path star", () => {
  const level = LEVELS[0];
  const detour: Cell[] = [
    { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
    { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 },
  ];
  assert.ok(isComplete(level, detour));
  const r = simulate(level, detour, new Map());
  assert.equal(r.success, true);
  assert.equal(r.stars, detour.length <= level.parLength ? 3 : 2);
});

test("paths cannot cross walls, revisit cells or leave the grid", () => {
  const level = LEVELS[0];
  const start = [level.source];
  assert.equal(canExtend(level, start, { x: 1, y: 1 }), true);
  assert.equal(canExtend(level, start, { x: -1, y: 1 }), false);
  assert.equal(canExtend(level, [{ x: 2, y: 1 }], { x: 3, y: 1 }), false); // wall
  assert.equal(canExtend(level, [level.source, { x: 1, y: 1 }], level.source), false);
});
