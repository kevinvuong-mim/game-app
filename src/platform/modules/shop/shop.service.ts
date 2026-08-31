import catalog from './catalog.json';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { saveService } from '@platform/modules/save';
import { usePlatformStore } from '@platform/core/state';
import type { ProductKey } from '@platform/modules/iap';
import { iap, getProductByKey } from '@platform/modules/iap';

type ShopItemType = 'coins' | 'boost' | 'entitlement';

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  type: ShopItemType;
  /** Coins granted after a successful IAP coin-pack purchase. */
  coinAmount?: number;
  description: string;
  productKey?: ProductKey;
  currency: 'iap' | 'coins';
}

export interface ShopPurchaseResult {
  error?: string;
  success: boolean;
  cancelled: boolean;
}

class ShopService {
  private purchaseInFlight = false;
  private fulfillChain: Promise<void> = Promise.resolve();
  private items: ShopItem[] = catalog.items as ShopItem[];

  getItems(type?: ShopItemType): ShopItem[] {
    if (!type) return this.items;
    return this.items.filter((item) => item.type === type);
  }

  getItem(id: string): ShopItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  isOwned(id: string): boolean {
    const item = this.getItem(id);
    if (!item) return false;

    if (item.type === 'entitlement' && item.productKey) {
      const product = getProductByKey(item.productKey);
      return iap.has(product.entitlement);
    }

    if (item.type === 'boost') {
      return this.getQuantity(id) > 0;
    }

    return !!usePlatformStore.getState().inventory.items[id];
  }

  getQuantity(id: string): number {
    return usePlatformStore.getState().inventory.items[id]?.quantity ?? 0;
  }

  isPurchaseInFlight(): boolean {
    return this.purchaseInFlight;
  }

  /** Consume one use of a boost skill. Returns false if none left. */
  consumeBoost(id: string): boolean {
    if (this.getQuantity(id) <= 0) return false;
    usePlatformStore.getState().removeItem(id, 1);
    // Persist immediately so force-quit mid-match cannot restore spent boosts.
    void saveService.saveLocal();
    return true;
  }

  async purchase(itemId: string): Promise<ShopPurchaseResult> {
    if (this.purchaseInFlight) {
      logger.warn(`[Shop] Purchase already in flight: ${itemId}`);
      return { success: false, cancelled: false, error: 'Purchase already in progress' };
    }

    const item = this.getItem(itemId);
    if (!item) {
      logger.warn(`[Shop] Item not found: ${itemId}`);
      return { success: false, cancelled: false, error: 'Item not found' };
    }

    this.purchaseInFlight = true;
    try {
      if (item.currency === 'iap' && item.productKey) {
        // Already owned — success without a second charge / failure toast.
        if (item.type === 'entitlement' && this.isOwned(itemId)) {
          return { success: true, cancelled: false };
        }

        const product = getProductByKey(item.productKey);
        const result = await iap.purchase(product);

        if (result.success) {
          eventBus.emit('shop:purchase', { itemId, price: item.price });
          return { success: true, cancelled: false };
        }

        if (!result.cancelled) {
          logger.error('[Shop] IAP purchase failed', result.error);
        }
        return {
          success: false,
          cancelled: result.cancelled,
          error: result.error,
        };
      }

      if (item.currency === 'coins') {
        if (!usePlatformStore.getState().spendCoins(item.price)) {
          return { success: false, cancelled: false, error: 'not_enough_coins' };
        }
      } else {
        return { success: false, cancelled: false, error: 'Unsupported currency' };
      }

      this.grantItem(item);
      eventBus.emit('shop:purchase', { itemId, price: item.price });
      return { success: true, cancelled: false };
    } finally {
      this.purchaseInFlight = false;
    }
  }

  /**
   * Grant a coin pack once per store transaction. Awaits durable save so a crash
   * cannot record the tx as granted without the coins.
   */
  async fulfillIapProduct(productId: string, transactionId: string): Promise<boolean> {
    const run = this.fulfillChain.then(() =>
      this.fulfillIapProductUnlocked(productId, transactionId)
    );
    this.fulfillChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async fulfillIapProductUnlocked(
    productId: string,
    transactionId: string
  ): Promise<boolean> {
    const txId = transactionId.trim();
    if (!txId) {
      logger.error('[Shop] Refusing consumable grant without transactionId', { productId });
      return false;
    }

    if (!saveService.isHydrated()) {
      throw new Error('Cannot fulfill IAP before save hydrate');
    }

    const item = this.findIapCatalogItem(productId);
    if (!item) {
      logger.error('[Shop] IAP product not in catalog', { productId });
      return false;
    }
    if (item.type !== 'coins') {
      return true;
    }

    const amount = item.coinAmount ?? 0;
    if (amount <= 0) {
      logger.warn(`[Shop] Coin pack missing coinAmount: ${item.id}`);
      return false;
    }

    const newlyGranted = usePlatformStore.getState().applyConsumableGrant(txId, amount);
    await saveService.saveLocal();
    if (newlyGranted) {
      logger.info('[Shop] Granted IAP coins', { productId, transactionId: txId, amount });
    }

    return true;
  }

  private findIapCatalogItem(productId: string): ShopItem | undefined {
    return this.items.find((entry) => {
      if (entry.id === productId) return true;
      if (!entry.productKey) return false;
      return getProductByKey(entry.productKey).id === productId;
    });
  }

  private grantItem(item: ShopItem): void {
    if (item.type === 'boost') {
      usePlatformStore.getState().addItem(item.id, 1);
    }
  }
}

export const shop = new ShopService();
