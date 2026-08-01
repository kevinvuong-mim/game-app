import Phaser from 'phaser';

import { gameConfig } from '@game/config';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { t, toast, RateAppModal, i18n, shareService, rateService, gameSync } from '@platform/ui';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect, measureTextWidth } from '@platform/ui/panel/graphics';
import {
  PANEL_BG,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  TEXT_COLOR,
} from '@platform/ui/panel/panelTheme';

const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 96;
const NEW_RECORD_GAP = 36;
const NEW_RECORD_WIDTH = 200;
const NEW_RECORD_HEIGHT = 58;
const PANEL_BOTTOM_PADDING = 48;

const COIN_ICON_SIZE = 36;
const COINS_PILL_HEIGHT = 52;
const COINS_PILL_PAD_X = 18;
const COINS_PILL_GAP = 10;
const COINS_PILL_FILL = 0xfff0d4;
const COINS_PILL_STROKE = 0xd4a84b;
const COINS_AMOUNT_COLOR = '#8a5a00';

/** Vertical layout offsets from contentTop — keep sections from overlapping. */
const LAYOUT = {
  scoreLabel: 44,
  scoreValue: 98,
  /** Gap below score number before coins section. */
  coinsLabel: 152,
  /** Label → pill center (must clear label height + gap). */
  coinsPillFromLabel: 52,
  /** Pill bottom → rank. */
  rankAfterPill: 28,
  /**
   * Rank center → first control center.
   * Play Again is taller (96) than the New Record badge (58), so gaps differ.
   */
  afterRankToPlayAgain: 78,
  afterRankToNewRecord: 52,
} as const;

export class GameOverScene extends Phaser.Scene {
  private returnTo = 'Home';
  private rankText?: Phaser.GameObjects.Text;
  private rateModal?: RateAppModal;
  private rankRequestId = 0;

  constructor() {
    super({ key: 'GameOver' });
  }

