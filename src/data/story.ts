import type { StoryId } from "../core/story.ts";

export interface Cutscene {
  chapter: string; // big label on the title card
  title: string;
  prop: "bin" | "pipe" | "factory" | "trophy"; // the illustration next to Ada
  lines: string[]; // Ada speaks, one bubble per line
  next: { scene: string; data?: object }; // where the story goes afterwards
}

/** Ada is the lead data engineer who mentors the player through the three chapters. */
export const CUTSCENES: Record<StoryId, Cutscene> = {
  prologue: {
    chapter: "CHAPTER 1",
    title: "The Quality Gate",
    prop: "bin",
    lines: [
      "Welcome to DataCorp! I'm Ada, lead data engineer. You must be the new intern.",
      "Every second, our API spits out rows. Most of them are fine. Some of them… really aren't.",
      "Empty values. Impossible ages. Emails without an @. Copies of copies.",
      "Before anything reaches the warehouse, someone checks it by hand. Today, that someone is you.",
      `Keep the clean rows, trash the dirty ones. Sort 30 right in one shift and I'll show you something better.`,
    ],
    next: { scene: "trash" },
  },
  ch2: {
    chapter: "CHAPTER 2",
    title: "Data Plumber",
    prop: "pipe",
    lines: [
      "30 rows, spotless. Nice work!",
      "Now the bad news: we receive three million rows a day. Your thumb won't survive the week.",
      "So we stop sorting by hand. We build pipelines: pipes, and stations that run the checks for us.",
      "Filter, Dedup, Parse, Normalize, Mask… and the ORDER you put them in matters. Let's start simple.",
    ],
    next: { scene: "level", data: { index: 0 } },
  },
  ch3: {
    chapter: "CHAPTER 3",
    title: "Data Factory",
    prop: "factory",
    lines: [
      "The auditors signed off. Your pipeline is flawless. I'm impressed.",
      "One small detail: it's not a batch at the end of the day anymore. The data now streams in LIVE.",
      "Sources change without warning, stations overheat, and Black Friday comes every Friday.",
      "Keep the lanes running for a full 3-minute shift. I'll be on call with you.",
    ],
    next: { scene: "factory" },
  },
  epilogue: {
    chapter: "EPILOGUE",
    title: "Shift complete",
    prop: "trophy",
    lines: [
      "You held the line. Every dashboard is green.",
      "Sorting rows by hand, then building pipelines, then running them live: that's the job of a data engineer.",
      "Thanks for playing! The factory stays open — go beat your records.",
    ],
    next: { scene: "menu" },
  },
};
