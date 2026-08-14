import Phaser from 'phaser';

import { t } from '@platform/ui';
import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
} from '@platform/ui/panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import type { UIButton } from '@platform/ui/types';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';

const PANEL_FILL = 0xf5e6c8;
const TEXT_DARK = '#1a1a1a';
const PANEL_STROKE = 0xd4b896;
const LABEL_COLOR = '#3a372f';

export type GameplayMode = 'campaign' | 'infinity';

export interface GameplayHUDOptions {
  mode: GameplayMode;
  levelNumber?: number;
  onBack: () => void;
  /** Infinity only — confirmed quit ends the run and goes to Game Over. */
  onQuit?: () => void;
  onQuitConfirmOpen?: () => void;
  onQuitConfirmClose?: () => void;
}

export class GameplayHUD extends Phaser.GameObjects.Container {
  private readonly mode: GameplayMode;
  private readonly onQuit?: () => void;
  private readonly onQuitConfirmOpen?: () => void;
  private readonly onQuitConfirmClose?: () => void;

  private backButton?: UIButton;
  private sideButton?: UIButton;
  private timerValue?: Phaser.GameObjects.Text;
  private scoreValue?: Phaser.GameObjects.Text;
  private comboText?: Phaser.GameObjects.Text;
  private quitConfirmModal?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, options: GameplayHUDOptions) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.mode = options.mode;
    this.onQuit = options.onQuit;
    this.onQuitConfirmOpen = options.onQuitConfirmOpen;
    this.onQuitConfirmClose = options.onQuitConfirmClose;
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

    if (options.onQuit) {
      this.sideButton = createUIButton({
        scene: this.scene,
        position: { x: width - 140, y: topY },
        size: { width: 72, height: 72 },
        background: { key: 'quit-icon' },
        depth: 501,
        onClick: () => this.showQuitConfirm(),
      });
      this.add(this.sideButton);
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

  isQuitConfirmOpen(): boolean {
    return !!this.quitConfirmModal?.visible;
  }

  showQuitConfirm(): void {
    if (!this.onQuit) return;

    if (this.quitConfirmModal) {
      this.quitConfirmModal.setVisible(true);
      this.onQuitConfirmOpen?.();
      return;
    }

    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(340, width * 0.82);
    const panelHeight = 220;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;
    const modal = this.scene.add.container(0, 0).setDepth(600);

    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.hideQuitConfirm());

    const panelGfx = this.scene.add.graphics();
    drawRoundedRect(
      panelGfx,
      panelX,
      panelY,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );

    const panelHit = this.scene.add
      .rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x000000, 0)
      .setInteractive();

    modal.add([overlay, panelGfx, panelHit]);

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 36, t('game.quitConfirmTitle'), {
          fontSize: '26px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: panelWidth - 40 },
        })
        .setOrigin(0.5, 0)
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 80, t('game.quitConfirmMessage'), {
          fontSize: '16px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5, 0)
    );

    const buttonGap = 12;
    const buttonWidth = Math.min(140, (panelWidth - 40 - buttonGap) / 2);
    const buttonHeight = 64;
    const buttonsY = panelY + panelHeight - 48;
    const pairWidth = buttonWidth * 2 + buttonGap;
    const cancelX = width / 2 - pairWidth / 2 + buttonWidth / 2;
    const quitX = width / 2 + pairWidth / 2 - buttonWidth / 2;

    modal.add(
      createUIButton({
        scene: this.scene,
        position: { x: cancelX, y: buttonsY },
        size: { width: buttonWidth, height: buttonHeight },
        background: { key: 'settings-button-background' },
        text: {
          content: t('game.quitCancel').toUpperCase(),
          style: {
            fontSize: 18,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => this.hideQuitConfirm(),
      })
    );

    modal.add(
      createUIButton({
        scene: this.scene,
        position: { x: quitX, y: buttonsY },
        size: { width: buttonWidth, height: buttonHeight },
        background: { key: 'share-button-background' },
        text: {
          content: t('game.quitConfirm').toUpperCase(),
          style: {
            fontSize: 18,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => {
          this.quitConfirmModal?.setVisible(false);
          this.onQuitConfirmClose?.();
          this.onQuit?.();
        },
      })
    );

    this.quitConfirmModal = modal;
    this.onQuitConfirmOpen?.();
  }

  hideQuitConfirm(): void {
    if (!this.quitConfirmModal?.visible) return;
    this.quitConfirmModal.setVisible(false);
    this.onQuitConfirmClose?.();
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
