import Phaser from "phaser";
import {
  canExtend,
  canPlace,
  displayId,
  fixedAt,
  inPublicZone,
  isComplete,
  key,
  same,
  simulate,
  starsFor,
  type BlobRun,
  type BlobSpec,
  type Cell,
  type Level,
  type Result,
  type StationKind,
} from "../core/sim.ts";
import { LEVELS, STATION_INFO } from "../data/levels.ts";
import { background, button, C, H, hex, save, text, W } from "../theme.ts";

const LOOK: Record<StationKind, { tex: string; color: number; dark: number }> = {
  parse: { tex: "st-parse", color: C.parse, dark: C.parseDark },
  filter: { tex: "st-filter", color: C.filter, dark: C.filterDark },
  normalize: { tex: "st-normalize", color: C.normalize, dark: C.normalizeDark },
  dedup: { tex: "st-dedup", color: C.dedup, dark: C.dedupDark },
  mask: { tex: "st-mask", color: C.mask, dark: C.maskDark },
};

const tagOf = (b: BlobSpec): string => (b.kind === "null" ? "∅" : b.keyPii ? `${displayId(b)}@` : displayId(b));

interface BlobView {
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  box?: Phaser.GameObjects.Image;
  badge?: Phaser.GameObjects.Graphics;
}

