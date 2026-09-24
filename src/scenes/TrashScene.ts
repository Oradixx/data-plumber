import Phaser from "phaser";
import { activeRules, deal, multiplier, RULES, rng, timeLimit, type Deal, type Row, type RuleId } from "../core/trash.ts";
import { CH1_GOAL } from "../core/story.ts";
import { arrive, background, button, C, go, H, hex, save, text, W } from "../theme.ts";

const STATION_TEX: Record<string, string> = { filter: "st-filter", normalize: "st-normalize", dedup: "st-dedup" };
const CARD_X = W / 2;
const CARD_Y = 352;
const CARD_W = 380;
const CARD_H = 250;
const SWIPE = 110; // drag distance that counts as a decision
const LIVES = 3;

interface Mistake {
  row: Row;
  said: "keep" | "trash" | "timeout";
  why: string;
}

/**
 * Clean or Trash: rows arrive one by one, swipe right to KEEP clean ones, left to TRASH dirty
 * ones. New data-quality rules unlock as you go; 3 mistakes end the shift.
 */
export class TrashScene extends Phaser.Scene {
  // public for browser tests
  current?: Deal;
  score = 0;
  correct = 0;
  lives = LIVES;
  over = false;

  private r = rng(Date.now());
  private year = new Date().getFullYear();
  private streak = 0;
  private bestStreak = 0;
  private answered = 0;
  private rules: RuleId[] = [];
  private warehouse = new Map<string, Row>();
  private used = new Set<string>();
  private mistakes: Mistake[] = [];
  private paused = true;
  private busy = false;
  private left = 0; // ms left on this card
  private limit = 1;

  private card?: Phaser.GameObjects.Container;
  private stampKeep?: Phaser.GameObjects.Text;
  private stampTrash?: Phaser.GameObjects.Text;
  private dragFrom: number | null = null;
  private timerBar!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Text[] = [];
  private feedback!: Phaser.GameObjects.Text;
  private strip!: Phaser.GameObjects.Text;
  private chips = new Map<RuleId, Phaser.GameObjects.Container>();
  private binImg!: Phaser.GameObjects.Image;
  private houseImg!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private overlay?: Phaser.GameObjects.Container;
  private goalText!: Phaser.GameObjects.Text;

  constructor() {
    super("trash");
  }

  init(): void {
    this.r = rng(Date.now());
    this.current = undefined;
    this.score = 0;
    this.correct = 0;
    this.lives = LIVES;
    this.over = false;
    this.streak = 0;
    this.bestStreak = 0;
    this.answered = 0;
    this.rules = [];
    this.warehouse = new Map();
    this.used = new Set();
    this.mistakes = [];
    this.paused = true;
    this.busy = false;
    this.card = undefined;
    this.overlay = undefined;
    this.hearts = [];
    this.chips = new Map();
    this.dragFrom = null;
  }

