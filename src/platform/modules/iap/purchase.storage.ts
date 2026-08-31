import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';
import type { StoredEntitlements } from './iap.types';
import { IAP_STORAGE_KEY, IAP_CONSUMABLE_TX_KEY } from './iap.config';

const STORAGE_VERSION = 1;
const MAX_COMPLETED_TX_IDS = 500;
const CONSUMABLE_STORE_VERSION = 2;

export interface PendingConsumableGrant {
  productId: string;
  transactionId: string;
}

interface ConsumableTxStore {
  version: number;
  updatedAt: number;
  transactionIds: string[];
  pending: PendingConsumableGrant[];
}

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

  /** Queue a paid consumable so a crash before wallet persist can still grant on settle. */
  async addPendingGrant(transactionId: string, productId: string): Promise<void> {
    const txId = transactionId.trim();
    const catalogId = productId.trim();
    if (!txId || !catalogId) return;

    await this.withConsumableWriteLock(async () => {
      const store = await this.loadConsumableStore();
      if (store.transactionIds.includes(txId)) return;
      if (store.pending.some((grant) => grant.transactionId === txId)) return;
      store.pending.push({ transactionId: txId, productId: catalogId });
      await this.persistConsumableStore(store);
    });
  }

  /** Drop pending and remember the transaction so Restore cannot replay it. */
  async completeGrant(transactionId: string): Promise<void> {
    const txId = transactionId.trim();
    if (!txId) return;

    await this.withConsumableWriteLock(async () => {
      const store = await this.loadConsumableStore();
      store.pending = store.pending.filter((grant) => grant.transactionId !== txId);
      if (!store.transactionIds.includes(txId)) {
        store.transactionIds.push(txId);
        if (store.transactionIds.length > MAX_COMPLETED_TX_IDS) {
          store.transactionIds = store.transactionIds.slice(-MAX_COMPLETED_TX_IDS);
        }
      }
      await this.persistConsumableStore(store);
    });
  }

  async listPendingGrants(): Promise<PendingConsumableGrant[]> {
    const store = await this.loadConsumableStore();
    return store.pending.map((grant) => ({ ...grant }));
  }

  private withConsumableWriteLock<T>(op: () => Promise<T>): Promise<T> {
    const run = this.consumableWriteChain.then(op, op);
    this.consumableWriteChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async loadConsumableStore(): Promise<ConsumableTxStore> {
    if (!this.consumableStore) {
      const durable = storage.getDurableProviderType();
      const data = await storage.load<Partial<ConsumableTxStore>>(IAP_CONSUMABLE_TX_KEY, durable);
      this.consumableStore = normalizeConsumableStore(data);
    }

    return {
      version: this.consumableStore.version,
      updatedAt: this.consumableStore.updatedAt,
      transactionIds: [...this.consumableStore.transactionIds],
      pending: this.consumableStore.pending.map((grant) => ({ ...grant })),
    };
  }

  private async persistConsumableStore(store: ConsumableTxStore): Promise<void> {
    const payload: ConsumableTxStore = {
      version: CONSUMABLE_STORE_VERSION,
      updatedAt: Date.now(),
      transactionIds: store.transactionIds,
      pending: store.pending,
    };
    this.consumableStore = payload;
    const durable = storage.getDurableProviderType();
    await storage.save(IAP_CONSUMABLE_TX_KEY, payload, durable);
  }
}

function normalizeConsumableStore(data: Partial<ConsumableTxStore> | null): ConsumableTxStore {
  const transactionIds = Array.isArray(data?.transactionIds)
    ? uniqueStrings(data.transactionIds)
    : [];
  const pending = Array.isArray(data?.pending) ? sanitizePendingGrants(data.pending) : [];

  return {
    version: CONSUMABLE_STORE_VERSION,
    updatedAt: data?.updatedAt ?? Date.now(),
    transactionIds,
    pending,
  };
}

function sanitizePendingGrants(pending: PendingConsumableGrant[]): PendingConsumableGrant[] {
  const seen = new Set<string>();
  const grants: PendingConsumableGrant[] = [];
  for (const grant of pending) {
    if (!grant || typeof grant !== 'object') continue;
    const transactionId = typeof grant.transactionId === 'string' ? grant.transactionId.trim() : '';
    const productId = typeof grant.productId === 'string' ? grant.productId.trim() : '';
    if (!transactionId || !productId || seen.has(transactionId)) continue;
    seen.add(transactionId);
    grants.push({ transactionId, productId });
  }
  return grants;
}

function uniqueStrings(values: unknown[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

export const purchaseStorage = new PurchaseStorage();
