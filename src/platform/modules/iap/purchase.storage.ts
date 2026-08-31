import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';
import type { StoredEntitlements } from './iap.types';
import { IAP_STORAGE_KEY, IAP_CONSUMABLE_TX_KEY } from './iap.config';

const STORAGE_VERSION = 2;

export interface PendingConsumableFulfillment {
  productId: string;
  transactionId: string;
}

interface ConsumableTxStore {
  version: number;
  updatedAt: number;
  transactionIds: string[];
  pending: PendingConsumableFulfillment[];
}

export type ConsumableFulfillmentPhase = 'granted' | 'already_pending' | 'started';

export class PurchaseStorage {
  private cache: StoredEntitlements | null = null;
  private consumableStore: ConsumableTxStore | null = null;
  private consumableWriteChain: Promise<void> = Promise.resolve();

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

  /**
   * Claim a consumable tx before granting coins.
   * `granted` — already fulfilled (restore / stale recovery must not re-grant).
   * `already_pending` — fulfill in flight or awaiting boot replay (do not grant again).
   * `started` — newly persisted as pending; caller must grant then `finishConsumableFulfillment`.
   */
  async beginConsumableFulfillment(
    transactionId: string,
    productId: string
  ): Promise<ConsumableFulfillmentPhase> {
    return this.enqueueConsumableWrite(async () => {
      const store = await this.loadConsumableStore();
      if (store.transactionIds.includes(transactionId)) return 'granted';
      if (store.pending.some((item) => item.transactionId === transactionId)) {
        return 'already_pending';
      }

      store.pending.push({ transactionId, productId });
      await this.persistConsumableStore(store);
      return 'started';
    });
  }

  async finishConsumableFulfillment(transactionId: string): Promise<void> {
    await this.enqueueConsumableWrite(async () => {
      const store = await this.loadConsumableStore();
      store.pending = store.pending.filter((item) => item.transactionId !== transactionId);
      if (!store.transactionIds.includes(transactionId)) {
        store.transactionIds.push(transactionId);
      }
      await this.persistConsumableStore(store);
    });
  }

  async getPendingConsumables(): Promise<PendingConsumableFulfillment[]> {
    const store = await this.loadConsumableStore();
    return store.pending.map((item) => ({ ...item }));
  }

  private enqueueConsumableWrite<T>(op: () => Promise<T>): Promise<T> {
    const run = this.consumableWriteChain.then(op, op);
    this.consumableWriteChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async loadConsumableStore(): Promise<ConsumableTxStore> {
    if (this.consumableStore) return this.consumableStore;

    const durable = storage.getDurableProviderType();
    const data = await storage.load<ConsumableTxStore>(IAP_CONSUMABLE_TX_KEY, durable);
    this.consumableStore = {
      version: STORAGE_VERSION,
      updatedAt: data?.updatedAt ?? Date.now(),
      transactionIds: [...new Set(data?.transactionIds ?? [])],
      pending: sanitizePending(data?.pending),
    };
    return this.consumableStore;
  }

  private async persistConsumableStore(store: ConsumableTxStore): Promise<void> {
    store.updatedAt = Date.now();
    this.consumableStore = store;
    const durable = storage.getDurableProviderType();
    await storage.save(IAP_CONSUMABLE_TX_KEY, store, durable);
  }
}

function sanitizePending(value: unknown): PendingConsumableFulfillment[] {
  if (!Array.isArray(value)) return [];

  const pending: PendingConsumableFulfillment[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const transactionId = (item as PendingConsumableFulfillment).transactionId;
    const productId = (item as PendingConsumableFulfillment).productId;
    if (typeof transactionId !== 'string' || transactionId.length === 0) continue;
    if (typeof productId !== 'string' || productId.length === 0) continue;
    if (seen.has(transactionId)) continue;
    seen.add(transactionId);
    pending.push({ transactionId, productId });
  }
  return pending;
}

export const purchaseStorage = new PurchaseStorage();
