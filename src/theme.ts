import Phaser from "phaser";
import { emptyFlags, type StoryFlags } from "./core/story.ts";

export const W = 1000;
export const H = 680;

/**
 * Render scale. The game is designed on a 1000×680 board, but the canvas is rendered R times
 * bigger (cameras zoom by R, textures and texts are baked at R×) so it stays sharp on big and
 * Retina screens instead of being stretched. R follows the screen: 1 on a small window, up to 3.
 */
export const R = (() => {
  if (typeof window === "undefined") return 1;
  const fit = Math.min(window.innerWidth / W, window.innerHeight / H);
  return Math.max(1, Math.min(3, Math.ceil(fit * (window.devicePixelRatio || 1) - 0.05)));
})();
export const FONT = '"Fredoka", "Nunito", system-ui, sans-serif';

export const C = {
  bg: 0xfff4e6,
  bgDots: 0xffe7cc,
  ink: 0x3a2e4f,
  inkHex: "#3a2e4f",
  mutedHex: "#8a7f9c",
  tile: 0xffffff,
  tileShade: 0xf1e3d3,
  crate: 0xd9a86c,
  crateDark: 0xb07f45,
  pipe: 0x5b7cfa,
  pipeLight: 0x9fb4ff,
  source: 0xff6f91,
  sourceDark: 0xd94f73,
  sink: 0x2ec4b6,
  sinkDark: 0x1f9b8f,
  ok: 0x3ddc97,
  okDark: 0x25b877,
  nul: 0xb9b6c9,
  nulDark: 0x9491a8,
  filter: 0x9b7bff,
  filterDark: 0x7a58e6,
  dedup: 0xff9f45,
  dedupDark: 0xe07f22,
  parse: 0x4cc9f0,
  parseDark: 0x2aa3cc,
  normalize: 0xf15bb5,
  normalizeDark: 0xc93c90,
  mask: 0x3a2e4f,
  maskDark: 0x221a30,
  pad: 0xffd166,
  padDark: 0xe0ac3c,
  zone: 0xffd6de,
  zoneStripe: 0xff9fb2,
  box: 0xc98f53,
  boxDark: 0x9c6a36,
  piiBadge: 0x4361ee,
  good: 0x2fbf71,
  bad: 0xff5d73,
  star: 0xffc93c,
  starEmpty: 0xe8dccd,
  white: 0xffffff,
};

export const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size = 24,
  color = C.inkHex,
  weight = "600",
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight, align: "center", resolution: R })
    .setOrigin(0.5);
}

/** A chunky, bouncy button: rounded body + darker "3D" base + label. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color: number,
  dark: number,
  onClick: () => void,
  width = 150,
  height = 54,
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    g.fillStyle(dark, 1).fillRoundedRect(-width / 2, -height / 2 + 6, width, height, 18);
    g.fillStyle(color, 1).fillRoundedRect(-width / 2, -height / 2 + (pressed ? 5 : 0), width, height, 18);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-width / 2 + 10, -height / 2 + (pressed ? 9 : 4), width - 20, 10, 5);
  };
  draw(false);
  const t = text(scene, 0, 0, label, 22, "#ffffff", "700");
  const box = scene.add.container(x, y, [g, t]).setSize(width, height + 6);
  box.setInteractive({ useHandCursor: true });
  box.on("pointerover", () => scene.tweens.add({ targets: box, scale: 1.06, duration: 120 }));
  box.on("pointerout", () => {
    draw(false);
    t.y = 0;
    scene.tweens.add({ targets: box, scale: 1, duration: 120 });
  });
  box.on("pointerdown", () => {
    draw(true);
    t.y = 5;
  });
  box.on("pointerup", () => {
    draw(false);
    t.y = 0;
    onClick();
  });
  return box;
}

/** Polka-dot factory floor background. */
export function background(scene: Phaser.Scene): void {
  // every scene draws in 1000×680 "board" units; the camera maps them to the R× canvas
  scene.cameras.main.setZoom(R).centerOn(W / 2, H / 2);
  scene.cameras.main.setBackgroundColor(C.bg);
  const g = scene.add.graphics().setDepth(-10);
  g.fillStyle(C.bgDots, 1);
  for (let y = 10; y < H; y += 34) {
    for (let x = (y / 34) % 2 ? 27 : 10; x < W; x += 34) g.fillCircle(x, y, 3);
  }
}

// ---- tiny progress store (guarded: storage can be unavailable)
export const save = {
  stars(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem("dp.stars") ?? "{}");
    } catch {
      return {};
    }
  },
  setStars(levelId: string, stars: number): void {
    const all = save.stars();
    all[levelId] = Math.max(all[levelId] ?? 0, stars);
    try {
      localStorage.setItem("dp.stars", JSON.stringify(all));
    } catch {
      /* ignore */
    }
  },
  best(game: string): number {
    try {
      return Number(localStorage.getItem(`dp.best.${game}`) ?? 0) || 0;
    } catch {
      return 0;
    }
  },
  flags(): StoryFlags {
    try {
      return { ...emptyFlags(), ...JSON.parse(localStorage.getItem("dp.story") ?? "{}") };
    } catch {
      return emptyFlags();
    }
  },
  updateFlags(change: (f: StoryFlags) => void): StoryFlags {
    const f = save.flags();
    change(f);
    try {
      localStorage.setItem("dp.story", JSON.stringify(f));
    } catch {
      /* ignore */
    }
    return f;
  },
  /** Stores the score if it beats the best one; returns true for a new record. */
  setBest(game: string, score: number): boolean {
    if (score <= save.best(game)) return false;
    try {
      localStorage.setItem(`dp.best.${game}`, String(score));
    } catch {
      /* ignore */
    }
    return true;
  },
};

// ---- scene transitions: a big pipe sweeps across the screen, blobs riding on it
let wipePending = false;

function pipeBand(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x3d5ad6, 1).fillRect(-W / 2 - 40, -H / 2, W + 80, H);
  g.fillStyle(C.pipe, 1).fillRect(-W / 2 - 40, -H / 2 + 24, W + 80, H - 48);
  g.fillStyle(C.pipeLight, 1).fillRect(-W / 2 - 40, -H / 2 + 60, W + 80, 26);
  const kids: Phaser.GameObjects.GameObject[] = [g];
  ["blob-ok", "blob-null", "blob-ok", "blob-ok"].forEach((k, i) => kids.push(scene.add.image(-270 + i * 180, 40, k).setScale(1.6)));
  return scene.add.container(W / 2, H / 2, kids).setDepth(1000);
}

/** Leave the current scene with a pipe wipe, then start `key`. */
export function go(scene: Phaser.Scene, key: string, data?: object): void {
  if (scene.data.get("leaving")) return;
  scene.data.set("leaving", true);
  scene.input.enabled = false;
  const band = pipeBand(scene);
  band.x = -W / 2 - 60;
  scene.tweens.add({
    targets: band,
    x: W / 2,
    duration: 380,
    ease: "Cubic.in",
    onComplete: () => {
      wipePending = true;
      scene.scene.start(key, data);
    },
  });
}

/** Call at the end of create(): finishes the wipe (or fades in when there was none). */
export function arrive(scene: Phaser.Scene): void {
  scene.data.set("leaving", false);
  scene.input.enabled = true;
  if (!wipePending) {
    scene.cameras.main.fadeIn(250, 255, 244, 230);
    return;
  }
  wipePending = false;
  const band = pipeBand(scene);
  scene.tweens.add({ targets: band, x: W * 1.5 + 60, duration: 420, ease: "Cubic.out", onComplete: () => band.destroy() });
}
