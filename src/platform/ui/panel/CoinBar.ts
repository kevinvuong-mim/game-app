import Phaser from 'phaser';

import type { UIButton } from '../types';
import { shop } from '@platform/modules/shop';
import { toast } from '../toast/ToastManager';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { formatNumber } from '@platform/core/utils';
import { t } from '@platform/modules/i18n/i18n.service';
import { usePlatformStore } from '@platform/core/state';
import { drawRoundedRect, measureTextWidth } from './graphics';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { PANEL_BG, TEXT_COLOR, PANEL_BORDER } from './panelTheme';
import { getWorldPosition, spawnCoinsFlyTo } from '../effects/coinFly';
import { COINS_10000_AMOUNT, COINS_10000_PRICE } from '@platform/modules/iap/iap.config';

const COIN_BAR_GAP = 10;
const COIN_BAR_PAD_X = 8;
const COIN_ICON_SIZE = 48;
const COIN_PLUS_SIZE = 48;
const COIN_BAR_HEIGHT = 54;
const GET_COINS_PAD_TOP = 40;
const SPEND_DIP_BG = 0xf5c4b8;
const COIN_BAR_MIN_WIDTH = 120;
const GET_COINS_BTN_HEIGHT = 80;
const GET_COINS_PAD_BOTTOM = 40;
const GET_COINS_ACTION_GAP = 12;
const GET_COINS_SECTION_GAP = 14;
const SPEND_DIP_TEXT = '#c62828';
const SPEND_DIP_BORDER = 0xc45c4a;
const GET_COINS_DIVIDER_HEIGHT = 22;
const COINS_PACK_ITEM_ID = 'coins_10000';

/** IAP coin-pack card in the get-coins modal. */
const IAP_TEXT_GAP = 8;
const IAP_PACK_PAD = 12;
const IAP_COIN_SIZE = 48;
const IAP_PACK_RADIUS = 16;
const IAP_PACK_BG = 0xfff3d6;
const IAP_PRICE_BTN_PAD_X = 14;
const IAP_PRICE_BTN_HEIGHT = 56;
const IAP_PACK_BORDER = 0xd4a017;
const IAP_PRICE_BTN_MIN_WIDTH = 92;
const IAP_PACK_HEIGHT = IAP_PRICE_BTN_HEIGHT + IAP_PACK_PAD * 2;

const GET_COIN_ACTIONS = [
  { labelKey: 'shop.getCoins.missions', sceneKey: 'Missions' },
  { labelKey: 'shop.getCoins.dailyReward', sceneKey: 'DailyReward' },
] as const;

export interface CoinBarOptions {
  /** Vertical center of the bar. */
  y: number;
  /**
   * Anchor X: bar center when `align: 'center'`, right edge when `align: 'right'`.
   * Defaults to screen center (center) or `width * 0.88` (right).
   */
  x?: number;
  /** Hide the + button / get-coins modal. */
  showGetCoins?: boolean;
  /** Horizontal alignment. Defaults to `'center'`. */
  align?: 'center' | 'right';
  /** Scene keys to omit from the get-coins modal. */
  excludeGetCoinScenes?: string[];
  onNavigate: (sceneKey: string) => void;
}

/**
 * Coin pill: coin icon, balance, optional + (opens get-coins modal).
 */
export class CoinBar extends Phaser.GameObjects.Container {
  private readonly barY: number;
  private readonly anchorX: number;
  private readonly showGetCoins: boolean;
  private readonly align: 'center' | 'right';
  private readonly excludeGetCoinScenes: Set<string>;
  private readonly onNavigate: (sceneKey: string) => void;

