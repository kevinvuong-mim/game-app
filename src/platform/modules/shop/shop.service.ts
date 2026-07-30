import catalog from './catalog.json';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { usePlatformStore } from '@platform/core/state';
import type { ProductKey } from '@platform/modules/iap';
import { iap, getProductByKey } from '@platform/modules/iap';
import { saveService } from '@platform/modules/save';

type ShopItemType = 'boost' | 'entitlement' | 'coins';

export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  type: ShopItemType;
  description: string;
  productKey?: ProductKey;
  /** Coins granted after a successful IAP coin-pack purchase. */
  coinAmount?: number;
  currency: 'iap' | 'coins';
}

class ShopService {
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

  /** Consume one use of a boost skill. Returns false if none left. */
  consumeBoost(id: string): boolean {
    if (this.getQuantity(id) <= 0) return false;
    usePlatformStore.getState().removeItem(id, 1);
    // Persist immediately so force-quit mid-match cannot restore spent boosts.
    void saveService.saveLocal();
    return true;
  }

  async purchase(itemId: string): Promise<boolean> {
    const item = this.getItem(itemId);
    if (!item) {
      logger.warn(`[Shop] Item not found: ${itemId}`);
      return false;
    }

    if (item.currency === 'iap' && item.productKey) {
      if (item.type === 'entitlement' && this.isOwned(itemId)) return false;

      const product = getProductByKey(item.productKey);
      const result = await iap.purchase(product);

      if (result.success) {
        // Coin packs are fulfilled via iap:purchase:success (also covers timeout recovery).
        eventBus.emit('shop:purchase', { itemId, price: item.price });
        return true;
      }

      if (!result.cancelled) {
        logger.error('[Shop] IAP purchase failed', result.error);
      }
      return false;
    }

    if (item.currency === 'coins') {
      if (!usePlatformStore.getState().spendCoins(item.price)) return false;
    } else {
      return false;
    }

    this.grantItem(item);
    eventBus.emit('shop:purchase', { itemId, price: item.price });
    return true;
  }

  /** Grant coin packs after IAP success / restore of an unconsumed consumable. */
  fulfillIapProduct(productId: string): void {
    const item = this.items.find((entry) => {
      if (entry.id === productId) return true;
      if (!entry.productKey) return false;
      return getProductByKey(entry.productKey).id === productId;
    });
    if (item?.type === 'coins') {
      this.grantCoins(item);
    }
  }

  private grantItem(item: ShopItem): void {
    if (item.type === 'boost') {
      usePlatformStore.getState().addItem(item.id, 1);
    }
  }

  private grantCoins(item: ShopItem): void {
    const amount = item.coinAmount ?? 0;
    if (amount <= 0) {
      logger.warn(`[Shop] Coin pack missing coinAmount: ${item.id}`);
      return;
    }
    usePlatformStore.getState().addCoins(amount);
    void saveService.saveLocal();
  }
}

export const shop = new ShopService();
