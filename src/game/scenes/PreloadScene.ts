import Phaser from 'phaser';

import {
  soundManager,
  SOUND_POP_KEY,
  SOUND_BGM_KEY,
  SOUND_COMBINE_KEY,
  SOUND_COIN_DROP_KEY,
} from '@platform/ui/audio/SoundManager';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { t, navigationService } from '@platform/ui';
import {
  MAP_CARD_COUNTS,
  cardTextureKey,
  cardTexturePath,
  mapBackgroundKey,
  mapBackgroundPath,
} from '@game/campaign/mapConfig';

type ImageAsset = { key: string; path: string };
type FallbackTexture = { key: string; width: number; height: number; color: number };

const MAP_IMAGE_ASSETS: ImageAsset[] = MAP_CARD_COUNTS.flatMap((cardCount, index) => {
  const mapId = index + 1;
  const assets: ImageAsset[] = [{ key: mapBackgroundKey(mapId), path: mapBackgroundPath(mapId) }];
  for (let objectIndex = 1; objectIndex <= cardCount; objectIndex += 1) {
    assets.push({
      key: cardTextureKey(mapId, objectIndex),
      path: cardTexturePath(mapId, objectIndex),
    });
  }
  return assets;
});

const IMAGE_ASSETS: ImageAsset[] = [
  ...MAP_IMAGE_ASSETS,
  { key: 'card-front', path: '/assets/images/card-front.png' },
  { key: 'card-back', path: '/assets/images/card-back.png' },
  { key: 'box-active', path: '/assets/images/box-active.png' },
  { key: 'box-inactive', path: '/assets/images/box-inactive.png' },
  { key: 'star-active', path: '/assets/images/star-active.png' },
  { key: 'star-inactive', path: '/assets/images/star-inactive.png' },
  { key: 'star-grey', path: '/assets/images/star-grey.png' },
  { key: 'coin-icon', path: '/assets/images/coin.png' },
  { key: 'chest-icon', path: '/assets/images/chest.png' },
  { key: 'shop-banner', path: '/assets/images/banner.png' },
  { key: 'back-icon', path: '/assets/images/back-icon.png' },
  { key: 'trophy-icon', path: '/assets/images/trophy-icon.png' },
  { key: 'quit-icon', path: '/assets/images/quit-icon.png' },
  { key: 'shop-icon', path: '/assets/images/shop-icon.png' },
  {
    key: 'circle-button-background',
    path: '/assets/images/circle-button-background.png',
  },
  { key: 'plus-icon', path: '/assets/images/plus-icon.png' },
  {
    key: 'leaderboard-button-background',
    path: '/assets/images/leaderboard-button-background.png',
  },
  { key: 'close-icon', path: '/assets/images/close-icon.png' },
  { key: 'shop-item-1', path: '/assets/images/shop-item-1.png' },
  { key: 'shop-item-2', path: '/assets/images/shop-item-2.png' },
  { key: 'shop-item-3', path: '/assets/images/shop-item-3.png' },
  { key: 'no-ads-icon', path: '/assets/images/no-ads-icon.png' },
  { key: 'speaker-icon', path: '/assets/images/speaker-icon.png' },
  { key: 'checked-icon', path: '/assets/images/checked-icon.png' },
  { key: 'missions-icon', path: '/assets/images/missions-icon.png' },
  { key: 'mission-item-1', path: '/assets/images/mission-item-1.png' },
  { key: 'mission-item-2', path: '/assets/images/mission-item-2.png' },
  { key: 'mission-item-3', path: '/assets/images/mission-item-3.png' },
  { key: 'mission-item-4', path: '/assets/images/mission-item-4.png' },
  { key: 'mission-item-5', path: '/assets/images/mission-item-5.png' },
  { key: 'mission-item-6', path: '/assets/images/mission-item-6.png' },
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
  { key: 'blue-button-background', path: '/assets/images/blue-button-background.png' },
  { key: 'settings-button-background', path: '/assets/images/settings-button-background.png' },
];

