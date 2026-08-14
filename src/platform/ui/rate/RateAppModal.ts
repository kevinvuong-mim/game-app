import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
} from '@platform/ui/panel/panelTheme';
import { t, toast } from '@platform/ui';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { rateService } from '@platform/modules/rate';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';

const MODAL_DEPTH = 50;

export class RateAppModal {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;

  private submitting = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(MODAL_DEPTH);
    this.build();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const padX = 40;
    const padTop = 40;
    const padBottom = 40;
    const panelWidth = Math.min(420, width * 0.9);
    const panelHeight = Math.min(560, height * 0.75);
    const centerX = width / 2;
    const centerY = height / 2;
    const panelX = centerX - panelWidth / 2;
    const panelY = centerY - panelHeight / 2;
    const contentWidth = panelWidth - padX * 2;

    const overlay = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.55)
      .setInteractive();

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
      .rectangle(centerX, centerY, panelWidth, panelHeight, 0x000000, 0)
      .setInteractive();

    this.root.add([overlay, panelGfx, panelHit]);

    this.root.add(
      this.scene.add
        .text(centerX, panelY + padTop, t('rateApp.title'), {
          fontSize: '28px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0.5, 0)
    );

    const character = this.scene.add
      .image(centerX, panelY + padTop + 150, 'watermelon-character')
      .setOrigin(0.5);
    const characterMaxW = contentWidth * 0.9;
    const characterMaxH = 170;
    const characterScale = Math.min(
      characterMaxW / character.width,
      characterMaxH / character.height,
      1.45
    );
    character.setScale(characterScale);
    this.root.add(character);

    this.root.add(
      this.scene.add
        .text(centerX, panelY + padTop + 270, t('rateApp.message'), {
          fontSize: '17px',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0.5, 0)
    );

    const buttonWidth = 260;
    const buttonHeight = 76;
    const buttonGap = 8;
    const laterY = panelY + panelHeight - padBottom - buttonHeight / 2;
    const rateY = laterY - buttonHeight - buttonGap;

    this.root.add(
      createUIButton({
        scene: this.scene,
        position: { x: centerX, y: rateY },
        size: { width: buttonWidth, height: buttonHeight },
        background: { key: 'play-button-background' },
        text: {
          content: t('rateApp.rateNow'),
          style: {
            fontSize: 24,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => void this.handleRateNow(),
      })
    );

    this.root.add(
      createUIButton({
        scene: this.scene,
        position: { x: centerX, y: laterY },
        size: { width: buttonWidth, height: buttonHeight },
        background: { key: 'blue-button-background' },
        text: {
          content: t('rateApp.later'),
          style: {
            fontSize: 24,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => void this.handleLater(),
      })
    );
  }

  private async handleRateNow(): Promise<void> {
    if (this.submitting) return;

    this.submitting = true;
    try {
      await rateService.submitRating();
      toast.show({ message: t('rateApp.thanks'), type: 'success' });
      this.destroy();
    } finally {
      this.submitting = false;
    }
  }

  private async handleLater(): Promise<void> {
    if (this.submitting) return;
    this.submitting = true;
    try {
      await rateService.dismissLater();
      this.destroy();
    } finally {
      this.submitting = false;
    }
  }
}
