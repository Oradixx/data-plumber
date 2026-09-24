// Searches random layouts for a final-boss level that is as hard as possible while
// staying fair: exactly one winning pipe, many tempting pipes, a long detour, and
// almost no chance to win by random placement.
// Run: node --experimental-strip-types scripts/gen-boss.ts [seconds] [seed]
import { allPaths, winningPlacements } from "../src/core/solver.ts";
import { key, type BlobSpec, type Cell, type Dir, type Level, type Pad, type StationKind } from "../src/core/sim.ts";

const seconds = Number(process.argv[2] ?? 60);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const COLS = 10;
const ROWS = 6;
const KINDS: StationKind[] = ["parse", "filter", "normalize", "dedup", "mask"];

const ok = (id: string, e: Partial<BlobSpec> = {}): BlobSpec => ({ id, kind: "ok", ...e });
const BLOBS: BlobSpec[] = [
  ok("a", { boxed: true }),
  ok("ana", { pii: true, keyPii: true }),
  { id: "n1", kind: "null", boxed: true },
  ok("c"),
  ok("a", { dup: true, upper: true }),
  ok("bob", { pii: true, keyPii: true }),
  ok("ana", { pii: true, keyPii: true, dup: true, boxed: true }),
  { id: "n2", kind: "null" },
  ok("c", { dup: true, upper: true, boxed: true }),
  ok("cid", { pii: true, keyPii: true }),
  ok("bob", { pii: true, keyPii: true, dup: true }),
  ok("d", { boxed: true }),
  { id: "n3", kind: "null", boxed: true },
  ok("e"),
  ok("dan", { pii: true, keyPii: true, boxed: true }),
  ok("e", { dup: true }),
];

function randomLevel(): Level {
  const source = { x: 0, y: Math.floor(rnd() * ROWS) };
  const sink = { x: COLS - 1, y: Math.floor(rnd() * ROWS) };
  const taken = new Set([key(source), key(sink)]);
  const free = (): Cell => {
    for (;;) {
      const c = { x: 1 + Math.floor(rnd() * (COLS - 2)), y: Math.floor(rnd() * ROWS) };
      if (!taken.has(key(c))) {
        taken.add(key(c));
        return c;
      }
    }
  };
  const walls = Array.from({ length: 12 + Math.floor(rnd() * 6) }, free);
  const zoneA = free();
  const zoneB = free();
  // the warehouse is shared too: personal data must be masked before it arrives
  const publicZone = [zoneA, zoneB, sink];
  for (const z of [zoneA, zoneB]) {
    const n = { x: z.x, y: z.y + (rnd() < 0.5 ? 1 : -1) };
    if (n.y >= 0 && n.y < ROWS && !taken.has(key(n))) {
      taken.add(key(n));
      publicZone.push(n);
    }
  }
  const pads: Pad[] = [];
  for (const k of KINDS) for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) pads.push({ ...free(), only: k });
  const arrows = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({
    cell: free(),
    dir: pick<Dir>(["up", "down", "left", "right"]),
  }));
  const fixed = [{ cell: free(), kind: "mask" as StationKind }];
  return {
    id: "final-boss",
    title: "",
    brief: "",
    lesson: { title: "", text: "" },
    boss: "final",
    cols: COLS,
    rows: ROWS,
    source,
    sink,
    walls,
    publicZone,
    pads,
    arrows,
    fixed,
    inventory: { parse: 1, filter: 1, normalize: 1, dedup: 1, mask: 1 },
    blobs: BLOBS,
  };
}

interface Scored {
  level: Level;
  score: number;
  info: Record<string, number>;
}

function evaluate(base: Level): Scored | null {
  // 1) find every pipe up to a generous budget, then the shortest winning one
  let wide = allPaths({ ...base, maxPipe: 19 }, 60_000);
  if (!wide.length) return null;
  const anyMin = Math.min(...wide.map((p) => p.length));
  wide = wide.sort((a, b) => a.length - b.length);
  let winLen: number | null = null;
  for (const p of wide) {
    if (winLen !== null && p.length > winLen) break;
    if (winningPlacements(base, p, true).length) winLen = p.length;
  }
  if (winLen === null) return null;
  // 2) exact budget = shortest winning pipe
  const level = { ...base, maxPipe: winLen, parLength: winLen };
  const paths = allPaths(level, 60_000);
  let winPaths = 0;
  let layouts = 0;
  for (const p of paths) {
    const w = winningPlacements(level, p);
    if (w.length) {
      winPaths++;
      layouts += w.length;
    }
  }
  const detour = winLen - anyMin;
  const score = (winPaths === 1 ? 60 : 20 / winPaths) + Math.min(paths.length, 400) / 8 + detour * 12 - layouts * 3;
  return { level, score, info: { paths: paths.length, winPaths, layouts, winLen, anyMin, detour } };
}

let best: Scored | null = null;
const end = Date.now() + seconds * 1000;
let tried = 0;
while (Date.now() < end) {
  tried++;
  const s = evaluate(randomLevel());
  if (s && (!best || s.score > best.score)) {
    best = s;
    console.error(`#${tried} score=${s.score.toFixed(1)} ${JSON.stringify(s.info)}`);
  }
}
console.error(`tried ${tried} layouts`);
if (best) console.log(JSON.stringify({ info: best.info, level: best.level }));
