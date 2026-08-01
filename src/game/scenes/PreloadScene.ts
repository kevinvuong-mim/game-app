import Phaser from 'phaser';

import { t } from '@platform/ui';
import {
  soundManager,
  SOUND_POP_KEY,
  SOUND_BGM_KEY,
  SOUND_SWOOSH_KEY,
  SOUND_REVERSE_KEY,
  SOUND_COMBINE_KEY,
  SOUND_COIN_DROP_KEY,
  SOUND_DISAPPEAR_KEY,
  SOUND_CHANGE_TURNS_KEY,
  SOUND_INCREASE_SIZE_KEY,
} from '@platform/ui/audio/SoundManager';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { eventBus, getBootNavigationTarget } from '@platform/core/events';
import { FRUIT_TYPES, fruitImagePath, fruitTextureKey } from '@game/fruits';

type ImageAsset = { key: string; path: string };
type FallbackTexture = { key: string; width: number; height: number; color: number };

const FRUIT_IMAGE_ASSETS: ImageAsset[] = FRUIT_TYPES.map((_, level) => ({
  key: fruitTextureKey(level),
  path: fruitImagePath(level),
}));

const IMAGE_ASSETS: ImageAsset[] = [
  ...FRUIT_IMAGE_ASSETS,
  { key: 'coin-icon', path: '/assets/images/coin.png' },
  { key: 'chest-icon', path: '/assets/images/chest.png' },
  { key: 'shop-banner', path: '/assets/images/banner.png' },
  { key: 'back-icon', path: '/assets/images/back-icon.png' },
  { key: 'quit-icon', path: '/assets/images/quit-icon.png' },
  { key: 'shop-icon', path: '/assets/images/shop-icon.png' },
  { key: 'plus-icon', path: '/assets/images/plus-icon.png' },
  {
    key: 'leaderboard-button-background',
    path: '/assets/images/leaderboard-button-background.png',
  },
  { key: 'close-icon', path: '/assets/images/close-icon.png' },
  { key: 'shop-item-1', path: '/assets/images/shop-item-1.png' },
  { key: 'shop-item-2', path: '/assets/images/shop-item-2.png' },
  { key: 'shop-item-3', path: '/assets/images/shop-item-3.png' },
  { key: 'shop-item-4', path: '/assets/images/shop-item-4.png' },
  { key: 'shop-item-5', path: '/assets/images/shop-item-5.png' },
  { key: 'no-ads-icon', path: '/assets/images/no-ads-icon.png' },
  { key: 'speaker-icon', path: '/assets/images/speaker-icon.png' },
  { key: 'checked-icon', path: '/assets/images/checked-icon.png' },
  { key: 'firework-icon', path: '/assets/images/firework-icon.png' },
  { key: 'missions-icon', path: '/assets/images/missions-icon.png' },
  { key: 'how-to-play-icon', path: '/assets/images/how-to-play.png' },
  { key: 'mission-item-1', path: '/assets/images/mission-item-1.png' },
  { key: 'mission-item-2', path: '/assets/images/mission-item-2.png' },
  { key: 'mission-item-3', path: '/assets/images/mission-item-3.png' },
  { key: 'mission-item-4', path: '/assets/images/mission-item-4.png' },
  { key: 'mission-item-5', path: '/assets/images/mission-item-5.png' },
  { key: 'mission-item-6', path: '/assets/images/mission-item-6.png' },
  { key: 'gameover-banner', path: '/assets/images/gameover-banner.png' },
  { key: 'glass-container', path: '/assets/images/glass-container.png' },
  { key: 'musical-note-icon', path: '/assets/images/musical-note-icon.png' },
  { key: 'golden-crown-icon', path: '/assets/images/golden-crown-icon.png' },
  { key: 'silver-crown-icon', path: '/assets/images/silver-crown-icon.png' },
  { key: 'bronze-crown-icon', path: '/assets/images/bronze-crown-icon.png' },
  { key: 'daily-reward-icon', path: '/assets/images/daily-reward-icon.png' },
  { key: 'language-globe-icon', path: '/assets/images/language-globe-icon.png' },
  { key: 'watermelon-character', path: '/assets/images/watermelon-character.png' },
  { key: 'play-button-background', path: '/assets/images/play-button-background.png' },
  { key: 'home-button-background', path: '/assets/images/home-button-background.png' },
  { key: 'share-button-background', path: '/assets/images/share-button-background.png' },
  { key: 'general-background-image', path: '/assets/images/general-background-image.webp' },
  { key: 'gameover-background-image', path: '/assets/images/gameover-background-image.webp' },
  { key: 'settings-button-background', path: '/assets/images/settings-button-background.png' },
  { key: 'best-score-background-image', path: '/assets/images/best-score-background-image.png' },
];

