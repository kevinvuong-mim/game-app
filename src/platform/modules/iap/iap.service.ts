import type {
  IAPProvider,
  RestoreResult,
  PurchaseResult,
  ProviderProduct,
  ProviderPurchase,
  ProductDefinition,
} from './iap.types';
import {
  PRODUCTS,
  getProductById,
  IAP_PURCHASE_TIMEOUT_MS,
  IAP_TIMEOUT_RECOVERY_MS,
  normalizeStorePriceString,
} from './iap.config';
import { IapError } from './iap.types';
import { IAP_EVENTS } from './iap.events';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { MockIapAdapter } from './iap.mock-adapter';
import { saveService } from '@platform/modules/save';
import type { IEventBus } from '@platform/core/events';
import { purchaseStorage, type PurchaseStorage } from './purchase.storage';

interface IapServiceDeps {
  emit?: IEventBus['emit'];
  storage?: PurchaseStorage;
}

export type ConsumableFulfiller = (productId: string, transactionId: string) => Promise<boolean>;

class IapService {
  private readonly storage: PurchaseStorage;
  private readonly emit: typeof eventBus.emit;

  private ready = false;
  private enabled = true;
  private restoring = false;
  private purchasing = false;
  private settleDirty = false;
  private authorityWarningLogged = false;
  private entitlements = new Set<string>();
  private provider: IAPProvider | null = null;
  private initPromise: Promise<void> | null = null;
  private settlePromise: Promise<void> | null = null;
  private products = new Map<string, ProviderProduct>();
  private consumableFulfiller: ConsumableFulfiller | null = null;

  constructor(deps: IapServiceDeps = {}) {
    this.storage = deps.storage ?? purchaseStorage;
    this.emit = deps.emit ?? eventBus.emit.bind(eventBus);
  }

  setProvider(provider: IAPProvider): void {
    this.provider = provider;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Bound from `bindIapController` so this module does not import shop. */
  setConsumableFulfiller(fulfiller: ConsumableFulfiller | null): void {
    this.consumableFulfiller = fulfiller;
  }

  /**
   * Replay coin packs that were paid but not durably granted (process death
   * between store success and wallet save). Safe to call after `loadLocal`.
   */
  async settlePendingConsumables(): Promise<void> {
    if (this.settlePromise) {
      this.settleDirty = true;
      return this.settlePromise;
    }

    this.settlePromise = (async () => {
      try {
        await this.runSettlePendingConsumables();
      } finally {
        const rerun = this.settleDirty;
        this.settlePromise = null;
        this.settleDirty = false;
        if (rerun) {
          await this.settlePendingConsumables();
        }
      }
    })();

    return this.settlePromise;
  }

  isEnabled(): boolean {
    return this.enabled && getConfig().iapEnabled;
  }

  isReady(): boolean {
    return this.ready;
  }

  isPurchasing(): boolean {
    return this.purchasing;
  }

  /** Localized store price string when available. */
  getProductPrice(productId: string): string | undefined {
    const price = this.products.get(productId)?.price;
    return price ? normalizeStorePriceString(price) : undefined;
  }

  /** Prefer live store price; fall back to catalog/hardcoded string for offline UI. */
  getDisplayPrice(productId: string, fallback: string): string {
    return this.getProductPrice(productId) ?? normalizeStorePriceString(fallback);
  }

  /** Initialize IAP once — safe to call multiple times. */
  async initialize(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      logger.info('[IAP] Initializing...');

      const stored = await this.storage.load();
      this.applyEntitlements(stored, { emitChanges: false });
      this.logClientAuthorityWarning();

      if (!this.provider) {
        this.provider = new MockIapAdapter();
      }

      await this.provider.initialize();

      if (this.provider instanceof MockIapAdapter) {
        for (const entitlement of stored) {
          const product = Object.values(PRODUCTS).find((p) => p.entitlement === entitlement);
          if (product) this.provider.seedPurchase(product.id);
        }
      }

      const remoteEntitlements = await this.provider.fetchEntitlements();
      for (const entitlement of remoteEntitlements) {
        if (!this.has(entitlement)) {
          await this.grantEntitlement(entitlement, { emitChange: false });
        }
      }

      await this.refreshProducts();

      this.ready = true;
      logger.info('[IAP] Ready', { provider: this.provider.name, entitlements: stored });

      // Init may finish after bindIapController's first sync — notify so ads/UI catch up.
      for (const entitlement of this.entitlements) {
        this.emitEntitlementChanged(entitlement, true);
      }
    } catch (error) {
      logger.error('[IAP] Initialization failed', error);
      throw error;
    }
  }

