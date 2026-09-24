import { test } from "node:test";
import assert from "node:assert/strict";

import { chapterOf, emptyFlags, nextStep, type StoryFlags } from "../src/core/story.ts";
import { LEVELS } from "../src/data/levels.ts";
import { CUTSCENES } from "../src/data/story.ts";

const ids = LEVELS.map((l) => l.id);
const allStars = Object.fromEntries(ids.map((id) => [id, 3]));

test("a brand new player starts with the prologue, then Clean or Trash", () => {
  const f = emptyFlags();
  assert.deepEqual(nextStep(f, {}, ids), { scene: "story", data: { id: "prologue" } });
  f.seen.push("prologue");
  assert.equal(nextStep(f, {}, ids).scene, "trash");
});

test("the whole story, in order", () => {
  const f: StoryFlags = emptyFlags();
  const stars: Record<string, number> = {};
  const order: string[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const s = nextStep(f, stars, ids);
    order.push(s.scene === "story" ? `story:${s.data.id}` : s.scene === "level" ? `level:${s.data.index}` : s.scene);
    if (s.scene === "story") {
      if (s.data.id === "epilogue") break;
      f.seen.push(s.data.id);
    } else if (s.scene === "trash") f.ch1 = true;
    else if (s.scene === "level") stars[ids[s.data.index]] = 2;
    else if (s.scene === "factory") f.ch3 = true;
  }
  assert.deepEqual(order, [
    "story:prologue",
    "trash",
    "story:ch2",
    ...ids.map((_, i) => `level:${i}`),
    "story:ch3",
    "factory",
    "story:epilogue",
  ]);
});

test("players who already have Plumber stars skip chapter 1", () => {
  const s = nextStep(emptyFlags(), { "first-flow": 3 }, ids);
  assert.deepEqual(s, { scene: "level", data: { index: 1 } });
  assert.equal(chapterOf(emptyFlags(), { "first-flow": 3 }, ids), 2);
});

test("after the story, Continue goes to the factory (free play)", () => {
  const f: StoryFlags = { seen: ["prologue", "ch2", "ch3", "epilogue"], ch1: true, ch3: true };
  assert.equal(nextStep(f, allStars, ids).scene, "factory");
  assert.equal(chapterOf(f, allStars, ids), 4);
});

test("each cutscene hands over to the next chapter's scene", () => {
  assert.equal(CUTSCENES.prologue.next.scene, "trash");
  assert.deepEqual(CUTSCENES.ch2.next, { scene: "level", data: { index: 0 } });
  assert.equal(CUTSCENES.ch3.next.scene, "factory");
  assert.equal(CUTSCENES.epilogue.next.scene, "menu");
});
