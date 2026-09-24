import type { BlobSpec, Cell, Level, StationKind } from "../core/sim.ts";

// ---- blob helpers
const ok = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", ...extra });
const nul = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "null", ...extra });
const copy = (id: string, extra: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", dup: true, ...extra });
const upper = (id: string): BlobSpec => ({ id, kind: "ok", dup: true, upper: true });
const box = (b: BlobSpec): BlobSpec => ({ ...b, boxed: true });
const pii = (b: BlobSpec): BlobSpec => ({ ...b, pii: true });

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
    careful: "Must act BEFORE the pipe enters the striped public zone.",
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
