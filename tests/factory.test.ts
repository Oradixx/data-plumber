import { test } from "node:test";
import assert from "node:assert/strict";

import { COST, createFactory, GOAL_SECONDS, place, repair, sell, START_CREDITS, step, WAVES, type Factory, type FEvent, type Mix, type Wave } from "../src/core/factory.ts";
import type { StationKind } from "../src/core/sim.ts";

/** One lane, one fixed data mix, no waves after that: a lab bench for station rules. */
function bench(mix: Mix, opts: { public?: boolean } = {}, seed = 3): Factory {
  const wave: Wave = { at: 0, title: "lab", text: "", pause: false, lanes: [{ lane: 0, open: true, mix, public: opts.public }] };
  const f = createFactory(seed, [wave]);
  f.credits = 999;
  step(f, 0); // starts the wave
  f.nextDrift = Infinity; // no schema drift on the bench
  return f;
}

function run(f: Factory, seconds: number): FEvent[] {
  const all: FEvent[] = [];
  for (let t = 0; t < seconds; t += 0.05) all.push(...step(f, 0.05));
  return all;
}

const build = (f: Factory, stations: StationKind[]) => stations.forEach((k, i) => assert.equal(place(f, 0, i, k), "ok"));
const reasons = (ev: FEvent[]) => ev.flatMap((e) => (e.type === "deliver" && !e.ok ? [e.reason] : []));

test("without a Filter, empty rows reach the warehouse and cost SLA", () => {
  const f = bench({ null: 0.4 });
  const ev = run(f, 60);
  assert.ok(reasons(ev).includes("NULL"));
  assert.ok(f.sla < 100);
});

test("a Filter stops them all", () => {
  const f = bench({ null: 0.4 });
  build(f, ["filter"]);
  const ev = run(f, 60);
  assert.deepEqual(reasons(ev), []);
  assert.ok(f.delivered > 10);
});

test("mixed-case copies: Normalize before Dedup works, after it doesn't", () => {
  const good = bench({ dup: 0.2, upper: 0.3 });
  build(good, ["normalize", "dedup"]);
  assert.deepEqual(reasons(run(good, 90)), []);

  const bad = bench({ dup: 0.2, upper: 0.3 });
  build(bad, ["dedup", "normalize"]);
  assert.ok(reasons(run(bad, 90)).includes("duplicate"));
});

test("boxed empty rows: Parse must come before the Filter", () => {
  const good = bench({ boxed: 0.5, null: 0.3 });
  build(good, ["parse", "filter"]);
  assert.deepEqual(reasons(run(good, 90)), []);

  const bad = bench({ boxed: 0.5, null: 0.3 });
  build(bad, ["filter", "parse"]);
  assert.ok(reasons(run(bad, 90)).includes("NULL"));
});

test("a public lane leaks personal data unless it is masked", () => {
  const leaky = bench({ pii: 0.5 }, { public: true });
  assert.ok(reasons(run(leaky, 60)).includes("leak"));

  const safe = bench({ pii: 0.5 }, { public: true });
  build(safe, ["mask"]);
  assert.deepEqual(reasons(run(safe, 60)), []);
});

test("credits: building costs, replacing refunds half, selling refunds half", () => {
  const f = createFactory(1);
  step(f, 0);
  assert.equal(f.credits, START_CREDITS);
  assert.equal(place(f, 0, 0, "dedup"), "ok");
  assert.equal(f.credits, START_CREDITS - COST.dedup);
  assert.equal(place(f, 0, 0, "filter"), "ok"); // replace: +7 back, -10
  assert.equal(f.credits, START_CREDITS - COST.dedup + Math.floor(COST.dedup / 2) - COST.filter);
  const before = f.credits;
  assert.equal(sell(f, 0, 0), Math.floor(COST.filter / 2));
  assert.equal(f.credits, before + Math.floor(COST.filter / 2));
  f.credits = 3;
  assert.equal(place(f, 0, 1, "parse"), "credits");
  assert.equal(place(f, 2, 0, "filter"), "closed", "lane 3 is not open at the start");
});

test("a broken station does nothing until repaired", () => {
  const f = bench({ null: 0.4 });
  build(f, ["filter"]);
  f.lanes[0].slots[0]!.broken = true;
  assert.ok(reasons(run(f, 40)).includes("NULL"));
  assert.equal(repair(f, 0, 0), true);
  run(f, 10); // let the rows already past the slot drain
  assert.deepEqual(reasons(run(f, 40)), []);
});

test("tutorial waves pause the game: step() returns the wave and doesn't advance time", () => {
  const f = createFactory(5);
  const ev = step(f, 0.1);
  assert.equal(ev[0].type, "wave");
  assert.equal(f.t, 0);
  step(f, 0.1);
  assert.ok(f.t > 0);
});

test("a well-run shift reaches the 3-minute goal", () => {
  // scripted player: builds what each wave calls for, repairs everything at once
  const f = createFactory(11);
  f.credits = 999;
  const plan: Record<number, [number, StationKind[]]> = {
    0: [0, ["filter"]],
    1: [0, ["filter", "dedup"]],
    2: [1, ["normalize", "dedup"]],
    3: [2, ["parse", "filter"]],
    4: [0, ["filter", "dedup", "mask"]],
    5: [1, ["normalize", "dedup", "filter"]],
  };
  let goal = false;
  for (let t = 0; t < GOAL_SECONDS + 5 && !f.over; t += 0.05) {
    for (const e of step(f, 0.05)) {
      if (e.type === "wave" && e.wave.pause && plan[e.index]) {
        const [lane, ks] = plan[e.index];
        ks.forEach((k, i) => place(f, lane, i, k));
      }
      if (e.type === "break") repair(f, e.lane, e.slot);
      if (e.type === "goal") goal = true;
    }
  }
  assert.ok(goal, `sla ${f.sla}, bad ${f.bad}`);
  assert.ok(f.sla > 60, `sla ${f.sla}`);
  assert.equal(f.waveIndex, WAVES.length - 1);
});

test("doing nothing loses the shift", () => {
  const f = createFactory(11);
  let over = false;
  for (let t = 0; t < 400 && !over; t += 0.05) over = step(f, 0.05).some((e) => e.type === "over");
  assert.ok(over);
});

test("same seed, same game", () => {
  const a = createFactory(42);
  const b = createFactory(42);
  run(a, 30);
  run(b, 30);
  assert.deepEqual(
    a.blobs.map((x) => x.id),
    b.blobs.map((x) => x.id),
  );
});
