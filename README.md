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

**9 levels** introduce five stations — Filter, Dedup, Parse, Normalize, Mask — whose **order matters**
(Parse before Filter, Normalize before Dedup, Mask before the public zone), plus bolted-down legacy
stations, build pads and pipe budgets. Every level has a reference solution checked by the tests,
and the tests also prove that the tempting wrong orders fail.

Roadmap: more Plumber levels · **Clean or Trash** (swipe mini-game) · **Data Factory** (real-time mode).
