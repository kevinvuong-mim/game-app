import Phaser from 'phaser';

import {
  t,
  i18n,
  toast,
  gameSync,
  rateService,
  RateAppModal,
  shareService,
  usePlatformStore,
} from '@platform/ui';
import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
} from '@platform/ui/panel/panelTheme';
import { gameConfig } from '@game/config';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { soundManager } from '@platform/ui/audio/SoundManager';

const MERGE_GAP = 14;
const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 96;
const COINS_PILL_GAP = 8;
const COIN_ICON_SIZE = 40;
const MERGE_ORB_SIZE = 58;
const ORB_FILL = 0xffc94a;
const ORB_INNER = 0xffe9a0;
const COINS_PILL_PAD_X = 8;
const ORB_STROKE = 0xb87a12;
const COINS_PILL_HEIGHT = 54;
const PANEL_BOTTOM_PADDING = 48;
const COINS_PILL_FILL = 0xfff0d4;
const GHOST_PILL_FILL = 0xfff8e8;
const COINS_PILL_STROKE = 0xd4a84b;
const GHOST_PILL_STROKE = 0xe0c078;
const COINS_AMOUNT_COLOR = '#8a5a00';
const GHOST_AMOUNT_COLOR = '#c4a05a';
/** Rewarded placement — doubles coins earned this run (granted by this scene). */
const DOUBLE_COINS_PLACEMENT = 'DOUBLE_COINS';

/** Vertical layout offsets from contentTop — keep sections from overlapping. */
const LAYOUT = {
  scoreLabel: 44,
  scoreValue: 98,
  /** Score number → rank. */
  rankAfterScore: 42,
  /** Label → pill/merge row center. */
  coinsPillFromLabel: 50,
  /** Rank → coins earned label. */
  coinsLabelAfterRank: 36,
  /** Coins section bottom → Play Again. */
  afterCoinsToPlayAgain: 78,
} as const;

type CoinPillParts = {
  width: number;
  icon: Phaser.GameObjects.Image;
  amount: Phaser.GameObjects.Text;
  gfx: Phaser.GameObjects.Graphics;
  root: Phaser.GameObjects.Container;
};

