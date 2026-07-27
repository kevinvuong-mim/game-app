import Phaser from 'phaser';

import { t, toast } from '@platform/ui';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import {
  PANEL_BG,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  TEXT_COLOR,
} from '@platform/ui/panel/panelTheme';
import { rateService } from '@platform/modules/rate';
import { soundManager } from '@platform/ui/audio/SoundManager';

const STAR_FILL = 0xff8a1a;
const STAR_STROKE = 0x8b4513;
const STAR_EMPTY = 0xe8d4b0;
const MODAL_DEPTH = 50;

export class RateAppModal {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private selectedStars = 0;
  private starsCenterX = 0;
  private starsY = 0;
  private starGfx: Phaser.GameObjects.Graphics[] = [];
  private starHits: Phaser.GameObjects.Zone[] = [];
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
    const panelHeight = Math.min(640, height * 0.8);
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2 + 10;
    const centerX = width / 2;
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
      .rectangle(centerX, height / 2, panelWidth, panelHeight, 0x000000, 0)
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

    this.buildStars(centerX, panelY + padTop + 350);

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
        background: { key: 'settings-button-background' },
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

  private buildStars(centerX: number, y: number): void {
    this.starsCenterX = centerX;
    this.starsY = y;

    const count = 5;
    const spacing = 52;
    const startX = centerX - ((count - 1) * spacing) / 2;
    const hitSize = 44;

    for (let i = 0; i < count; i++) {
      const x = startX + i * spacing;
      const gfx = this.scene.add.graphics();
      this.starGfx.push(gfx);
      this.root.add(gfx);

      const hit = this.scene.add
        .zone(x, y, hitSize, hitSize)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.setStars(i + 1));
      this.starHits.push(hit);
      this.root.add(hit);
    }

    this.redrawStars();
  }

  private setStars(value: number): void {
    this.selectedStars = value;
    soundManager.playPop();
    this.redrawStars();
  }

  private redrawStars(): void {
    const count = 5;
    const spacing = 52;
    const startX = this.starsCenterX - ((count - 1) * spacing) / 2;
    const outerR = 18;
    const innerR = 8;

    for (let i = 0; i < count; i++) {
      const gfx = this.starGfx[i];
      if (!gfx) continue;
      gfx.clear();
      drawStar(gfx, startX + i * spacing, this.starsY, outerR, innerR, i < this.selectedStars);
    }
  }

  private async handleRateNow(): Promise<void> {
    if (this.submitting) return;

    if (this.selectedStars < 1) {
      toast.show({ message: t('rateApp.selectStars'), type: 'warning' });
      return;
    }

    this.submitting = true;
    try {
      const result = await rateService.submitRating(this.selectedStars);
      if (result === 'saved') {
        toast.show({ message: t('rateApp.thanksFeedback'), type: 'success' });
      } else {
        toast.show({ message: t('rateApp.thanks'), type: 'success' });
      }
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

function drawStar(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  filled: boolean
): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 5; i++) {
    const outerAngle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const innerAngle = outerAngle + Math.PI / 5;
    points.push(
      new Phaser.Math.Vector2(
        cx + Math.cos(outerAngle) * outerR,
        cy + Math.sin(outerAngle) * outerR
      )
    );
    points.push(
      new Phaser.Math.Vector2(
        cx + Math.cos(innerAngle) * innerR,
        cy + Math.sin(innerAngle) * innerR
      )
    );
  }

  gfx.lineStyle(3, STAR_STROKE, 1);
  if (filled) {
    gfx.fillStyle(STAR_FILL, 1);
  } else {
    gfx.fillStyle(STAR_EMPTY, 1);
  }

  gfx.beginPath();
  gfx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x, points[i].y);
  }
  gfx.closePath();
  gfx.fillPath();
  gfx.strokePath();
}
