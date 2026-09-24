import Phaser from "phaser";
import {
  COST,
  createFactory,
  GOAL_SECONDS,
  LANES,
  place,
  repair,
  sell,
  SLOTS,
  step,
  tagOf,
  type Factory,
  type FBlob,
  type FEvent,
  type Wave,
} from "../core/factory.ts";
import type { StationKind } from "../core/sim.ts";
import { STATION_INFO } from "../data/levels.ts";
import { arrive, background, button, C, go, H, hex, save, text, W } from "../theme.ts";

const LOOK: Record<StationKind, { tex: string; color: number; dark: number }> = {
  parse: { tex: "st-parse", color: C.parse, dark: C.parseDark },
  filter: { tex: "st-filter", color: C.filter, dark: C.filterDark },
  normalize: { tex: "st-normalize", color: C.normalize, dark: C.normalizeDark },
  dedup: { tex: "st-dedup", color: C.dedup, dark: C.dedupDark },
  mask: { tex: "st-mask", color: C.mask, dark: C.maskDark },
};
const TOOLS: StationKind[] = ["filter", "dedup", "normalize", "parse", "mask"];
const LANE_Y = [236, 356, 476];
const X0 = 150; // belt start
const X1 = 850; // belt end
const slotX = (i: number) => X0 + (X1 - X0) * SLOTS[i];
const beltX = (x: number) => X0 + (X1 - X0) * x;

interface BlobView {
  c: Phaser.GameObjects.Container;
  tag: Phaser.GameObjects.Text;
  box?: Phaser.GameObjects.Image;
  badge?: Phaser.GameObjects.Graphics;
}

/**
 * Data Factory: three live conveyor lanes, a shifting data mix, credits to spend and an SLA to keep.
 * All the rules live in core/factory.ts; this scene draws the state and forwards taps.
 */