  private plusButton?: UIButton;
  private purchasingCoins = false;
  private buyCoinsButton?: UIButton;
  private storeUnsubscribe?: () => void;
  private coinText?: Phaser.GameObjects.Text;
  private coinIcon?: Phaser.GameObjects.Image;
  private coinBarGfx?: Phaser.GameObjects.Graphics;
  private iapPackCoinIcon?: Phaser.GameObjects.Image;
  private getCoinsModal?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, options: CoinBarOptions) {
    super(scene, 0, 0);
    this.onNavigate = options.onNavigate;
    this.showGetCoins = options.showGetCoins !== false;
    this.excludeGetCoinScenes = new Set(options.excludeGetCoinScenes ?? []);
    this.align = options.align ?? 'center';
    this.barY = options.y;

    const { width } = scene.cameras.main;
    this.anchorX = options.x ?? (this.align === 'right' ? width * 0.88 : width / 2);

    scene.add.existing(this);
    this.build();
    this.bindStore();
  }

  destroy(fromScene?: boolean): void {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = undefined;
    this.getCoinsModal?.destroy(true);
    this.getCoinsModal = undefined;
    this.buyCoinsButton = undefined;
    this.iapPackCoinIcon = undefined;
    super.destroy(fromScene);
  }

  isGetCoinsModalOpen(): boolean {
    return !!this.getCoinsModal?.visible;
  }

  /** World-space center of the coin icon (for fly-in VFX). */
  getCoinIconWorldPosition(): { x: number; y: number } {
    if (!this.coinIcon) {
      return { x: this.anchorX, y: this.barY };
    }
    const matrix = this.coinIcon.getWorldTransformMatrix();
    return { x: matrix.tx, y: matrix.ty };
  }

  /** Quick pop when a flying coin lands in the bar. */
  pulseReceive(): void {
    if (!this.coinIcon) return;
    this.scene.tweens.killTweensOf(this.coinIcon);
    this.coinIcon.setDisplaySize(COIN_ICON_SIZE, COIN_ICON_SIZE);
    this.scene.tweens.add({
      targets: this.coinIcon,
      displayWidth: COIN_ICON_SIZE * 1.22,
      displayHeight: COIN_ICON_SIZE * 1.22,
      duration: 90,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  /**
   * Spend feedback: bar dips red briefly and a floating "-N" rises from the balance.
   */
  playSpendDip(amount: number): void {
    if (amount <= 0 || !this.coinText || !this.coinBarGfx) return;

    this.scene.tweens.killTweensOf(this.coinText);
    this.coinText.setColor(SPEND_DIP_TEXT);
    this.coinText.setScale(1);

    this.redrawBar(SPEND_DIP_BG, SPEND_DIP_BORDER);

    this.scene.tweens.add({
      targets: this.coinText,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 110,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        this.coinText?.setColor(TEXT_COLOR);
        this.coinText?.setScale(1);
      },
    });

    this.scene.time.delayedCall(160, () => {
      if (!this.active) return;
      this.layout();
    });

    const origin = this.getBalanceWorldPosition();
    const label = this.scene.add
      .text(origin.x, origin.y - 8, `-${formatNumber(amount)}`, {
        fontSize: '22px',
        fontStyle: 'bold',
        color: SPEND_DIP_TEXT,
        fontFamily: FREDOKA_FONT,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(220);

    this.scene.tweens.add({
      targets: label,
      y: origin.y - 52,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  /** World-space center of the balance text (for spend VFX). */
  getBalanceWorldPosition(): { x: number; y: number } {
    if (!this.coinText) {
      return { x: this.anchorX, y: this.barY };
    }
    const matrix = this.coinText.getWorldTransformMatrix();
    return { x: matrix.tx, y: matrix.ty };
  }

  showGetCoinsModal(): void {
    if (!this.showGetCoins) return;

    if (this.getCoinsModal) {
      this.getCoinsModal.setVisible(true);
      return;
    }

    const { width, height } = this.scene.cameras.main;
    const modal = this.scene.add.container(0, 0).setDepth(100);

    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hideGetCoinsModal());

    const actions = GET_COIN_ACTIONS.filter(
      (action) => !this.excludeGetCoinScenes.has(action.sceneKey)
    );
    const navSections = actions.map((action) => ({
      kind: 'nav' as const,
      label: t(action.labelKey),
      fontSize: 22,
      backgroundKey: 'leaderboard-button-background',
      onClick: () => {
        if (this.purchasingCoins) return;
        this.hideGetCoinsModal();
        this.onNavigate(action.sceneKey);
      },
    }));

    const hasDivider = navSections.length > 0;
    const panelWidth = Math.min(340, width * 0.82);
    const navGapTotal = Math.max(0, navSections.length - 1) * GET_COINS_ACTION_GAP;
    const dividerBlock = hasDivider ? GET_COINS_SECTION_GAP * 2 + GET_COINS_DIVIDER_HEIGHT : 0;
    const panelHeight =
      GET_COINS_PAD_TOP +
      navSections.length * GET_COINS_BTN_HEIGHT +
      navGapTotal +
      dividerBlock +
      IAP_PACK_HEIGHT +
      GET_COINS_PAD_BOTTOM;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;

    const panelGfx = this.scene.add.graphics();
    drawRoundedRect(panelGfx, panelX, panelY, panelWidth, panelHeight, 20, PANEL_BG, PANEL_BORDER);

    const panelHit = this.scene.add
      .rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x000000, 0)
      .setInteractive();

    modal.add([overlay, panelGfx, panelHit]);

    const closeSize = 56;
    modal.add(
      createUIButton({
        scene: this.scene,
        position: {
          x: panelX + panelWidth - 6,
          y: panelY + 6,
        },
        size: { width: closeSize, height: closeSize },
        background: { key: 'close-icon' },
        onClick: () => this.hideGetCoinsModal(),
      })
    );

    const buttonWidth = Math.min(260, panelWidth * 0.78);
    const dividerWidth = panelWidth * 0.72;
    let cursorY = panelY + GET_COINS_PAD_TOP;

    navSections.forEach((section, index) => {
      if (index > 0) cursorY += GET_COINS_ACTION_GAP;

      modal.add(
        createUIButton({
          scene: this.scene,
          position: { x: width / 2, y: cursorY + GET_COINS_BTN_HEIGHT / 2 },
          size: { width: buttonWidth, height: GET_COINS_BTN_HEIGHT },
          background: { key: section.backgroundKey },
          text: {
            content: section.label,
            style: {
              fontSize: section.fontSize,
              fontStyle: 'bold',
              border: { width: 3, color: '#000000' },
            },
          },
          onClick: section.onClick,
        })
      );
      cursorY += GET_COINS_BTN_HEIGHT;
    });

    if (hasDivider) {
      cursorY += GET_COINS_SECTION_GAP;
      modal.add(
        this.createGetCoinsDivider(width / 2, cursorY + GET_COINS_DIVIDER_HEIGHT / 2, dividerWidth)
      );
      cursorY += GET_COINS_DIVIDER_HEIGHT + GET_COINS_SECTION_GAP;
    }

    modal.add(
      this.createIapCoinPack(width / 2, cursorY, buttonWidth, () => {
        void this.purchaseCoinPack();
      })
    );

    this.getCoinsModal = modal;
  }

  hideGetCoinsModal(): void {
    if (this.purchasingCoins) return;
    this.getCoinsModal?.setVisible(false);
  }

  private createGetCoinsDivider(
    centerX: number,
    y: number,
    width: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(centerX, y);

    const label = this.scene.add
      .text(0, 0, t('shop.getCoins.or'), {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#8a7340',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);
    container.add(label);

    const gap = 10;
    const lineWidth = Math.max(24, (width - label.width) / 2 - gap);
    const lineY = 0;
    const lines = this.scene.add.graphics();
    lines.lineStyle(2, PANEL_BORDER, 0.45);
    lines.beginPath();
    lines.moveTo(-label.width / 2 - gap - lineWidth, lineY);
    lines.lineTo(-label.width / 2 - gap, lineY);
    lines.moveTo(label.width / 2 + gap, lineY);
    lines.lineTo(label.width / 2 + gap + lineWidth, lineY);
    lines.strokePath();
    container.add(lines);

    return container;
  }

  /** Soft gold offer card: coin icon + amount + price CTA. */
  private createIapCoinPack(
    centerX: number,
    topY: number,
    packWidth: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const pack = this.scene.add.container(centerX, topY + IAP_PACK_HEIGHT / 2);
    const halfW = packWidth / 2;
    const halfH = IAP_PACK_HEIGHT / 2;

    const cardGfx = this.scene.add.graphics();
    drawRoundedRect(
      cardGfx,
      -halfW,
      -halfH,
      packWidth,
      IAP_PACK_HEIGHT,
      IAP_PACK_RADIUS,
      IAP_PACK_BG,
      IAP_PACK_BORDER,
      3
    );
    // Soft top sheen for depth.
    cardGfx.fillStyle(0xffffff, 0.28);
    cardGfx.fillRoundedRect(-halfW + 4, -halfH + 4, packWidth - 8, IAP_PACK_HEIGHT * 0.38, {
      tl: IAP_PACK_RADIUS - 4,
      tr: IAP_PACK_RADIUS - 4,
      bl: 8,
      br: 8,
    });
    pack.add(cardGfx);

    const coinX = -halfW + IAP_PACK_PAD + IAP_COIN_SIZE / 2;
    this.iapPackCoinIcon = this.scene.add.image(coinX, 0, 'coin-icon');
    this.iapPackCoinIcon.setDisplaySize(IAP_COIN_SIZE, IAP_COIN_SIZE);
    pack.add(this.iapPackCoinIcon);

    this.scene.tweens.add({
      targets: this.iapPackCoinIcon,
      y: -3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const textX = coinX + IAP_COIN_SIZE / 2 + IAP_TEXT_GAP;
    const amountLabel = t('shop.getCoins.coinPackAmount', {
      coins: formatNumber(COINS_10000_AMOUNT),
    });
    pack.add(
      this.scene.add
        .text(textX, -10, amountLabel, {
          fontSize: '22px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
          stroke: '#ffffff',
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5)
    );
    pack.add(
      this.scene.add
        .text(textX, 12, t('shop.getCoins.coinPackLabel'), {
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#8a7340',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0.5)
    );

    const priceLabel = t('shop.getCoins.buyPrice', { price: COINS_10000_PRICE });
    const priceTextWidth = measureTextWidth(this.scene, priceLabel, {
      fontSize: '18px',
      fontStyle: 'bold',
      fontFamily: FREDOKA_FONT,
      stroke: '#000000',
      strokeThickness: 3,
    });
    const priceBtnWidth = Math.max(
      IAP_PRICE_BTN_MIN_WIDTH,
      IAP_PRICE_BTN_PAD_X * 2 + priceTextWidth
    );
    const priceBtnX = halfW - IAP_PACK_PAD - priceBtnWidth / 2;

    this.buyCoinsButton = createUIButton({
      scene: this.scene,
      position: { x: priceBtnX, y: 0 },
      size: { width: priceBtnWidth, height: IAP_PRICE_BTN_HEIGHT },
      background: { key: 'play-button-background' },
      text: {
        content: priceLabel,
        style: {
          fontSize: 18,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      sound: 'coin-drop',
      onClick,
    });
    pack.add(this.buyCoinsButton);

    return pack;
  }

  private async purchaseCoinPack(): Promise<void> {
    if (this.purchasingCoins) return;
    this.purchasingCoins = true;
    this.buyCoinsButton?.setLoading(true);

    let success = false;
    try {
      success = await shop.purchase(COINS_PACK_ITEM_ID);
      if (success) {
        soundManager.playCoinDrop();
        this.playPurchaseCoinFly();
      } else {
        toast.show({ message: t('shop.purchaseFailed'), type: 'error' });
      }
    } finally {
      this.purchasingCoins = false;
      this.buyCoinsButton?.setLoading(false);
    }

    if (success) {
      this.hideGetCoinsModal();
    }
  }

  /** Coins fly from the offer-card coin icon into the CoinBar after a successful IAP pack purchase. */
  private playPurchaseCoinFly(): void {
    const { width, height } = this.scene.cameras.main;
    const from = this.iapPackCoinIcon
      ? getWorldPosition(this.iapPackCoinIcon)
      : { x: width / 2, y: height / 2 };
    const to = this.getCoinIconWorldPosition();
    const count = Math.min(10, Math.max(6, Math.round(COINS_10000_AMOUNT / 1200)));

    spawnCoinsFlyTo(this.scene, from, to, {
      count,
      size: 30,
      onCoinArrive: () => this.pulseReceive(),
    });
  }

  private build(): void {
    this.coinBarGfx = this.scene.add.graphics();
    this.add(this.coinBarGfx);

    this.coinIcon = this.scene.add.image(0, this.barY, 'coin-icon');
    this.coinIcon.setDisplaySize(COIN_ICON_SIZE, COIN_ICON_SIZE);
    this.add(this.coinIcon);

    this.coinText = this.scene.add
      .text(0, this.barY, formatNumber(usePlatformStore.getState().currency.coins), {
        fontSize: '22px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);
    this.add(this.coinText);

    if (this.showGetCoins) {
      this.plusButton = createUIButton({
        scene: this.scene,
        position: { x: 0, y: this.barY },
        size: { width: COIN_PLUS_SIZE, height: COIN_PLUS_SIZE },
        background: { key: 'plus-icon' },
        onClick: () => this.showGetCoinsModal(),
      });
      this.add(this.plusButton);
    }

    this.layout();
  }

  private layout(): void {
    if (!this.coinBarGfx || !this.coinIcon || !this.coinText) return;

    const textWidth = Math.ceil(this.coinText.width);
    const trailingWidth = this.plusButton ? COIN_BAR_GAP + COIN_PLUS_SIZE : 0;
    const coinBarWidth = Math.max(
      COIN_BAR_MIN_WIDTH,
      COIN_BAR_PAD_X * 2 + COIN_ICON_SIZE + COIN_BAR_GAP + textWidth + trailingWidth
    );

    const left =
      this.align === 'right' ? this.anchorX - coinBarWidth : this.anchorX - coinBarWidth / 2;
    const centerY = this.barY;

    this.redrawBar(PANEL_BG, PANEL_BORDER, left, centerY, coinBarWidth);

    const coinIconX = left + COIN_BAR_PAD_X + COIN_ICON_SIZE / 2;

    if (this.plusButton) {
      const plusX = left + coinBarWidth - COIN_BAR_PAD_X - COIN_PLUS_SIZE / 2;
      const textX = (coinIconX + COIN_ICON_SIZE / 2 + plusX - COIN_PLUS_SIZE / 2) / 2;
      this.coinIcon.setPosition(coinIconX, centerY);
      this.coinText.setPosition(textX, centerY);
      this.plusButton.setPosition(plusX, centerY);
      return;
    }

    const textX = left + coinBarWidth - COIN_BAR_PAD_X - textWidth / 2;
    this.coinIcon.setPosition(coinIconX, centerY);
    this.coinText.setPosition(textX, centerY);
  }

  private redrawBar(
    fill: number,
    border: number,
    left?: number,
    centerY?: number,
    coinBarWidth?: number
  ): void {
    if (!this.coinBarGfx || !this.coinText) return;

    const textWidth = Math.ceil(this.coinText.width);
    const trailingWidth = this.plusButton ? COIN_BAR_GAP + COIN_PLUS_SIZE : 0;
    const width =
      coinBarWidth ??
      Math.max(
        COIN_BAR_MIN_WIDTH,
        COIN_BAR_PAD_X * 2 + COIN_ICON_SIZE + COIN_BAR_GAP + textWidth + trailingWidth
      );
    const barLeft =
      left ?? (this.align === 'right' ? this.anchorX - width : this.anchorX - width / 2);
    const y = centerY ?? this.barY;

    this.coinBarGfx.clear();
    drawRoundedRect(
      this.coinBarGfx,
      barLeft,
      y - COIN_BAR_HEIGHT / 2,
      width,
      COIN_BAR_HEIGHT,
      COIN_BAR_HEIGHT / 2,
      fill,
      border
    );
  }

  private bindStore(): void {
    let coins = usePlatformStore.getState().currency.coins;
    this.storeUnsubscribe = usePlatformStore.subscribe((state) => {
      if (state.currency.coins === coins) return;
      coins = state.currency.coins;
      this.coinText?.setText(formatNumber(coins));
      this.layout();
    });
  }
}
