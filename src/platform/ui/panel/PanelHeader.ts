import Phaser from 'phaser';

import type { UIButton } from '../types';
import { drawRoundedRect } from './graphics';
import { toast } from '../toast/ToastManager';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { formatNumber } from '@platform/core/utils';
import { shop } from '@platform/modules/shop';
import { t } from '@platform/modules/i18n/i18n.service';
import { usePlatformStore } from '@platform/core/state';
import { PANEL_BG, TEXT_COLOR, PANEL_BORDER } from './panelTheme';
import { COINS_10000_AMOUNT, COINS_10000_PRICE } from '@platform/modules/iap/iap.config';

const COIN_BAR_GAP = 10;
const COIN_BAR_PAD_X = 8;
const COIN_ICON_SIZE = 48;
const COIN_PLUS_SIZE = 48;
const COIN_BAR_HEIGHT = 54;
const COIN_BAR_MIN_WIDTH = 120;

const COINS_PACK_ITEM_ID = 'coins_10000';
const GET_COINS_BTN_HEIGHT = 80;
const GET_COINS_PAD_TOP = 52;
const GET_COINS_PAD_BOTTOM = 28;
const GET_COINS_ACTION_GAP = 12;
const GET_COINS_SECTION_GAP = 18;
const GET_COINS_DIVIDER_THICKNESS = 2;

const GET_COIN_ACTIONS = [
  { labelKey: 'shop.getCoins.missions', sceneKey: 'Missions' },
  { labelKey: 'shop.getCoins.dailyReward', sceneKey: 'DailyReward' },
] as const;

export interface PanelHeaderOptions {
  titleKey: string;
  bannerKey?: string;
  /** Target banner display width in px. Defaults to min(screen*0.72, 360). */
  bannerWidth?: number;
  onBack: () => void;
  /** Hide the + button / get-coins modal (e.g. when already offering coin sources). */
  showGetCoins?: boolean;
  /** Scene keys to omit from the get-coins modal (e.g. hide Missions while already there). */
  excludeGetCoinScenes?: string[];
  onNavigate: (sceneKey: string) => void;
}

/**
 * Shared beige-panel header: back button, title banner, coin bar (+ optional get-coins modal).
 */
export class PanelHeader extends Phaser.GameObjects.Container {
  private readonly showGetCoins: boolean;
  private readonly excludeGetCoinScenes: Set<string>;
  private readonly onNavigate: (sceneKey: string) => void;

  private coinBarY = 0;
  private plusButton?: UIButton;
  private storeUnsubscribe?: () => void;
  private coinText?: Phaser.GameObjects.Text;
  private coinIcon?: Phaser.GameObjects.Image;
  private coinBar?: Phaser.GameObjects.Graphics;
  private getCoinsModal?: Phaser.GameObjects.Container;
  private purchasingCoins = false;

  constructor(scene: Phaser.Scene, options: PanelHeaderOptions) {
    super(scene, 0, 0);
    this.onNavigate = options.onNavigate;
    this.showGetCoins = options.showGetCoins !== false;
    this.excludeGetCoinScenes = new Set(options.excludeGetCoinScenes ?? []);
    scene.add.existing(this);

    const { width, height } = scene.cameras.main;
    this.buildHeader(width, height, options.onBack);
    this.buildBanner(
      width,
      height,
      options.titleKey,
      options.bannerKey ?? 'shop-banner',
      options.bannerWidth
    );
    this.bindStore();
  }

  destroy(fromScene?: boolean): void {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = undefined;
    this.getCoinsModal?.destroy(true);
    this.getCoinsModal = undefined;
    super.destroy(fromScene);
  }

