import Phaser from "phaser";
import { ch1Done, chapterOf, nextStep, type StoryId } from "../core/story.ts";
import { LEVELS } from "../data/levels.ts";
import { arrive, background, button, C, go, hex, save, text, W } from "../theme.ts";

const CHAPTER_NAMES = ["", "Chapter 1 · Clean or Trash", "Chapter 2 · Data Plumber", "Chapter 3 · Data Factory", "Story complete · free play"];

/** Title + the story map: chapter 1 (Clean or Trash) → chapter 2 (the 11 Plumber levels) → chapter 3 (Data Factory). */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    background(this);
    const title = text(this, W / 2, 62, "Data Plumber", 60, C.inkHex, "700");
    title.setStroke("#ffffff", 10);
    this.tweens.add({ targets: title, y: 68, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    text(this, W / 2, 110, "Sort the data. Pipe the data. Run the factory.", 20, C.mutedHex, "500");

    this.parade();

    const stars = save.stars();
    const flags = save.flags();
    const ids = LEVELS.map((l) => l.id);
    // zig-zag story road, 5 per row: [Clean or Trash, levels 1-4] [levels 5-9 reversed] [mini, final, factory]
    const rows = [236, 352, 468];
    const xs = [130, 315, 500, 685, 870];
    const points = [{ x: xs[0], y: rows[0] }, ...LEVELS.map((_, i) => {
      const slot = i + 1;
      const r = Math.floor(slot / 5);
      const c = slot % 5;
      return { x: r % 2 ? xs[4 - c] : xs[c], y: rows[r] };
    })];
    const finalIdx = LEVELS.findIndex((l) => l.boss === "final");
    points[finalIdx + 1] = { x: 395, y: rows[2] };
    points.push({ x: 725, y: rows[2] }); // the factory

    const road = this.add.graphics();
    road.fillStyle(C.tileShade, 1);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a.x === b.x) continue; // vertical hops would cross the level names
      for (let t = 0.2; t < 0.85; t += 0.1) road.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 5);
    }

    // chapter 1
    const c1 = ch1Done(flags, stars);
    this.chapterTag(points[0].x, 1);
    this.trashNode(points[0].x, points[0].y, c1, () => this.play("prologue", "trash"));
    // chapter 2
    this.chapterTag(points[1].x, 2);
    LEVELS.forEach((level, i) => {
      const p = points[i + 1];
      const unlocked = i === 0 ? c1 : (stars[LEVELS[i - 1].id] ?? 0) > 0;
      const open = () => (i === 0 ? this.play("ch2", "level", { index: 0 }) : go(this, "level", { index: i }));
      const name = level.title.replace(/^\d+ · /, "").replace(/^(MINI-BOSS|FINAL BOSS) — /, "");
      if (level.boss === "final") this.finalNode(p.x, p.y, name, unlocked, stars[level.id] ?? 0, open, i);
      else if (level.boss) this.miniNode(p.x, p.y, name, unlocked, stars[level.id] ?? 0, open);
      else this.levelNode(p.x, p.y, i + 1, name, unlocked, stars[level.id] ?? 0, open);
    });
    // chapter 3
    const fp = points[points.length - 1];
    const factoryOpen = (stars[LEVELS[finalIdx].id] ?? 0) > 0 || flags.ch3;
    this.factoryNode(fp.x, fp.y, factoryOpen, flags.ch3, () => this.play("ch3", "factory"));

    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    text(this, W - 30, 30, `★ ${total} / ${LEVELS.length * 3}`, 20, "#e0a800", "700").setOrigin(1, 0.5);

    // Continue: straight to the next step of the story
    const chapter = chapterOf(flags, stars, ids);
    const next = nextStep(flags, stars, ids);
    const cont = button(this, W / 2, 616, `▶  Continue`, C.good, 0x229a58, () => go(this, next.scene, next.data), 300, 58);
    cont.add(text(this, 0, 44, CHAPTER_NAMES[chapter], 14, C.mutedHex, "700"));
    this.tweens.add({ targets: cont, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    arrive(this);
  }

  /** Open a chapter's scene, playing its cutscene first if it hasn't been seen yet. */
  private play(cutscene: StoryId, key: string, data?: object): void {
    if (!save.flags().seen.includes(cutscene)) go(this, "story", { id: cutscene });
    else go(this, key, data);
  }

  private chapterTag(x: number, n: number): void {
    const t = text(this, x, 186, `CHAPTER ${n}`, 12, "#ffffff", "700");
    const g = this.add.graphics();
    g.fillStyle(C.ink, 0.85).fillRoundedRect(x - t.width / 2 - 10, 176, t.width + 20, 20, 10);
    t.setDepth(1);
  }

  private trashNode(x: number, y: number, done: boolean, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(C.filterDark, 1).fillCircle(0, 6, 36);
    g.fillStyle(C.filter, 1).fillCircle(0, 0, 36);
    g.fillStyle(0xffffff, 0.25).fillEllipse(-10, -17, 26, 9);
    const node = this.add.container(x, y, [g, this.add.image(0, 0, "bin").setScale(0.62)]).setSize(76, 84);
    if (done) node.add(text(this, 26, -26, "✓", 20, "#2fbf71", "700").setStroke("#ffffff", 5));
    text(this, x, y + 50, "Clean or Trash", 16, hex(C.filterDark), "700");
    text(this, x, y + 70, `best ${save.best("trash")}`, 13, C.mutedHex, "600");
    this.hover(node, 1.1, onClick);
    if (!done) this.tweens.add({ targets: node, scale: 1.08, duration: 700, yoyo: true, repeat: -1 });
  }

  private factoryNode(x: number, y: number, unlocked: boolean, done: boolean, onClick: () => void): void {
    const g = this.add.graphics();
    const w = 280;
    g.fillStyle(unlocked ? C.dedupDark : 0xd6c8b6, 1).fillRoundedRect(-w / 2, -32, w, 72, 24);
    g.fillStyle(unlocked ? C.dedup : C.starEmpty, 1).fillRoundedRect(-w / 2, -38, w, 72, 24);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 16, -32, w - 32, 12, 6);
    const title = text(this, 0, -12, unlocked ? "🏭 DATA FACTORY" : "🔒 DATA FACTORY", 20, "#ffffff", "700");
    const sub = text(this, 0, 14, unlocked ? `Chapter 3 · ${done ? "✓ done · " : ""}best ${save.best("factory")}` : "Chapter 3 · beat the final boss", 14, "#ffffff", "600");
    const node = this.add.container(x, y, [g, title, sub]).setSize(w, 78);
    if (!unlocked) return;
    this.hover(node, 1.06, onClick);
    if (!done) this.tweens.add({ targets: node, scale: 1.04, duration: 600, yoyo: true, repeat: -1 });
  }

  private levelNode(
    x: number,
    y: number,
    n: number,
    name: string,
    unlocked: boolean,
    stars: number,
    onClick: () => void,
  ): void {
    const g = this.add.graphics();
    const color = unlocked ? C.pipe : C.starEmpty;
    g.fillStyle(unlocked ? 0x3d5ad6 : 0xd6c8b6, 1).fillCircle(0, 6, 34);
    g.fillStyle(color, 1).fillCircle(0, 0, 34);
    g.fillStyle(0xffffff, 0.25).fillEllipse(-10, -16, 24, 9);
    const label = text(this, 0, -2, unlocked ? String(n) : "🔒", unlocked ? 30 : 22, "#ffffff", "700");
    const node = this.add.container(x, y, [g, label]).setSize(72, 80);
    text(this, x, y + 50, name, 16, unlocked ? C.inkHex : C.mutedHex, "600");
    for (let s = 0; s < 3; s++) {
      this.add
        .image(x - 22 + s * 22, y + 72, "star")
        .setScale(0.3)
        .setTint(s < stars ? C.star : C.starEmpty);
    }
    if (!unlocked) return;
    node.setInteractive({ useHandCursor: true });
    node.on("pointerover", () => this.tweens.add({ targets: node, scale: 1.1, duration: 140, ease: "Back.out" }));
    node.on("pointerout", () => this.tweens.add({ targets: node, scale: 1, duration: 140 }));
    node.on("pointerup", onClick);
    if (stars === 0) this.tweens.add({ targets: node, scale: 1.08, duration: 700, yoyo: true, repeat: -1 });
  }

  private miniNode(x: number, y: number, name: string, unlocked: boolean, stars: number, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(unlocked ? 0xd94f73 : 0xd6c8b6, 1).fillCircle(0, 6, 40);
    g.fillStyle(unlocked ? 0xff5d73 : C.starEmpty, 1).fillCircle(0, 0, 40);
    g.fillStyle(0xffffff, 0.25).fillEllipse(-12, -19, 28, 10);
    const label = text(this, 0, -2, unlocked ? "👑" : "🔒", 30, "#ffffff", "700");
    const node = this.add.container(x, y, [g, label]).setSize(84, 90);
    text(this, x, y + 54, `MINI-BOSS · ${name}`, 16, unlocked ? "#d94f73" : C.mutedHex, "700");
    for (let s = 0; s < 3; s++) this.add.image(x - 22 + s * 22, y + 76, "star").setScale(0.3).setTint(s < stars ? C.star : C.starEmpty);
    if (!unlocked) return;
    this.hover(node, 1.1, onClick);
    if (!stars) this.tweens.add({ targets: node, angle: { from: -4, to: 4 }, duration: 320, yoyo: true, repeat: -1 });
  }

  private finalNode(x: number, y: number, name: string, unlocked: boolean, stars: number, onClick: () => void, idx: number): void {
    const g = this.add.graphics();
    const w = 290;
    g.fillStyle(unlocked ? 0x5a3cc0 : 0xd6c8b6, 1).fillRoundedRect(-w / 2, -32, w, 72, 24);
    g.fillStyle(unlocked ? 0x7a58e6 : C.starEmpty, 1).fillRoundedRect(-w / 2, -38, w, 72, 24);
    if (unlocked) g.lineStyle(3, 0xff5d73, 1).strokeRoundedRect(-w / 2, -38, w, 72, 24);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 16, -32, w - 32, 12, 6);
    const title = text(this, 0, -12, unlocked ? "☠ FINAL BOSS ☠" : "🔒 FINAL BOSS", 21, "#ffffff", "700");
    const sub = text(this, 0, 14, unlocked ? (stars ? "★".repeat(stars) + "☆".repeat(3 - stars) : name) : `Beat level ${idx} first`, 14, "#ffffff", "600");
    const node = this.add.container(x, y, [g, title, sub]).setSize(w, 78);
    if (!unlocked) return;
    this.hover(node, 1.06, onClick);
    if (!stars) this.tweens.add({ targets: node, angle: { from: -1.2, to: 1.2 }, duration: 260, yoyo: true, repeat: -1 });
  }

  private hover(node: Phaser.GameObjects.Container, scale: number, onClick: () => void): void {
    node.setInteractive({ useHandCursor: true });
    node.on("pointerover", () => this.tweens.add({ targets: node, scale, duration: 140, ease: "Back.out" }));
    node.on("pointerout", () => this.tweens.add({ targets: node, scale: 1, duration: 140 }));
    node.on("pointerup", onClick);
  }

  private marchers: Phaser.GameObjects.Image[] = [];

  /** Blobs marching across the top: pure decoration, sets the mood. */
  private parade(): void {
    this.marchers = [];
    for (let i = 0; i < 8; i++) {
      const key = i % 3 === 2 ? "blob-null" : "blob-ok";
      const b = this.add.image(i * 135, 148, key).setScale(0.62);
      this.tweens.add({ targets: b, y: 140, duration: 240 + i * 17, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.marchers.push(b);
    }
  }

  update(_time: number, delta: number): void {
    for (const b of this.marchers) {
      b.x += delta * 0.06;
      if (b.x > W + 60) b.x -= W + 120;
    }
  }
}
