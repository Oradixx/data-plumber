import type { BlobSpec, Cell, Level, StationKind } from "../core/sim.ts";

// ---- blob helpers
const ok = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", ...extra });
const nul = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "null", ...extra });
const copy = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", dup: true, ...extra });
const upper = (id: string): BlobSpec => ({ id, kind: "ok", dup: true, upper: true });
const box = (b: BlobSpec): BlobSpec => ({ ...b, boxed: true });
const pii = (b: BlobSpec): BlobSpec => ({ ...b, pii: true });
/** A row whose id is an email: personal data used as the key. */
const email = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", pii: true, keyPii: true, ...extra });

const cells = (...xy: [number, number][]): Cell[] => xy.map(([x, y]) => ({ x, y }));
const column = (x: number, rows: number): Cell[] => Array.from({ length: rows }, (_, y) => ({ x, y }));

export const STATION_INFO: Record<StationKind, { name: string; does: string; careful: string }> = {
  filter: {
    name: "Filter",
    does: "Removes empty (NULL) rows.",
    careful: "It can't see inside a raw box — Parse first.",
  },
  dedup: {
    name: "Dedup",
    does: "Removes a row whose id it has already let through.",
    careful: 'Compares ids exactly ("A" ≠ "a") and can\'t read boxed rows.',
  },
  parse: {
    name: "Parse",
    does: "Opens raw boxes so the rows inside can be checked.",
    careful: "Put it before any station that needs to read the row.",
  },
  normalize: {
    name: "Normalize",
    does: 'Lower-cases ids, so "A" and "a" become the same key.',
    careful: "Must come before the Dedup to be useful.",
  },
  mask: {
    name: "Mask",
    does: "Hides personal data (names, emails…) — the row puts on sunglasses.",
    careful: "Before the public zone — and it can't redact inside a raw box.",
  },
};

