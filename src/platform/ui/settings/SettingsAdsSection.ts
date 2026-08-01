import Phaser from 'phaser';

import {
  LABEL_COLOR,
  TOGGLE_WIDTH,
  ROW_ICON_SIZE,
  REMOVE_ADS_ITEM_ID,
  SECTION_TITLE_COLOR,
  type SettingsToggle,
  createSettingsToggle,
} from './settingsShared';
import { iap } from '@platform/modules/iap';
import { shop } from '@platform/modules/shop';
import { toast } from '../toast/ToastManager';
import { ads } from '@platform/core/advertising';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { drawRoundedRect } from '../panel/graphics';
import type { UIButton, ToastOptions } from '../types';
import { t } from '@platform/modules/i18n/i18n.service';
import { PANEL_BG, TEXT_COLOR, PANEL_BORDER } from '../panel/panelTheme';
import { ENTITLEMENT_REMOVE_ADS, REMOVE_ADS_PRICE } from '@platform/modules/iap/iap.config';

const NO_ADS_ICON_KEY = 'no-ads-icon';

export class SettingsAdsSection {
  private disposed = false;
  private purchasingAds = false;
  private buyAdsButton?: UIButton;
  private restoringPurchases = false;
  private hideAdsToggle?: SettingsToggle;
  private purchaseModal?: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly helpers: {
      endNameEdit: () => void;
      closeLanguageMenu: () => void;
      scheduleDestroy: (target?: Phaser.GameObjects.GameObject) => void;
      restartThenShowToast: (options: ToastOptions) => void;
    }
  ) {}

  cleanup(): void {
    this.disposed = true;
    this.purchaseModal = undefined;
    this.buyAdsButton = undefined;
    this.hideAdsToggle = undefined;
  }

  isPurchaseModalOpen(): boolean {
    return !!this.purchaseModal?.visible;
  }

  hidePurchaseModal(): void {
    if (this.purchasingAds) return;
    const modal = this.purchaseModal;
    this.purchaseModal = undefined;
    this.buyAdsButton = undefined;
    this.helpers.scheduleDestroy(modal);
  }

  /** Keep Hide ads toggle in sync when IAP init/restore finishes after Settings opened. */
  refreshHideAdsToggle(): void {
    if (this.disposed || !this.hideAdsToggle) return;

    const owned = shop.isOwned(REMOVE_ADS_ITEM_ID);
    this.hideAdsToggle.setLocked(!owned);
    this.hideAdsToggle.setEnabled(owned && ads.isAdsRemoved());

    if (owned) {
      this.hidePurchaseModal();
    }
  }

  build(left: number, right: number, startY: number): number {
    let y = startY;
    const hasRemoveAds = shop.isOwned(REMOVE_ADS_ITEM_ID);

    this.parent.add(
      this.scene.add
        .text(left, y, t('settings.ads').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 40;

    const rowHeight = 48;
    const centerY = y + rowHeight / 2;

    const icon = this.scene.add.image(left + ROW_ICON_SIZE / 2, centerY, NO_ADS_ICON_KEY);
    icon.setDisplaySize(ROW_ICON_SIZE, ROW_ICON_SIZE);
    this.parent.add(icon);

    this.parent.add(
      this.scene.add
        .text(left + ROW_ICON_SIZE + 12, centerY, t('settings.hideAds'), {
          fontSize: '20px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0.5)
    );

    this.hideAdsToggle = createSettingsToggle(this.scene, right - TOGGLE_WIDTH / 2, centerY, {
      initial: hasRemoveAds && ads.isAdsRemoved(),
      locked: !hasRemoveAds,
      onChange: (hideAds) => {
        ads.setAdsRemoved(hideAds);
      },
      onLockedTap: () => {
        this.showRemoveAdsPurchaseModal();
      },
    });
    this.parent.add(this.hideAdsToggle);

    return y + rowHeight + 8;
  }

  private async restorePurchases(): Promise<void> {
    if (this.disposed || this.restoringPurchases || !iap.isEnabled()) return;
    this.restoringPurchases = true;

    toast.show({ message: t('settings.restoringPurchases'), type: 'info', duration: 2500 });

    try {
      const result = await iap.restore();
      if (!result.success) {
        toast.show({ message: t('settings.restorePurchasesFailed'), type: 'error' });
        return;
      }

      // Modal entry is remove-ads only — success means that entitlement is owned after restore.
      const restoredRemoveAds =
        result.restoredEntitlements.includes(ENTITLEMENT_REMOVE_ADS) ||
        iap.has(ENTITLEMENT_REMOVE_ADS);
      this.refreshHideAdsToggle();

      toast.show({
        type: restoredRemoveAds ? 'success' : 'info',
        message: restoredRemoveAds
          ? t('settings.restorePurchasesSuccess')
          : t('settings.restorePurchasesEmpty'),
      });
    } finally {
      this.restoringPurchases = false;
    }
  }

  private showRemoveAdsPurchaseModal(): void {
    if (
      this.disposed ||
      this.purchaseModal ||
      this.purchasingAds ||
      shop.isOwned(REMOVE_ADS_ITEM_ID)
    ) {
      return;
    }

    this.helpers.endNameEdit();
    this.helpers.closeLanguageMenu();

    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(340, width * 0.82);
    const showRestore = iap.isEnabled();
    const panelHeight = showRestore ? 318 : 280;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;
    const modal = this.scene.add.container(0, 0).setDepth(200);

    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hidePurchaseModal());

    const panelGfx = this.scene.add.graphics();
    drawRoundedRect(panelGfx, panelX, panelY, panelWidth, panelHeight, 20, PANEL_BG, PANEL_BORDER);

    const panelHit = this.scene.add
      .rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x000000, 0)
      .setInteractive();

    modal.add([overlay, panelGfx, panelHit]);

    modal.add(
      createUIButton({
        scene: this.scene,
        position: { x: panelX + panelWidth - 6, y: panelY + 6 },
        size: { width: 56, height: 56 },
        background: { key: 'close-icon' },
        onClick: () => this.hidePurchaseModal(),
      })
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 56, t('shop.items.remove_ads.name'), {
          fontSize: '24px',
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
        .text(width / 2, panelY + 100, t('shop.items.remove_ads.description'), {
          fontSize: '15px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5, 0)
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 148, t('settings.removeAdsPrice', { price: REMOVE_ADS_PRICE }), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5, 0)
    );

    const buyWidth = Math.min(220, panelWidth * 0.7);
    const buyY = showRestore ? panelY + panelHeight - 88 : panelY + panelHeight - 52;
    this.buyAdsButton = createUIButton({
      scene: this.scene,
      position: { x: width / 2, y: buyY },
      size: { width: buyWidth, height: 64 },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('shop.buy').toUpperCase(),
        style: {
          fontSize: 22,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => {
        void this.purchaseRemoveAds();
      },
    });
    modal.add(this.buyAdsButton);

    if (showRestore) {
      const restoreY = panelY + panelHeight - 28;
      const hint = this.scene.add
        .text(width / 2, restoreY, t('settings.restorePurchasesHint'), {
          fontSize: '14px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      hint.on('pointerdown', () => {
        if (this.purchasingAds) return;
        this.hidePurchaseModal();
        void this.restorePurchases();
      });
      modal.add(hint);
    }

    this.purchaseModal = modal;
    this.parent.add(modal);
  }

  private async purchaseRemoveAds(): Promise<void> {
    if (this.purchasingAds || shop.isOwned(REMOVE_ADS_ITEM_ID)) return;
    this.purchasingAds = true;
    this.buyAdsButton?.setLoading(true);

    let success = false;
    try {
      success = await shop.purchase(REMOVE_ADS_ITEM_ID);
      if (!success) {
        toast.show({ message: t('shop.purchaseFailed'), type: 'error' });
        return;
      }

      const successToast: ToastOptions = {
        type: 'success',
        message: t('shop.purchaseSuccess', { name: t('shop.items.remove_ads.name') }),
      };

      // Toast is scene-owned; Phaser queues restart so we must wait for CREATE.
      if (!this.disposed && this.scene.sys.isActive() && this.scene.scene.key === 'Settings') {
        this.helpers.restartThenShowToast(successToast);
      } else {
        toast.show(successToast);
      }
    } finally {
      this.purchasingAds = false;
      this.buyAdsButton?.setLoading(false);
    }

    if (success) {
      this.hidePurchaseModal();
    }
  }
}