export class FactoryScene extends Phaser.Scene {
  f!: Factory; // public for browser tests
  paused = true;
  private tool: StationKind | null = null;
  private views = new Map<number, BlobView>();
  private slotViews: { img?: Phaser.GameObjects.Image; fire?: Phaser.GameObjects.Text }[][] = [];
  private laneLayer: Phaser.GameObjects.Container[] = [];
  private toolButtons = new Map<StationKind, Phaser.GameObjects.Container>();
  private hud!: {
    credits: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    sla: Phaser.GameObjects.Graphics;
    slaText: Phaser.GameObjects.Text;
    shift: Phaser.GameObjects.Graphics;
    shiftText: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
  };
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private overlay?: Phaser.GameObjects.Container;
  private sinks: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("factory");
  }

  init(): void {
    this.f = createFactory(Date.now());
    this.paused = true;
    this.tool = null;
    this.views = new Map();
    this.slotViews = [];
    this.laneLayer = [];
    this.toolButtons = new Map();
    this.overlay = undefined;
    this.sinks = [];
  }

  create(): void {
    background(this);
    button(this, 50, 42, "←", C.pipe, 0x3d5ad6, () => go(this, "menu"), 58, 48);
    text(this, 96, 30, "Data Factory", 28, hex(C.dedupDark), "700").setOrigin(0, 0.5);
    this.hud = {
      hint: text(this, 96, 62, "Build stations on the lanes. Clean rows earn credits.", 15, C.mutedHex, "500").setOrigin(0, 0.5).setWordWrapWidth(470),
      credits: text(this, W - 24, 28, "", 24, "#e0a800", "700").setOrigin(1, 0.5),
      score: text(this, W - 24, 56, "", 15, C.mutedHex, "700").setOrigin(1, 0.5),
      sla: this.add.graphics(),
      slaText: text(this, 610, 30, "SLA", 15, C.inkHex, "700").setOrigin(1, 0.5),
      shift: this.add.graphics(),
      shiftText: text(this, 820, 74, "", 12, C.mutedHex, "700").setOrigin(1, 0.5),
    };

    for (let lane = 0; lane < LANES; lane++) this.drawLane(lane);

    this.sparks = this.add
      .particles(0, 0, "spark", { speed: { min: 80, max: 220 }, lifespan: 600, scale: { start: 0.9, end: 0 }, gravityY: 300, emitting: false })
      .setDepth(30);

    // toolbar: station buttons with their price
    TOOLS.forEach((t, i) => {
      const look = LOOK[t];
      const x = 76 + i * 136;
      const b = button(this, x, H - 46, STATION_INFO[t].name, look.color, look.dark, () => this.selectTool(t), 128, 50);
      (b.list[1] as Phaser.GameObjects.Text).setFontSize(17).setX(14);
      b.add(this.add.image(-42, 0, look.tex).setScale(0.44));
      b.add(this.add.graphics().fillStyle(C.ink, 1).fillRoundedRect(30, -36, 40, 22, 11));
      b.add(text(this, 50, -25, `${COST[t]}`, 13, "#ffd166", "700"));
      this.toolButtons.set(t, b);
    });
    button(this, W - 88, H - 46, "❚❚ Pause", 0xc9bfd6, 0xa89cb8, () => this.togglePause(), 150, 50);

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onTap(p));
    const kb = this.input.keyboard;
    TOOLS.forEach((t, i) => kb?.on(`keydown-${["ONE", "TWO", "THREE", "FOUR", "FIVE"][i]}`, () => this.selectTool(t)));
    kb?.on("keydown-SPACE", () => this.togglePause());

    this.refreshLanes();
    this.updateHud();
    arrive(this);
    // the first wave's card starts the game
    this.handle(step(this.f, 0));
  }

  // ------------------------------------------------------------ board
  private drawLane(lane: number): void {
    const y = LANE_Y[lane];
    const layer = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0xd8c7b3, 1).fillRoundedRect(X0 - 10, y - 16, X1 - X0 + 20, 38, 14);
    g.fillStyle(C.tileShade, 1).fillRoundedRect(X0 - 10, y - 20, X1 - X0 + 20, 38, 14);
    g.fillStyle(0xe8d6c2, 1);
    for (let x = X0; x < X1; x += 34) g.fillRoundedRect(x, y - 4, 18, 6, 3);
    const stripes = this.add.graphics();
    layer.add([g, stripes]);
    layer.setData("stripes", stripes);
    const src = this.add.image(X0 - 58, y, "source").setScale(0.85);
    text(this, X0 - 58, y + 12, `API ${lane + 1}`, 12, "#ffffff", "700");
    const sink = this.add.image(X1 + 58, y, "sink").setScale(0.85);
    this.sinks.push(sink);
    const lock = text(this, (X0 + X1) / 2, y, "🔒 opens later in the shift", 16, C.mutedHex, "700").setDepth(3);
    layer.setData("lock", lock);
    layer.setData("src", src);
    const publicTag = text(this, X1 + 58, y - 44, "PUBLIC", 12, "#ff5d73", "700").setVisible(false);
    layer.setData("public", publicTag);
    this.slotViews.push(
      SLOTS.map((_, i) => {
        this.add.image(slotX(i), y, "pad").setScale(0.72).setDepth(0.5);
        return {};
      }),
    );
    this.laneLayer.push(layer);
  }

  /** Reflect lane state (open, public) and stations. */
  private refreshLanes(): void {
    this.f.lanes.forEach((L, lane) => {
      const layer = this.laneLayer[lane];
      (layer.getData("lock") as Phaser.GameObjects.Text).setVisible(!L.open);
      layer.setAlpha(L.open ? 1 : 0.5);
      (layer.getData("public") as Phaser.GameObjects.Text).setVisible(L.public);
      const stripes = layer.getData("stripes") as Phaser.GameObjects.Graphics;
      stripes.clear();
      if (L.public) {
        const y = LANE_Y[lane];
        stripes.fillStyle(C.zone, 1).fillRoundedRect(slotX(2) + 40, y - 20, X1 + 10 - slotX(2) - 40, 38, 12);
        stripes.lineStyle(4, C.zoneStripe, 0.8);
        for (let x = slotX(2) + 44; x < X1 + 4; x += 14) stripes.lineBetween(x, y + 16, x + 14, y - 18);
      }
      L.slots.forEach((st, i) => {
        const v = this.slotViews[lane][i];
        if (!st) {
          v.img?.destroy();
          v.fire?.destroy();
          this.slotViews[lane][i] = {};
          return;
        }
        if (!v.img || v.img.texture.key !== LOOK[st.kind].tex) {
          v.img?.destroy();
          v.img = this.add.image(slotX(i), LANE_Y[lane], LOOK[st.kind].tex).setDepth(4).setScale(0);
          this.tweens.add({ targets: v.img, scale: 0.8, duration: 240, ease: "Back.out" });
        }
        if (st.broken && !v.fire) {
          v.img.setTint(0xff8a8a);
          v.fire = text(this, slotX(i) + 18, LANE_Y[lane] - 26, "🔥", 24).setDepth(6);
          this.tweens.add({ targets: v.fire, scale: 1.3, duration: 250, yoyo: true, repeat: -1 });
          this.tweens.add({ targets: v.img, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: -1 });
        } else if (!st.broken && v.fire) {
          v.fire.destroy();
          v.fire = undefined;
          this.tweens.killTweensOf(v.img);
          v.img.clearTint().setAngle(0).setScale(0.8);
        }
      });
    });
  }

  // ------------------------------------------------------------ loop
  update(_t: number, delta: number): void {
    if (this.paused || this.overlay || this.f.over) return;
    this.handle(step(this.f, Math.min(delta, 50) / 1000));
    for (const b of this.f.blobs) {
      const v = this.views.get(b.uid);
      if (v) v.c.x = beltX(b.x);
    }
    this.updateHud();
  }

  private handle(events: FEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "spawn":
          this.views.set(e.blob.uid, this.makeBlob(e.blob));
          break;
        case "station": {
          const v = this.views.get(e.blob.uid);
          if (!v) break;
          if (e.what === "parse" && v.box) {
            const bx = v.box;
            v.box = undefined;
            this.tweens.add({ targets: bx, y: -34, angle: 60, alpha: 0, duration: 240, onComplete: () => bx.destroy() });
          } else if (e.what === "normalize") {
            v.tag.setText(tagOf(e.blob));
            this.tweens.add({ targets: v.tag, scale: { from: 1.7, to: 1 }, duration: 220 });
          } else if (e.what === "mask") {
            v.badge?.destroy();
            const shades = this.add.image(0, -30, "shades").setScale(0.5);
            v.c.add(shades);
            this.tweens.add({ targets: shades, y: -2, duration: 200, ease: "Bounce.out" });
          }
          this.bounce(e.blob.lane, e.slot);
          break;
        }
        case "drop": {
          const v = this.views.get(e.blob.uid);
          this.views.delete(e.blob.uid);
          if (!v) break;
          this.sparks.setParticleTint(e.by === "filter" ? C.filter : C.dedup);
          this.sparks.explode(10, v.c.x, v.c.y);
          this.tweens.add({ targets: v.c, scale: 0, angle: 180, duration: 200, onComplete: () => v.c.destroy() });
          this.bounce(e.blob.lane, e.slot);
          break;
        }
        case "deliver": {
          const v = this.views.get(e.blob.uid);
          this.views.delete(e.blob.uid);
          v?.c.destroy();
          const sink = this.sinks[e.blob.lane];
          this.tweens.add({ targets: sink, scaleY: 0.95, duration: 80, yoyo: true });
          if (e.ok) this.float(sink.x, sink.y - 30, "+2", C.good, 14);
          else {
            this.float(sink.x - 20, sink.y - 30, e.reason === "leak" ? "leak! −15" : `${e.reason}! −10`, C.bad, 16);
            this.sparks.setParticleTint(C.bad);
            this.sparks.explode(12, sink.x, sink.y);
            this.cameras.main.shake(110, 0.004);
          }
          break;
        }
        case "wave":
          this.refreshLanes();
          if (e.wave.pause) this.waveCard(e.wave, e.index);
          else this.banner(`⚠ ${e.wave.title}: ${e.wave.text}`);
          break;
        case "break":
          this.refreshLanes();
          this.banner(`🔥 A ${STATION_INFO[this.f.lanes[e.lane].slots[e.slot]!.kind].name} on lane ${e.lane + 1} overheated — tap it to repair!`);
          break;
        case "goal":
          this.goal();
          break;
        case "over":
          this.gameOver();
          break;
      }
    }
  }

  // ------------------------------------------------------------ input
  private onTap(p: Phaser.Input.Pointer): void {
    if (this.overlay || this.f.over) return;
    const lane = LANE_Y.findIndex((y) => Math.abs(p.y - y) < 40);
    if (lane < 0 || p.x < X0 - 20 || p.x > X1 + 20) return;
    const slot = SLOTS.findIndex((_, i) => Math.abs(p.x - slotX(i)) < 44);
    if (slot < 0) return this.nudge("Stations go on the yellow slots.");
    const L = this.f.lanes[lane];
    const st = L.slots[slot];
    if (this.tool) {
      const r = place(this.f, lane, slot, this.tool);
      if (r === "credits") this.nudge(`Not enough credits for a ${STATION_INFO[this.tool].name} (${COST[this.tool]}). Clean rows earn +2.`);
      else if (r === "closed") this.nudge("This lane isn't open yet.");
      else this.selectTool(this.tool); // built: drop the tool
      this.refreshLanes();
      this.updateHud();
      return;
    }
    if (st?.broken) {
      repair(this.f, lane, slot);
      this.float(slotX(slot), LANE_Y[lane] - 40, "repaired!", C.good, 15);
    } else if (st) {
      const refund = sell(this.f, lane, slot);
      this.float(slotX(slot), LANE_Y[lane] - 40, `sold +${refund}`, C.pad, 15);
    } else {
      this.nudge("Pick a station below first (or press 1–5).");
    }
    this.refreshLanes();
    this.updateHud();
  }

  private selectTool(t: StationKind): void {
    if (this.overlay) return;
    this.tool = this.tool === t ? null : t;
    this.toolButtons.forEach((b, k) => this.tweens.add({ targets: b, scale: k === this.tool ? 1.1 : 1, duration: 150, ease: "Back.out" }));
    if (this.tool) this.nudge(`${STATION_INFO[t].name} (${COST[t]}💰) — tap a yellow slot to build it.`);
  }

  private togglePause(): void {
    if (this.overlay || this.f.over) return;
    this.paused = !this.paused;
    this.nudge(this.paused ? "Paused — press Pause or Space to resume." : "Back to work!");
  }

  // ------------------------------------------------------------ views
  private makeBlob(b: FBlob): BlobView {
    const y = LANE_Y[b.lane];
    const body = this.add.image(0, 0, b.kind === "null" ? "blob-null" : "blob-ok").setScale(0.66);
    const tag = text(this, 0, 22, tagOf(b), 12, "#ffffff", "700");
    tag.setStroke("#3a2e4f", 4);
    const parts: Phaser.GameObjects.GameObject[] = [body, tag];
    const v: BlobView = { c: this.add.container(beltX(0), y - 8), tag };
    if (b.pii) {
      const badge = this.add.graphics();
      badge.fillStyle(C.piiBadge, 1).fillRoundedRect(6, -18, 14, 10, 3);
      parts.push(badge);
      v.badge = badge;
    }
    if (b.boxed) {
      v.box = this.add.image(0, 2, "box").setScale(0.62);
      parts.push(v.box);
    }
    v.c.add(parts).setDepth(10);
    this.tweens.add({ targets: body, y: -3, duration: 150, yoyo: true, repeat: -1 });
    return v;
  }

  private bounce(lane: number, slot: number): void {
    const img = this.slotViews[lane][slot]?.img;
    if (img && !this.f.lanes[lane].slots[slot]?.broken) this.tweens.add({ targets: img, scaleY: 0.66, duration: 80, yoyo: true });
  }

  private updateHud(): void {
    const f = this.f;
    this.hud.credits.setText(`💰 ${f.credits}`);
    this.hud.score.setText(`${f.score} pts · best ${save.best("factory")}`);
    const g = this.hud.sla.clear();
    g.fillStyle(0xe8dccd, 1).fillRoundedRect(620, 22, 200, 16, 8);
    g.fillStyle(f.sla > 60 ? C.good : f.sla > 30 ? C.dedup : C.bad, 1).fillRoundedRect(620, 22, Math.max(16, 2 * f.sla), 16, 8);
    const s = this.hud.shift.clear();
    const frac = Math.min(1, f.t / GOAL_SECONDS);
    s.fillStyle(0xe8dccd, 1).fillRoundedRect(620, 52, 200, 10, 5);
    s.fillStyle(f.goalReached ? C.star : C.pipe, 1).fillRoundedRect(620, 52, Math.max(10, 200 * frac), 10, 5);
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    this.hud.shiftText.setText(f.goalReached ? `overtime ${mmss(f.t)}` : `shift ${mmss(f.t)} / ${mmss(GOAL_SECONDS)}`);
  }

  private nudge(msg: string): void {
    this.hud.hint.setText(msg).setColor("#5b7cfa");
  }

  private float(x: number, y: number, msg: string, color: number, size = 16): void {
    const t = text(this, x, y, msg, size, "#ffffff", "700").setDepth(35);
    t.setStroke(hex(color), 5);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private banner(msg: string): void {
    const t = text(this, W / 2, 128, msg, 17, "#ffffff", "700").setDepth(45).setWordWrapWidth(820);
    const bg = this.add.graphics().setDepth(44);
    bg.fillStyle(C.bad, 0.95).fillRoundedRect(W / 2 - t.width / 2 - 20, 128 - t.height / 2 - 8, t.width + 40, t.height + 16, 14);
    [t, bg].forEach((o) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 200, hold: 3200, yoyo: true, onComplete: () => o.destroy() });
    });
  }

  // ------------------------------------------------------------ cards
  private card(
    title: string,
    body: string,
    color: number,
    dark: number,
    buttons: { label: string; color: number; dark: number; act: () => void; w?: number }[],
    height = 300,
  ): void {
    this.paused = true;
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.45).fillRect(0, 0, W, H);
    const cw = 620;
    const g = this.add.graphics();
    g.fillStyle(dark, 1).fillRoundedRect(-cw / 2, -height / 2 + 8, cw, height, 28);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -height / 2, cw, height, 28);
    g.fillStyle(color, 1).fillRoundedRect(-cw / 2, -height / 2, cw, 62, { tl: 28, tr: 28, bl: 0, br: 0 });
    const items: Phaser.GameObjects.GameObject[] = [
      g,
      text(this, 0, -height / 2 + 31, title, 26, "#ffffff", "700"),
      text(this, 0, -height / 2 + 86, body, 18, C.inkHex, "500").setOrigin(0.5, 0).setWordWrapWidth(cw - 70),
    ];
    const box = this.add.container(W / 2, H / 2, items).setScale(0.8);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(60);
    const span = buttons.length > 1 ? 250 : 0;
    buttons.forEach((b, i) =>
      box.add(
        button(this, -span / 2 + i * span, height / 2 - 42, b.label, b.color, b.dark, () => {
          this.overlay?.destroy();
          this.overlay = undefined;
          b.act();
        }, b.w ?? 200, 52),
      ),
    );
    this.tweens.add({ targets: box, scale: 1, duration: 260, ease: "Back.out" });
  }

  private waveCard(w: Wave, index: number): void {
    this.card(`Wave ${index + 1} · ${w.title}`, w.text, index >= 5 ? C.bad : C.dedup, index >= 5 ? 0xd9485f : C.dedupDark, [
      { label: "Go!", color: C.good, dark: 0x229a58, act: () => (this.paused = false) },
    ]);
  }

  private goal(): void {
    const first = !save.flags().ch3;
    save.updateFlags((fl) => (fl.ch3 = true));
    if (!first) return this.banner("⭐ Shift complete — you're in overtime now. Go for the record!");
    this.card(
      "⭐ Shift complete!",
      "3 minutes of live data, and the warehouse is still standing. Chapter 3 is done.\n\nKeep going in overtime for a high score, or see the epilogue.",
      C.star,
      0xe0a800,
      [
        { label: "Overtime", color: 0xc9bfd6, dark: 0xa89cb8, act: () => (this.paused = false) },
        { label: "Epilogue ▶", color: C.good, dark: 0x229a58, act: () => this.endRun("story", { id: "epilogue" }) },
      ],
      320,
    );
  }

  private endRun(key: string, data?: object): void {
    save.setBest("factory", this.f.score);
    go(this, key, data);
  }

  private gameOver(): void {
    this.paused = true;
    const f = this.f;
    const record = save.setBest("factory", f.score);
    const mmss = `${Math.floor(f.t / 60)}:${String(Math.floor(f.t % 60)).padStart(2, "0")}`;
    const body =
      `You kept the factory running for ${mmss} and delivered ${f.delivered} clean row${f.delivered === 1 ? "" : "s"} (${f.bad} bad one${f.bad === 1 ? "" : "s"} got through).` +
      `${record ? "\nNEW RECORD! 🎉" : ""}\n\n💡 Real-time data is never stable: sources change without warning (schema drift), traffic spikes, jobs crash. ` +
      "Teams watch SLAs, get alerts and fix things live — that's DataOps and on-call.";
    this.card(`SLA breached · ${f.score} pts`, body, C.bad, 0xd9485f, [
      { label: "Map", color: 0xc9bfd6, dark: 0xa89cb8, act: () => go(this, "menu") },
      { label: "Play again", color: C.dedup, dark: C.dedupDark, act: () => this.scene.restart() },
    ], 350);
    if (record) {
      this.sparks.setParticleTint(C.star);
      this.sparks.explode(40, W / 2, 120);
    }
  }
}
