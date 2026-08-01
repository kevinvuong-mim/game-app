import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';
import type { StoredEntitlements } from './iap.types';
import { IAP_STORAGE_KEY, IAP_CONSUMABLE_TX_KEY } from './iap.config';

const STORAGE_VERSION = 1;

interface ConsumableTxStore {
  version: number;
  updatedAt: number;
  transactionIds: string[];
}

export class PurchaseStorage {
  private cache: StoredEntitlements | null = null;
  private consumableTxIds: Set<string> | null = null;

  async load(): Promise<string[]> {
    if (this.cache) {
      return [...this.cache.entitlements];
    }

    const durable = storage.getDurableProviderType();
    const data = await storage.load<StoredEntitlements>(IAP_STORAGE_KEY, durable);

    if (!data?.entitlements) {
      this.cache = { version: STORAGE_VERSION, entitlements: [], updatedAt: Date.now() };
      return [];
    }

    this.cache = {
      version: data.version ?? STORAGE_VERSION,
      entitlements: [...new Set(data.entitlements)],
      updatedAt: data.updatedAt ?? Date.now(),
    };

    logger.debug('[IAP] Entitlements loaded', { count: this.cache.entitlements.length });
    return [...this.cache.entitlements];
  }

  async save(entitlements: string[]): Promise<void> {
    const unique = [...new Set(entitlements)];
    this.cache = {
      version: STORAGE_VERSION,
      entitlements: unique,
      updatedAt: Date.now(),
    };

    const durable = storage.getDurableProviderType();
    await storage.save(IAP_STORAGE_KEY, this.cache, durable);
    logger.debug('[IAP] Entitlements saved', { count: unique.length });
  }

  async add(entitlement: string): Promise<void> {
    const current = await this.load();
    if (current.includes(entitlement)) return;
    await this.save([...current, entitlement]);
  }

  async sync(entitlements: string[]): Promise<void> {
    await this.save(entitlements);
  }

  async hasConsumableTransaction(transactionId: string): Promise<boolean> {
    const ids = await this.loadConsumableTxIds();
    return ids.has(transactionId);
  }

  /** Returns false if this transaction was already recorded. */
  async recordConsumableTransaction(transactionId: string): Promise<boolean> {
    const ids = await this.loadConsumableTxIds();
    if (ids.has(transactionId)) return false;
    ids.add(transactionId);
    this.consumableTxIds = ids;

    const durable = storage.getDurableProviderType();
    const payload: ConsumableTxStore = {
      version: STORAGE_VERSION,
      transactionIds: [...ids],
      updatedAt: Date.now(),
    };
    await storage.save(IAP_CONSUMABLE_TX_KEY, payload, durable);
    return true;
  }

  private async loadConsumableTxIds(): Promise<Set<string>> {
    if (this.consumableTxIds) return this.consumableTxIds;

    const durable = storage.getDurableProviderType();
    const data = await storage.load<ConsumableTxStore>(IAP_CONSUMABLE_TX_KEY, durable);
    this.consumableTxIds = new Set(data?.transactionIds ?? []);
    return this.consumableTxIds;
  }
}

export const purchaseStorage = new PurchaseStorage();