export class LevelScene extends Phaser.Scene {
  private level!: Level;
  private index = 0;
  private cell = 80;
  private ox = 0;
  private oy = 0;
  private path: Cell[] = [];
  private placed = new Map<string, StationKind>();
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private pipeGfx!: Phaser.GameObjects.Graphics;
  private drawing = false;
  private tool: StationKind | null = null;
  private toolButtons = new Map<StationKind, { box: Phaser.GameObjects.Container; count: Phaser.GameObjects.Text }>();
  private running = false;
  private attempts = 0;
  private counter!: Phaser.GameObjects.Text;
  private budget?: Phaser.GameObjects.Text;
  private sinkSprite!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private info?: Phaser.GameObjects.Container;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super("level");
  }

  init(data: { index: number }): void {
    this.index = data.index ?? 0;
    this.level = LEVELS[this.index];
    this.path = [this.level.source];
    this.placed = new Map();
    this.sprites = new Map();
    this.toolButtons = new Map();
    this.tool = null;
    this.running = false;
    this.attempts = 0;
    this.overlay = undefined;
    this.info = undefined;
    this.budget = undefined;
  }

  create(): void {
    background(this);
    const L = this.level;
    if (L.boss) {
      // red alert ambience: a pulsing vignette
      const v = this.add.graphics().setDepth(-5);
      for (let i = 0; i < 6; i++) v.lineStyle(26, 0xff5d73, 0.05 + i * 0.012).strokeRect(i * 13, i * 13, W - i * 26, H - i * 26);
      this.tweens.add({ targets: v, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
    }
    this.cell = Math.min(80, Math.floor(880 / L.cols), Math.floor(340 / L.rows));
    this.ox = Math.round(W / 2 - (L.cols * this.cell) / 2);
    this.oy = Math.round(352 - (L.rows * this.cell) / 2);

    // ---- header
    button(this, 50, 42, "←", C.pipe, 0x3d5ad6, () => this.scene.start("menu"), 58, 48);
    text(this, 96, 30, L.title, 28, L.boss ? "#ff5d73" : C.inkHex, "700").setOrigin(0, 0.5);
    this.hint = text(this, 96, 62, L.brief, 17, C.mutedHex, "500").setOrigin(0, 0.5);
    this.incoming(L.blobs);
    if (L.maxPipe) this.budget = text(this, W - 24, 30, "", 18, C.inkHex, "700").setOrigin(1, 0.5);

    // ---- board
    this.drawBoard();
    this.pipeGfx = this.add.graphics().setDepth(1);
    const s = this.center(L.source);
    const src = this.add.image(s.x, s.y, "source").setDepth(3).setScale((this.cell * 0.95) / 72);
    text(this, s.x, s.y + this.cell * 0.2, "API", 13, "#ffffff", "700").setDepth(4);
    this.tweens.add({ targets: src, scaleY: src.scaleY * 1.05, duration: 700, yoyo: true, repeat: -1 });
    const k = this.center(L.sink);
    this.sinkSprite = this.add.image(k.x, k.y, "sink").setDepth(3).setScale((this.cell * 0.95) / 72);
    this.counter = text(this, k.x, k.y - this.cell * 0.78, "", 17, C.inkHex, "700").setDepth(5);
    for (const f of L.fixed ?? []) {
      const p = this.center(f.cell);
      this.add.image(p.x, p.y, LOOK[f.kind].tex).setDepth(4).setScale((this.cell * 0.8) / 64);
      this.add.image(p.x + this.cell * 0.3, p.y - this.cell * 0.3, "lock").setDepth(5).setScale(0.8);
    }

    this.sparks = this.add
      .particles(0, 0, "spark", { speed: { min: 80, max: 220 }, lifespan: 600, scale: { start: 0.9, end: 0 }, gravityY: 300, emitting: false })
      .setDepth(30);

    // ---- toolbar: one button per station type in the inventory, with a counter
    const by = H - 46;
    const tools = Object.keys(L.inventory) as StationKind[];
    tools.forEach((t, i) => {
      const look = LOOK[t];
      const x = 76 + i * 136;
      const b = button(this, x, by, STATION_INFO[t].name, look.color, look.dark, () => this.selectTool(t), 128, 50);
      (b.list[1] as Phaser.GameObjects.Text).setFontSize(17).setX(14);
      b.add(this.add.image(-42, 0, look.tex).setScale(0.44));
      const count = text(this, 52, -24, "", 14, "#ffffff", "700");
      const bubble = this.add.graphics().fillStyle(C.ink, 1).fillCircle(52, -24, 12);
      b.add([bubble, count]);
      this.toolButtons.set(t, { box: b, count });
    });
    button(this, W - 222, by, "Clear", 0xc9bfd6, 0xa89cb8, () => this.clearBoard(), 104, 50);
    button(this, W - 88, by, "Run ▶", C.good, 0x229a58, () => this.run(), 150, 50);

    // ---- input
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", () => (this.drawing = false));

    this.redraw();
    this.cameras.main.fadeIn(250, 255, 244, 230);
    if (L.boss) this.bossIntro();
    else if (L.introduces?.length) this.introduce(L.introduces);
  }

  // ------------------------------------------------------------ board
  private center(c: Cell): { x: number; y: number } {
    return { x: this.ox + c.x * this.cell + this.cell / 2, y: this.oy + c.y * this.cell + this.cell / 2 };
  }

  private cellAt(p: Phaser.Input.Pointer): Cell | null {
    const x = Math.floor((p.x - this.ox) / this.cell);
    const y = Math.floor((p.y - this.oy) / this.cell);
    return x >= 0 && y >= 0 && x < this.level.cols && y < this.level.rows ? { x, y } : null;
  }

  private drawBoard(): void {
    const L = this.level;
    const g = this.add.graphics();
    const pad = 3;
    const s = this.cell - 2 * pad;
    for (let y = 0; y < L.rows; y++) {
      for (let x = 0; x < L.cols; x++) {
        const px = this.ox + x * this.cell + pad;
        const py = this.oy + y * this.cell + pad;
        const zone = inPublicZone(L, { x, y });
        g.fillStyle(zone ? C.zoneStripe : C.tileShade, 1).fillRoundedRect(px, py + 4, s, s, 12);
        g.fillStyle(zone ? C.zone : C.tile, 1).fillRoundedRect(px, py, s, s, 12);
        if (zone) {
          g.lineStyle(4, C.zoneStripe, 0.8);
          for (let d = -s; d < s; d += 14) {
            const x1 = Math.max(0, d);
            const y1 = Math.max(0, -d);
            const len = Math.min(s - x1, s - y1);
            g.lineBetween(px + x1, py + s - y1, px + x1 + len, py + s - y1 - len);
          }
        }
      }
    }
    if (L.publicZone?.length) {
      const top = L.publicZone.reduce((a, c) => (c.y < a.y || (c.y === a.y && c.x < a.x) ? c : a));
      const p = this.center(top);
      const lbl = text(this, p.x + (L.publicZone.some((c) => c.x === top.x + 1) ? this.cell / 2 : 0), this.oy - 12, "PUBLIC ZONE", 13, "#ff5d73", "700");
      lbl.setDepth(6);
    }
    for (const c of L.pads ?? []) {
      const p = this.center(c);
      this.add.image(p.x, p.y, "pad").setScale((this.cell * 0.78) / 64).setDepth(0.5).setAlpha(0.95);
    }
    for (const w of L.walls) {
      const c = this.center(w);
      this.add.image(c.x, c.y, "crate").setScale((this.cell * 0.85) / 64).setDepth(2);
    }
  }

  private redraw(): void {
    const g = this.pipeGfx.clear();
    const pts = this.path.map((c) => this.center(c));
    const width = this.cell * 0.34;
    const done = isComplete(this.level, this.path);
    const layers: [number, number][] = [
      [0x3d5ad6, width + 8],
      [done ? C.pipe : 0x8ea3f5, width],
      [done ? C.pipeLight : 0xc3cffb, width * 0.4],
    ];
    for (const [color, w] of layers) {
      g.lineStyle(w, color, 1);
      for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      g.fillStyle(color, 1);
      for (const p of pts) g.fillCircle(p.x, p.y, w / 2);
    }
    const expected = new Set(this.level.blobs.filter((b) => b.kind === "ok").map((b) => b.id.toLowerCase())).size;
    this.counter.setText(`0 / ${expected}`).setColor(C.inkHex);
    if (this.budget && this.level.maxPipe) {
      this.budget.setText(`Pipe ${this.path.length} / ${this.level.maxPipe}`);
      this.budget.setColor(this.path.length >= this.level.maxPipe ? "#ff5d73" : C.inkHex);
    }
    this.refreshCounts();
  }

  private remaining(t: StationKind): number {
    const used = [...this.placed.values()].filter((k) => k === t).length;
    return (this.level.inventory[t] ?? 0) - used;
  }

  private refreshCounts(): void {
    this.toolButtons.forEach(({ box, count }, t) => {
      const n = this.remaining(t);
      count.setText(`${n}`);
      box.setAlpha(n === 0 && this.tool !== t ? 0.55 : this.tool && this.tool !== t ? 0.75 : 1);
    });
  }

  // ------------------------------------------------------------ input
  private onDown(p: Phaser.Input.Pointer): void {
    if (this.running || this.overlay) return;
    const c = this.cellAt(p);
    if (!c) return;
    if (this.tool) {
      this.toggleStation(c);
      return;
    }
    const st = this.placed.get(key(c)) ?? fixedAt(this.level, c);
    const last = this.path[this.path.length - 1];
    if (same(c, this.level.source)) {
      this.path = [this.level.source];
      this.dropStationsOffPath();
      this.drawing = true;
    } else if (same(c, last)) {
      this.drawing = true;
    } else if (canExtend(this.level, this.path, c)) {
      this.drawing = true;
      this.extend(c);
    } else if (st) {
      this.showInfo(st, !!fixedAt(this.level, c));
    } else if (this.level.maxPipe && this.path.length >= this.level.maxPipe) {
      this.nudge("Out of pipe! Go back (drag backwards) or Clear, and find a shorter route.");
    } else {
      this.nudge("Start from the API, then drag cell by cell.");
    }
    this.redraw();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drawing || !p.isDown) return;
    const c = this.cellAt(p);
    if (!c) return;
    const n = this.path.length;
    if (n >= 2 && same(c, this.path[n - 2])) {
      this.path.pop();
      this.dropStationsOffPath();
      this.redraw();
    } else if (canExtend(this.level, this.path, c)) {
      this.extend(c);
      this.redraw();
    }
  }

  private extend(c: Cell): void {
    this.path.push(c);
    if (same(c, this.level.sink)) {
      this.drawing = false;
      this.tweens.add({ targets: this.sinkSprite, scale: this.sinkSprite.scale * 1.15, duration: 120, yoyo: true });
      this.nudge(Object.keys(this.level.inventory).length ? "Connected! Pick a station below, then tap the pipe to build it." : "Pipe connected! Press Run ▶");
    }
  }

  private clearBoard(): void {
    if (this.running || this.overlay) return;
    this.path = [this.level.source];
    this.dropStationsOffPath();
    this.redraw();
  }

  // ------------------------------------------------------------ stations
  private selectTool(t: StationKind): void {
    if (this.running || this.overlay) return;
    this.tool = this.tool === t ? null : t;
    this.toolButtons.forEach(({ box }, k) =>
      this.tweens.add({ targets: box, scale: k === this.tool ? 1.1 : 1, duration: 150, ease: "Back.out" }),
    );
    this.refreshCounts();
    if (this.tool) this.showInfo(t, false);
    else this.hideInfo();
  }

  private toggleStation(c: Cell): void {
    const k = key(c);
    const onPipe = this.path.some((p) => same(p, c));
    if (fixedAt(this.level, c)) return this.nudge("That old station is bolted down 🔒 — work around it.");
    if (!onPipe || !canPlace(this.level, c)) {
      return this.nudge(this.level.pads ? "Stations can only be built on yellow pads that the pipe goes through." : "Stations go on the pipe — draw it first.");
    }
    const existing = this.sprites.get(k);
    if (existing && this.placed.get(k) === this.tool) {
      this.removeStation(k);
      this.refreshCounts();
      return;
    }
    if (this.remaining(this.tool!) <= 0) return this.nudge(`No ${STATION_INFO[this.tool!].name} left — tap a placed one to pick it up.`);
    if (existing) this.removeStation(k);
    const pos = this.center(c);
    const img = this.add.image(pos.x, pos.y, LOOK[this.tool!].tex).setDepth(4).setScale(0);
    this.tweens.add({ targets: img, scale: (this.cell * 0.8) / 64, duration: 260, ease: "Back.out" });
    this.placed.set(k, this.tool!);
    this.sprites.set(k, img);
    this.refreshCounts();
  }

  private removeStation(k: string): void {
    const img = this.sprites.get(k);
    this.placed.delete(k);
    this.sprites.delete(k);
    if (img) this.tweens.add({ targets: img, scale: 0, duration: 150, onComplete: () => img.destroy() });
  }

  private dropStationsOffPath(): void {
    const onPath = new Set(this.path.map(key));
    for (const k of [...this.sprites.keys()]) if (!onPath.has(k)) this.removeStation(k);
  }

  // ------------------------------------------------------------ explanations
  private showInfo(t: StationKind, fixed: boolean): void {
    this.hideInfo();
    const info = STATION_INFO[t];
    const w = 560;
    const h = 80;
    const g = this.add.graphics();
    g.fillStyle(LOOK[t].dark, 1).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 18);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, LOOK[t].color, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    const icon = this.add.image(-w / 2 + 44, 0, LOOK[t].tex).setScale(0.8);
    const title = text(this, -w / 2 + 84, -22, `${info.name}${fixed ? "  (bolted down 🔒)" : ""}`, 19, hex(LOOK[t].dark), "700").setOrigin(0, 0.5);
    const does = text(this, -w / 2 + 84, 4, info.does, 15, C.inkHex, "500").setOrigin(0, 0.5);
    const careful = text(this, -w / 2 + 84, 26, `⚠ ${info.careful}`, 14, "#c93c90", "600").setOrigin(0, 0.5);
    this.info = this.add.container(W / 2, H - 110, [g, icon, title, does, careful]).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: this.info, alpha: 1, y: H - 116, duration: 180 });
  }

  private hideInfo(): void {
    this.info?.destroy();
    this.info = undefined;
  }

  private bossIntro(): void {
    const dim = this.add.graphics().fillStyle(0x221a30, 0.6).fillRect(0, 0, W, H);
    const cw = 640;
    const ch = 470;
    const card = this.add.graphics();
    card.fillStyle(0xd94f73, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    card.fillStyle(0xff5d73, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, 74, { tl: 28, tr: 28, bl: 0, br: 0 });
    const items: Phaser.GameObjects.GameObject[] = [card, text(this, 0, -ch / 2 + 38, "⚠  BOSS LEVEL  ⚠", 32, "#ffffff", "700")];
    items.push(text(this, 0, -ch / 2 + 104, "Everything you learned, all at once. Remember:", 17, C.mutedHex, "600"));
    const rules: [StationKind, string][] = [
      ["parse", "Parse first — nobody can read inside a box."],
      ["filter", "Filter the empty rows (after Parse)."],
      ["normalize", 'Normalize before Dedup ("A" = "a").'],
      ["dedup", "Dedup on the id…"],
      ["mask", "…and Mask before the public zone."],
    ];
    rules.forEach(([k, r], i) => {
      const y = -ch / 2 + 146 + i * 40;
      items.push(this.add.image(-cw / 2 + 60, y, LOOK[k].tex).setScale(0.5));
      items.push(text(this, -cw / 2 + 92, y, r, 17, C.inkHex, "500").setOrigin(0, 0.5));
    });
    items.push(
      text(this, 0, ch / 2 - 104, "NEW TWIST: here the ids are EMAILS (personal data!).\nWhat does Mask do to an id… and what does Dedup need?", 16, "#c93c90", "700").setWordWrapWidth(cw - 60),
    );
    const box = this.add.container(W / 2, H / 2, items).setScale(0.7).setAlpha(0);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(60);
    box.add(button(this, 0, ch / 2 - 40, "Bring it on!", 0xff5d73, 0xd94f73, () => {
      this.overlay?.destroy();
      this.overlay = undefined;
    }, 210, 52));
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 420, ease: "Back.out" });
    this.cameras.main.shake(250, 0.006);
  }

  private introduce(kinds: StationKind[]): void {
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.45).fillRect(0, 0, W, H);
    const t = kinds[0];
    const info = STATION_INFO[t];
    const card = this.add.graphics();
    const cw = 540;
    const ch = 300;
    card.fillStyle(LOOK[t].dark, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    const items: Phaser.GameObjects.GameObject[] = [
      card,
      text(this, 0, -112, "New station unlocked!", 18, C.mutedHex, "600"),
      this.add.image(0, -56, LOOK[t].tex).setScale(1.1),
      text(this, 0, 0, info.name, 32, hex(LOOK[t].dark), "700"),
      text(this, 0, 38, info.does, 17, C.inkHex, "500").setWordWrapWidth(cw - 60),
      text(this, 0, 70, `⚠ ${info.careful}`, 15, "#c93c90", "600").setWordWrapWidth(cw - 60),
    ];
    const box = this.add.container(W / 2, H / 2, items);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(60);
    const ok = button(this, 0, ch / 2 - 30, "Got it!", LOOK[t].color, LOOK[t].dark, () => {
      this.overlay?.destroy();
      this.overlay = undefined;
    }, 160, 50);
    box.add(ok);
    box.setScale(0.8);
    this.tweens.add({ targets: box, scale: 1, duration: 260, ease: "Back.out" });
  }

  // ------------------------------------------------------------ run & animation
  private run(): void {
    if (this.running || this.overlay) return;
    this.hideInfo();
    if (!isComplete(this.level, this.path)) {
      this.nudge("The pipe must reach the warehouse first!");
      this.tweens.add({ targets: this.sinkSprite, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.sinkSprite.setAngle(0) });
      return;
    }
    this.running = true;
    this.attempts++;
    this.tool = null;
    this.toolButtons.forEach(({ box }) => box.setScale(1));
    this.refreshCounts();
    const result = simulate(this.level, this.path, this.placed);
    const step = Math.max(100, 170 - this.path.length * 4);
    let finished = 0;
    let ok = 0;
    let bad = 0;
    result.runs.forEach((run, i) => {
      this.time.delayedCall(i * (this.level.boss ? 430 : 560), () =>
        this.animate(run, step, (verdict) => {
          if (verdict === "ok") ok++;
          else if (verdict) bad++;
          this.counter.setText(`${ok} / ${result.delivered.expected}${bad ? `   ✗ ${bad}` : ""}`).setColor(bad ? "#ff5d73" : C.inkHex);
          finished++;
          if (finished === result.runs.length) this.time.delayedCall(650, () => this.showResult(result));
        }),
      );
    });
  }

  private makeBlob(spec: BlobSpec, x: number, y: number): BlobView {
    const scale = this.cell / 88;
    const body = this.add.image(0, 0, spec.kind === "null" ? "blob-null" : "blob-ok").setScale(scale);
    const tag = text(this, 0, 22 * scale + 6, tagOf(spec), 13, "#ffffff", "700");
    tag.setStroke("#3a2e4f", 4);
    const parts: Phaser.GameObjects.GameObject[] = [body, tag];
    const view: BlobView = { c: this.add.container(x, y), body, tag };
    if (spec.pii) {
      const badge = this.add.graphics();
      badge.fillStyle(C.piiBadge, 1).fillRoundedRect(8, -24, 18, 13, 3);
      badge.fillStyle(0xffffff, 1).fillCircle(13, -19, 2.5).fillRect(17, -21, 7, 2).fillRect(17, -17, 7, 2);
      parts.push(badge);
      view.badge = badge;
    }
    if (spec.boxed) {
      view.box = this.add.image(0, 2, "box").setScale(scale * 0.95);
      parts.push(view.box);
    }
    view.c.add(parts).setDepth(10);
    this.tweens.add({ targets: body, y: -4, duration: 140, yoyo: true, repeat: -1 });
    return view;
  }

  private animate(run: BlobRun, step: number, done: (verdict: string | null) => void): void {
    const start = this.center(this.path[0]);
    const v = this.makeBlob(run.blob, start.x, start.y);
    const events = [...run.events];
    const next = () => {
      const ev = events.shift();
      if (!ev) return;
      const p = this.center(this.path[ev.step]);
      switch (ev.type) {
        case "move":
          this.tweens.add({ targets: v.c, x: p.x, y: p.y, duration: step, onComplete: next });
          return;
        case "parse": {
          const bx = v.box!;
          this.sparks.setParticleTint(C.box);
          this.sparks.explode(10, p.x, p.y);
          this.tweens.add({ targets: bx, y: -40, angle: 60, alpha: 0, duration: 260, onComplete: () => bx.destroy() });
          this.stationBounce(ev.step);
          break;
        }
        case "normalize":
          v.tag.setText(run.blob.id.toLowerCase());
          this.tweens.add({ targets: v.tag, scale: { from: 1.8, to: 1 }, duration: 250 });
          this.stationBounce(ev.step);
          break;
        case "mask": {
          v.badge?.destroy();
          if (run.blob.keyPii) v.tag.setText("***");
          const shades = this.add.image(0, -40, "shades").setScale(this.cell / 110);
          v.c.add(shades);
          this.tweens.add({ targets: shades, y: -2 * (this.cell / 88), duration: 220, ease: "Bounce.out" });
          this.stationBounce(ev.step);
          break;
        }
        case "leak":
          this.floatText(p.x, p.y, "personal data leak!", C.bad);
          this.cameras.main.shake(120, 0.004);
          break;
        case "drop":
          this.sparks.setParticleTint(ev.by === "filter" ? C.filter : C.dedup);
          this.sparks.explode(14, p.x, p.y);
          this.floatText(p.x, p.y, ev.by === "filter" ? "NULL ✗" : "copy ✗", ev.by === "filter" ? C.filter : C.dedup);
          this.stationBounce(ev.step);
          this.tweens.add({ targets: v.c, scale: 0, angle: 180, duration: 220, onComplete: () => v.c.destroy() });
          done(null);
          return;
        case "deliver": {
          const good = ev.verdict === "ok";
          this.tweens.add({ targets: v.c, scale: 0.2, alpha: 0, duration: 200, onComplete: () => v.c.destroy() });
          this.tweens.add({ targets: this.sinkSprite, scaleY: this.sinkSprite.scaleY * 1.08, duration: 90, yoyo: true });
          if (!good) {
            this.sparks.setParticleTint(C.bad);
            this.sparks.explode(10, p.x, p.y);
            this.floatText(p.x, p.y, { null: "NULL!", boxed: "raw box!", duplicate: "duplicate!" }[ev.verdict as "null"], C.bad);
            this.cameras.main.shake(120, 0.004);
          }
          done(ev.verdict);
          return;
        }
      }
      this.time.delayedCall(140, next);
    };
    next();
  }

  private stationBounce(stepIdx: number): void {
    const img = this.sprites.get(key(this.path[stepIdx]));
    if (img) this.tweens.add({ targets: img, scaleY: img.scaleY * 0.82, duration: 90, yoyo: true });
  }

  private floatText(x: number, y: number, msg: string, color: number): void {
    const label = text(this, x, y - 30, msg, 15, "#ffffff", "700").setDepth(35);
    label.setStroke(hex(color), 6);
    this.tweens.add({ targets: label, y: y - 72, alpha: 0, duration: 900, onComplete: () => label.destroy() });
  }

  // ------------------------------------------------------------ result
  private showResult(result: Result): void {
    this.running = false;
    const stars = starsFor(result, this.attempts);
    if (result.success) save.setStars(this.level.id, stars);
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.45).fillRect(0, 0, W, H);
    const card = this.add.graphics();
    const cw = 640;
    const ch = result.success ? 430 : 250 + 30 * (result.problems.length + result.hints.length);
    card.fillStyle(0xe8dccd, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    const items: Phaser.GameObjects.GameObject[] = [card];
    const top = -ch / 2;

    if (result.success) {
      items.push(text(this, 0, top + 50, this.level.boss ? "🏆 BOSS DEFEATED! 🏆" : "Pipeline delivered!", 34, this.level.boss ? "#ff5d73" : "#2fbf71", "700"));
      for (let s = 0; s < 3; s++) {
        const star = this.add.image(-90 + s * 90, top + 122, "star").setScale(0).setTint(s < stars ? C.star : C.starEmpty);
        items.push(star);
        this.tweens.add({ targets: star, scale: 1, delay: 250 + s * 220, duration: 380, ease: "Back.out" });
      }
      const why: string[] = [];
      if (!result.shortPipe) why.push("use a shorter pipe");
      if (this.attempts > 1) why.push("succeed on the first run");
      items.push(text(this, 0, top + 180, why.length ? `For 3 stars: ${why.join(" and ")}.` : "Perfect run!", 16, C.mutedHex, "500"));
      const kc = this.add.graphics().fillStyle(0xf3efff, 1).fillRoundedRect(-cw / 2 + 30, top + 206, cw - 60, 130, 18);
      items.push(kc, text(this, 0, top + 230, `💡 ${this.level.lesson.title}`, 19, "#7a58e6", "700"));
      items.push(text(this, 0, top + 285, this.level.lesson.text, 15, C.inkHex, "500").setWordWrapWidth(cw - 100));
      const hasNext = this.index + 1 < LEVELS.length;
      items.push(
        button(this, -150, top + ch - 46, "Replay", 0xc9bfd6, 0xa89cb8, () => this.scene.restart({ index: this.index }), 150, 50),
        button(this, 90, top + ch - 46, hasNext ? "Next level ▶" : "Back to map", C.good, 0x229a58, () =>
          hasNext ? this.scene.start("level", { index: this.index + 1 }) : this.scene.start("menu"), 230, 50),
      );
    } else {
      items.push(text(this, 0, top + 46, "Almost!", 36, "#ff5d73", "700"));
      let y = top + 100;
      for (const pr of result.problems) {
        items.push(text(this, 0, y, pr, 17, C.inkHex, "600").setWordWrapWidth(cw - 60));
        y += 30;
      }
      y += 10;
      for (const h of result.hints) {
        items.push(text(this, 0, y, `💡 ${h}`, 16, "#7a58e6", "600").setWordWrapWidth(cw - 60));
        y += 30;
      }
      items.push(button(this, 0, top + ch - 44, "Try again", C.pipe, 0x3d5ad6, () => this.closeOverlay(), 190, 50));
    }

    const box = this.add.container(W / 2, H / 2 + 30, items).setAlpha(0);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(70);
    this.tweens.add({ targets: box, y: H / 2, alpha: 1, duration: 300, ease: "Back.out" });
    if (result.success) {
      this.sparks.setParticleTint(C.star);
      this.sparks.explode(40, W / 2, H / 2 - 120);
      if (this.level.boss) {
        const colors = [C.ok, C.filter, C.dedup, C.parse, C.normalize, C.star];
        for (let i = 0; i < 8; i++) {
          this.time.delayedCall(200 + i * 260, () => {
            this.sparks.setParticleTint(colors[i % colors.length]);
            this.sparks.explode(36, Phaser.Math.Between(120, W - 120), Phaser.Math.Between(80, 300));
          });
        }
      }
    }
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.redraw();
  }

  // ------------------------------------------------------------ header helpers
  private incoming(blobs: BlobSpec[]): void {
    const y = 96;
    const label = text(this, 96, y, "Incoming:", 14, C.mutedHex, "600").setOrigin(0, 0.5);
    let x = label.x + label.width + 20;
    for (const b of blobs) {
      this.add.image(x, y, b.kind === "null" ? "blob-null" : "blob-ok").setScale(0.42);
      if (b.boxed) this.add.image(x, y + 1, "box").setScale(0.42);
      if (b.pii) this.add.graphics().fillStyle(C.piiBadge, 1).fillRoundedRect(x + 3, y - 12, 9, 7, 2);
      const t = text(this, x, y + 15, tagOf(b), 10, "#3a2e4f", "700");
      t.setAlpha(0.8);
      x += blobs.some((bb) => bb.keyPii) ? 34 : 28;
    }
    // legend for the special kinds present in this level
    const legend: string[] = [];
    if (blobs.some((b) => b.kind === "null")) legend.push("∅ = empty row");
    if (blobs.some((b) => b.boxed)) legend.push("📦 = raw, unparsed");
    if (blobs.some((b) => b.upper)) legend.push("A/a = same id, different case");
    if (blobs.some((b) => b.pii)) legend.push("🪪 = personal data");
    if (blobs.some((b) => b.keyPii)) legend.push("x@ = the id is an email");
    if (legend.length) text(this, 96, y + 30, legend.join("    ·    "), 13, C.mutedHex, "500").setOrigin(0, 0.5);
  }

  private nudge(msg: string): void {
    this.hint.setText(msg).setColor("#5b7cfa");
    this.tweens.add({ targets: this.hint, x: { from: 90, to: 96 }, duration: 240, ease: "Back.out" });
  }
}
