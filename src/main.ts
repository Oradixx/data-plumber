import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.ts";
import { LevelScene } from "./scenes/LevelScene.ts";
import { MenuScene } from "./scenes/MenuScene.ts";
import { TrashScene } from "./scenes/TrashScene.ts";
import { C, H, W } from "./theme.ts";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: C.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, LevelScene, TrashScene],
});

// Handy for debugging and browser tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
