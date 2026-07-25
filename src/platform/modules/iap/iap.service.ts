import { IapError } from './iap.types';
import { IAP_EVENTS } from './iap.events';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { MockIapAdapter } from './iap.mock-adapter';
import type { IEventBus } from '@platform/core/events';
import { purchaseStorage, type PurchaseStorage } from './purchase.storage';
import { PRODUCTS, getProductById, IAP_PURCHASE_TIMEOUT_MS } from './iap.config';
import type { IAPProvider, RestoreResult, PurchaseResult, ProductDefinition } from './iap.types';

interface IapServiceDeps {
  emit?: IEventBus['emit'];
  storage?: PurchaseStorage;
}

class IapService {
  private readonly storage: PurchaseStorage;
  private readonly emit: typeof eventBus.emit;

  private ready = false;
  private enabled = true;
  private restoring = false;
  private purchasing = false;
  private authorityWarningLogged = false;
  private entitlements = new Set<string>();
  private provider: IAPProvider | null = null;
  private initPromise: Promise<void> | null = null;

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

  isEnabled(): boolean {
    return this.enabled && getConfig().iapEnabled;
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

      this.ready = true;
      logger.info('[IAP] Ready', { provider: this.provider.name, entitlements: stored });
    } catch (error) {
      logger.error('[IAP] Initialization failed', error);
      throw error;
    }
  }

  has(entitlement: string): boolean {
    return this.entitlements.has(entitlement);
  }

  getEntitlements(): string[] {
    return [...this.entitlements];
  }

  /** Convenience — true when remove_ads entitlement is active. */
  isPremium(): boolean {
    return this.has('remove_ads');
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

    if (product.type === 'non_consumable' && this.has(product.entitlement)) {
      return { success: false, cancelled: false, error: 'Already owned' };
    }

    this.purchasing = true;
    logger.info('[IAP] Purchase started', { productId: product.id });

    try {
      const providerPurchase = await this.withTimeout(
        this.provider.purchase(product.id),
        IAP_PURCHASE_TIMEOUT_MS,
        'Purchase timed out'
      );

      const matched = getProductById(providerPurchase.productId) ?? product;
      // Consumables (e.g. coin packs) grant once at purchase time — do not persist.
      if (matched.type !== 'consumable') {
        await this.grantEntitlement(matched.entitlement);
      }

      this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
        productId: providerPurchase.productId,
        entitlement: matched.entitlement,
      });

      logger.info('[IAP] Purchase succeeded', {
        productId: matched.id,
        entitlement: matched.entitlement,
        type: matched.type,
      });

      return { success: true, cancelled: false, entitlement: matched.entitlement };
    } catch (error) {
      const result = this.normalizePurchaseError(error, product.id);

      // Store purchase may still complete after a client timeout — sync entitlements.
      if (result.error && /timed out/i.test(result.error)) {
        const recovered = await this.tryRecoverTimedOutPurchase(product);
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

  /** After a client timeout, re-check the store in case the charge succeeded. */
  private async tryRecoverTimedOutPurchase(product: ProductDefinition): Promise<boolean> {
    if (!this.provider) return false;

    try {
      if (product.type === 'consumable') {
        const withinMs = IAP_PURCHASE_TIMEOUT_MS + 60_000;
        const recent = await this.provider.findRecentPurchase?.(product.id, withinMs);
        if (!recent) {
          logger.warn('[IAP] Timeout recovery: no recent consumable purchase', {
            productId: product.id,
          });
          return false;
        }

        this.emit(IAP_EVENTS.PURCHASE_SUCCESS, {
          productId: product.id,
          entitlement: product.entitlement,
        });
        logger.info('[IAP] Recovered consumable after purchase timeout', {
          productId: product.id,
          transactionId: recent.transactionId,
        });
        return true;
      }

      const remote = await this.provider.fetchEntitlements();
      if (!remote.includes(product.entitlement)) {
        logger.warn('[IAP] Timeout recovery: entitlement not present yet', {
          productId: product.id,
        });
        return false;
      }

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
        if (!product?.entitlement || product.type === 'consumable') continue;

        const wasNew = !this.has(product.entitlement);
        await this.grantEntitlement(product.entitlement, { emitChange: wasNew });
        if (wasNew) restoredEntitlements.push(product.entitlement);
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

  isPurchasing(): boolean {
    return this.purchasing;
  }

  isRestoring(): boolean {
    return this.restoring;
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

export const iap = new IapService();