  create(): void {
    background(this);
    button(this, 50, 42, "←", C.pipe, 0x3d5ad6, () => go(this, "menu"), 58, 48);
    text(this, 96, 30, "Clean or Trash", 28, hex(C.filterDark), "700").setOrigin(0, 0.5);
    this.feedback = text(this, 96, 62, "Swipe → to keep a clean row, ← to trash a dirty one.", 17, C.mutedHex, "500").setOrigin(0, 0.5);
    this.scoreText = text(this, W - 24, 28, "0", 26, C.inkHex, "700").setOrigin(1, 0.5);
    text(this, W - 24, 52, `best ${save.best("trash")}`, 13, C.mutedHex, "600").setOrigin(1, 0.5);
    for (let i = 0; i < LIVES; i++) this.hearts.push(text(this, W - 190 + i * 30, 30, "❤", 24, "#ff5d73", "700"));
    this.comboText = text(this, W - 160, 58, "", 15, "#e07f22", "700");
    this.goalText = text(this, W / 2, 170, "", 15, C.mutedHex, "700");

    // rules bar: one chip per rule, locked ones hidden behind a "?"
    RULES.forEach((rule, i) => {
      const x = 140 + i * 240;
      const g = this.add.graphics();
      const chip = this.add.container(x, 112, [g]).setSize(220, 40);
      chip.setData("g", g);
      this.chips.set(rule.id, chip);
      this.drawChip(rule.id, false);
    });

    // bin on the left, warehouse on the right
    this.binImg = this.add.image(120, CARD_Y - 10, "bin").setScale(1.5);
    text(this, 120, CARD_Y + 60, "← TRASH", 18, "#ff5d73", "700");
    this.houseImg = this.add.image(W - 120, CARD_Y - 10, "sink").setScale(1.5);
    text(this, W - 120, CARD_Y + 60, "KEEP →", 18, "#2fbf71", "700");

    this.timerBar = this.add.graphics();
    this.strip = text(this, W / 2, 530, "", 15, C.mutedHex, "600");
    button(this, W / 2 - 130, H - 52, "✗ Trash", C.bad, 0xd9485f, () => this.answer("trash"), 200, 58);
    button(this, W / 2 + 130, H - 52, "✓ Keep", C.good, 0x229a58, () => this.answer("keep"), 200, 58);

    this.sparks = this.add
      .particles(0, 0, "spark", { speed: { min: 80, max: 220 }, lifespan: 600, scale: { start: 0.9, end: 0 }, gravityY: 300, emitting: false })
      .setDepth(30);

    // input: drag the card, or arrow keys / A-D
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onDrag(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onRelease(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onRelease(p));
    const kb = this.input.keyboard;
    kb?.on("keydown-LEFT", () => this.answer("trash"));
    kb?.on("keydown-A", () => this.answer("trash"));
    kb?.on("keydown-RIGHT", () => this.answer("keep"));
    kb?.on("keydown-D", () => this.answer("keep"));

    this.updateHud();
    arrive(this);
    this.howTo();
  }

  // ------------------------------------------------------------ flow
  private howTo(): void {
    this.modal(
      "🧹 Clean or Trash",
      "Rows are streaming in from the API. You are the quality gate.\n\nSwipe → (or press →) to KEEP a clean row: it goes to the warehouse.\nSwipe ← (or press ←) to TRASH a dirty one.\n\nNew rules unlock as you go. Be quick — and 3 mistakes end your shift.",
      "Start shift",
      C.filter,
      C.filterDark,
      () => this.nextRule() || this.nextCard(),
    );
  }

  /** Unlocks the next rule if its time has come; returns true when it showed a pop-up. */
  private nextRule(): boolean {
    const now = activeRules(this.correct);
    const fresh = now.filter((r) => !this.rules.includes(r));
    if (!fresh.length) return false;
    this.rules = now;
    const rule = RULES.find((r) => r.id === fresh[0])!;
    this.drawChip(rule.id, true);
    const chip = this.chips.get(rule.id)!;
    this.tweens.add({ targets: chip, scale: { from: 1.4, to: 1 }, duration: 400, ease: "Back.out" });
    const first = this.rules.length === 1;
    this.modal(
      first ? `Rule 1 · ${rule.name}` : `NEW RULE · ${rule.name}`,
      `${rule.explain}\n\n${rule.link}`,
      "Got it!",
      C.filter,
      C.filterDark,
      () => this.nextCard(),
      STATION_TEX[rule.station],
    );
    return true;
  }

  private nextCard(): void {
    if (this.over) return;
    this.current = deal(this.r, this.rules, this.warehouse, this.used, this.year);
    this.limit = timeLimit(this.correct) * 1000;
    this.left = this.limit;
    this.busy = false;
    this.paused = false;
    this.makeCard(this.current.row);
  }

  update(_t: number, delta: number): void {
    if (this.paused || this.busy || this.over || !this.current) return;
    this.left -= delta;
    this.drawTimer();
    if (this.left <= 0) this.answer("timeout");
  }

  /** The player's decision (or a timeout). */
  answer(said: "keep" | "trash" | "timeout"): void {
    if (this.paused || this.busy || this.over || this.overlay || !this.current) return;
    this.busy = true;
    const { row, verdict } = this.current;
    const right = said !== "timeout" && (said === "keep") === verdict.keep;
    const goesRight = said === "timeout" ? verdict.keep : said === "keep";
    this.answered++;
    if (right) {
      this.correct++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      const pts = 10 * multiplier(this.streak - 1);
      this.score += pts;
      if (verdict.keep) this.warehouse.set(row.id, row);
      this.float(goesRight ? W - 120 : 120, CARD_Y - 90, `+${pts}`, goesRight ? C.good : C.bad);
      this.feedback.setText(verdict.keep ? "Clean ✓" : `Trashed ✓ — ${verdict.reason}`).setColor(verdict.keep ? "#2fbf71" : "#7a58e6");
      const chapterDone = this.correct >= CH1_GOAL && !save.flags().ch1;
      if (chapterDone) save.updateFlags((f) => (f.ch1 = true));
      this.fly(goesRight, () => (chapterDone ? this.chapterComplete() : this.nextRule() || this.nextCard()));
    } else {
      this.streak = 0;
      this.lives--;
      const why = verdict.keep
        ? said === "timeout"
          ? "Too slow! It was clean: keep it."
          : "It was clean — nothing wrong with it."
        : `${said === "timeout" ? "Too slow! " : ""}It was dirty: ${verdict.reason}.`;
      this.mistakes.push({ row, said, why });
      this.feedback.setText(`✗ ${why}`).setColor("#ff5d73");
      this.cameras.main.shake(160, 0.006);
      this.tweens.add({ targets: this.hearts[this.lives], scale: 1.6, alpha: 0.2, duration: 300 });
      this.card?.setData("wrong", true);
      // show the right answer: the card slowly goes where it belonged
      this.stamp(verdict.keep ? "keep" : "trash", 1);
      this.time.delayedCall(900, () =>
        this.fly(verdict.keep, () => {
          if (this.lives <= 0) this.gameOver();
          else this.nextRule() || this.nextCard();
        }),
      );
    }
    this.updateHud();
  }

  // ------------------------------------------------------------ card
  private makeCard(row: Row): void {
    const g = this.add.graphics();
    g.fillStyle(0xe8dccd, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2 + 8, CARD_W, CARD_H, 22);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 22);
    g.fillStyle(C.pipe, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 46, { tl: 22, tr: 22, bl: 0, br: 0 });
    const items: Phaser.GameObjects.GameObject[] = [g, text(this, 0, -CARD_H / 2 + 23, `ROW  #${row.id}`, 20, "#ffffff", "700")];
    const fields: [string, string | null][] = [
      ["email", row.email],
      ["age", row.age === null ? null : String(row.age)],
      ["country", row.country],
      ["signup", row.signup],
    ];
    fields.forEach(([k, v], i) => {
      const y = -CARD_H / 2 + 80 + i * 42;
      items.push(text(this, -CARD_W / 2 + 28, y, k, 16, C.mutedHex, "600").setOrigin(0, 0.5));
      items.push(text(this, CARD_W / 2 - 28, y, v === null ? "∅ null" : v, 20, v === null ? hex(C.nulDark) : C.inkHex, "700").setOrigin(1, 0.5));
      if (i < 3) items.push(this.add.graphics().lineStyle(1, 0xeee4d8, 1).lineBetween(-CARD_W / 2 + 24, y + 21, CARD_W / 2 - 24, y + 21));
    });
    this.stampKeep = text(this, 90, -CARD_H / 2 + 80, "KEEP", 40, "#2fbf71", "700").setAngle(-14).setAlpha(0);
    this.stampKeep.setStroke("#ffffff", 6);
    this.stampTrash = text(this, -90, -CARD_H / 2 + 80, "TRASH", 40, "#ff5d73", "700").setAngle(14).setAlpha(0);
    this.stampTrash.setStroke("#ffffff", 6);
    items.push(this.stampKeep, this.stampTrash);

    const card = this.add.container(CARD_X, CARD_Y - 260, items).setSize(CARD_W, CARD_H).setDepth(10);
    card.setInteractive({ useHandCursor: true, draggable: false });
    card.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.busy && !this.paused) this.dragFrom = p.x;
    });
    this.tweens.add({ targets: card, y: CARD_Y, duration: 260, ease: "Back.out" });
    this.card = card;
    this.drawTimer();
  }

  private onDrag(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null || !this.card || this.busy) return;
    const dx = p.x - this.dragFrom;
    this.card.x = CARD_X + dx;
    this.card.angle = dx * 0.05;
    this.stamp(dx > 0 ? "keep" : "trash", Math.min(1, Math.abs(dx) / SWIPE));
  }

  private onRelease(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    const dx = p.x - this.dragFrom;
    this.dragFrom = null;
    if (!this.card || this.busy) return;
    if (dx > SWIPE) this.answer("keep");
    else if (dx < -SWIPE) this.answer("trash");
    else {
      this.stamp("keep", 0);
      this.tweens.add({ targets: this.card, x: CARD_X, angle: 0, duration: 180, ease: "Back.out" });
    }
  }

  private stamp(which: "keep" | "trash", alpha: number): void {
    this.stampKeep?.setAlpha(which === "keep" ? alpha : 0);
    this.stampTrash?.setAlpha(which === "trash" ? alpha : 0);
  }

  private fly(right: boolean, then: () => void): void {
    const card = this.card;
    this.card = undefined;
    this.timerBar.clear();
    if (!card) return then();
    this.stamp(right ? "keep" : "trash", 1);
    const target = right ? this.houseImg : this.binImg;
    this.tweens.add({
      targets: card,
      x: target.x,
      y: target.y,
      scale: 0.12,
      angle: right ? 25 : -25,
      duration: 320,
      ease: "Cubic.in",
      onComplete: () => {
        card.destroy();
        this.tweens.add({ targets: target, scaleY: 1.7, duration: 90, yoyo: true });
        this.sparks.setParticleTint(right ? C.ok : C.bad);
        this.sparks.explode(12, target.x, target.y);
        then();
      },
    });
  }

  // ------------------------------------------------------------ hud
  private drawChip(id: RuleId, open: boolean): void {
    const chip = this.chips.get(id)!;
    const rule = RULES.find((r) => r.id === id)!;
    const g = chip.getData("g") as Phaser.GameObjects.Graphics;
    g.clear();
    g.fillStyle(open ? C.filterDark : 0xd6c8b6, 1).fillRoundedRect(-110, -16, 220, 40, 16);
    g.fillStyle(open ? C.filter : C.starEmpty, 1).fillRoundedRect(-110, -20, 220, 40, 16);
    chip.list.slice(1).forEach((o) => o.destroy());
    if (open) {
      chip.add(this.add.image(-86, 0, STATION_TEX[rule.station]).setScale(0.36));
      chip.add(text(this, -66, 0, rule.name, 16, "#ffffff", "700").setOrigin(0, 0.5));
    } else {
      chip.add(text(this, 0, 0, `🔒 rule ${RULES.indexOf(rule) + 1}`, 15, C.mutedHex, "700"));
    }
  }

  private drawTimer(): void {
    const g = this.timerBar.clear();
    if (!this.card) return;
    const w = CARD_W;
    const f = Math.max(0, this.left / this.limit);
    g.fillStyle(0xe8dccd, 1).fillRoundedRect(CARD_X - w / 2, CARD_Y + CARD_H / 2 + 18, w, 12, 6);
    g.fillStyle(f > 0.5 ? C.good : f > 0.25 ? C.dedup : C.bad, 1).fillRoundedRect(CARD_X - w / 2, CARD_Y + CARD_H / 2 + 18, Math.max(12, w * f), 12, 6);
  }

  private updateHud(): void {
    this.scoreText.setText(String(this.score));
    const m = multiplier(this.streak);
    this.comboText.setText(m > 1 ? `🔥 combo ×${m}` : "");
    const recent = [...this.warehouse.keys()].slice(-6);
    this.goalText.setText(save.flags().ch1 ? "" : `Chapter goal: ${Math.min(this.correct, CH1_GOAL)} / ${CH1_GOAL} rows sorted right`);
    this.strip.setText(recent.length ? `In the warehouse:  ${recent.map((id) => `#${id}`).join("   ")}` : "The warehouse is empty.");
  }

  private float(x: number, y: number, msg: string, color: number): void {
    const t = text(this, x, y, msg, 22, "#ffffff", "700").setDepth(35);
    t.setStroke(hex(color), 6);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private modal(
    title: string,
    body: string,
    cta: string,
    color: number,
    dark: number,
    onClose: () => void,
    icon?: string,
    alt?: { label: string; act: () => void },
  ): void {
    this.paused = true;
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.45).fillRect(0, 0, W, H);
    const cw = 600;
    const bodyText = text(this, 0, 0, body, 17, C.inkHex, "500").setOrigin(0.5, 0).setWordWrapWidth(cw - 70);
    const ch = 44 + (icon ? 66 : 0) + 30 + bodyText.height + 110;
    const card = this.add.graphics();
    card.fillStyle(dark, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    const items: Phaser.GameObjects.GameObject[] = [card];
    let y = -ch / 2 + 44;
    if (icon) {
      items.push(this.add.image(0, y + 6, icon).setScale(0.9));
      y += 66;
    }
    items.push(text(this, 0, y, title, 28, hex(dark), "700"));
    items.push(bodyText.setY(y + 30));
    const box = this.add.container(W / 2, H / 2, items).setScale(0.8);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(60);
    const close = (then: () => void) => () => {
      this.overlay?.destroy();
      this.overlay = undefined;
      then();
    };
    box.add(button(this, alt ? 120 : 0, ch / 2 - 40, cta, color, dark, close(onClose), alt ? 230 : 200, 52));
    if (alt) box.add(button(this, -130, ch / 2 - 40, alt.label, 0xc9bfd6, 0xa89cb8, close(alt.act), 210, 52));
    this.tweens.add({ targets: box, scale: 1, duration: 260, ease: "Back.out" });
  }

  /** Chapter 1 goal reached: go on with the story, or keep sorting for a high score. */
  private chapterComplete(): void {
    this.sparks.setParticleTint(C.star);
    this.sparks.explode(40, W / 2, 200);
    this.modal(
      "⭐ Chapter 1 complete!",
      `${CH1_GOAL} rows sorted by hand, all four quality checks mastered. Ada has something better to show you…`,
      "Chapter 2 ▶",
      C.good,
      0x229a58,
      () => go(this, save.flags().seen.includes("ch2") ? "level" : "story", save.flags().seen.includes("ch2") ? { index: 0 } : { id: "ch2" }),
      undefined,
      { label: "Keep sorting", act: () => this.nextRule() || this.nextCard() },
    );
  }

  private gameOver(): void {
    this.over = true;
    this.paused = true;
    const record = save.setBest("trash", this.score);
    const dim = this.add.graphics().fillStyle(0x3a2e4f, 0.5).fillRect(0, 0, W, H);
    const cw = 660;
    const ch = 540;
    const card = this.add.graphics();
    card.fillStyle(0xe8dccd, 1).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 28);
    card.fillStyle(0xffffff, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 28);
    const top = -ch / 2;
    const accuracy = this.answered ? Math.round((100 * this.correct) / this.answered) : 0;
    const items: Phaser.GameObjects.GameObject[] = [
      card,
      text(this, 0, top + 44, "Shift over!", 36, hex(C.filterDark), "700"),
      text(this, 0, top + 94, `${this.score} pts${record ? "  ·  NEW RECORD! 🎉" : ""}`, 26, record ? "#e0a800" : C.inkHex, "700"),
      text(this, 0, top + 130, `${this.correct} rows sorted right  ·  ${accuracy}% accuracy  ·  best streak ${this.bestStreak}`, 16, C.mutedHex, "600"),
      text(this, -cw / 2 + 36, top + 168, "What went wrong:", 16, C.inkHex, "700").setOrigin(0, 0.5),
    ];
    this.mistakes.slice(-3).forEach((m, i) => {
      items.push(text(this, -cw / 2 + 36, top + 196 + i * 28, `#${m.row.id} — ${m.why}`, 15, "#c93c90", "600").setOrigin(0, 0.5));
    });
    const kc = this.add.graphics().fillStyle(0xf3efff, 1).fillRoundedRect(-cw / 2 + 30, top + 290, cw - 60, 150, 18);
    items.push(kc, text(this, 0, top + 314, "💡 The 4 classic data-quality checks", 19, "#7a58e6", "700"));
    items.push(
      text(
        this,
        0,
        top + 340,
        "Completeness (no empty values), validity (possible values), conformity (right formats) and uniqueness (no duplicates). Real pipelines don't sort rows by hand: they run these as automated tests — for example not_null and unique tests in dbt.",
        15,
        C.inkHex,
        "500",
      )
        .setOrigin(0.5, 0)
        .setWordWrapWidth(cw - 100),
    );
    items.push(
      button(this, -130, top + ch - 46, "Map", 0xc9bfd6, 0xa89cb8, () => go(this, "menu"), 150, 50),
      button(this, 100, top + ch - 46, "Play again", C.filter, C.filterDark, () => this.scene.restart(), 210, 50),
    );
    const box = this.add.container(W / 2, H / 2 + 30, items).setAlpha(0);
    this.overlay = this.add.container(0, 0, [dim, box]).setDepth(70);
    this.tweens.add({ targets: box, y: H / 2, alpha: 1, duration: 300, ease: "Back.out" });
    if (record) {
      this.sparks.setParticleTint(C.star);
      this.sparks.explode(40, W / 2, 120);
    }
  }
}
