// Clean or Trash: pure rules for the swipe mini-game (no Phaser, unit-tested).
// A row arrives; the player keeps it (it goes to the warehouse) or trashes it.
// Each dirty row has exactly ONE flaw, and only from rules already unlocked.

export type RuleId = "empty" | "impossible" | "format" | "duplicate";

export interface Row {
  id: string;
  email: string | null;
  age: number | null;
  country: string | null;
  signup: string | null; // YYYY-MM-DD
}

export interface Rule {
  id: RuleId;
  name: string;
  explain: string;
  station: "filter" | "normalize" | "dedup"; // the Data Plumber station closest to it (icon)
  link: string; // how a real pipeline automates it
  unlockAt: number; // correct answers needed before it applies
}

/** In unlock order. The names are the classic data-quality dimensions. */
export const RULES: Rule[] = [
  { id: "empty", name: "Empty values", explain: "A field is NULL: the row is incomplete. Trash it.", station: "filter", link: "Soon you won't do this by hand: a Filter station will do it for you.", unlockAt: 0 },
  {
    id: "impossible",
    name: "Impossible values",
    explain: "An age below 0 or above 120, or a sign-up date in the future, can't be true. Trash it.",
    station: "filter",
    link: "In a pipeline, that's a validation rule: a Filter with a condition, like 0 ≤ age ≤ 120.",
    unlockAt: 6,
  },
  {
    id: "format",
    name: "Bad formats",
    explain: "An email needs an @, and a country is a 2-letter code like FR or US. Trash anything else.",
    station: "normalize",
    link: "Some formats can be fixed (Normalize's job), but nobody can guess a missing @: reject the row.",
    unlockAt: 14,
  },
  {
    id: "duplicate",
    name: "Duplicates",
    explain: "Same id as a row already in the warehouse: it's a copy. Trash it (check the strip below).",
    station: "dedup",
    link: "Soon a Dedup station will do this for you, automatically.",
    unlockAt: 24,
  },
];

export const activeRules = (correct: number): RuleId[] => RULES.filter((r) => correct >= r.unlockAt).map((r) => r.id);

export interface Verdict {
  keep: boolean;
  rule?: RuleId;
  reason?: string;
}

const COUNTRY = /^[A-Z]{2}$/;

/** The single source of truth: what should happen to this row, given the rules in play. */
export function judge(row: Row, active: RuleId[], warehouse: ReadonlySet<string>, year: number): Verdict {
  const on = (r: RuleId) => active.includes(r);
  if (on("empty")) {
    for (const f of ["email", "age", "country", "signup"] as const) {
      if (row[f] === null) return { keep: false, rule: "empty", reason: `${f} is empty (NULL)` };
    }
  }
  if (on("impossible")) {
    if (row.age !== null && (row.age < 0 || row.age > 120)) return { keep: false, rule: "impossible", reason: `age ${row.age} is impossible` };
    if (row.signup !== null && Number(row.signup.slice(0, 4)) > year)
      return { keep: false, rule: "impossible", reason: `signed up in ${row.signup.slice(0, 4)}: that's the future` };
  }
  if (on("format")) {
    if (row.email !== null && !row.email.includes("@")) return { keep: false, rule: "format", reason: `"${row.email}" has no @` };
    if (row.country !== null && !COUNTRY.test(row.country))
      return { keep: false, rule: "format", reason: `"${row.country}" isn't a 2-letter country code` };
  }
  if (on("duplicate") && warehouse.has(row.id)) return { keep: false, rule: "duplicate", reason: `id #${row.id} is already in the warehouse` };
  return { keep: true };
}

// ------------------------------------------------------------------ generator

const NAMES = ["ana", "bob", "cid", "dan", "eva", "fay", "gus", "hana", "ivo", "jade", "kim", "leo", "mia", "noa", "omar", "paz", "rui", "sam", "tao", "uma", "vic", "wen", "yan", "zoe"];
const DOMAINS = ["mail.com", "data.io", "corp.fr", "uni.edu", "shop.de"];
const COUNTRIES = ["FR", "US", "DE", "ES", "IT", "JP", "BR", "CA", "GB", "IN"];
const BAD_COUNTRIES = ["France", "usa", "Deutschland", "F", "Spain", "jp", "U.K."];

export type Rng = () => number;

/** Seeded generator (Park–Miller), so tests and replays are deterministic. */
export function rng(seed: number): Rng {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad2 = (n: number) => String(n).padStart(2, "0");

function cleanRow(r: Rng, id: string, year: number): Row {
  const name = pick(r, NAMES);
  return {
    id,
    email: `${name}${r() < 0.4 ? int(r, 1, 99) : ""}@${pick(r, DOMAINS)}`,
    age: int(r, 16, 89),
    country: pick(r, COUNTRIES),
    signup: `${int(r, year - 9, year - 1)}-${pad2(int(r, 1, 12))}-${pad2(int(r, 1, 28))}`,
  };
}

export interface Deal {
  row: Row;
  verdict: Verdict;
}

/**
 * Deals the next row. About `dirtyRate` of rows carry exactly one flaw, drawn only from
 * the active rules. Duplicates copy a row that is really in the warehouse.
 */
export function deal(
  r: Rng,
  active: RuleId[],
  warehouse: ReadonlyMap<string, Row>,
  usedIds: Set<string>,
  year: number,
  dirtyRate = 0.45,
): Deal {
  let id: string;
  do id = String(int(r, 1000, 9999));
  while (usedIds.has(id));
  const row = cleanRow(r, id, year);
  const possible = active.filter((a) => a !== "duplicate" || warehouse.size > 0);
  if (possible.length && r() < dirtyRate) {
    const flaw = pick(r, possible);
    if (flaw === "empty") row[pick(r, ["email", "age", "country", "signup"] as const)] = null as never;
    else if (flaw === "impossible") {
      if (r() < 0.6) row.age = r() < 0.5 ? -int(r, 1, 40) : int(r, 121, 240);
      else row.signup = `${year + int(r, 3, 40)}-${pad2(int(r, 1, 12))}-${pad2(int(r, 1, 28))}`;
    } else if (flaw === "format") {
      if (r() < 0.5) row.email = row.email!.replace("@", pick(r, [".", " at ", "#", ""]));
      else row.country = pick(r, BAD_COUNTRIES);
    } else {
      const ids = [...warehouse.keys()];
      const original = warehouse.get(pick(r, ids.slice(-6)))!; // recent ones: they're on screen
      Object.assign(row, original);
    }
  }
  usedIds.add(row.id);
  const verdict = judge(row, active, new Set(warehouse.keys()), year);
  return { row, verdict };
}

/** Points for a correct answer: 10 × combo multiplier (×1 … ×5, +1 every 4 in a row). */
export const multiplier = (streak: number): number => 1 + Math.min(4, Math.floor(streak / 4));

/** Seconds to decide: generous at first, faster as you go. */
export const timeLimit = (correct: number): number => Math.max(2.8, 7.5 - correct * 0.1);
