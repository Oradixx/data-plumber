// Story mode: which chapter comes next. Pure logic, unit-tested.
//
// Chapter 1 · Clean or Trash — sort rows BY HAND (feel the pain, learn the 4 quality checks)
// Chapter 2 · Data Plumber   — AUTOMATE those checks with pipelines (11 levels, 2 bosses)
// Chapter 3 · Data Factory   — RUN them live, at scale, while everything changes
// Manual → automated → operated: the same path a data team follows.

export type StoryId = "prologue" | "ch2" | "ch3" | "epilogue";

export interface StoryFlags {
  seen: StoryId[]; // cutscenes already watched
  ch1: boolean; // Clean or Trash goal reached
  ch3: boolean; // Data Factory shift completed
}

export const CH1_GOAL = 30; // rows sorted right in one Clean or Trash run

export type StoryStep =
  | { scene: "story"; data: { id: StoryId } }
  | { scene: "trash"; data: Record<string, never> }
  | { scene: "level"; data: { index: number } }
  | { scene: "factory"; data: Record<string, never> };

export const emptyFlags = (): StoryFlags => ({ seen: [], ch1: false, ch3: false });

/** Plumber progress counts as having done chapter 1 (players from before story mode existed). */
export const ch1Done = (flags: StoryFlags, stars: Record<string, number>): boolean => flags.ch1 || Object.values(stars).some((s) => s > 0);

/** The next thing to play in story mode — what "Continue" does. */
export function nextStep(flags: StoryFlags, stars: Record<string, number>, levelIds: string[]): StoryStep {
  const seen = (id: StoryId) => flags.seen.includes(id);
  if (!seen("prologue") && !ch1Done(flags, stars)) return { scene: "story", data: { id: "prologue" } };
  if (!ch1Done(flags, stars)) return { scene: "trash", data: {} };
  if (!seen("ch2") && !levelIds.some((id) => stars[id])) return { scene: "story", data: { id: "ch2" } };
  const todo = levelIds.findIndex((id) => !stars[id]);
  if (todo >= 0) return { scene: "level", data: { index: todo } };
  if (!seen("ch3")) return { scene: "story", data: { id: "ch3" } };
  if (!flags.ch3) return { scene: "factory", data: {} };
  if (!seen("epilogue")) return { scene: "story", data: { id: "epilogue" } };
  return { scene: "factory", data: {} };
}

/** Which chapter the player is in (for the map's banner). */
export function chapterOf(flags: StoryFlags, stars: Record<string, number>, levelIds: string[]): 1 | 2 | 3 | 4 {
  if (!ch1Done(flags, stars)) return 1;
  if (levelIds.some((id) => !stars[id])) return 2;
  if (!flags.ch3) return 3;
  return 4; // story complete
}
