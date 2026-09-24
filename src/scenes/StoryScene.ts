import Phaser from "phaser";
import type { StoryId } from "../core/story.ts";
import { CUTSCENES, type Cutscene } from "../data/story.ts";
import { arrive, background, button, C, go, H, hex, save, text, W } from "../theme.ts";

const TYPE_MS = 22; // typewriter speed

/**
 * Story cutscene: a chapter title card, then Ada talks in speech bubbles (tap to continue),
 * then the story moves on to the next chapter's scene.
 */
export class StoryScene extends Phaser.Scene {
  private id: StoryId = "prologue";
  private cut!: Cutscene;
  private line = -1;
  private typing?: Phaser.Time.TimerEvent;
  private full = "";
  private bubbleText!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private ada!: Phaser.GameObjects.Image;
  private ready = false; // title card finished
  private done = false;

  constructor() {
    super("story");
  }

  init(data: { id?: StoryId }): void {
    this.id = data.id ?? "prologue";
    this.cut = CUTSCENES[this.id];
    this.line = -1;
    this.ready = false;
    this.done = false;
    this.dots = [];
  }

  create(): void {
    background(this);
    this.scene_();
    this.titleCard();
    this.input.on("pointerdown", () => this.advance());
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    const skip = button(this, W - 80, 40, "Skip ▸▸", 0xc9bfd6, 0xa89cb8, () => this.finish(), 120, 44);
    skip.setDepth(50);
    (skip.list[1] as Phaser.GameObjects.Text).setFontSize(17);
    arrive(this);
  }