  create(data: { score?: number; returnTo?: string; isNewRecord?: boolean } = {}): void {
    this.cleanupEventListeners();
    this.events.once('shutdown', this.shutdown, this);

    this.returnTo = data.returnTo ?? 'Home';
    eventBus.emit('ad:context:change', { context: 'GAME_OVER' });

    const score = data.score ?? 0;
    const coinsEarned = Math.max(0, Math.floor(score));
    const { width, height } = this.cameras.main;
    const centerX = width / 2;
    const isNewRecord = data.isNewRecord === true;

    this.addBackgroundImage(width, height);

    const panelWidth = Math.min(width * 0.88, 420);
    const contentTop = height * 0.36;

    const scoreLabelY = contentTop + LAYOUT.scoreLabel;
    const scoreValueY = contentTop + LAYOUT.scoreValue;
    const coinsLabelY = contentTop + LAYOUT.coinsLabel;
    const coinsPillY = coinsLabelY + LAYOUT.coinsPillFromLabel;
    const rankY = coinsPillY + COINS_PILL_HEIGHT / 2 + LAYOUT.rankAfterPill;
    const buttonsStartY =
      rankY + (isNewRecord ? LAYOUT.afterRankToNewRecord : LAYOUT.afterRankToPlayAgain);

    const lastButtonY = isNewRecord
      ? buttonsStartY + NEW_RECORD_HEIGHT + NEW_RECORD_GAP + 2 * BUTTON_HEIGHT
      : buttonsStartY + 2 * BUTTON_HEIGHT;
    const panelBottom = lastButtonY + BUTTON_HEIGHT / 2 + PANEL_BOTTOM_PADDING;
    const panelTop = contentTop - 40;
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
      .text(centerX, scoreLabelY, t('game.yourScore'), {
        color: TEXT_COLOR,
        fontSize: '24px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(centerX, scoreValueY, formatScore(score), {
        color: TEXT_COLOR,
        fontSize: '60px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.addCoinsEarned(centerX, coinsLabelY, coinsPillY, coinsEarned);

    this.rankText = this.add
      .text(centerX, rankY, '', {
        color: '#8a7a5a',
        fontSize: '20px',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);

    // Online: take data.rank from /results. Offline / failed sync: leave hidden.
    void this.resolveRankFromApi();

    let buttonY = buttonsStartY;

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
      background: { key: 'share-button-background' },
      depth: 3,
      text: {
        content: t('game.shareScore'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => void this.handleShareScore(score),
    });

    if (rateService.shouldPrompt()) {
      this.rateModal = new RateAppModal(this);
    }
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

  /** Coins section: label above pill with explicit positions (no overlap). */
  private addCoinsEarned(centerX: number, labelY: number, pillY: number, coins: number): void {
    this.add
      .text(centerX, labelY, t('game.coinsEarned'), {
        color: '#8a7a5a',
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    const amountLabel = `+${formatScore(coins)}`;
    const amountStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: COINS_AMOUNT_COLOR,
      fontSize: '28px',
      fontStyle: 'bold',
      fontFamily: FREDOKA_FONT,
    };
    const amountWidth = measureTextWidth(this, amountLabel, amountStyle);
    const pillWidth = Math.max(
      140,
      COINS_PILL_PAD_X + COIN_ICON_SIZE + COINS_PILL_GAP + amountWidth + COINS_PILL_PAD_X
    );

    const pill = this.add.graphics().setDepth(2);
    drawRoundedRect(
      pill,
      centerX - pillWidth / 2,
      pillY - COINS_PILL_HEIGHT / 2,
      pillWidth,
      COINS_PILL_HEIGHT,
      COINS_PILL_HEIGHT / 2,
      COINS_PILL_FILL,
      COINS_PILL_STROKE,
      2
    );

    const contentWidth = COIN_ICON_SIZE + COINS_PILL_GAP + amountWidth;
    const contentLeft = centerX - contentWidth / 2;

    const coin = this.add.image(contentLeft + COIN_ICON_SIZE / 2, pillY, 'coin-icon');
    const targetScaleX = COIN_ICON_SIZE / Math.max(coin.width, 1);
    const targetScaleY = COIN_ICON_SIZE / Math.max(coin.height, 1);
    coin.setScale(0).setDepth(3);

    this.add
      .text(contentLeft + COIN_ICON_SIZE + COINS_PILL_GAP, pillY, amountLabel, amountStyle)
      .setOrigin(0, 0.5)
      .setDepth(3);

    this.tweens.add({
      targets: coin,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      duration: 380,
      ease: 'Back.Out',
      delay: 120,
    });
  }

  private addNewRecordBadge(centerX: number, y: number): void {
    this.add
      .image(centerX, y, 'best-score-background-image')
      .setDisplaySize(NEW_RECORD_WIDTH, NEW_RECORD_HEIGHT)
      .setDepth(3);

    this.add
      .text(centerX - 14, y, t('game.newRecord'), {
        color: '#ffffff',
        fontSize: '17px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(4);

    this.add
      .image(centerX + NEW_RECORD_WIDTH * 0.32, y - 2, 'firework-icon')
      .setDisplaySize(30, 28)
      .setDepth(4);
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
    this.rankRequestId += 1;
    this.rateModal?.destroy();
    this.rateModal = undefined;
    this.rankText = undefined;
  }

  private cleanupEventListeners(): void {
    this.rankRequestId += 1;
  }

  /** Online → show `data.rank` from `/results`. Offline / error → keep hidden. */
  private async resolveRankFromApi(): Promise<void> {
    const requestId = ++this.rankRequestId;
    try {
      const rank = await gameSync.flushAndGetRank();
      if (requestId !== this.rankRequestId) return;
      if (rank === null) return;
      this.showRank(rank);
    } catch {
      // Network / sync failure — leave rank hidden.
    }
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