const FALLBACK_TEXTURES: FallbackTexture[] = [
  { key: 'back-icon', width: 72, height: 72, color: 0x3cb043 },
  { key: 'quit-icon', width: 72, height: 72, color: 0xc62828 },
  { key: 'coin-icon', width: 48, height: 48, color: 0xffd700 },
  { key: 'plus-icon', width: 48, height: 48, color: 0x3cb043 },
  { key: 'shop-icon', width: 80, height: 82, color: 0x4a90d9 },
  { key: 'close-icon', width: 72, height: 72, color: 0x3cb043 },
  { key: 'shop-item-1', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-2', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-3', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-4', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-5', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-banner', width: 360, height: 80, color: 0xc62828 },
  { key: 'checked-icon', width: 48, height: 48, color: 0x3cb043 },
  { key: 'chest-icon', width: 256, height: 160, color: 0xc62828 },
  { key: 'speaker-icon', width: 75, height: 72, color: 0x3cb043 },
  { key: 'missions-icon', width: 80, height: 82, color: 0x4a90d9 },
  { key: 'no-ads-icon', width: 126, height: 129, color: 0xc62828 },
  { key: 'mission-item-1', width: 96, height: 96, color: 0xffd700 },
  { key: 'mission-item-2', width: 96, height: 96, color: 0xff6b6b },
  { key: 'mission-item-3', width: 96, height: 96, color: 0x4a90d9 },
  { key: 'mission-item-4', width: 96, height: 96, color: 0x3cb043 },
  { key: 'mission-item-5', width: 96, height: 96, color: 0xffc107 },
  { key: 'mission-item-6', width: 96, height: 96, color: 0x9b59b6 },
  { key: 'firework-icon', width: 120, height: 116, color: 0xff9800 },
  { key: 'how-to-play-icon', width: 80, height: 80, color: 0x3cb043 },
  { key: 'gameover-banner', width: 400, height: 313, color: 0xc62828 },
  { key: 'musical-note-icon', width: 81, height: 95, color: 0x3cb043 },
  { key: 'golden-crown-icon', width: 48, height: 48, color: 0xf5c518 },
  { key: 'silver-crown-icon', width: 48, height: 48, color: 0xc0c7d1 },
  { key: 'bronze-crown-icon', width: 48, height: 48, color: 0xd4894a },
  { key: 'daily-reward-icon', width: 80, height: 82, color: 0x4a90d9 },
  { key: 'glass-container', width: 479, height: 592, color: 0x88aacc },
  { key: 'language-globe-icon', width: 64, height: 64, color: 0x3cb043 },
  { key: 'home-background-image', width: 16, height: 16, color: 0x7cbc3a },
  { key: 'watermelon-character', width: 255, height: 168, color: 0x3cb043 },
  { key: 'play-button-background', width: 256, height: 78, color: 0x4a90d9 },
  { key: 'home-button-background', width: 265, height: 98, color: 0x8e44ad },
  { key: 'general-background-image', width: 16, height: 16, color: 0x16213e },
  { key: 'share-button-background', width: 265, height: 98, color: 0xe67e22 },
  { key: 'gameover-background-image', width: 16, height: 16, color: 0x16213e },
  { key: 'settings-button-background', width: 256, height: 78, color: 0x4a90d9 },
  { key: 'best-score-background-image', width: 265, height: 97, color: 0xe74c3c },
  { key: 'leaderboard-button-background', width: 256, height: 78, color: 0x4a90d9 },
];

const TRACK_PAD = 5;
const BAR_WIDTH = 420;
const BAR_HEIGHT = 28;
const BAR_RADIUS = 14;
const FILL_COLORS = {
  rim: 0xfff6d8,
  track: 0x2f4a1c,
  shine: 0xffffff,
  rimEdge: 0xc9a227,
  fillHot: 0xffe566,
  fillWarm: 0xffb020,
  trackInner: 0x1a2e10,
};
const PRELOAD_DELAY_MS = 0;

export class PreloadScene extends Phaser.Scene {
  private progress = 0;
  private statusText!: Phaser.GameObjects.Text;
  private shine!: Phaser.GameObjects.Rectangle;
  private fillGfx!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    this.buildLoadingUi();

    this.load.on('progress', (value: number) => {
      this.setProgress(value);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[Assets] Missing starter asset: ${file.key}`);
    });

    for (const image of IMAGE_ASSETS) {
      this.load.image(image.key, image.path);
    }

    this.load.audio(SOUND_POP_KEY, '/assets/audio/pop.mp3');
    this.load.audio(SOUND_SWOOSH_KEY, '/assets/audio/swoosh.mp3');
    this.load.audio(SOUND_COMBINE_KEY, '/assets/audio/combine.mp3');
    this.load.audio(SOUND_REVERSE_KEY, '/assets/audio/reverse.mp3');
    this.load.audio(SOUND_COIN_DROP_KEY, '/assets/audio/coin-drop.mp3');
    this.load.audio(SOUND_DISAPPEAR_KEY, '/assets/audio/disappear.mp3');
    this.load.audio(SOUND_BGM_KEY, '/assets/audio/background-music.mp3');
    this.load.audio(SOUND_CHANGE_TURNS_KEY, '/assets/audio/change-turns.mp3');
    this.load.audio(SOUND_INCREASE_SIZE_KEY, '/assets/audio/increase-size.mp3');
  }

  create(): void {
    for (const texture of FALLBACK_TEXTURES) {
      this.ensureFallbackTexture(texture.key, texture.width, texture.height, texture.color);
    }

    this.setProgress(1);

    this.time.delayedCall(PRELOAD_DELAY_MS, () => {
      const target = getBootNavigationTarget();

      eventBus.emit('boot:preload-complete', undefined);
      soundManager.syncMusic();

      // Must transition from this scene — game.scene.start() would leave Preload visible.
      this.scene.start(target.sceneKey, target.data);
    });
  }

  private buildLoadingUi(): void {
    const { width, height } = this.cameras.main;
    const centerX = width / 2;

    this.addBackground(width, height);

    // Soft bottom wash so the bar reads on bright grass without a heavy card.
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(0x1a2e10, 0.28);
    wash.fillEllipse(centerX, height * 0.78, width * 0.92, height * 0.28);

    const barCenterY = height * 0.77;
    const shell = this.add.container(centerX, barCenterY).setDepth(2).setAlpha(0).setScale(0.92);

    const rim = this.add.graphics();
    rim.fillStyle(FILL_COLORS.rimEdge, 1);
    rim.fillRoundedRect(
      -BAR_WIDTH / 2 - TRACK_PAD - 2,
      -BAR_HEIGHT / 2 - TRACK_PAD - 2,
      BAR_WIDTH + (TRACK_PAD + 2) * 2,
      BAR_HEIGHT + (TRACK_PAD + 2) * 2,
      BAR_RADIUS + TRACK_PAD + 2
    );
    rim.fillStyle(FILL_COLORS.rim, 1);
    rim.fillRoundedRect(
      -BAR_WIDTH / 2 - TRACK_PAD,
      -BAR_HEIGHT / 2 - TRACK_PAD,
      BAR_WIDTH + TRACK_PAD * 2,
      BAR_HEIGHT + TRACK_PAD * 2,
      BAR_RADIUS + TRACK_PAD
    );

    const track = this.add.graphics();
    track.fillStyle(FILL_COLORS.track, 1);
    track.fillRoundedRect(-BAR_WIDTH / 2, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS);
    track.fillStyle(FILL_COLORS.trackInner, 0.55);
    track.fillRoundedRect(
      -BAR_WIDTH / 2 + 3,
      -BAR_HEIGHT / 2 + 3,
      BAR_WIDTH - 6,
      BAR_HEIGHT - 6,
      BAR_RADIUS - 3
    );

    this.fillGfx = this.add.graphics();
    this.shine = this.add
      .rectangle(-BAR_WIDTH / 2, 0, 36, BAR_HEIGHT - 8, FILL_COLORS.shine, 0.35)
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.statusText = this.add
      .text(0, -52, t('common.loading'), {
        fontFamily: FREDOKA_FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#fffdf5',
        stroke: '#2a4018',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.percentText = this.add
      .text(0, 44, '0%', {
        fontFamily: FREDOKA_FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#fff8dc',
        stroke: '#2a4018',
        strokeThickness: 7,
      })
      .setOrigin(0.5);

    shell.add([this.statusText, rim, track, this.fillGfx, this.shine, this.percentText]);

    this.tweens.add({
      targets: shell,
      alpha: 1,
      scale: 1,
      duration: 420,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: shell,
      y: barCenterY - 5,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.setProgress(0);
  }

  private addBackground(width: number, height: number): void {
    if (this.textures.exists('home-background-image')) {
      const bg = this.add.image(width / 2, height / 2, 'home-background-image');
      const scale = Math.max(width / bg.width, height / bg.height);
      bg.setScale(scale).setDepth(0);
      return;
    }

    this.cameras.main.setBackgroundColor(0x7cbc3a);
  }

  private setProgress(value: number): void {
    this.progress = Phaser.Math.Clamp(value, 0, 1);
    this.drawFill(this.progress);

    if (this.percentText) {
      this.percentText.setText(`${Math.round(this.progress * 100)}%`);
    }
  }

  private drawFill(progress: number): void {
    if (!this.fillGfx) return;

    this.fillGfx.clear();
    const innerW = BAR_WIDTH - 6;
    const innerH = BAR_HEIGHT - 6;
    const fillW = innerW * progress;
    if (fillW <= 0.5) {
      this.shine?.setVisible(false);
      return;
    }

    const x = -BAR_WIDTH / 2 + 3;
    const y = -BAR_HEIGHT / 2 + 3;
    const radius = Math.min(BAR_RADIUS - 3, fillW / 2);

    this.fillGfx.fillStyle(FILL_COLORS.fillWarm, 1);
    this.fillGfx.fillRoundedRect(x, y, fillW, innerH, radius);

    // Top highlight stripe for a candy-like fill.
    this.fillGfx.fillStyle(FILL_COLORS.fillHot, 0.55);
    this.fillGfx.fillRoundedRect(x + 2, y + 2, Math.max(0, fillW - 4), innerH * 0.38, radius * 0.6);

    this.shine.setVisible(true);
    const shineX = x + Math.max(0, fillW - 40);
    this.shine.setPosition(shineX, 0);
    this.shine.width = Math.min(36, fillW * 0.35);
  }

  private ensureFallbackTexture(key: string, width: number, height: number, color: number): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