  isGetCoinsModalOpen(): boolean {
    return !!this.getCoinsModal?.visible;
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
        this.hideGetCoinsModal();
        this.onNavigate(action.sceneKey);
      },
    }));
    const iapSection = {
      kind: 'iap' as const,
      label: t('shop.getCoins.buyCoins', {
        coins: formatNumber(COINS_10000_AMOUNT),
        price: COINS_10000_PRICE,
      }),
      fontSize: 18,
      backgroundKey: 'settings-button-background',
      onClick: () => {
        void this.purchaseCoinPack();
      },
    };

    const hasDivider = navSections.length > 0;
    const panelWidth = Math.min(340, width * 0.82);
    const navGapTotal = Math.max(0, navSections.length - 1) * GET_COINS_ACTION_GAP;
    const dividerBlock = hasDivider ? GET_COINS_SECTION_GAP * 2 + GET_COINS_DIVIDER_THICKNESS : 0;
    const panelHeight =
      GET_COINS_PAD_TOP +
      navSections.length * GET_COINS_BTN_HEIGHT +
      navGapTotal +
      dividerBlock +
      GET_COINS_BTN_HEIGHT +
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
        this.createGetCoinsDivider(
          width / 2,
          cursorY + GET_COINS_DIVIDER_THICKNESS / 2,
          dividerWidth
        )
      );
      cursorY += GET_COINS_DIVIDER_THICKNESS + GET_COINS_SECTION_GAP;
    }

    modal.add(
      createUIButton({
        scene: this.scene,
        position: { x: width / 2, y: cursorY + GET_COINS_BTN_HEIGHT / 2 },
        size: { width: buttonWidth, height: GET_COINS_BTN_HEIGHT },
        background: { key: iapSection.backgroundKey },
        text: {
          content: iapSection.label,
          style: {
            fontSize: iapSection.fontSize,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: iapSection.onClick,
      })
    );

    this.getCoinsModal = modal;
  }

  hideGetCoinsModal(): void {
    this.getCoinsModal?.setVisible(false);
  }

  private createGetCoinsDivider(
    centerX: number,
    y: number,
    width: number
  ): Phaser.GameObjects.Graphics {
    const line = this.scene.add.graphics();
    line.lineStyle(2, PANEL_BORDER, 0.55);
    line.beginPath();
    line.moveTo(centerX - width / 2, y);
    line.lineTo(centerX + width / 2, y);
    line.strokePath();
    return line;
  }

  private async purchaseCoinPack(): Promise<void> {
    if (this.purchasingCoins) return;
    this.purchasingCoins = true;

    toast.show({ message: t('shop.getCoins.purchasing'), type: 'info', duration: 2500 });

    try {
      const success = await shop.purchase(COINS_PACK_ITEM_ID);
      if (success) {
        toast.show({
          type: 'success',
          message: t('shop.getCoins.purchaseSuccess', {
            coins: formatNumber(COINS_10000_AMOUNT),
          }),
        });
        this.hideGetCoinsModal();
        return;
      }

      toast.show({ message: t('shop.purchaseFailed'), type: 'error' });
    } finally {
      this.purchasingCoins = false;
    }
  }

  private buildHeader(width: number, height: number, onBack: () => void): void {
    const headerY = height * 0.08;

    this.add(
      createUIButton({
        scene: this.scene,
        size: { width: 80, height: 80 },
        background: { key: 'back-icon' },
        onClick: onBack,
        position: { x: width * 0.18, y: headerY },
      })
    );

    this.coinBarY = headerY;
    this.coinBar = this.scene.add.graphics();
    this.add(this.coinBar);

    this.coinIcon = this.scene.add.image(0, headerY, 'coin-icon');
    this.coinIcon.setDisplaySize(COIN_ICON_SIZE, COIN_ICON_SIZE);
    this.add(this.coinIcon);

    this.coinText = this.scene.add
      .text(0, headerY, formatNumber(usePlatformStore.getState().currency.coins), {
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
        position: { x: 0, y: headerY },
        size: { width: COIN_PLUS_SIZE, height: COIN_PLUS_SIZE },
        background: { key: 'plus-icon' },
        onClick: () => this.showGetCoinsModal(),
      });
      this.add(this.plusButton);
    }

    this.layoutCoinBar(width);
  }

  private layoutCoinBar(width = this.scene.cameras.main.width): void {
    if (!this.coinBar || !this.coinIcon || !this.coinText) return;

    const textWidth = Math.ceil(this.coinText.width);
    const trailingWidth = this.plusButton ? COIN_BAR_GAP + COIN_PLUS_SIZE : 0;
    const coinBarWidth = Math.max(
      COIN_BAR_MIN_WIDTH,
      COIN_BAR_PAD_X * 2 + COIN_ICON_SIZE + COIN_BAR_GAP + textWidth + trailingWidth
    );
    const left = width * 0.88 - coinBarWidth;
    const centerY = this.coinBarY;

    this.coinBar.clear();
    drawRoundedRect(
      this.coinBar,
      left,
      centerY - COIN_BAR_HEIGHT / 2,
      coinBarWidth,
      COIN_BAR_HEIGHT,
      COIN_BAR_HEIGHT / 2,
      PANEL_BG,
      PANEL_BORDER
    );

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

  private buildBanner(
    width: number,
    height: number,
    titleKey: string,
    bannerKey: string,
    bannerWidth?: number
  ): void {
    const bannerY = height * 0.18;
    const banner = this.scene.add.image(width / 2, bannerY, bannerKey);
    const defaultWidth = Math.min(width * 0.72, 360);
    const targetWidth = bannerWidth ?? defaultWidth;
    const targetHeight = banner.height * (defaultWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 16, t(titleKey), {
          fontSize: '48px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
  }

  private bindStore(): void {
    let coins = usePlatformStore.getState().currency.coins;
    this.storeUnsubscribe = usePlatformStore.subscribe((state) => {
      if (state.currency.coins === coins) return;
      coins = state.currency.coins;
      this.coinText?.setText(formatNumber(coins));
      this.layoutCoinBar();
    });
  }
}
