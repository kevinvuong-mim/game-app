import Phaser from 'phaser';

import { gameConfig } from '@game/config';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { t, toast, shareService, i18n } from '@platform/ui';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import {
  PANEL_BG,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  TEXT_COLOR,
} from '@platform/ui/panel/panelTheme';

const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 96;
const NEW_RECORD_GAP = 36;
const NEW_RECORD_WIDTH = 250;
const NEW_RECORD_HEIGHT = 76;

export class GameOverScene extends Phaser.Scene {
  private returnTo = 'Home';
  private rankText?: Phaser.GameObjects.Text;
  private unsubscribeSyncCompleted?: () => void;

  constructor() {
    super({ key: 'GameOver' });
  }

  create(
    data: { score?: number; returnTo?: string; isNewRecord?: boolean } = {}
  ): void {
    this.cleanupEventListeners();
    this.events.once('shutdown', this.shutdown, this);

    this.returnTo = data.returnTo ?? 'Home';
    eventBus.emit('ad:context:change', { context: 'GAME_OVER' });

    const score = data.score ?? 0;
    const { width, height } = this.cameras.main;
    const centerX = width / 2;
    const isNewRecord = data.isNewRecord === true;

    this.addBackgroundImage(width, height);

    const panelWidth = Math.min(width * 0.88, 420);
    const contentTop = height * 0.38;
    const buttonsStartY = this.getButtonsStartY(contentTop, isNewRecord);
    const lastButtonY = isNewRecord
      ? buttonsStartY + NEW_RECORD_HEIGHT + NEW_RECORD_GAP + 3 * BUTTON_HEIGHT
      : buttonsStartY + 3 * BUTTON_HEIGHT;
    const panelBottom = lastButtonY + BUTTON_HEIGHT / 2 + 36;
    const panelTop = contentTop - 28;
    const panelHeight = panelBottom - panelTop;

    const panel = this.add.graphics().setDepth(0);
    drawRoundedRect(
      panel,
      centerX - panelWidth / 2,
      panelTop,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );

    this.addBanner(centerX, panelTop);

    this.add
      .text(centerX, contentTop + 60, t('game.yourScore'), {
        color: TEXT_COLOR,
        fontSize: '26px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(centerX, contentTop + 112, formatScore(score), {
        color: TEXT_COLOR,
        fontSize: '64px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.rankText = this.add
      .text(centerX, contentTop + 158, '', {
        color: '#8a7a5a',
        fontSize: '20px',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);

    this.unsubscribeSyncCompleted = eventBus.on('game:sync:completed', ({ rank }) => {
      this.showRank(rank);
    });

    let buttonY = buttonsStartY + 12;

    if (isNewRecord) {
      this.addNewRecordBadge(centerX, buttonY);
      buttonY += NEW_RECORD_HEIGHT + NEW_RECORD_GAP;
    }

    createUIButton({
      scene: this,
      position: { x: centerX, y: buttonY },
      size: { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
      background: { key: 'settings-button-background' },
      depth: 3,
      text: {
        content: t('game.retry'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => this.scene.start('Gameplay', { returnTo: this.returnTo }),
    });
    buttonY += BUTTON_HEIGHT;

    createUIButton({
      scene: this,
      position: { x: centerX, y: buttonY },
      size: { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
      background: { key: 'home-button-background' },
      depth: 3,
      text: {
        content: t('game.home'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => {
        eventBus.emit('game:destroy', undefined);
        this.scene.start(this.returnTo);
      },
    });
    buttonY += BUTTON_HEIGHT;

    createUIButton({
      scene: this,
      position: { x: centerX, y: buttonY },
      size: { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
      background: { key: 'leaderboard-button-background' },
      depth: 3,
      text: {
        content: t('game.leaderboard'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () =>
        this.scene.start('Leaderboard', {
          returnTo: 'GameOver',
          returnData: { score, returnTo: this.returnTo, isNewRecord },
        }),
    });
    buttonY += BUTTON_HEIGHT;

    createUIButton({
      scene: this,
      position: { x: centerX, y: buttonY },
      size: { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
      background: { key: 'share-button-background' },
      depth: 3,
      text: {
        content: t('game.shareScore'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => void this.handleShareScore(score),
    });
  }

  private addBackgroundImage(width: number, height: number): void {
    const background = this.add.image(width / 2, height / 2, 'general-background-image');
    const backgroundScale = Math.max(width / background.width, height / background.height);
    background.setScale(backgroundScale).setDepth(-1);
  }

  private addBanner(centerX: number, panelTop: number): void {
    const banner = this.add.image(centerX, panelTop - 42, 'gameover-banner').setDepth(4);
    const bannerScale = Math.min(1.1, (this.cameras.main.width * 0.9) / banner.width);
    banner.setScale(bannerScale);
    banner.setOrigin(0.5, 0.72);

    const ribbonY = banner.y + banner.displayHeight * 0.03;
    this.add
      .text(centerX, ribbonY, t('game.gameOver'), {
        color: '#ffffff',
        fontSize: '40px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#5c2a0a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  private addNewRecordBadge(centerX: number, y: number): void {
    this.add
      .image(centerX, y, 'best-score-background-image')
      .setDisplaySize(NEW_RECORD_WIDTH, NEW_RECORD_HEIGHT)
      .setDepth(3);

    this.add
      .text(centerX - 18, y - 2, t('game.newRecord'), {
        color: '#ffffff',
        fontSize: '22px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);

    this.add
      .image(centerX + NEW_RECORD_WIDTH * 0.32, y - 2, 'firework-icon')
      .setDisplaySize(42, 40)
      .setDepth(4);
  }

  private getButtonsStartY(contentTop: number, isNewRecord: boolean): number {
    return contentTop + (isNewRecord ? 170 : 210);
  }

  private async handleShareScore(score: number): Promise<void> {
    const result = await shareService.shareScore({
      score,
      gameName: gameConfig.name,
    });

    if (result === 'unavailable') {
      toast.show({ message: t('game.shareUnavailable'), type: 'warning' });
    }
  }

  shutdown(): void {
    this.cleanupEventListeners();
    this.rankText = undefined;
  }

  private cleanupEventListeners(): void {
    this.unsubscribeSyncCompleted?.();
    this.unsubscribeSyncCompleted = undefined;
  }

  private showRank(rank: number): void {
    if (!this.sys.isActive() || !this.rankText?.active) {
      return;
    }

    this.rankText.setText(t('leaderboard.rank', { rank }));
    this.rankText.setVisible(true);
  }
}

function formatScore(score: number): string {
  const locale = i18n.getCurrentLanguage() === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.NumberFormat(locale).format(Math.floor(score));
}
