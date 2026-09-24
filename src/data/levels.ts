import type { BlobSpec, Level } from "../core/sim.ts";

const ok = (id: string): BlobSpec => ({ id, kind: "ok" });
const nul = (id: string): BlobSpec => ({ id, kind: "null" });
const dup = (id: string): BlobSpec => ({ id, kind: "dup" });

export const LEVELS: Level[] = [
  {
    id: "first-flow",
    title: "1 · First flow",
    brief: "Drag from the API to the warehouse to lay a pipe, then press Run.",
    lesson: {
      title: "What is a pipeline?",
      text: "A data pipeline moves data from a source (an API, a database, sensors…) to a destination such as a warehouse, where people can analyse it.",
    },
    cols: 7,
    rows: 4,
    source: { x: 0, y: 1 },
    sink: { x: 6, y: 2 },
    walls: [{ x: 3, y: 1 }, { x: 3, y: 2 }],
    blobs: [ok("a"), ok("b"), ok("c"), ok("d"), ok("e")],
    tools: [],
    parStations: 0,
    parLength: 10,
  },
  {
    id: "nulls-ahead",
    title: "2 · Nulls ahead",
    brief: "Some rows arrive empty. Place a Filter on the pipe to stop them.",
    lesson: {
      title: "Data quality: NULL rows",
      text: "Sources send incomplete rows all the time. Filtering them early keeps dashboards and models from computing on garbage — and you keep the rejected rows aside to investigate.",
    },
    cols: 7,
    rows: 4,
    source: { x: 0, y: 0 },
    sink: { x: 6, y: 3 },
    walls: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 }],
    blobs: [ok("a"), nul("n1"), ok("b"), ok("c"), nul("n2"), ok("d")],
    tools: ["filter"],
    parStations: 1,
    parLength: 12,
  },
  {
    id: "seeing-double",
    title: "3 · Seeing double",
    brief: "The API retried and sent some rows twice — and there are still NULLs. Clean it all up!",
    lesson: {
      title: "Duplicates & idempotency",
      text: "Retries and replays duplicate records. Deduplicating on a key (here the row id) makes the load idempotent: running it twice gives the same result as running it once.",
    },
    cols: 8,
    rows: 5,
    source: { x: 0, y: 2 },
    sink: { x: 7, y: 2 },
    walls: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }],
    blobs: [ok("a"), dup("a"), nul("n1"), ok("b"), ok("c"), dup("c"), nul("n2"), ok("d")],
    tools: ["filter", "dedup"],
    parStations: 2,
    parLength: 12,
  },
];