export const LEVELS: Level[] = [
  {
    id: "first-flow",
    title: "1 · First flow",
    brief: "Drag from the API to the warehouse to lay a pipe, then press Run.",
    lesson: {
      title: "What is a pipeline?",
      text: "A data pipeline moves data from a source (an API, a database, sensors…) to a destination such as a warehouse, where people can analyse it.",
    },
    cols: 7, rows: 4,
    source: { x: 0, y: 1 }, sink: { x: 6, y: 2 },
    walls: cells([3, 1], [3, 2]),
    inventory: {},
    blobs: [ok("a"), ok("b"), ok("c"), ok("d")],
  },
  {
    id: "nulls-ahead",
    title: "2 · Nulls ahead",
    brief: "Some rows arrive empty. Put your Filter on the pipe.",
    introduces: ["filter"],
    lesson: {
      title: "Data quality: NULL rows",
      text: "Sources send incomplete rows all the time. Filtering them early keeps dashboards and models from computing on garbage.",
    },
    cols: 7, rows: 4,
    source: { x: 0, y: 0 }, sink: { x: 6, y: 3 },
    walls: cells([2, 0], [2, 1], [4, 2], [4, 3]),
    inventory: { filter: 1 },
    blobs: [ok("a"), nul("n1"), ok("b"), ok("c"), nul("n2"), ok("d")],
  },
  {
    id: "seeing-double",
    title: "3 · Seeing double",
    brief: "The API retried: some rows come twice. Keep exactly one of each.",
    introduces: ["dedup"],
    lesson: {
      title: "Duplicates & idempotency",
      text: "Retries and replays duplicate records. Deduplicating on a key makes the load idempotent: running it twice gives the same result as running it once.",
    },
    cols: 8, rows: 5,
    source: { x: 0, y: 2 }, sink: { x: 7, y: 2 },
    walls: cells([2, 1], [2, 2], [2, 3], [5, 0], [5, 1], [5, 2]),
    inventory: { filter: 1, dedup: 1 },
    blobs: [ok("a"), copy("a"), nul("n1"), ok("b"), ok("c"), copy("c"), nul("n2"), ok("d")],
  },
  {
    id: "boxed-in",
    title: "4 · Boxed in",
    brief: "Raw boxes hide what's inside. The old Filter by the API can't see into them…",
    introduces: ["parse"],
    lesson: {
      title: "Parse before you validate",
      text: "Raw payloads (JSON, CSV lines) must be parsed into typed columns before any rule can check them. Validation on unparsed data silently lets bad rows through.",
    },
    cols: 7, rows: 4,
    source: { x: 0, y: 1 }, sink: { x: 6, y: 1 },
    walls: cells([0, 0], [0, 2], [3, 0], [3, 2], [3, 3], [5, 3]),
    fixed: [{ cell: { x: 1, y: 1 }, kind: "filter" }],
    inventory: { parse: 1, filter: 1 },
    blobs: [ok("a"), box(ok("b")), box(nul("n1")), nul("n2"), box(ok("c")), ok("d"), box(nul("n3"))],
  },
  {
    id: "case-sensitive",
    title: "5 · Case sensitive",
    brief: 'Some ids arrive in capitals: "A" is the same row as "a"…',
    introduces: ["normalize"],
    lesson: {
      title: "Normalize keys before deduplicating",
      text: 'Keys often differ only by case, spaces or format ("A" vs "a", "fr" vs "FR"). Normalizing them first is what makes deduplication and joins reliable.',
    },
    cols: 7, rows: 4,
    source: { x: 0, y: 0 }, sink: { x: 6, y: 3 },
    walls: cells([1, 1], [3, 0], [3, 1], [5, 2], [5, 3]),
    inventory: { normalize: 1, dedup: 1 },
    blobs: [ok("a"), ok("b"), upper("a"), copy("b"), ok("c"), upper("c"), ok("d")],
  },
  {
    id: "privacy-zone",
    title: "6 · Privacy zone",
    brief: "Mask personal data before the striped public zone. Stations only fit on yellow pads.",
    introduces: ["mask"],
    lesson: {
      title: "Protect personal data (GDPR)",
      text: "Personal data must be pseudonymised or masked before it reaches places many people can access (shared analytics, exports). Do it as early as possible in the pipeline.",
    },
    cols: 8, rows: 5,
    source: { x: 0, y: 2 }, sink: { x: 7, y: 2 },
    walls: cells([2, 1], [2, 2], [2, 3], [6, 1], [6, 3]),
    publicZone: [...column(4, 5), ...column(5, 5)],
    pads: cells([1, 0], [6, 2]),
    parLength: 12,
    inventory: { mask: 1, filter: 1 },
    blobs: [ok("a"), pii(ok("b")), nul("n1"), pii(ok("c")), ok("d"), nul("n2"), pii(ok("e"))],
  },
  {
    id: "legacy-trap",
    title: "7 · Legacy trap",
    brief: "An old Dedup sits by the API and the pipe budget is tight. Make it work anyway.",
    lesson: {
      title: "Order matters",
      text: "In real pipelines, legacy steps you can't remove are common. Understanding what each step can and cannot see is how you fix a pipeline without rewriting it.",
    },
    cols: 8, rows: 5,
    source: { x: 0, y: 2 }, sink: { x: 7, y: 2 },
    walls: cells([0, 1], [0, 3], [3, 1], [3, 2], [3, 3], [5, 0], [5, 1]),
    fixed: [{ cell: { x: 1, y: 2 }, kind: "dedup" }],
    maxPipe: 12,
    inventory: { normalize: 1, dedup: 1, filter: 1 },
    blobs: [ok("a"), upper("a"), ok("b"), copy("b"), nul("n1"), ok("c"), upper("c"), nul("n2")],
  },
  {
    id: "full-stack",
    title: "8 · The full pipeline",
    brief: "Boxes, NULLs, capitals, personal data — and a public zone. Five stations, one order.",
    lesson: {
      title: "A real ingestion pipeline",
      text: "Parse → validate → normalize → deduplicate → protect: that is the backbone of most ingestion pipelines. You just built one.",
    },
    cols: 9, rows: 5,
    source: { x: 0, y: 0 }, sink: { x: 8, y: 4 },
    walls: cells([2, 1], [2, 2], [2, 3], [4, 0], [4, 1], [4, 2]),
    publicZone: [...column(6, 5), ...column(7, 5)],
    inventory: { parse: 1, filter: 1, normalize: 1, dedup: 1, mask: 1 },
    blobs: [
      box(ok("a")),
      pii(ok("b")),
      box(nul("n1")),
      upper("a"),
      box(pii(ok("c"))),
      copy("b", { pii: true }),
      nul("n2"),
      box(upper("c")),
      ok("d"),
    ],
  },
  {
    id: "two-roads",
    title: "9 · Two roads",
    brief: "Two routes around the old server room. Only one has enough pads for everything…",
    lesson: {
      title: "Design under constraints",
      text: "Real platforms impose where processing can run (clusters, zones, budgets). A good data engineer designs the flow around those constraints instead of fighting them.",
    },
    cols: 9, rows: 5,
    source: { x: 0, y: 2 }, sink: { x: 8, y: 2 },
    walls: [
      ...cells([0, 1], [0, 3]),
      ...[2, 3, 4, 5, 6].flatMap((x) => cells([x, 1], [x, 2], [x, 3])),
    ],
    publicZone: column(7, 5),
    pads: cells([1, 2], [3, 0], [5, 0], [2, 4], [3, 4], [4, 4], [5, 4]),
    parLength: 13,
    inventory: { parse: 1, filter: 1, normalize: 1, dedup: 1, mask: 1 },
    blobs: [
      box(ok("a")),
      box(upper("a")),
      box(nul("n1")),
      pii(ok("b")),
      copy("b", { pii: true }),
      ok("c"),
      box(nul("n2")),
      upper("c"),
      pii(ok("d")),
    ],
  },
  {
    id: "black-friday",
    title: "10 · MINI-BOSS — Black Friday",
    brief: "Every trap at once, three roads, not one centimetre of spare pipe. Here the ids are EMAILS…",
    boss: "mini",
    lesson: {
      title: "Order of operations — and why it matters",
      text: "Parse → validate → normalize → deduplicate → protect. When the key itself is personal data, deduplicate (or hash consistently) BEFORE masking, or you lose rows. You just beat the boss: that's real data engineering.",
    },
    cols: 10, rows: 6,
    source: { x: 0, y: 0 }, sink: { x: 9, y: 5 },
    walls: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: 1 })),
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((x) => cells([x, 3], [x, 4])),
      ...cells([9, 2]).filter(() => false),
    ],
    publicZone: cells([2, 2], [9, 3], [9, 4], [8, 3], [8, 4], [7, 5], [8, 5]),
    fixed: [
      { cell: { x: 2, y: 0 }, kind: "mask" },
      { cell: { x: 0, y: 2 }, kind: "filter" },
    ],
    pads: cells([1, 0], [4, 0], [5, 0], [7, 0], [1, 2], [4, 2], [5, 2], [6, 2], [0, 3], [1, 5], [3, 5], [4, 5], [6, 5]),
    maxPipe: 15,
    parLength: 15,
    inventory: { parse: 1, filter: 1, normalize: 1, dedup: 1, mask: 1 },
    blobs: [
      box(ok("a")),
      email("ana"),
      box(nul("n1")),
      ok("c"),
      upper("a"),
      email("bob"),
      box(email("ana", { dup: true })),
      nul("n2"),
      box(upper("c")),
      email("cid"),
      email("bob", { dup: true }),
      box(ok("d")),
      box(nul("n3")),
      ok("e"),
    ],
  },
  {
    id: "year-end-close",
    title: "11 · FINAL BOSS — Year-End Close",
    brief: "Auditors read the warehouse: it's PUBLIC now. Typed pads. 19 cells. One way through.",
    boss: "final",
    lesson: {
      title: "Plan backwards from the destination",
      text: "Real pipelines run on infrastructure you didn't design: bolted legacy jobs, one-way flows, compute only where it's provisioned, compliance at the destination. Read the constraints, then plan backwards from the sink. Campaign complete: you think like a data engineer.",
    },
    cols: 10, rows: 6,
    source: { x: 0, y: 1 }, sink: { x: 9, y: 0 },
    walls: cells([1, 0], [2, 0], [5, 0], [5, 1], [8, 1], [8, 2], [4, 3], [7, 4], [8, 4], [1, 5], [4, 5], [5, 5]),
    // the warehouse itself is shared with the auditors
    publicZone: cells([1, 3], [1, 4], [8, 3], [9, 0]),
    fixed: [{ cell: { x: 4, y: 2 }, kind: "mask" }],
    pads: [
      ...cells([3, 1], [5, 3], [5, 4]).map((c) => ({ ...c, only: "parse" as const })),
      ...cells([3, 2], [6, 5], [7, 5]).map((c) => ({ ...c, only: "filter" as const })),
      ...cells([7, 2], [6, 4]).map((c) => ({ ...c, only: "normalize" as const })),
      ...cells([3, 0], [7, 3]).map((c) => ({ ...c, only: "dedup" as const })),
      ...cells([6, 3], [7, 0]).map((c) => ({ ...c, only: "mask" as const })),
    ],
    arrows: [
      { cell: { x: 1, y: 2 }, dir: "down" },
      { cell: { x: 7, y: 1 }, dir: "down" },
      { cell: { x: 8, y: 5 }, dir: "left" },
    ],
    maxPipe: 19,
    parLength: 19,
    inventory: { parse: 1, filter: 1, normalize: 1, dedup: 1, mask: 1 },
    blobs: [
      box(ok("a")),
      email("ana"),
      box(nul("n1")),
      ok("c"),
      upper("a"),
      email("bob"),
      box(email("ana", { dup: true })),
      nul("n2"),
      box(upper("c")),
      email("cid"),
      email("bob", { dup: true }),
      box(ok("d")),
      box(nul("n3")),
      ok("e"),
      box(email("dan")),
      copy("e"),
    ],
  },
];