  /** Reload localized product metadata from the store / mock catalog. */
  async refreshProducts(): Promise<void> {
    if (!this.provider) return;

    try {
      const list = await this.provider.getProducts();
      this.products.clear();
      for (const product of list) {
        this.products.set(product.id, product);
      }
      this.emit(IAP_EVENTS.PRODUCTS_UPDATED, { productIds: [...this.products.keys()] });
    } catch (error) {
      logger.warn('[IAP] Failed to refresh products', error);
    }
  }

  has(entitlement: string): boolean {
    return this.entitlements.has(entitlement);
  }

  getEntitlements(): string[] {
    return [...this.entitlements];
  }

  async purchase(product: ProductDefinition): Promise<PurchaseResult> {
    if (!this.isEnabled()) {
      return { success: false, cancelled: false, error: 'IAP not available' };
    }

    if (!this.ready || !this.provider) {
      return { success: false, cancelled: false, error: 'IAP not initialized' };
    }

    if (this.purchasing) {
      return { success: false, cancelled: false, error: 'Purchase already in progress' };
    }

    // Already owned locally — treat as success and re-sync ads/UI (do not show failure).
    if (product.type === 'non_consumable' && this.has(product.entitlement)) {
      await this.acknowledgeOwnedEntitlement(product);
      return { success: true, cancelled: false, entitlement: product.entitlement };
    }

    this.purchasing = true;
    logger.info('[IAP] Purchase started', { productId: product.id });

    const purchasePromise = this.provider.purchase(product.id);

    try {
      const providerPurchase = await this.withTimeout(
        purchasePromise,
        IAP_PURCHASE_TIMEOUT_MS,
        'Purchase timed out'
      );

      return await this.completePurchase(product, providerPurchase);
    } catch (error) {
      if (this.isDuplicatePurchaseError(error) && product.type === 'non_consumable') {
        await this.acknowledgeOwnedEntitlement(product);
        logger.info('[IAP] Already owned at store — granted locally', { productId: product.id });
        return { success: true, cancelled: false, entitlement: product.entitlement };
      }

      const result = this.normalizePurchaseError(error, product.id);

      // Store purchase may still complete after a client timeout — keep waiting + poll.
      if (result.error && /timed out/i.test(result.error)) {
        const recovered = await this.recoverAfterTimeout(product, purchasePromise);
        if (recovered) {
          return { success: true, cancelled: false, entitlement: product.entitlement };
        }
      }

      this.emit(IAP_EVENTS.PURCHASE_FAILED, {
        productId: product.id,
        cancelled: result.cancelled,
        error: result.error,
      });
      logger.warn('[IAP] Purchase failed', { productId: product.id, ...result });
      return result;
    } finally {
      this.purchasing = false;
    }
  }

