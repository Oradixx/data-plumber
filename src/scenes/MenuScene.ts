import Phaser from "phaser";
import { LEVELS } from "../data/levels.ts";
import { background, C, hex, save, text, W } from "../theme.ts";

/** Title + a little world map: the campaign path, and the two modes coming next. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    background(this);
    const title = text(this, W / 2, 66, "Data Plumber", 62, C.inkHex, "700");
    title.setStroke("#ffffff", 10);
    this.tweens.add({ targets: title, y: 72, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    text(this, W / 2, 116, "Build pipelines. Keep the data clean. Don't flood the warehouse.", 20, C.mutedHex, "500");

    this.parade();

    const stars = save.stars();
    // zig-zag map, 4 per row: levels 1-9, then the mini-boss and the final boss
    const rows = [228, 350, 472];
    const xs = [170, 390, 610, 830];
    const points = LEVELS.map((_, i) => {
      const r = Math.floor(i / 4);
      const c = i % 4;
      return { x: r % 2 ? xs[3 - c] : xs[c], y: rows[r] };
    });
    const finalIdx = LEVELS.findIndex((l) => l.boss === "final");
    if (finalIdx >= 0) points[finalIdx] = { x: 745, y: rows[2] };

    const road = this.add.graphics();
    road.fillStyle(C.tileShade, 1);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a.x === b.x) continue; // vertical hops would cross the level names
      for (let t = 0.2; t < 0.85; t += 0.1) road.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 5);
    }

    LEVELS.forEach((level, i) => {
      const p = points[i];
      const unlocked = i === 0 || (stars[LEVELS[i - 1].id] ?? 0) > 0;
      const open = () => this.scene.start("level", { index: i });
      const name = level.title.replace(/^\d+ · /, "").replace(/^(MINI-BOSS|FINAL BOSS) — /, "");
      if (level.boss === "final") this.finalNode(p.x, p.y, name, unlocked, stars[level.id] ?? 0, open, i);
      else if (level.boss) this.miniNode(p.x, p.y, name, unlocked, stars[level.id] ?? 0, open);
      else this.levelNode(p.x, p.y, i + 1, name, unlocked, stars[level.id] ?? 0, open);
    });

    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    text(this, W - 30, 30, `★ ${total} / ${LEVELS.length * 3}`, 20, "#e0a800", "700").setOrigin(1, 0.5);
    this.modeCard(W / 2 - 160, 620, "🧹 Clean or Trash", `mini-game · best ${save.best("trash")}`, C.filter, C.filterDark, () => this.scene.start("trash"));
    this.teaser(W / 2 + 160, 620, "Data Factory", C.dedup);
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

  private modeCard(x: number, y: number, title: string, sub: string, color: number, dark: number, onClick: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(dark, 1).fillRoundedRect(-130, -26, 260, 58, 20);
    g.fillStyle(color, 1).fillRoundedRect(-130, -31, 260, 58, 20);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-116, -26, 232, 10, 5);
    const node = this.add.container(x, y, [g, text(this, 0, -10, title, 20, "#ffffff", "700"), text(this, 0, 13, sub, 13, "#ffffff", "600")]);
    node.setSize(260, 62);
    this.hover(node, 1.06, onClick);
  }

  private hover(node: Phaser.GameObjects.Container, scale: number, onClick: () => void): void {
    node.setInteractive({ useHandCursor: true });
    node.on("pointerover", () => this.tweens.add({ targets: node, scale, duration: 140, ease: "Back.out" }));
    node.on("pointerout", () => this.tweens.add({ targets: node, scale: 1, duration: 140 }));
    node.on("pointerup", onClick);
  }

  private teaser(x: number, y: number, title: string, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.75).fillRoundedRect(x - 120, y - 15, 240, 30, 15);
    g.lineStyle(2, color, 0.5).strokeRoundedRect(x - 120, y - 15, 240, 30, 15);
    text(this, x, y, `${title} · soon`, 15, hex(color), "700");
  }

  private marchers: Phaser.GameObjects.Image[] = [];

  /** Blobs marching across the top: pure decoration, sets the mood. */
  private parade(): void {
    this.marchers = [];
    for (let i = 0; i < 8; i++) {
      const key = i % 3 === 2 ? "blob-null" : "blob-ok";
      const b = this.add.image(i * 135, 166, key).setScale(0.7);
      this.tweens.add({ targets: b, y: 156, duration: 240 + i * 17, yoyo: true, repeat: -1, ease: "Sine.inOut" });
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