  /** The set: a conveyor with marching blobs, Ada, a prop for the chapter, an empty speech bubble. */
  private scene_(): void {
    const belt = this.add.graphics();
    belt.fillStyle(C.tileShade, 1).fillRoundedRect(0, 616, W, 34, 10);
    belt.fillStyle(0xe8d6c2, 1);
    for (let x = 10; x < W; x += 40) belt.fillRoundedRect(x, 628, 22, 8, 4);
    for (let i = 0; i < 7; i++) {
      const b = this.add.image(i * 160, 598, i % 3 === 1 ? "blob-null" : "blob-ok").setScale(0.8);
      this.tweens.add({ targets: b, y: 590, duration: 260, yoyo: true, repeat: -1, delay: i * 40 });
      this.tweens.add({ targets: b, x: b.x + 160, duration: 2600, repeat: -1 });
    }

    this.ada = this.add.image(190, 400, "ada").setScale(2.1);
    this.tweens.add({ targets: this.ada, scaleY: 2.2, y: 394, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    text(this, 190, 540, "Ada · lead data engineer", 16, hex(C.sourceDark), "700");

    this.prop(this.cut.prop, 820, 500);

    // speech bubble with a tail pointing at Ada
    const g = this.add.graphics();
    const bx = 330;
    const by = 130;
    const bw = 580;
    const bh = 190;
    g.fillStyle(0xe8dccd, 1).fillRoundedRect(bx, by + 8, bw, bh, 28);
    g.fillStyle(0xffffff, 1).fillRoundedRect(bx, by, bw, bh, 28);
    g.fillTriangle(bx + 30, by + bh - 40, bx + 30, by + bh - 4, bx - 40, by + bh + 50);
    this.bubbleText = text(this, bx + 34, by + 30, "", 23, C.inkHex, "600").setOrigin(0, 0).setAlign("left").setWordWrapWidth(bw - 68).setLineSpacing(6);
    text(this, bx + bw - 30, by + bh - 24, "tap ▸", 14, C.mutedHex, "600").setOrigin(1, 0.5);
    this.cut.lines.forEach((_, i) => this.dots.push(this.add.circle(bx + bw / 2 - (this.cut.lines.length - 1) * 11 + i * 22, by + bh + 34, 6, C.starEmpty)));
    text(this, 40, 40, `${this.cut.chapter} · ${this.cut.title}`, 18, C.mutedHex, "700").setOrigin(0, 0.5);
  }

  private prop(kind: Cutscene["prop"], x: number, y: number): void {
    if (kind === "bin") {
      this.add.image(x, y + 10, "bin").setScale(1.5);
      const junk = this.add.image(x - 10, y - 90, "blob-null").setScale(1);
      this.tweens.add({ targets: junk, y: y - 30, angle: 200, alpha: 0, duration: 1400, repeat: -1, repeatDelay: 500, ease: "Quad.in" });
    } else if (kind === "pipe") {
      const g = this.add.graphics();
      g.lineStyle(26, 0x3d5ad6, 1).lineBetween(x - 110, y - 40, x - 110, y + 30).lineBetween(x - 110, y + 30, x + 90, y + 30);
      g.lineStyle(18, C.pipe, 1).lineBetween(x - 110, y - 40, x - 110, y + 30).lineBetween(x - 110, y + 30, x + 90, y + 30);
      this.add.image(x - 110, y - 10, "st-filter").setScale(0.8);
      this.add.image(x, y + 30, "st-dedup").setScale(0.8);
      this.add.image(x + 100, y + 30, "sink").setScale(1);
    } else if (kind === "factory") {
      const g = this.add.graphics();
      for (let i = 0; i < 3; i++) {
        g.fillStyle(C.tileShade, 1).fillRoundedRect(x - 130, y - 50 + i * 40, 190, 18, 8);
        const b = this.add.image(x - 120, y - 58 + i * 40, i === 1 ? "blob-null" : "blob-ok").setScale(0.5);
        this.tweens.add({ targets: b, x: x + 40, duration: 1600 + i * 300, repeat: -1 });
      }
      this.add.image(x + 100, y - 14, "sink").setScale(1.2);
    } else {
      const star = this.add.image(x, y - 10, "star").setScale(2).setTint(C.star);
      this.tweens.add({ targets: star, angle: 360, duration: 6000, repeat: -1 });
      this.tweens.add({ targets: star, scale: 2.2, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  /** Big "CHAPTER 2 / Data Plumber" card that slides away to reveal the scene. */
  private titleCard(): void {
    const g = this.add.graphics();
    g.fillStyle(C.ink, 1).fillRect(-W / 2, -H / 2, W, H);
    g.fillStyle(0xffffff, 0.04);
    for (let i = -W; i < W; i += 60) g.fillRect(i, -H / 2, 26, H);
    const small = text(this, 0, -60, this.cut.chapter, 28, hex(C.pad), "700").setAlpha(0);
    const big = text(this, 0, 6, this.cut.title, 72, "#ffffff", "700").setScale(0.6).setAlpha(0);
    const blobs = ["blob-ok", "blob-null", "blob-ok"].map((k, i) => this.add.image(-60 + i * 60, 110, k).setAlpha(0));
    const card = this.add.container(W / 2, H / 2, [g, small, big, ...blobs]).setDepth(40);
    this.tweens.add({ targets: small, alpha: 1, y: -70, duration: 400, delay: 250 });
    this.tweens.add({ targets: big, alpha: 1, scale: 1, duration: 500, delay: 450, ease: "Back.out" });
    blobs.forEach((b, i) => this.tweens.add({ targets: b, alpha: 1, y: 96, duration: 300, delay: 800 + i * 120, yoyo: true, hold: 400 }));
    this.time.delayedCall(2100, () => this.openScene(card));
    card.setData("close", () => this.openScene(card));
    this.titleCardRef = card;
  }

  private titleCardRef?: Phaser.GameObjects.Container;

  private openScene(card: Phaser.GameObjects.Container): void {
    if (this.ready) return;
    this.ready = true;
    this.tweens.add({ targets: card, y: -H / 2 - 20, duration: 520, ease: "Cubic.in", onComplete: () => card.destroy() });
    this.time.delayedCall(420, () => this.nextLine());
  }

  private advance(): void {
    if (this.done) return;
    if (!this.ready) return this.openScene(this.titleCardRef!);
    if (this.typing) {
      // first tap finishes the sentence, second one moves on
      this.typing.remove();
      this.typing = undefined;
      this.bubbleText.setText(this.full);
      return;
    }
    this.nextLine();
  }

  private nextLine(): void {
    this.line++;
    if (this.line >= this.cut.lines.length) return this.finish();
    this.dots.forEach((d, i) => d.setFillStyle(i <= this.line ? C.source : C.starEmpty));
    this.full = this.cut.lines[this.line];
    this.bubbleText.setText("");
    this.tweens.add({ targets: this.ada, angle: { from: -4, to: 4 }, duration: 120, yoyo: true, repeat: 1, onComplete: () => this.ada.setAngle(0) });
    let n = 0;
    this.typing = this.time.addEvent({
      delay: TYPE_MS,
      repeat: this.full.length - 1,
      callback: () => {
        n++;
        this.bubbleText.setText(this.full.slice(0, n));
        if (n >= this.full.length) this.typing = undefined;
      },
    });
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    save.updateFlags((f) => {
      if (!f.seen.includes(this.id)) f.seen.push(this.id);
    });
    go(this, this.cut.next.scene, this.cut.next.data);
  }
}
