import Phaser from "phaser";
import { canExtend, isComplete, key, same, simulate, type BlobSpec, type Cell, type Level, type StationKind } from "../core/sim.ts";
import { LEVELS } from "../data/levels.ts";
import { background, button, C, H, save, text, W } from "../theme.ts";

const TOOL_INFO: Record<StationKind, { label: string; tex: string; color: number; dark: number }> = {
  filter: { label: "Filter", tex: "st-filter", color: C.filter, dark: C.filterDark },
  dedup: { label: "Dedup", tex: "st-dedup", color: C.dedup, dark: C.dedupDark },
};

export class LevelScene extends Phaser.Scene {
  private level!: Level;
  private index = 0;
  private cell = 80;
  private ox = 0;
  private oy = 0;
  private path: Cell[] = [];
  private stations = new Map<string, StationKind>();
  private stationSprites = new Map<string, Phaser.GameObjects.Image>();
  private pipeGfx!: Phaser.GameObjects.Graphics;
  private drawing = false;
  private tool: StationKind | null = null;
  private toolButtons = new Map<StationKind, Phaser.GameObjects.Container>();
  private running = false;
  private counter!: Phaser.GameObjects.Text;
  private sinkSprite!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super("level");
  }

  init(data: { index: number }): void {
    this.index = data.index ?? 0;
    this.level = LEVELS[this.index];
    this.path = [this.level.source];
    this.stations = new Map();
    this.stationSprites = new Map();
    this.tool = null;
    this.running = false;
    this.overlay = undefined;
  }

  create(): void {
    background(this);
    const L = this.level;
    this.cell = Math.min(84, Math.floor(860 / L.cols), Math.floor(360 / L.rows));
    this.ox = Math.round(W / 2 - (L.cols * this.cell) / 2);
    this.oy = Math.round(330 - (L.rows * this.cell) / 2);

    // ---- header
    button(this, 58, 46, "←", C.pipe, 0x3d5ad6, () => this.scene.start("menu"), 64, 50);
    text(this, 110, 34, L.title, 30, C.inkHex, "700").setOrigin(0, 0.5);
    this.hint = text(this, 110, 68, L.brief, 18, C.mutedHex, "500").setOrigin(0, 0.5);
    this.incoming(L.blobs);

    // ---- board
    this.drawBoard();
    this.pipeGfx = this.add.graphics().setDepth(1);
    const src = this.add.image(this.center(L.source).x, this.center(L.source).y, "source").setDepth(3);
    src.setScale((this.cell * 0.95) / 72);
    text(this, src.x, src.y + this.cell * 0.2, "API", 14, "#ffffff", "700").setDepth(4);
    this.sinkSprite = this.add
      .image(this.center(L.sink).x, this.center(L.sink).y, "sink")
      .setDepth(3)
      .setScale((this.cell * 0.95) / 72);
    this.counter = text(this, this.sinkSprite.x, this.sinkSprite.y - this.cell * 0.8, "", 18, C.inkHex, "700").setDepth(5);
    this.tweens.add({ targets: src, scaleY: src.scaleY * 1.05, duration: 700, yoyo: true, repeat: -1 });

    this.sparks = this.add
      .particles(0, 0, "spark", {
        speed: { min: 80, max: 220 },
        lifespan: 600,
        scale: { start: 0.9, end: 0 },
        gravityY: 300,
        emitting: false,
      })
      .setDepth(20);

    // ---- toolbar
    const by = H - 62;
    let x = 110;
    for (const t of L.tools) {
      const info = TOOL_INFO[t];
      const b = button(this, x, by, `  ${info.label}`, info.color, info.dark, () => this.selectTool(t), 170, 56);
      b.add(this.add.image(-54, 0, info.tex).setScale(0.55));
      this.toolButtons.set(t, b);
      x += 190;
    }
    button(this, W - 330, by, "Clear", 0xc9bfd6, 0xa89cb8, () => this.clearBoard(), 130, 56);
    button(this, W - 150, by, "Run ▶", C.good, 0x229a58, () => this.run(), 200, 56);

    // ---- input: draw the pipe, or place/remove a station
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on("pointerup", () => (this.drawing = false));

    this.redraw();
    this.cameras.main.fadeIn(250, 255, 244, 230);
  }

  // ------------------------------------------------------------ board & pipe
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
    const pad = 4;
    for (let y = 0; y < L.rows; y++) {
      for (let x = 0; x < L.cols; x++) {
        const px = this.ox + x * this.cell + pad;
        const py = this.oy + y * this.cell + pad;
        const s = this.cell - 2 * pad;
        g.fillStyle(C.tileShade, 1).fillRoundedRect(px, py + 4, s, s, 14);
        g.fillStyle(C.tile, 1).fillRoundedRect(px, py, s, s, 14);
      }
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
    const ok = this.level.blobs.filter((b) => b.kind === "ok").length;
    this.counter.setText(`0 / ${ok}`).setColor(C.inkHex);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.running || this.overlay) return;
    const c = this.cellAt(p);
    if (!c) return;
    if (this.tool) {
      this.toggleStation(c);
      return;
    }
    const last = this.path[this.path.length - 1];
    if (same(c, this.level.source)) {
      this.path = [this.level.source];
      this.removeStationsOffPath();
      this.drawing = true;
    } else if (same(c, last)) {
      this.drawing = true;
    } else if (canExtend(this.level, this.path, c)) {
      this.drawing = true;
      this.extend(c);
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
      this.path.pop(); // backtrack
      this.removeStationsOffPath();
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
      this.nudge(this.level.tools.length ? "Pipe connected! Now place your stations, then Run." : "Pipe connected! Press Run ▶");
    }
  }

  private clearBoard(): void {
    if (this.running) return;
    this.path = [this.level.source];
    this.removeStationsOffPath();
    this.redraw();
  }

  // ------------------------------------------------------------ stations
  private selectTool(t: StationKind): void {
    this.tool = this.tool === t ? null : t;
    this.toolButtons.forEach((b, k) => {
      this.tweens.add({ targets: b, scale: k === this.tool ? 1.12 : 1, duration: 150, ease: "Back.out" });
      b.setAlpha(this.tool && k !== this.tool ? 0.6 : 1);
    });
    if (this.tool) this.nudge(`Tap a pipe cell to place a ${TOOL_INFO[t].label}. Tap it again to remove it.`);
  }

  private toggleStation(c: Cell): void {
    const onPipe = this.path.slice(1).some((p) => same(p, c)) && !same(c, this.level.sink);
    if (!onPipe) {
      this.nudge("Stations go on the pipe — draw it first.");
      return;
    }
    const k = key(c);
    const existing = this.stationSprites.get(k);
    if (existing && this.stations.get(k) === this.tool) {
      this.stations.delete(k);
      this.stationSprites.delete(k);
      this.tweens.add({ targets: existing, scale: 0, duration: 150, onComplete: () => existing.destroy() });
      return;
    }
    existing?.destroy();
    const pos = this.center(c);
    const img = this.add.image(pos.x, pos.y, TOOL_INFO[this.tool!].tex).setDepth(4).setScale(0);
    this.tweens.add({ targets: img, scale: (this.cell * 0.8) / 64, duration: 260, ease: "Back.out" });
    this.stations.set(k, this.tool!);
    this.stationSprites.set(k, img);
  }

  private removeStationsOffPath(): void {
    const onPath = new Set(this.path.map(key));
    for (const [k, img] of this.stationSprites) {
      if (!onPath.has(k)) {
        img.destroy();
        this.stationSprites.delete(k);
        this.stations.delete(k);
      }
    }
  }

  // ------------------------------------------------------------ run
  private run(): void {
    if (this.running || this.overlay) return;
    if (!isComplete(this.level, this.path)) {
      this.nudge("The pipe must reach the warehouse first!");
      this.tweens.add({ targets: this.sinkSprite, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.sinkSprite.setAngle(0) });
      return;
    }
    this.running = true;
    this.tool = null;
    this.toolButtons.forEach((b) => b.setAlpha(1).setScale(1));
    const result = simulate(this.level, this.path, this.stations);
    let ok = 0;
    let bad = 0;
    const totalOk = this.level.blobs.filter((b) => b.kind === "ok").length;
    let finished = 0;
    const step = Math.max(110, 190 - this.path.length * 4);

    result.outcomes.forEach((o, i) => {
      this.time.delayedCall(i * 520, () => {
        const start = this.center(this.path[0]);
        const blob = this.makeBlob(o.blob, start.x, start.y);
        const last = o.removedAt ?? this.path.length - 1;
        const hop = (idx: number) => {
          if (idx > last) return;
          const p = this.center(this.path[idx]);
          this.tweens.add({
            targets: blob,
            x: p.x,
            y: p.y,
            duration: step,
            onComplete: () => {
              if (idx === o.removedAt) {
                this.pop(blob, o.removedBy!, p);
                finished++;
              } else if (idx === this.path.length - 1) {
                const good = o.blob.kind === "ok";
                if (good) ok++;
                else bad++;
                this.arrive(blob, good);
                this.counter.setText(`${ok} / ${totalOk}${bad ? `   ✗ ${bad}` : ""}`);
                this.counter.setColor(bad ? "#ff5d73" : "#3a2e4f");
                finished++;
              } else hop(idx + 1);
              if (finished === result.outcomes.length) this.time.delayedCall(700, () => this.showResult(result));
            },
          });
        };
        hop(1);
      });
    });
  }

  private makeBlob(spec: BlobSpec, x: number, y: number): Phaser.GameObjects.Container {
    const img = this.add.image(0, 0, spec.kind === "null" ? "blob-null" : "blob-ok").setScale(this.cell / 90);
    const parts: Phaser.GameObjects.GameObject[] = [img];
    if (spec.kind === "dup") {
      const badge = this.add.graphics();
      badge.fillStyle(C.dedup, 1).fillCircle(14, -14, 9);
      parts.push(badge, text(this, 14, -14, "2", 12, "#ffffff", "700"));
    }
    const c = this.add.container(x, y, parts).setDepth(10);
    this.tweens.add({ targets: img, y: -4, duration: 140, yoyo: true, repeat: -1 });
    return c;
  }

  private pop(blob: Phaser.GameObjects.Container, by: StationKind, p: { x: number; y: number }): void {
    const color = by === "filter" ? C.filter : C.dedup;
    this.sparks.setParticleTint(color);
    this.sparks.explode(14, p.x, p.y);
    const st = this.stationSprites.get(key(this.path.find((c) => this.center(c).x === p.x && this.center(c).y === p.y)!));
    if (st) this.tweens.add({ targets: st, scaleY: st.scaleY * 0.8, duration: 90, yoyo: true });
    const label = text(this, p.x, p.y - 30, by === "filter" ? "NULL ✗" : "copy ✗", 16, "#ffffff", "700").setDepth(21);
    label.setStroke(Phaser.Display.Color.IntegerToColor(color).rgba, 6);
    this.tweens.add({ targets: label, y: p.y - 70, alpha: 0, duration: 800, onComplete: () => label.destroy() });
    this.tweens.add({ targets: blob, scale: 0, angle: 180, duration: 220, onComplete: () => blob.destroy() });
  }

  private arrive(blob: Phaser.GameObjects.Container, good: boolean): void {
    this.tweens.add({ targets: blob, scale: 0.2, alpha: 0, duration: 200, onComplete: () => blob.destroy() });
    this.tweens.add({ targets: this.sinkSprite, scaleY: this.sinkSprite.scaleY * 1.08, duration: 90, yoyo: true });
    if (!good) {
      this.sparks.setParticleTint(C.bad);
      this.sparks.explode(10, this.sinkSprite.x, this.sinkSprite.y);
      this.cameras.main.shake(120, 0.004);
    }
  }

  // ------------------------------------------------------------ result
  private showResult(result: ReturnType<typeof simulate>): void {
    this.running = false;
    if (result.success) save.setStars(this.level.id, result.stars);
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.45).fillRect(0, 0, W, H);
    const card = this.add.graphics();
    const cw = 620;
    const ch = result.success ? 420 : 330;
    card.fillStyle(0xe8dccd, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    const items: Phaser.GameObjects.GameObject[] = [card];
    const top = -ch / 2;

    if (result.success) {
      items.push(text(this, 0, top + 52, "Pipeline delivered!", 36, "#2fbf71", "700"));
      for (let s = 0; s < 3; s++) {
        const star = this.add.image(-90 + s * 90, top + 128, "star").setScale(0).setTint(s < result.stars ? C.star : C.starEmpty);
        items.push(star);
        this.tweens.add({ targets: star, scale: 1.05, delay: 250 + s * 220, duration: 380, ease: "Back.out" });
      }
      const why: string[] = [];
      if (this.stations.size > this.level.parStations) why.push(`use only ${this.level.parStations} station(s)`);
      if (this.path.length > this.level.parLength) why.push("find a shorter pipe");
      items.push(text(this, 0, top + 186, why.length ? `For 3 stars: ${why.join(" and ")}.` : "Perfect run!", 17, "#8a7f9c", "500"));
      // knowledge card
      const kc = this.add.graphics().fillStyle(0xf3efff, 1).fillRoundedRect(-cw / 2 + 30, top + 212, cw - 60, 120, 18);
      items.push(kc, text(this, 0, top + 236, `💡 ${this.level.lesson.title}`, 20, "#7a58e6", "700"));
      const body = text(this, 0, top + 286, this.level.lesson.text, 16, "#3a2e4f", "500");
      body.setWordWrapWidth(cw - 100);
      items.push(body);
      const hasNext = this.index + 1 < LEVELS.length;
      items.push(
        button(this, -150, top + ch - 50, "Replay", 0xc9bfd6, 0xa89cb8, () => this.scene.restart({ index: this.index }), 150, 52),
        button(this, 90, top + ch - 50, hasNext ? "Next level ▶" : "Back to map", C.good, 0x229a58, () =>
          hasNext ? this.scene.start("level", { index: this.index + 1 }) : this.scene.start("menu"), 230, 52),
      );
    } else {
      items.push(text(this, 0, top + 56, "Almost!", 38, "#ff5d73", "700"));
      result.problems.forEach((pr, i) => items.push(text(this, 0, top + 116 + i * 32, pr, 19, "#3a2e4f", "500")));
      const tip = result.delivered.bad
        ? this.level.tools.length
          ? "Tip: place the right station on the pipe to catch them."
          : "Tip: check the pipe."
        : "Tip: make sure every valid row can reach the warehouse.";
      items.push(text(this, 0, top + 116 + result.problems.length * 32 + 20, tip, 17, "#8a7f9c", "500"));
      items.push(button(this, 0, top + ch - 50, "Try again", C.pipe, 0x3d5ad6, () => this.closeOverlay(), 200, 52));
    }

    const box = this.add.container(W / 2, H / 2 + 30, items).setAlpha(0);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(50);
    this.tweens.add({ targets: box, y: H / 2, alpha: 1, duration: 300, ease: "Back.out" });
    if (result.success) {
      this.sparks.setParticleTint(C.star);
      this.sparks.explode(40, W / 2, H / 2 - 120);
    }
  }

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.redraw();
  }

  // ------------------------------------------------------------ helpers
  private incoming(blobs: BlobSpec[]): void {
    const y = 108;
    const label = text(this, 110, y, "Incoming:", 15, C.mutedHex, "600").setOrigin(0, 0.5);
    const x0 = label.x + label.width + 22;
    blobs.forEach((b, i) => {
      const img = this.add.image(x0 + i * 30, y, b.kind === "null" ? "blob-null" : "blob-ok").setScale(0.48);
      if (b.kind === "dup") this.add.graphics().fillStyle(C.dedup, 1).fillCircle(img.x + 8, y - 8, 5);
    });
  }

  private nudge(msg: string): void {
    this.hint.setText(msg).setColor("#5b7cfa");
    this.tweens.add({ targets: this.hint, x: { from: 104, to: 110 }, duration: 240, ease: "Back.out" });
  }
}