const FALLBACK_TEXTURES: FallbackTexture[] = [
  { key: 'back-icon', width: 72, height: 72, color: 0x3cb043 },
  { key: 'trophy-icon', width: 72, height: 72, color: 0xf5c518 },
  { key: 'quit-icon', width: 72, height: 72, color: 0xc62828 },
  { key: 'coin-icon', width: 48, height: 48, color: 0xffd700 },
  { key: 'plus-icon', width: 48, height: 48, color: 0x3cb043 },
  { key: 'shop-icon', width: 80, height: 82, color: 0x4a90d9 },
  { key: 'circle-button-background', width: 128, height: 128, color: 0xf5c518 },
  { key: 'close-icon', width: 72, height: 72, color: 0x3cb043 },
  { key: 'shop-item-1', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-2', width: 96, height: 96, color: 0xffd700 },
  { key: 'shop-item-3', width: 96, height: 96, color: 0xffd700 },
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
  { key: 'musical-note-icon', width: 81, height: 95, color: 0x3cb043 },
  { key: 'golden-crown-icon', width: 48, height: 48, color: 0xf5c518 },
  { key: 'silver-crown-icon', width: 48, height: 48, color: 0xc0c7d1 },
  { key: 'bronze-crown-icon', width: 48, height: 48, color: 0xd4894a },
  { key: 'daily-reward-icon', width: 80, height: 82, color: 0x4a90d9 },
  { key: 'language-globe-icon', width: 64, height: 64, color: 0x3cb043 },
  { key: 'card-front', width: 128, height: 128, color: 0xf5e6c8 },
  { key: 'card-back', width: 128, height: 128, color: 0x2a5cad },
  { key: 'box-active', width: 128, height: 128, color: 0xe8c878 },
  { key: 'box-inactive', width: 128, height: 128, color: 0x8a8a8a },
  { key: 'star-active', width: 48, height: 48, color: 0xffd54a },
  { key: 'star-inactive', width: 48, height: 48, color: 0xc4a05a },
  { key: 'star-grey', width: 48, height: 48, color: 0x9e9e9e },
  { key: 'home-background-image', width: 16, height: 16, color: 0x7cbc3a },
  { key: 'watermelon-character', width: 255, height: 168, color: 0x3cb043 },
  { key: 'play-button-background', width: 256, height: 78, color: 0x4a90d9 },
  { key: 'home-button-background', width: 265, height: 98, color: 0x8e44ad },
  { key: 'general-background-image', width: 16, height: 16, color: 0x16213e },
  { key: 'share-button-background', width: 265, height: 98, color: 0xe67e22 },
  { key: 'gameover-background-image', width: 16, height: 16, color: 0x16213e },
  { key: 'blue-button-background', width: 256, height: 78, color: 0x4a90d9 },
  { key: 'leaderboard-button-background', width: 256, height: 78, color: 0x4a90d9 },
  { key: 'settings-button-background', width: 256, height: 78, color: 0xe67e22 },
];

const CARD_COUNT = 8;
const CARD_W = 44;
const CARD_H = 60;
const CARD_GAP = 8;
const CARD_RADIUS = 8;
const PRELOAD_CARD_BACK = 'preload-card-back';
const PRELOAD_CARD_FRONT = 'preload-card-front';
const PRELOAD_DELAY_MS = 0;

export class PreloadScene extends Phaser.Scene {
  private progress = 0;
  private cards: Phaser.GameObjects.Image[] = [];
  private statusText!: Phaser.GameObjects.Text;
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
    this.load.audio(SOUND_COMBINE_KEY, '/assets/audio/combine.mp3');
    this.load.audio(SOUND_COIN_DROP_KEY, '/assets/audio/coin-drop.mp3');
    this.load.audio(SOUND_BGM_KEY, '/assets/audio/background-music.mp3');
  }

  create(): void {
    for (const texture of FALLBACK_TEXTURES) {
      this.ensureFallbackTexture(texture.key, texture.width, texture.height, texture.color);
    }

    this.setProgress(1);

    this.time.delayedCall(PRELOAD_DELAY_MS, () => {
      const pending = navigationService.peekPendingNavigation();
      const sceneKey = pending?.sceneKey ?? 'Home';
      const data = pending?.data;

      eventBus.emit('boot:preload-complete', undefined);
      soundManager.syncMusic();

      // Must transition from this scene — game.scene.start() would leave Preload visible.
      this.scene.start(sceneKey, data);
    });
  }

  private buildLoadingUi(): void {
    const { width, height } = this.cameras.main;
    const centerX = width / 2;

    this.addBackground(width, height);
    this.createCardTextures();

    const rowY = height * 0.77;
    const shell = this.add.container(centerX, rowY).setDepth(2).setAlpha(0).setScale(0.92);
    const rowWidth = CARD_COUNT * CARD_W + (CARD_COUNT - 1) * CARD_GAP;

    this.statusText = this.add
      .text(0, -CARD_H / 2 - 36, t('common.loading'), {
        fontFamily: FREDOKA_FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#fffdf5',
        stroke: '#1a2a4a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.cards = [];
    for (let i = 0; i < CARD_COUNT; i += 1) {
      const x = -rowWidth / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const card = this.add.image(x, 0, PRELOAD_CARD_BACK).setData('flipped', false);
      this.cards.push(card);
    }

    this.percentText = this.add
      .text(0, CARD_H / 2 + 36, '0%', {
        fontFamily: FREDOKA_FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#fff8dc',
        stroke: '#1a2a4a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    shell.add([this.statusText, ...this.cards, this.percentText]);

    this.tweens.add({
      targets: shell,
      alpha: 1,
      scale: 1,
      duration: 360,
      ease: 'Back.Out',
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
    this.revealCards(this.progress >= 1 ? CARD_COUNT : Math.floor(this.progress * CARD_COUNT));

    if (this.percentText) {
      this.percentText.setText(`${Math.round(this.progress * 100)}%`);
    }
  }

  private revealCards(count: number): void {
    let delay = 0;
    for (let i = 0; i < count; i += 1) {
      const card = this.cards[i];
      if (!card || card.getData('flipped')) continue;
      this.flipCard(card, delay);
      delay += 50;
    }
  }

  private flipCard(card: Phaser.GameObjects.Image, delay: number): void {
    card.setData('flipped', true);
    this.tweens.add({
      targets: card,
      scaleX: 0,
      duration: 80,
      delay,
      ease: 'Sine.In',
      onComplete: () => {
        if (!card.active) return;
        card.setTexture(PRELOAD_CARD_FRONT);
        this.tweens.add({
          targets: card,
          scaleX: 1,
          duration: 80,
          ease: 'Sine.Out',
        });
      },
    });
  }

  private createCardTextures(): void {
    if (!this.textures.exists(PRELOAD_CARD_BACK)) {
      this.drawCardTexture(PRELOAD_CARD_BACK, 0x163a7a, 0x2a5cad, 0x7eb3ff);
    }
    if (!this.textures.exists(PRELOAD_CARD_FRONT)) {
      this.drawCardTexture(PRELOAD_CARD_FRONT, 0xc9a227, 0xf5e6c8, 0xc62828);
    }
  }

  private drawCardTexture(key: string, border: number, fill: number, mark: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(border, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, CARD_RADIUS);
    gfx.fillStyle(fill, 1);
    gfx.fillRoundedRect(3, 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 2);

    const cx = CARD_W / 2;
    const cy = CARD_H / 2;
    gfx.fillStyle(mark, 1);
    gfx.fillTriangle(cx, cy - 11, cx + 9, cy, cx, cy + 11);
    gfx.fillTriangle(cx, cy - 11, cx - 9, cy, cx, cy + 11);

    gfx.generateTexture(key, CARD_W, CARD_H);
    gfx.destroy();
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
