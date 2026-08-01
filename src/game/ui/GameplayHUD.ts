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

function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

export interface GameplayHUDOptions {
  onBack: () => void;
  onQuit: () => void;
  onQuitConfirmOpen?: () => void;
  onQuitConfirmClose?: () => void;
}

/**
 * Suika gameplay HUD — back/quit buttons and score panel.
 */
export class GameplayHUD extends Phaser.GameObjects.Container {
  private readonly onQuit: () => void;
  private readonly onQuitConfirmOpen?: () => void;
  private readonly onQuitConfirmClose?: () => void;

  private backButton?: UIButton;
  private quitButton?: UIButton;
  private scoreValue?: Phaser.GameObjects.Text;
  private quitConfirmModal?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, options: GameplayHUDOptions) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(500);
    this.setScrollFactor(0);
    this.onQuit = options.onQuit;
    this.onQuitConfirmOpen = options.onQuitConfirmOpen;
    this.onQuitConfirmClose = options.onQuitConfirmClose;
    this.build(options);
  }

  private build(options: GameplayHUDOptions): void {
    const { width } = this.scene.cameras.main;
    const topY = 124;

    this.backButton = createUIButton({
      scene: this.scene,
      position: { x: 132, y: topY },
      size: { width: 80, height: 80 },
      background: { key: 'back-icon' },
      depth: 501,
      onClick: options.onBack,
    });
    this.add(this.backButton);

    this.quitButton = createUIButton({
      scene: this.scene,
      position: { x: width * 0.8, y: topY },
      size: { width: 72, height: 72 },
      background: { key: 'quit-icon' },
      depth: 501,
      onClick: () => this.showQuitConfirm(),
    });
    this.add(this.quitButton);

    const scorePanel = this.makePanel(width * 0.5, topY, 200, 96);
    scorePanel.add(
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
    scorePanel.add(this.scoreValue);
    this.add(scorePanel);
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

  setScore(score: number): void {
    this.scoreValue?.setText(formatScore(score));
  }

  isQuitConfirmOpen(): boolean {
    return !!this.quitConfirmModal?.visible;
  }

  showQuitConfirm(): void {
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
    // Use pointerup so the dismiss gesture never arms a gameplay drop on pointerdown.
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
          this.onQuit();
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
}
