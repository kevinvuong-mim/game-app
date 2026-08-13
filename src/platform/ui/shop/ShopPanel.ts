import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_LIST_PADDING,
  PANEL_CORNER_RADIUS,
} from '../panel/panelTheme';
import type { UIButton } from '../types';
import { toast } from '../toast/ToastManager';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { PanelHeader } from '../panel/PanelHeader';
import { createUIButton } from '../button/UIButton';
import { formatNumber } from '@platform/core/utils';
import { t } from '@platform/modules/i18n/i18n.service';
import { usePlatformStore } from '@platform/core/state';
import { shop, type ShopItem } from '@platform/modules/shop';
import { DeferredListRebuild } from '../panel/deferredListRebuild';
import { drawRoundedRect, measureTextWidth } from '../panel/graphics';

const PRICE_BTN_GAP = 6;
const PRICE_BTN_PAD_X = 14;
const PRICE_ICON_SIZE = 22;
const PRICE_BTN_HEIGHT = 60;
const ITEM_ROW_HEIGHT = 146;
const PRICE_BTN_MIN_WIDTH = 100;
const PRICE_BTN_RIGHT_MARGIN = 4;
const FALLBACK_ITEM_ICON = 'shop-item-1';

/**
 * Shop UI — coin boosts only. IAP (remove ads) lives in Settings.
 */
