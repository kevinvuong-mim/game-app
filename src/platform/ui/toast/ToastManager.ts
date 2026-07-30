import Phaser from 'phaser';

import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { PANEL_BG, PANEL_BORDER, TEXT_COLOR } from '@platform/ui/panel/panelTheme';
import type { UIToastType, ToastOptions, ToastPosition } from '@platform/ui/types';

const TOAST_EDGE_MARGIN = 100;
const TOAST_ANIMATION_OFFSET = 28;
const TOAST_CORNER_RADIUS = 18;
const TOAST_PADDING_X = 22;
const TOAST_PADDING_Y = 14;
const TOAST_MIN_WIDTH = 200;
const TOAST_MAX_WIDTH_RATIO = 0.88;
const ACCENT_WIDTH = 8;
const ICON_SIZE = 28;
const ICON_GAP = 12;
const SHADOW_OFFSET = 4;

type ToastPalette = {
  accent: number;
  iconBg: number;
  iconBorder: number;
  iconGlyph: string;
};

const TOAST_PALETTE: Record<UIToastType, ToastPalette> = {
  info: {
    accent: 0x3d7ea6,
    iconBg: 0xd6ebf5,
    iconBorder: 0x2f6a8c,
    iconGlyph: 'i',
  },
  success: {
    accent: 0x1f6b32,
    iconBg: 0xd8f0dc,
    iconBorder: 0x145024,
    iconGlyph: '✓',
  },
  warning: {
    accent: 0xc4841a,
    iconBg: 0xffe8c2,
    iconBorder: 0x9a6410,
    iconGlyph: '!',
  },
  error: {
    accent: 0xb33a2e,
    iconBg: 0xf8d6d2,
    iconBorder: 0x8c2a20,
    iconGlyph: '×',
  },
};

function resolveToastCoords(
  width: number,
  height: number,
  position: ToastPosition,
  offsetX = 0,
  offsetY = 0
): { x: number; startY: number; restY: number; exitY: number } {
  const x = width / 2 + offsetX;

  switch (position) {
    case 'bottom':
      return {
        x,
        startY: height - TOAST_EDGE_MARGIN + offsetY,
        restY: height - TOAST_EDGE_MARGIN - TOAST_ANIMATION_OFFSET + offsetY,
        exitY: height - TOAST_EDGE_MARGIN + TOAST_ANIMATION_OFFSET + offsetY,
      };
    case 'top':
    default:
      return {
        x,
        restY: TOAST_EDGE_MARGIN + offsetY,
        exitY: TOAST_EDGE_MARGIN + TOAST_ANIMATION_OFFSET + offsetY,
        startY: TOAST_EDGE_MARGIN - TOAST_ANIMATION_OFFSET + offsetY,
      };
  }
}

class ToastManager {
  private showing = false;
  private queue: ToastOptions[] = [];
  private game: Phaser.Game | null = null;

  init(game: Phaser.Game): void {
    this.game = game;
  }

  show(options: ToastOptions): void {
    this.queue.push(options);
    if (!this.showing) void this.processQueue();
  }

  private getActiveScene(): Phaser.Scene | null {
    if (!this.game) return null;
    const scenes = this.game.scene.getScenes(true);
    return scenes[scenes.length - 1] ?? null;
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.showing = false;
      return;
    }

