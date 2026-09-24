# Data Plumber

A casual puzzle game about data pipelines. Lay a pipe from the API to the warehouse,
drop stations on it (Filter, Dedup…) and press **Run**: cute data blobs flow through,
and only clean rows should reach the warehouse. Each level ends with a short lesson card.

Built with **Phaser 4 + TypeScript + Vite**. All illustrations are drawn in code — no image files.

```bash
npm install
npm run dev      # play locally
npm test         # game logic tests (node --test)
npm run build    # type-check + production build in dist/
```

`src/core/sim.ts` holds the pure game rules (path validation, simulation, stars) and is
unit-tested; `src/data/levels.ts` defines the levels; `src/scenes/` renders them.

## Story mode — three chapters

The game follows the path of a real data team: **by hand → automated → live**. Ada, the lead data
engineer, introduces each chapter in a short cutscene; a pipe sweeps across the screen between scenes,
and the map's **Continue** button always jumps to the next step (`src/core/story.ts`, tested).

1. **Clean or Trash** — the intern sorts rows by hand. Swipe right to keep, left to trash. The four
   classic data-quality checks unlock one by one (completeness, validity, conformity, uniqueness)
   against a shrinking timer, with combos and 3 lives. Sort 30 right to finish the chapter.
   Rules: `src/core/trash.ts` — tests check every dealt row has at most one flaw, never from a locked rule.
2. **Data Plumber** — automate those checks: lay pipes and place Filter, Dedup, Parse, Normalize and Mask
   stations, whose **order matters**. 11 levels with bolted legacy stations, build pads, pipe budgets,
   typed pads and one-way conveyors. Level 10 is the **mini-boss** (Black Friday); level 11 is the
   **final boss** (Year-End Close): the solver in `src/core/solver.ts` proves ~500 legal pipes and
   **exactly one** winning layout. The layout was found by `scripts/gen-boss.ts`.
3. **Data Factory** — run it live. Three conveyor lanes, a data mix that keeps changing (retries, a new
   source, a legacy system, compliance, Black Friday, then random schema drift), credits to spend,
   stations that overheat, and an SLA to keep above zero for a 3-minute shift.
   Rules: `src/core/factory.ts` — tests replay whole shifts deterministically from a seed.

## Tests

Every level has a reference solution checked by the tests, and the tests also prove that the tempting
wrong layouts fail *with an explanation* (each failure must produce a hint).