export class ShopPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly onNavigate: (sceneKey: string) => void;
  private readonly listRebuild = new DeferredListRebuild(() => this.rebuildItems());

  private header?: PanelHeader;
  private purchaseUiLocked = false;
  private priceButtons: UIButton[] = [];
  private listContainer?: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    options: {
      onBack: () => void;
      onNavigate: (sceneKey: string) => void;
    }
  ) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.onNavigate = options.onNavigate;
    scene.add.existing(this);
    this.build();
    this.listRebuild.runNow();
  }

  destroy(fromScene?: boolean): void {
    this.header = undefined;
    super.destroy(fromScene);
  }

  isGetCoinsModalOpen(): boolean {
    return !!this.header?.isGetCoinsModalOpen();
  }

  isPurchaseInFlight(): boolean {
    return (
      this.purchaseUiLocked || shop.isPurchaseInFlight() || !!this.header?.isPurchaseInFlight()
    );
  }

  hideGetCoinsModal(): void {
    this.header?.hideGetCoinsModal();
  }

  private getBoostItems(): ShopItem[] {
    return shop.getItems('boost');
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(width * 0.97, 460);
    const itemCount = Math.max(this.getBoostItems().length, 1);
    const panelHeight =
      PANEL_LIST_PADDING * 2 + ITEM_ROW_HEIGHT * (itemCount - 1) + ITEM_ROW_HEIGHT * 0.85;
    const panelTop = height * 0.24;
    const panelY = panelTop + panelHeight / 2;

    const panel = this.scene.add.graphics();
    drawRoundedRect(
      panel,
      width / 2 - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
    this.add(panel);

    this.header = new PanelHeader(this.scene, {
      onBack: this.onBack,
      onNavigate: this.onNavigate,
      titleKey: 'shop.title',
    });
    this.add(this.header);

    this.listContainer = this.scene.add.container(
      width / 2,
      panelTop + PANEL_LIST_PADDING + ITEM_ROW_HEIGHT * 0.4
    );
    this.add(this.listContainer);
  }

  private createItemRow(item: ShopItem, y: number, rowWidth: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, y);
    const rowHalf = rowWidth / 2;
    const iconSize = 100;
    const iconX = -rowHalf + iconSize / 2 + 4;
    const iconKey = this.scene.textures.exists(item.icon) ? item.icon : FALLBACK_ITEM_ICON;

    const icon = this.scene.add.image(iconX, 0, iconKey);
    const scale = Math.min(iconSize / icon.width, iconSize / icon.height);
    icon.setDisplaySize(icon.width * scale, icon.height * scale);
    container.add(icon);

    const textX = iconX + iconSize / 2 + 12;
    container.add(
      this.scene.add.text(textX, -38, t(`shop.items.${item.id}.name`), {
        fontSize: '20px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
    );
    container.add(
      this.scene.add.text(textX, -12, t(`shop.items.${item.id}.description`), {
        fontSize: '13px',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: rowWidth * 0.42 },
      })
    );
    container.add(
      this.scene.add.text(
        textX,
        24,
        t('shop.ownedQuantity', { quantity: formatNumber(shop.getQuantity(item.id)) }),
        {
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#b45309',
          fontFamily: FREDOKA_FONT,
        }
      )
    );

    container.add(this.createPriceButton(item, rowHalf));

    return container;
  }

  private createPriceButton(item: ShopItem, rowHalf: number): UIButton {
    const priceLabel = formatNumber(item.price);
    const priceTextWidth = measureTextWidth(this.scene, priceLabel, {
      fontSize: '16px',
      fontStyle: 'bold',
      fontFamily: FREDOKA_FONT,
      stroke: '#000000',
      strokeThickness: 2,
    });

    const priceButtonWidth = Math.max(
      PRICE_BTN_MIN_WIDTH,
      PRICE_BTN_PAD_X + PRICE_ICON_SIZE + PRICE_BTN_GAP + priceTextWidth + PRICE_BTN_PAD_X
    );

    const button = createUIButton({
      scene: this.scene,
      position: {
        x: rowHalf - PRICE_BTN_RIGHT_MARGIN - priceButtonWidth / 2,
        y: 0,
      },
      size: { width: priceButtonWidth, height: PRICE_BTN_HEIGHT },
      background: { key: 'leaderboard-button-background' },
      icon: {
        key: 'coin-icon',
        size: { width: PRICE_ICON_SIZE, height: PRICE_ICON_SIZE },
        offset: { x: PRICE_BTN_PAD_X + PRICE_ICON_SIZE / 2, y: PRICE_BTN_HEIGHT / 2 },
      },
      text: {
        content: priceLabel,
        offset: {
          x: PRICE_BTN_PAD_X + PRICE_ICON_SIZE + PRICE_BTN_GAP + priceTextWidth / 2,
          y: PRICE_BTN_HEIGHT / 2,
        },
        style: {
          fontSize: 16,
          fontStyle: 'bold',
          border: { width: 2, color: '#000000' },
        },
      },
      disabled: this.purchaseUiLocked || shop.isPurchaseInFlight(),
      onClick: () => {
        this.purchaseItem(item);
      },
    });
    this.priceButtons.push(button);
    return button;
  }

  private setPriceButtonsLocked(locked: boolean): void {
    this.purchaseUiLocked = locked;
    this.listRebuild.setLocked(locked);
    for (const button of this.priceButtons) {
      // setLoading disables hit area; clear loading before re-enabling.
      if (locked) {
        button.setLoading(true);
      } else {
        button.setLoading(false);
        button.setEnabled(true);
      }
    }
  }

  private renderItems(): void {
    this.listRebuild.schedule();
  }

  private rebuildItems(): void {
    if (!this.listContainer) return;
    this.listContainer.removeAll(true);
    this.priceButtons = [];

    const { width } = this.scene.cameras.main;
    const items = this.getBoostItems();
    const rowWidth = Math.min(width * 0.91, 430);

    items.forEach((item, index) => {
      const y = index * ITEM_ROW_HEIGHT;
      this.listContainer!.add(this.createItemRow(item, y, rowWidth));

      if (index < items.length - 1) {
        this.listContainer!.add(
          this.scene.add.rectangle(
            0,
            y + ITEM_ROW_HEIGHT / 2,
            rowWidth * 0.92,
            2,
            PANEL_BORDER,
            0.55
          )
        );
      }
    });
  }
  private async purchaseItem(item: ShopItem): Promise<void> {
    if (this.purchaseUiLocked || shop.isPurchaseInFlight()) {
      return;
    }

    const coins = usePlatformStore.getState().currency.coins;

    if (item.currency === 'coins' && coins < item.price) {
      toast.show({ message: t('shop.notEnoughCoins'), type: 'error' });
      return;
    }

    this.setPriceButtonsLocked(true);
    try {
      const result = await shop.purchase(item.id);
      if (result.cancelled) return;
      if (!result.success) {
        toast.show({
          message:
            result.error === 'not_enough_coins'
              ? t('shop.notEnoughCoins')
              : t('shop.purchaseFailed'),
          type: 'error',
        });
        return;
      }
      if (item.currency === 'coins') {
        this.header?.playCoinSpendDip(item.price);
      }
      this.renderItems();
    } finally {
      this.setPriceButtonsLocked(false);
    }
  }
}
