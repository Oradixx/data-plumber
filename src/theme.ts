import Phaser from "phaser";

export const W = 1000;
export const H = 680;
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
    .text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight, align: "center" })
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
};
