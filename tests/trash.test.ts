import { test } from "node:test";
import assert from "node:assert/strict";

import { activeRules, deal, judge, multiplier, RULES, rng, timeLimit, type Row, type RuleId } from "../src/core/trash.ts";

const YEAR = 2026;
const base: Row = { id: "1042", email: "ana@mail.com", age: 34, country: "FR", signup: "2021-03-14" };
const ALL: RuleId[] = RULES.map((r) => r.id);
const none = new Set<string>();

test("a clean row is kept", () => {
  assert.deepEqual(judge(base, ALL, none, YEAR), { keep: true });
});

test("each rule catches its own flaw", () => {
  assert.equal(judge({ ...base, age: null }, ALL, none, YEAR).rule, "empty");
  assert.equal(judge({ ...base, age: -3 }, ALL, none, YEAR).rule, "impossible");
  assert.equal(judge({ ...base, age: 121 }, ALL, none, YEAR).rule, "impossible");
  assert.equal(judge({ ...base, signup: "2049-01-01" }, ALL, none, YEAR).rule, "impossible");
  assert.equal(judge({ ...base, email: "ana.mail.com" }, ALL, none, YEAR).rule, "format");
  assert.equal(judge({ ...base, country: "France" }, ALL, none, YEAR).rule, "format");
  assert.equal(judge(base, ALL, new Set(["1042"]), YEAR).rule, "duplicate");
});

test("edge values are fine: age 0 and 120, sign-up this year", () => {
  assert.equal(judge({ ...base, age: 0 }, ALL, none, YEAR).keep, true);
  assert.equal(judge({ ...base, age: 120 }, ALL, none, YEAR).keep, true);
  assert.equal(judge({ ...base, signup: `${YEAR}-01-01` }, ALL, none, YEAR).keep, true);
});

test("a rule that isn't unlocked yet doesn't apply", () => {
  assert.equal(judge({ ...base, age: -3 }, ["empty"], none, YEAR).keep, true);
});

test("rules unlock progressively", () => {
  assert.deepEqual(activeRules(0), ["empty"]);
  assert.deepEqual(activeRules(6), ["empty", "impossible"]);
  assert.deepEqual(activeRules(100), ALL);
});

test("dealt rows: one flaw at most, never from a locked rule, about 45% dirty", () => {
  const r = rng(42);
  for (const active of [["empty"], ["empty", "impossible"], ["empty", "impossible", "format"], ALL] as RuleId[][]) {
    const warehouse = new Map<string, Row>();
    const used = new Set<string>();
    let dirty = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const { row, verdict } = deal(r, active, warehouse, used, YEAR);
      // the verdict must not change if we switch on every rule: no hidden flaws
      assert.deepEqual(judge(row, ALL, new Set(warehouse.keys()), YEAR), verdict, JSON.stringify(row));
      if (!verdict.keep) dirty++;
      else if (warehouse.size < 30) warehouse.set(row.id, row);
    }
    assert.ok(dirty / N > 0.35 && dirty / N < 0.55, `dirty rate ${dirty / N}`);
  }
});

test("duplicates copy a row that really is in the warehouse", () => {
  const r = rng(7);
  const warehouse = new Map<string, Row>([[base.id, base]]);
  const used = new Set([base.id]);
  let dups = 0;
  for (let i = 0; i < 500; i++) {
    const { row, verdict } = deal(r, ["duplicate"], warehouse, used, YEAR, 1);
    assert.equal(verdict.rule, "duplicate");
    assert.deepEqual(row, base);
    dups++;
  }
  assert.equal(dups, 500);
});

test("combo and speed curves", () => {
  assert.equal(multiplier(0), 1);
  assert.equal(multiplier(4), 2);
  assert.equal(multiplier(100), 5);
  assert.equal(timeLimit(0), 7.5);
  assert.equal(timeLimit(1000), 2.8);
});