    this.showing = true;
    const options = this.queue.shift()!;
    await this.displayToast(options);
    void this.processQueue();
  }

  private displayToast(options: ToastOptions): Promise<void> {
    return new Promise((resolve) => {
      const scene = this.getActiveScene();
      if (!scene) {
        resolve();
        return;
      }

      let settled = false;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onSceneEnd);
        scene.events.off(Phaser.Scenes.Events.DESTROY, onSceneEnd);
        if (container.active) {
          scene.tweens.killTweensOf(container);
          container.destroy(true);
        }
        resolve();
      };

      const onSceneEnd = (): void => {
        finish();
      };

      // Scene restart/shutdown kills tweens without onComplete — must unblock the queue.
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onSceneEnd);
      scene.events.once(Phaser.Scenes.Events.DESTROY, onSceneEnd);

      const { width, height } = scene.cameras.main;
      const type = options.type ?? 'info';
      const duration = options.duration ?? 2500;
      const position = options.position ?? 'top';
      const palette = TOAST_PALETTE[type];
      const { x, startY, restY, exitY } = resolveToastCoords(
        width,
        height,
        position,
        options.offset?.x,
        options.offset?.y
      );

      const maxTextWidth =
        width * TOAST_MAX_WIDTH_RATIO - TOAST_PADDING_X * 2 - ICON_SIZE - ICON_GAP - ACCENT_WIDTH;

      const label = scene.add.text(0, 0, options.message, {
        color: TEXT_COLOR,
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: maxTextWidth },
        align: 'left',
      });

      const contentWidth = Math.min(
        Math.max(
          TOAST_MIN_WIDTH,
          ACCENT_WIDTH + TOAST_PADDING_X + ICON_SIZE + ICON_GAP + label.width + TOAST_PADDING_X
        ),
        width * TOAST_MAX_WIDTH_RATIO
      );
      const contentHeight = Math.max(
        ICON_SIZE + TOAST_PADDING_Y * 2,
        label.height + TOAST_PADDING_Y * 2
      );

      const container = scene.add.container(x, startY);
      container.setDepth(2000);
      container.setAlpha(0);
      container.setScale(0.92);

      const shadow = scene.add.graphics();
      shadow.fillStyle(0x000000, 0.18);
      shadow.fillRoundedRect(
        -contentWidth / 2 + 1,
        -contentHeight / 2 + SHADOW_OFFSET,
        contentWidth,
        contentHeight,
        TOAST_CORNER_RADIUS
      );

      const panel = scene.add.graphics();
      drawRoundedRect(
        panel,
        -contentWidth / 2,
        -contentHeight / 2,
        contentWidth,
        contentHeight,
        TOAST_CORNER_RADIUS,
        PANEL_BG,
        PANEL_BORDER,
        3
      );

      panel.lineStyle(2, 0xffffff, 0.35);
      panel.beginPath();
      panel.moveTo(-contentWidth / 2 + TOAST_CORNER_RADIUS, -contentHeight / 2 + 2);
      panel.lineTo(contentWidth / 2 - TOAST_CORNER_RADIUS, -contentHeight / 2 + 2);
      panel.strokePath();

      const accent = scene.add.graphics();
      accent.fillStyle(palette.accent, 1);
      accent.fillRoundedRect(
        -contentWidth / 2 + 3,
        -contentHeight / 2 + 3,
        ACCENT_WIDTH,
        contentHeight - 6,
        { tl: TOAST_CORNER_RADIUS - 4, bl: TOAST_CORNER_RADIUS - 4, tr: 4, br: 4 }
      );

      const iconX = -contentWidth / 2 + ACCENT_WIDTH + TOAST_PADDING_X + ICON_SIZE / 2;
      const iconBg = scene.add.circle(iconX, 0, ICON_SIZE / 2, palette.iconBg);
      iconBg.setStrokeStyle(2, palette.iconBorder, 1);

      const icon = scene.add
        .text(iconX, 0, palette.iconGlyph, {
          color: TEXT_COLOR,
          fontSize: type === 'success' || type === 'error' ? '18px' : '16px',
          fontStyle: 'bold',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5);

      const textX =
        -contentWidth / 2 + ACCENT_WIDTH + TOAST_PADDING_X + ICON_SIZE + ICON_GAP + label.width / 2;
      label.setOrigin(0.5).setPosition(textX, 0);

      container.add([shadow, panel, accent, iconBg, icon, label]);

      scene.tweens.add({
        targets: container,
        alpha: 1,
        y: restY,
        scaleX: 1,
        scaleY: 1,
        duration: 280,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (settled) return;
          scene.time.delayedCall(duration, () => {
            if (settled) return;
            scene.tweens.add({
              targets: container,
              alpha: 0,
              y: exitY,
              scaleX: 0.94,
              scaleY: 0.94,
              duration: 220,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                finish();
              },
            });
          });
        },
      });
    });
  }
}

export const toast = new ToastManager();