export interface Layout {
  path: [number, number][];
  stations: [[number, number], StationKind][];
}

/**
 * Reference solutions, used by the tests: either a station order placed on the shortest pipe,
 * or an explicit pipe + station layout for levels with pads.
 */
export const SOLUTIONS: Record<string, StationKind[] | Layout> = {
  "first-flow": [],
  "nulls-ahead": ["filter"],
  "seeing-double": ["filter", "dedup"],
  "boxed-in": ["parse", "filter"],
  "case-sensitive": ["normalize", "dedup"],
  "privacy-zone": {
    path: [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]],
    stations: [[[1, 0], "mask"], [[6, 2], "filter"]],
  },
  "legacy-trap": ["normalize", "dedup", "filter"],
  "full-stack": ["parse", "filter", "normalize", "dedup", "mask"],
  "two-roads": {
    path: [[0, 2], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [7, 3], [7, 2], [8, 2]],
    stations: [[[1, 2], "parse"], [[2, 4], "filter"], [[3, 4], "normalize"], [[4, 4], "dedup"], [[5, 4], "mask"]],
  },
  "black-friday": {
    path: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]],
    stations: [[[0, 3], "parse"], [[1, 5], "filter"], [[3, 5], "normalize"], [[4, 5], "dedup"], [[6, 5], "mask"]],
  },
  "year-end-close": {
    path: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [6, 4], [6, 3], [7, 3], [7, 2], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [9, 0]],
    stations: [[[3, 1], "parse"], [[3, 2], "filter"], [[6, 4], "normalize"], [[7, 3], "dedup"], [[7, 0], "mask"]],
  },
};

