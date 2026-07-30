export type ProductType = 'consumable' | 'subscription' | 'non_consumable';

export interface ProductDefinition {
  id: string;
  type: ProductType;
  entitlement: string;
}

export interface ProviderProduct {
  id: string;
  title: string;
  price: string;
  currency: string;
  type: ProductType;
  description: string;
  priceAmount: number;
}

export interface ProviderPurchase {
  receipt: string;
  productId: string;
  purchaseTime: number;
  transactionId: string;
}

export interface PurchaseResult {
  error?: string;
  success: boolean;
  cancelled: boolean;
  entitlement?: string;
}

export interface RestoreResult {
  error?: string;
  success: boolean;
  restoredEntitlements: string[];
}

export interface StoredEntitlements {
  version: number;
  updatedAt: number;
  entitlements: string[];
}

export interface IAPProvider {
  readonly name: string;
  initialize(): Promise<void>;
  /** Sync active entitlements from the provider (RevenueCat CustomerInfo, mock cache). */
  fetchEntitlements(): Promise<string[]>;
  restore(): Promise<ProviderPurchase[]>;
  getProducts(): Promise<ProviderProduct[]>;
  purchase(productId: string): Promise<ProviderPurchase>;
  /** Link store account to app user id (RevenueCat logIn). */
  linkAppUser?(appUserId: string): Promise<void>;
  /**
   * Look up a recent store purchase of `productId` (used to recover after client timeout).
   * Optional — mock / providers without history omit this.
   */
  findRecentPurchase?(productId: string, withinMs: number): Promise<ProviderPurchase | null>;
}

export class IapError extends Error {
  constructor(
    message: string,
    readonly code: 'cancelled' | 'timeout' | 'unavailable' | 'duplicate' | 'provider' | 'unknown',
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IapError';
  }
}
