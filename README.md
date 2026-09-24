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

## Modes

**Data Plumber — the campaign (11 levels).** Five stations — Filter, Dedup, Parse, Normalize, Mask — whose
**order matters** (Parse before Filter, Normalize before Dedup, Dedup before masking an email id, Mask before
the public zone), plus bolted-down legacy stations, build pads, pipe budgets, typed pads and one-way conveyors.

- Level 10 is the **mini-boss** (Black Friday): every rule at once, three roads, no spare pipe.
- Level 11 is the **final boss** (Year-End Close): the solver in `src/core/solver.ts` proves there are
  ~500 legal pipes and **exactly one** winning layout; random play wins about 0.03% of the time.
  The layout was found by `scripts/gen-boss.ts` (seeded random search scored by the solver).

**Clean or Trash — the swipe mini-game.** Rows stream in; swipe right to keep clean ones, left to trash
dirty ones. The four classic data-quality checks unlock one by one — completeness, validity, conformity,
uniqueness — against a shrinking timer, with combos and 3 lives. Rules live in `src/core/trash.ts`,
where the tests check that every dealt row has at most one flaw and never one from a locked rule.

**Data Factory** (real-time mode) is next.

## Tests

Every level has a reference solution checked by the tests, and the tests also prove that the tempting
wrong layouts fail *with an explanation* (each failure must produce a hint).