/** Tempting wrong layouts for the bosses (per level): each must fail with a hint. */
export const BOSS_TRAPS: Record<string, Record<string, Layout>> = {
  "black-friday": {
    "top road (bolted Mask comes too early)": {
      path: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5]],
      stations: [[[1, 0], "parse"], [[4, 0], "filter"], [[5, 0], "normalize"], [[7, 0], "dedup"]],
    },
    "middle road (public zone before any pad)": {
      path: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [8, 3], [8, 4], [8, 5], [9, 5]],
      stations: [[[1, 2], "parse"], [[4, 2], "filter"], [[5, 2], "normalize"], [[6, 2], "dedup"]],
    },
    "bottom road, Mask before Dedup": {
      path: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]],
      stations: [[[0, 3], "parse"], [[1, 5], "filter"], [[3, 5], "normalize"], [[4, 5], "mask"], [[6, 5], "dedup"]],
    },
    "bottom road, Mask before Parse": {
      path: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]],
      stations: [[[0, 3], "mask"], [[1, 5], "parse"], [[3, 5], "filter"], [[4, 5], "normalize"], [[6, 5], "dedup"]],
    },
  },
  "year-end-close": {
    "shortcut through the bolted Mask": {
      path: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [5, 2], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [9, 0]],
      stations: [[[3, 1], "parse"], [[7, 0], "mask"]],
    },
    "top road: Dedup before Normalize": {
      path: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [4, 0], [4, 1], [4, 2], [5, 2], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [9, 0]],
      stations: [[[3, 1], "parse"], [[3, 0], "dedup"], [[7, 0], "mask"]],
    },
    "right road, Mask before Dedup": {
      path: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [6, 4], [6, 3], [7, 3], [7, 2], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [9, 0]],
      stations: [[[3, 1], "parse"], [[3, 2], "filter"], [[6, 4], "normalize"], [[6, 3], "mask"], [[7, 3], "dedup"]],
    },
    "right road, Normalize after Dedup": {
      path: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [6, 4], [6, 3], [7, 3], [7, 2], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0], [9, 0]],
      stations: [[[3, 1], "parse"], [[3, 2], "filter"], [[7, 3], "dedup"], [[7, 2], "normalize"], [[7, 0], "mask"]],
    },
  },
};

/** Tempting wrong answers that must fail — proof that order matters. */
export const TRAPS: Record<string, StationKind[][]> = {
  "boxed-in": [["filter", "parse"]],
  "case-sensitive": [["dedup", "normalize"]],
  "legacy-trap": [["dedup", "normalize", "filter"]],
  "full-stack": [
    ["filter", "parse", "normalize", "dedup", "mask"],
    ["parse", "filter", "dedup", "normalize", "mask"],
    ["parse", "dedup", "filter", "normalize", "mask"],
  ],
};
