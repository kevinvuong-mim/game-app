import Phaser from 'phaser';

import { t } from '@platform/ui';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import type { UIButton } from '@platform/ui/types';
import { createUIButton } from '@platform/ui/button/UIButton';

const PANEL_FILL = 0xf5e6c8;
const TEXT_DARK = '#1a1a1a';
const PANEL_STROKE = 0xd4b896;

export type GameplayMode = 'campaign' | 'infinity';

export interface GameplayHUDOptions {
  mode: GameplayMode;
  levelNumber?: number;
  onBack: () => void;
  onLeaderboard?: () => void;
}

export class GameplayHUD extends Phaser.GameObjects.Container {
  private readonly mode: GameplayMode;

  private backButton?: UIButton;
  private timerValue?: Phaser.GameObjects.Text;
  private scoreValue?: Phaser.GameObjects.Text;
  private comboText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, options: GameplayHUDOptions) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.mode = options.mode;
    this.setDepth(500);
    this.setScrollFactor(0);
    this.build(options);
  }

  private build(options: GameplayHUDOptions): void {
    if (this.mode === 'infinity') {
      this.buildInfinityHud(options);
      return;
    }
    this.buildCampaignHud(options);
  }

  private buildInfinityHud(options: GameplayHUDOptions): void {
    const { width } = this.scene.cameras.main;
    const topY = 124;

    this.backButton = createUIButton({
      scene: this.scene,
      position: { x: 140, y: topY },
      size: { width: 72, height: 72 },
      background: { key: 'back-icon' },
      depth: 501,
      onClick: options.onBack,
    });
    this.add(this.backButton);

    if (options.onLeaderboard) {
      const trophyButton = createUIButton({
        scene: this.scene,
        position: { x: width - 140, y: topY },
        size: { width: 72, height: 72 },
        background: { key: 'trophy-icon', fit: 'contain' },
        depth: 501,
        onClick: options.onLeaderboard,
      });
      this.add(trophyButton);
    }

    const panel = this.makePanel(width * 0.5, topY, 200, 96);
    panel.add(
      this.scene.add
        .text(0, -28, t('game.scoreLabel'), {
          color: TEXT_DARK,
          fontSize: '22px',
          fontStyle: 'bold',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
    this.scoreValue = this.scene.add
      .text(0, 14, '0', {
        color: TEXT_DARK,
        fontSize: '36px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);
    panel.add(this.scoreValue);
    this.add(panel);

    this.timerValue = this.scene.add
      .text(width / 2, topY + 78, '0:00', {
        color: '#fff8dc',
        fontSize: '26px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#2a4018',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add(this.timerValue);

    this.comboText = this.scene.add
      .text(width / 2, topY + 108, '', {
        color: '#ffe566',
        fontSize: '22px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#5c2a0a',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.add(this.comboText);
  }

  private buildCampaignHud(options: GameplayHUDOptions): void {
    const { width } = this.scene.cameras.main;
    const topY = 124;

    this.backButton = createUIButton({
      scene: this.scene,
      position: { x: 140, y: topY },
      size: { width: 72, height: 72 },
      background: { key: 'back-icon' },
      depth: 501,
      onClick: options.onBack,
    });
    this.add(this.backButton);

    const panel = this.makePanel(width * 0.5, topY, 200, 96);
    panel.add(
      this.scene.add
        .text(0, -28, t('game.levelShort'), {
          color: TEXT_DARK,
          fontSize: '22px',
          fontStyle: 'bold',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
    panel.add(
      this.scene.add
        .text(0, 14, String(options.levelNumber ?? 1), {
          color: TEXT_DARK,
          fontSize: '36px',
          fontStyle: 'bold',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
    this.add(panel);

    this.timerValue = this.scene.add
      .text(width / 2, topY + 78, '0:00', {
        color: '#fff8dc',
        fontSize: '26px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#2a4018',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add(this.timerValue);
  }

  private makePanel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics();
    bg.fillStyle(PANEL_FILL, 1);
    bg.lineStyle(3, PANEL_STROKE, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    container.add(bg);
    return container;
  }

  setTimer(seconds: number): void {
    const clamped = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    this.timerValue?.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
    this.timerValue?.setColor(clamped <= 10 ? '#ff6b6b' : '#fff8dc');
  }

  setScore(score: number): void {
    this.scoreValue?.setText(score.toLocaleString('en-US'));
  }

  setCombo(combo: number): void {
    if (!this.comboText) return;
    if (combo <= 1) {
      this.comboText.setAlpha(0);
      return;
    }
    this.comboText.setText(t('game.combo', { combo }));
    this.comboText.setAlpha(1);
    this.scene.tweens.killTweensOf(this.comboText);
    this.comboText.setScale(1.2);
    this.scene.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
    });
  }
}