  private async completePurchase(
    product: ProductDefinition,
    providerPurchase: ProviderPurchase
  ): Promise<PurchaseResult> {
    const matched = getProductById(providerPurchase.productId) ?? product;

    if (matched.type === 'consumable') {
      const transactionId = resolveConsumableTransactionId(providerPurchase, matched.id);
      const granted = await this.fulfillConsumablePurchase(matched.id, transactionId);
      if (!granted) {
        logger.warn('[IAP] Consumable pending — wallet grant will retry on settle', {
          productId: matched.id,
          transactionId,
        });
        void this.settlePendingConsumables();
      }

      this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
        productId: providerPurchase.productId || matched.id,
        entitlement: matched.entitlement,
        transactionId,
      });
    } else {
      await this.grantEntitlement(matched.entitlement);
      this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
        productId: providerPurchase.productId,
        entitlement: matched.entitlement,
      });
    }

    logger.info('[IAP] Purchase succeeded', {
      productId: matched.id,
      entitlement: matched.entitlement,
      type: matched.type,
    });

    return { success: true, cancelled: false, entitlement: matched.entitlement };
  }

  /** After a client timeout, await the store promise and poll purchase history. */
  private async recoverAfterTimeout(
    product: ProductDefinition,
    purchasePromise: Promise<ProviderPurchase>
  ): Promise<boolean> {
    if (!this.provider) return false;

    let settled: ProviderPurchase | undefined;
    let settledError: unknown;
    void purchasePromise.then(
      (value) => {
        settled = value;
      },
      (error: unknown) => {
        settledError = error;
      }
    );

    const deadline = Date.now() + IAP_TIMEOUT_RECOVERY_MS;
    const delaysMs = [0, 400, 800, 1_500, 3_000, 5_000, 8_000, 12_000, 20_000];

    try {
      for (const delayMs of delaysMs) {
        if (delayMs > 0) {
          await this.delay(delayMs);
        }

        if (settled) {
          await this.completePurchase(product, settled);
          logger.info('[IAP] Recovered purchase after timeout (provider promise)', {
            productId: product.id,
          });
          return true;
        }

        if (settledError) {
          if (this.isDuplicatePurchaseError(settledError) && product.type === 'non_consumable') {
            await this.acknowledgeOwnedEntitlement(product);
            return true;
          }

          const failed = this.normalizePurchaseError(settledError, product.id);
          if (failed.cancelled || (failed.error && !/timed out/i.test(failed.error))) {
            logger.warn('[IAP] Timeout recovery: store returned failure', failed);
            return false;
          }
        }

        if (product.type === 'consumable') {
          const withinMs = IAP_PURCHASE_TIMEOUT_MS + IAP_TIMEOUT_RECOVERY_MS;
          const recent = await this.provider.findRecentPurchase?.(product.id, withinMs);
          if (recent) {
            await this.completePurchase(product, recent);
            logger.info('[IAP] Recovered consumable after purchase timeout', {
              productId: product.id,
              transactionId: recent.transactionId,
            });
            return true;
          }
        } else {
          const remote = await this.provider.fetchEntitlements();
          if (remote.includes(product.entitlement)) {
            await this.grantEntitlement(product.entitlement);
            this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
              productId: product.id,
              entitlement: product.entitlement,
            });
            logger.info('[IAP] Recovered entitlement after purchase timeout', {
              productId: product.id,
              entitlement: product.entitlement,
            });
            return true;
          }
        }

        if (Date.now() >= deadline) break;
      }

      logger.warn('[IAP] Timeout recovery: no recent purchase found', {
        productId: product.id,
      });
      return false;
    } catch (error) {
      logger.warn('[IAP] Timeout recovery failed', error);
      return false;
    }
  }

  async restore(): Promise<RestoreResult> {
    if (!this.ready || !this.provider) {
      return { success: false, restoredEntitlements: [], error: 'IAP not initialized' };
    }

    if (this.restoring) {
      return { success: false, restoredEntitlements: [], error: 'Restore already in progress' };
    }

    this.restoring = true;
    logger.info('[IAP] Restore started');

    try {
      const purchases = await this.provider.restore();
      const restoredEntitlements: string[] = [];

      for (const purchase of purchases) {
        const product = getProductById(purchase.productId);
        if (!product?.entitlement) continue;

        // Consumables are one-shot grants at purchase time. Store/RevenueCat history
        // is not "unconsumed stock" — replaying it on Restore reinstalls free coins.
        if (product.type === 'consumable') {
          continue;
        }

        // Always report store-confirmed non-consumables so Settings can refresh
        // even when the entitlement was already loaded before ads/UI synced.
        const wasNew = !this.has(product.entitlement);
        await this.grantEntitlement(product.entitlement, { emitChange: wasNew });
        if (!wasNew) {
          // Already owned in memory — still notify so Settings/ads can catch up.
          this.emitEntitlementChanged(product.entitlement, true);
        }
        if (!restoredEntitlements.includes(product.entitlement)) {
          restoredEntitlements.push(product.entitlement);
        }
      }

      this.emit(IAP_EVENTS.PURCHASE_RESTORED, { restoredEntitlements });
      logger.info('[IAP] Restore complete', { restoredEntitlements });

      return { success: true, restoredEntitlements };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed';
      logger.error('[IAP] Restore failed', error);
      return { success: false, restoredEntitlements: [], error: message };
    } finally {
      this.restoring = false;
    }
  }

  /** Associates the IAP provider with the guest id when it becomes available. */
  async linkGuestUser(guestId: string): Promise<void> {
    if (!guestId || !this.ready || !this.provider?.linkAppUser) {
      return;
    }

    await this.provider.linkAppUser(guestId);

    const remoteEntitlements = await this.provider.fetchEntitlements();
    for (const entitlement of remoteEntitlements) {
      if (!this.has(entitlement)) {
        await this.grantEntitlement(entitlement, { emitChange: true });
      }
    }

    await this.refreshProducts();
  }

  /**
   * Persist + notify for an already-owned non-consumable (local cache or store duplicate).
   */
  private async acknowledgeOwnedEntitlement(product: ProductDefinition): Promise<void> {
    await this.grantEntitlement(product.entitlement);
    this.emitEntitlementChanged(product.entitlement, true);
    this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
      productId: product.id,
      entitlement: product.entitlement,
    });
  }

  private isDuplicatePurchaseError(error: unknown): boolean {
    if (error instanceof Error && error.name === 'IapError') {
      return (error as IapError).code === 'duplicate';
    }
    const message = error instanceof Error ? error.message : String(error);
    return /already\s*(owned|purchased)/i.test(message);
  }

  private async grantEntitlement(
    entitlement: string,
    options: { emitChange?: boolean } = {}
  ): Promise<void> {
    const { emitChange = true } = options;
    const wasActive = this.has(entitlement);

    this.entitlements.add(entitlement);
    await this.storage.add(entitlement);

    if (emitChange && !wasActive) {
      this.emitEntitlementChanged(entitlement, true);
    }
  }

  private applyEntitlements(entitlements: string[], options: { emitChanges: boolean }): void {
    for (const entitlement of entitlements) {
      const wasActive = this.entitlements.has(entitlement);
      this.entitlements.add(entitlement);
      if (options.emitChanges && !wasActive) {
        this.emitEntitlementChanged(entitlement, true);
      }
    }
  }

  private emitEntitlementChanged(entitlement: string, active: boolean): void {
    this.emit(IAP_EVENTS.ENTITLEMENT_CHANGED, {
      entitlement,
      active,
      entitlements: this.getEntitlements(),
    });
  }

  private normalizePurchaseError(error: unknown, _productId: string): PurchaseResult {
    if (error instanceof Error && error.name === 'IapError') {
      const iapError = error as IapError;
      return {
        success: false,
        cancelled: iapError.code === 'cancelled',
        error: iapError.message,
      };
    }

    const message = error instanceof Error ? error.message : 'Purchase failed';
    const cancelled =
      /cancel/i.test(message) ||
      /user.*denied/i.test(message) ||
      /SKErrorDomain error 2/i.test(message);

    if (/timed out/i.test(message)) {
      return { success: false, cancelled: false, error: message };
    }

    return { success: false, cancelled, error: message };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fulfillConsumablePurchase(
    productId: string,
    transactionId: string
  ): Promise<boolean> {
    await this.storage.addPendingGrant(transactionId, productId);

    if (!this.consumableFulfiller) {
      logger.error('[IAP] Consumable fulfiller not bound — grant queued');
      return false;
    }

    try {
      const granted = await this.consumableFulfiller(productId, transactionId);
      if (granted) {
        await this.storage.completeGrant(transactionId);
      }
      return granted;
    } catch (error) {
      logger.warn('[IAP] Consumable fulfill failed — pending kept for settle', {
        productId,
        transactionId,
        error,
      });
      return false;
    }
  }

  private async runSettlePendingConsumables(): Promise<void> {
    if (!saveService.isHydrated()) {
      logger.warn('[IAP] Skipping consumable settle before save hydrate');
      return;
    }
    if (!this.consumableFulfiller) {
      return;
    }

    do {
      this.settleDirty = false;
      const pending = await this.storage.listPendingGrants();
      for (const grant of pending) {
        try {
          const ok = await this.consumableFulfiller(grant.productId, grant.transactionId);
          if (ok) {
            await this.storage.completeGrant(grant.transactionId);
            logger.info('[IAP] Settled pending consumable', grant);
          }
        } catch (error) {
          logger.warn('[IAP] Pending consumable settle failed — will retry', {
            ...grant,
            error,
          });
        }
      }
    } while (this.settleDirty);
  }

  private logClientAuthorityWarning(): void {
    if (this.authorityWarningLogged || !this.isEnabled()) {
      return;
    }

    this.authorityWarningLogged = true;
    logger.warn(
      '[IAP] Entitlements are client-authoritative in this starter kit; add backend validation before treating remove_ads as tamper-resistant.'
    );
  }
}

function resolveConsumableTransactionId(purchase: ProviderPurchase, productId: string): string {
  const raw = purchase.transactionId?.trim();
  if (raw) return raw;
  return `${productId}:${purchase.purchaseTime}`;
}

export const iap = new IapService();