export class GameOverScene extends Phaser.Scene {
  private coinsRowY = 0;
  private coinsEarned = 0;
  private rankRequestId = 0;
  private returnTo = 'Home';
  private coinsRowCenterX = 0;
  private doubleClaimed = false;
  private showDoubleCoins = false;
  private doubleRequesting = false;
  private rateModal?: RateAppModal;
  private leftPill?: CoinPillParts;
  private ghostPill?: CoinPillParts;
  private mergedPill?: CoinPillParts;
  private rankText?: Phaser.GameObjects.Text;
  private mergeHit?: Phaser.GameObjects.Zone;
  private unsubscribers: Array<() => void> = [];
  private mergeOrbIcon?: Phaser.GameObjects.Text;
  private mergeOrb?: Phaser.GameObjects.Container;
  private mergeOrbGfx?: Phaser.GameObjects.Graphics;
  private mergeOrbRing?: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameOver' });
  }

  create(data: { score?: number; returnTo?: string } = {}): void {
    this.cleanupEventListeners();
    this.events.once('shutdown', this.shutdown, this);

    this.returnTo = data.returnTo ?? 'Home';
    this.doubleClaimed = false;
    this.doubleRequesting = false;
    eventBus.emit('ad:context:change', { context: 'GAME_OVER' });

    const score = data.score ?? 0;
    this.coinsEarned = Math.max(0, Math.floor(score));
    this.showDoubleCoins = this.coinsEarned > 0;
    const { width, height } = this.cameras.main;
    const centerX = width / 2;

    this.addBackgroundImage(width, height);

    const panelWidth = Math.min(width * 0.88, 420);
    const contentTop = height * 0.4;

    const scoreLabelY = contentTop + LAYOUT.scoreLabel;
    const scoreValueY = contentTop + LAYOUT.scoreValue;
    const rankY = scoreValueY + LAYOUT.rankAfterScore;
    const coinsLabelY = rankY + LAYOUT.coinsLabelAfterRank;
    const coinsRowY = coinsLabelY + LAYOUT.coinsPillFromLabel;
    const coinsSectionBottom = coinsRowY + COINS_PILL_HEIGHT / 2;
    const buttonsStartY = coinsSectionBottom + LAYOUT.afterCoinsToPlayAgain;

    const lastButtonY = buttonsStartY + 2 * BUTTON_HEIGHT;
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

    this.rankText = this.add
      .text(centerX, rankY, '', {
        color: '#8a7a5a',
        fontSize: '20px',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);

    void this.resolveRankFromApi();

    this.addCoinsSection(centerX, coinsLabelY, coinsRowY);

    let buttonY = buttonsStartY;

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
    const background = this.add.image(width / 2, height / 2, 'gameover-background-image');
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

  /**
   * Breakthrough coins UX: two coin pills + play orb.
   * Watching the ad merges them (same fantasy as fruit merges) into x2.
   */
  private addCoinsSection(centerX: number, labelY: number, rowY: number): void {
    this.coinsRowCenterX = centerX;
    this.coinsRowY = rowY;

    this.add
      .text(centerX, labelY, t('game.coinsEarned'), {
        color: '#8a7a5a',
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);

    if (!this.showDoubleCoins) {
      this.leftPill = this.createCoinPill(this.coinsEarned, false);
      this.leftPill.root.setPosition(centerX, rowY).setDepth(3);
      this.animatePillPop(this.leftPill);
      return;
    }

    this.leftPill = this.createCoinPill(this.coinsEarned, false);
    this.ghostPill = this.createCoinPill(this.coinsEarned, true);
    this.addMergeOrb(rowY);

    this.layoutMergeOffer();
    this.animatePillPop(this.leftPill);
    this.animatePillPop(this.ghostPill, 80);

    this.unsubscribers.push(
      eventBus.on('ad:reward:result', ({ placement, success, message }) => {
        if (placement !== DOUBLE_COINS_PLACEMENT) return;
        this.handleDoubleCoinsResult(success, message);
      })
    );
  }

  private createCoinPill(coins: number, ghost: boolean): CoinPillParts {
    const root = this.add.container(0, 0);
    const gfx = this.add.graphics();
    const icon = this.add.image(0, 0, 'coin-icon');
    icon.setDisplaySize(COIN_ICON_SIZE, COIN_ICON_SIZE);
    if (ghost) icon.setAlpha(0.55);

    const amount = this.add
      .text(0, 0, `+${formatScore(coins)}`, {
        color: ghost ? GHOST_AMOUNT_COLOR : COINS_AMOUNT_COLOR,
        fontSize: '24px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0, 0.5);

    if (ghost) amount.setAlpha(0.7);

    root.add([gfx, icon, amount]);

    const parts: CoinPillParts = { root, gfx, icon, amount, width: 0 };
    this.redrawCoinPill(parts, coins, ghost);
    return parts;
  }

  private redrawCoinPill(parts: CoinPillParts, coins: number, ghost: boolean): void {
    const label = `+${formatScore(coins)}`;
    parts.amount.setText(label);

    const amountWidth = Math.ceil(parts.amount.width);
    const width = Math.max(
      100,
      COINS_PILL_PAD_X + COIN_ICON_SIZE + COINS_PILL_GAP + amountWidth + COINS_PILL_PAD_X
    );
    parts.width = width;

    parts.gfx.clear();
    drawRoundedRect(
      parts.gfx,
      -width / 2,
      -COINS_PILL_HEIGHT / 2,
      width,
      COINS_PILL_HEIGHT,
      COINS_PILL_HEIGHT / 2,
      ghost ? GHOST_PILL_FILL : COINS_PILL_FILL,
      ghost ? GHOST_PILL_STROKE : COINS_PILL_STROKE,
      ghost ? 2 : 2.5
    );

    if (ghost) {
      // Soft “potential reward” wash over the ghost pill.
      parts.gfx.fillStyle(0xffe08a, 0.16);
      parts.gfx.fillRoundedRect(
        -width / 2 + 3,
        -COINS_PILL_HEIGHT / 2 + 3,
        width - 6,
        COINS_PILL_HEIGHT - 6,
        COINS_PILL_HEIGHT / 2 - 2
      );
    }

    const contentWidth = COIN_ICON_SIZE + COINS_PILL_GAP + amountWidth;
    const contentLeft = -contentWidth / 2;
    parts.icon.setPosition(contentLeft + COIN_ICON_SIZE / 2, 0);
    parts.amount.setPosition(contentLeft + COIN_ICON_SIZE + COINS_PILL_GAP, 0);
  }

  private addMergeOrb(rowY: number): void {
    const orb = this.add.container(0, rowY).setDepth(4);
    const ring = this.add.graphics();
    const gfx = this.add.graphics();
    const icon = this.add
      .text(1, -1, '▶', {
        color: '#5c3a00',
        fontSize: '26px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);

    const hit = this.add.zone(0, 0, MERGE_ORB_SIZE + 16, MERGE_ORB_SIZE + 16);
    hit.setInteractive({ useHandCursor: true });

    orb.add([ring, gfx, icon, hit]);
    this.mergeOrb = orb;
    this.mergeOrbGfx = gfx;
    this.mergeOrbIcon = icon;
    this.mergeOrbRing = ring;
    this.mergeHit = hit;

    this.drawMergeOrb(false);

    hit.on('pointerdown', () => {
      if (this.doubleClaimed || this.doubleRequesting) return;
      soundManager.playPop();
      this.tweens.killTweensOf(orb);
      this.tweens.add({ targets: orb, scale: 0.9, duration: 70, ease: 'Power2' });
    });

    hit.on('pointerup', () => {
      if (this.doubleClaimed || this.doubleRequesting) return;
      this.tweens.killTweensOf(orb);
      this.tweens.add({
        targets: orb,
        scale: 1,
        duration: 110,
        ease: 'Back.easeOut',
        onComplete: () => this.requestDoubleCoins(),
      });
    });

    hit.on('pointerout', () => {
      this.tweens.killTweensOf(orb);
      this.tweens.add({ targets: orb, scale: 1, duration: 100, ease: 'Back.easeOut' });
    });

    this.tweens.add({
      targets: orb,
      scaleX: 1.08,
      scaleY: 1.08,
      yoyo: true,
      repeat: -1,
      duration: 700,
      ease: 'Sine.InOut',
      delay: 400,
    });

    this.tweens.add({
      targets: ring,
      angle: 360,
      duration: 4200,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private drawMergeOrb(loading: boolean): void {
    if (!this.mergeOrbGfx || !this.mergeOrbRing || !this.mergeOrbIcon) return;

    const r = MERGE_ORB_SIZE / 2;
    this.mergeOrbGfx.clear();
    this.mergeOrbRing.clear();

    // Orbit ticks — suggests “spin to merge”.
    this.mergeOrbRing.lineStyle(3, 0xf0c45a, 0.55);
    for (let i = 0; i < 6; i += 1) {
      const a0 = (i / 6) * Math.PI * 2;
      const a1 = a0 + 0.35;
      this.mergeOrbRing.beginPath();
      this.mergeOrbRing.arc(0, 0, r + 7, a0, a1);
      this.mergeOrbRing.strokePath();
    }

    this.mergeOrbGfx.fillStyle(ORB_STROKE, 1);
    this.mergeOrbGfx.fillCircle(0, 2, r);
    this.mergeOrbGfx.fillStyle(ORB_FILL, 1);
    this.mergeOrbGfx.fillCircle(0, 0, r);
    this.mergeOrbGfx.fillStyle(ORB_INNER, 1);
    this.mergeOrbGfx.fillCircle(-6, -7, r * 0.34);
    this.mergeOrbGfx.lineStyle(3, ORB_STROKE, 1);
    this.mergeOrbGfx.strokeCircle(0, 0, r);

    this.mergeOrbIcon.setText(loading ? '…' : '▶');
  }

  private layoutMergeOffer(): void {
    if (!this.leftPill || !this.ghostPill || !this.mergeOrb) return;

    const leftW = this.leftPill.width;
    const rightW = this.ghostPill.width;
    const total = leftW + MERGE_GAP + MERGE_ORB_SIZE + MERGE_GAP + rightW;
    const left = this.coinsRowCenterX - total / 2;

    this.leftPill.root.setPosition(left + leftW / 2, this.coinsRowY).setDepth(3);
    this.mergeOrb.setPosition(left + leftW + MERGE_GAP + MERGE_ORB_SIZE / 2, this.coinsRowY);
    this.ghostPill.root
      .setPosition(
        left + leftW + MERGE_GAP + MERGE_ORB_SIZE + MERGE_GAP + rightW / 2,
        this.coinsRowY
      )
      .setDepth(3);
  }

  private animatePillPop(pill: CoinPillParts, delay = 0): void {
    pill.root.setScale(0);
    this.tweens.add({
      targets: pill.root,
      scale: 1,
      duration: 380,
      ease: 'Back.Out',
      delay: 120 + delay,
    });
  }

  private requestDoubleCoins(): void {
    if (this.doubleClaimed || this.doubleRequesting || this.coinsEarned <= 0) return;

    this.doubleRequesting = true;
    this.mergeHit?.disableInteractive();
    this.drawMergeOrb(true);
    eventBus.emit('ad:reward:request', { placement: DOUBLE_COINS_PLACEMENT });
  }

  private handleDoubleCoinsResult(success: boolean, message?: string): void {
    this.doubleRequesting = false;

    if (!this.sys.isActive()) return;

    if (!success) {
      this.drawMergeOrb(false);
      this.mergeHit?.setInteractive({ useHandCursor: true });
      if (message) toast.show({ message, type: 'error' });
      return;
    }

    if (this.doubleClaimed || this.coinsEarned <= 0) return;

    this.doubleClaimed = true;
    usePlatformStore.getState().addCoins(this.coinsEarned);
    this.playMergeDoubleAnimation();
  }

  /** Slam both coin pills into the orb — fruit-merge fantasy for x2. */
  private playMergeDoubleAnimation(): void {
    const left = this.leftPill;
    const ghost = this.ghostPill;
    const orb = this.mergeOrb;
    if (!left || !ghost || !orb) return;

    this.tweens.killTweensOf(orb);
    if (this.mergeOrbRing) this.tweens.killTweensOf(this.mergeOrbRing);
    orb.setScale(1);
    this.mergeHit?.disableInteractive();

    const centerX = this.coinsRowCenterX;
    const centerY = this.coinsRowY;

    this.tweens.add({
      targets: left.root,
      x: centerX,
      scale: 0.72,
      duration: 320,
      ease: 'Back.In',
    });

    this.tweens.add({
      targets: ghost.root,
      x: centerX,
      scale: 0.72,
      alpha: 1,
      duration: 320,
      ease: 'Back.In',
      onComplete: () => {
        soundManager.playCombine();
        left.root.setVisible(false);
        ghost.root.setVisible(false);
        orb.setVisible(false);

        this.spawnMergeBurst(centerX, centerY);
        this.showMergedResult(centerX, centerY);
      },
    });
  }

  private showMergedResult(x: number, y: number): void {
    const doubled = this.coinsEarned * 2;
    this.mergedPill = this.createCoinPill(doubled, false);
    this.mergedPill.root.setPosition(x, y).setDepth(5).setScale(0.4);

    // Gold flash ring behind the merged pill.
    const flash = this.add.graphics().setDepth(4);
    flash.fillStyle(0xffe08a, 0.55);
    flash.fillCircle(x, y, 18);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 420,
      onUpdate: () => {
        const p = 1 - (flash.alpha ?? 0);
        flash.clear();
        flash.fillStyle(0xffe08a, 0.45 * (1 - p));
        flash.fillCircle(x, y, 18 + p * 42);
      },
      onComplete: () => flash.destroy(),
    });

    this.tweens.add({
      targets: this.mergedPill.root,
      scale: 1.12,
      duration: 280,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: this.mergedPill?.root,
          scale: 1,
          duration: 140,
          ease: 'Sine.Out',
        });
      },
    });
  }

  private spawnMergeBurst(x: number, y: number): void {
    for (let i = 0; i < 7; i += 1) {
      const spark = this.add.image(x, y, 'coin-icon').setDepth(6);
      spark.setDisplaySize(16, 16);
      const angle = -Math.PI * 0.15 + (i / 6) * Math.PI * 1.3;
      const dist = 46 + (i % 3) * 14;
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 10,
        alpha: 0,
        scale: 0.4,
        duration: 420 + i * 30,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      });
    }
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
    this.rateModal?.destroy();
    this.rateModal = undefined;
    this.rankText = undefined;
    this.leftPill = undefined;
    this.ghostPill = undefined;
    this.mergedPill = undefined;
    this.mergeOrb = undefined;
    this.mergeOrbGfx = undefined;
    this.mergeOrbIcon = undefined;
    this.mergeOrbRing = undefined;
    this.mergeHit = undefined;
  }

  private cleanupEventListeners(): void {
    this.rankRequestId += 1;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

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

    this.rankText.setText(t('game.rank', { rank }));
    this.rankText.setVisible(true);
  }
}

function formatScore(score: number): string {
  const locale = i18n.getCurrentLanguage() === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.NumberFormat(locale).format(Math.floor(score));
}
