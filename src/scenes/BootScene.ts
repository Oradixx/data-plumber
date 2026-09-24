import Phaser from "phaser";
import { C } from "../theme.ts";

/**
 * Every illustration is drawn in code and baked into a texture once:
 * no image files to load, crisp at any size, easy to restyle.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.blob("blob-ok", C.ok, C.okDark, "happy");
    this.blob("blob-null", C.nul, C.nulDark, "meh");
    this.station("st-filter", C.filter, C.filterDark, (g) => {
      // funnel
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(18, 20, 46, 20, 32, 38);
      g.fillRect(29, 36, 6, 10);
    });
    this.station("st-dedup", C.dedup, C.dedupDark, (g) => {
      // two overlapping rows, one crossed out
      g.fillStyle(0xffffff, 1).fillCircle(26, 30, 9);
      g.lineStyle(4, 0xffffff, 1).strokeCircle(38, 30, 9);
      g.lineStyle(4, C.dedupDark, 1).lineBetween(32, 42, 44, 18);
    });
    this.source();
    this.sink();
    this.crate();

    const s = this.add.graphics();
    s.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
    s.generateTexture("spark", 12, 12).destroy();

    const star = this.add.graphics();
    star.fillStyle(0xffffff, 1).fillPoints(this.starPoints(32, 32, 30, 13), true);
    star.generateTexture("star", 64, 64).destroy();

    // Wait for the web font so the first texts render with it.
    const fontReady = document.fonts?.load('600 24px "Fredoka"').catch(() => undefined);
    Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(() => this.scene.start("menu"));
  }

  private blob(keyName: string, fill: number, dark: number, mood: "happy" | "meh"): void {
    const g = this.add.graphics();
    const r = 22;
    g.fillStyle(dark, 1).fillEllipse(24, 27, 2 * r, 2 * r - 4); // shadow base
    g.fillStyle(fill, 1).fillEllipse(24, 24, 2 * r, 2 * r - 4);
    g.fillStyle(0xffffff, 0.35).fillEllipse(16, 14, 12, 7); // highlight
    // eyes
    g.fillStyle(0xffffff, 1).fillEllipse(17, 23, 11, 13).fillEllipse(31, 23, 11, 13);
    g.fillStyle(0x2b2340, 1).fillCircle(18, 25, 3.4).fillCircle(32, 25, 3.4);
    // mouth
    if (mood === "happy") {
      g.lineStyle(3, 0x2b2340, 1).beginPath().arc(24, 31, 5, 0.15 * Math.PI, 0.85 * Math.PI).strokePath();
    } else {
      g.lineStyle(3, 0x2b2340, 1).lineBetween(19, 35, 29, 34);
    }
    g.generateTexture(keyName, 48, 48).destroy();
  }

  private station(keyName: string, fill: number, dark: number, icon: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics();
    g.fillStyle(dark, 1).fillRoundedRect(4, 10, 56, 52, 14);
    g.fillStyle(fill, 1).fillRoundedRect(4, 4, 56, 52, 14);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(10, 8, 44, 8, 4);
    // little chimney lights
    g.fillStyle(0xffffff, 0.9).fillCircle(14, 50, 2.5).fillCircle(22, 50, 2.5);
    icon(g);
    g.generateTexture(keyName, 64, 64).destroy();
  }

  private source(): void {
    const g = this.add.graphics();
    g.fillStyle(C.sourceDark, 1).fillRoundedRect(6, 18, 60, 52, 12);
    g.fillStyle(C.source, 1).fillRoundedRect(6, 12, 60, 52, 12);
    // antenna
    g.lineStyle(4, C.sourceDark, 1).lineBetween(36, 12, 36, 2);
    g.fillStyle(C.star, 1).fillCircle(36, 3, 4);
    // windows
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(16, 24, 16, 12, 3).fillRoundedRect(40, 24, 16, 12, 3);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(16, 44, 40, 12, 4);
    g.generateTexture("source", 72, 72).destroy();
  }

  private sink(): void {
    const g = this.add.graphics();
    g.fillStyle(C.sinkDark, 1).fillRoundedRect(6, 26, 60, 44, 10);
    g.fillStyle(C.sink, 1).fillRoundedRect(6, 22, 60, 42, 10);
    g.fillStyle(C.sinkDark, 1).fillTriangle(0, 26, 36, 2, 72, 26); // roof
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(24, 38, 24, 26, 5); // door
    g.lineStyle(3, C.sink, 1).lineBetween(24, 46, 48, 46).lineBetween(24, 54, 48, 54);
    g.generateTexture("sink", 72, 72).destroy();
  }

  private crate(): void {
    const g = this.add.graphics();
    g.fillStyle(C.crateDark, 1).fillRoundedRect(4, 8, 56, 54, 10);
    g.fillStyle(C.crate, 1).fillRoundedRect(4, 4, 56, 54, 10);
    g.lineStyle(4, C.crateDark, 1).strokeRoundedRect(10, 10, 44, 42, 6);
    g.lineBetween(12, 12, 52, 50).lineBetween(52, 12, 12, 50);
    g.generateTexture("crate", 64, 64).destroy();
  }

  private starPoints(cx: number, cy: number, outer: number, inner: number): Phaser.Math.Vector2[] {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? inner : outer;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return pts;
  }
}
