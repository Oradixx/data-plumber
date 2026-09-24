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
    const title = text(this, W / 2, 86, "Data Plumber", 66, C.inkHex, "700");
    title.setStroke("#ffffff", 10);
    this.tweens.add({ targets: title, y: 94, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    text(this, W / 2, 146, "Build pipelines. Keep the data clean. Don't flood the warehouse.", 20, C.mutedHex, "500");

    this.parade();

    const stars = save.stars();
    // 3 × 3 zig-zag map
    const rows = [300, 420, 540];
    const xs = [250, 500, 750];
    const points = LEVELS.map((_, i) => {
      const r = Math.floor(i / 3);
      const c = i % 3;
      return { x: r % 2 ? xs[2 - c] : xs[c], y: rows[r] };
    });

    const road = this.add.graphics();
    road.fillStyle(C.tileShade, 1);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      for (let t = 0.2; t < 0.85; t += 0.1) road.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 5);
    }

    LEVELS.forEach((level, i) => {
      const p = points[i];
      const unlocked = i === 0 || (stars[LEVELS[i - 1].id] ?? 0) > 0;
      this.levelNode(p.x, p.y, i + 1, level.title.replace(/^\d+ · /, ""), unlocked, stars[level.id] ?? 0, () =>
        this.scene.start("level", { index: i }),
      );
    });

    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    text(this, W - 30, 30, `★ ${total} / ${LEVELS.length * 3}`, 20, "#e0a800", "700").setOrigin(1, 0.5);
    this.teaser(W / 2 - 135, 655, "Clean or Trash", C.filter);
    this.teaser(W / 2 + 135, 655, "Data Factory", C.dedup);
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
      const b = this.add.image(i * 135, 212, key).setScale(0.8);
      this.tweens.add({ targets: b, y: 200, duration: 240 + i * 17, yoyo: true, repeat: -1, ease: "Sine.inOut" });
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
