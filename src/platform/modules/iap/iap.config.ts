import type { ProductDefinition } from './iap.types';

/**
 * Product registry — add new products here without changing IapService logic.
 * Map store / Play Console product IDs to entitlements.
 */
export const PRODUCTS = {
  REMOVE_ADS: {
    id: 'remove_ads',
    type: 'non_consumable',
    entitlement: 'remove_ads',
  },
  COINS_10000: {
    id: 'coins_10000',
    type: 'consumable',
    entitlement: 'coins_10000',
  },
} as const satisfies Record<string, ProductDefinition>;

export type ProductKey = keyof typeof PRODUCTS;

export const REMOVE_ADS_PRICE = '$3.99';
export const COINS_10000_AMOUNT = 10_000;
export const COINS_10000_PRICE = '$0.99';
export const ENTITLEMENT_REMOVE_ADS = PRODUCTS.REMOVE_ADS.entitlement;

/**
 * StoreKit often formats USD as `US$0.99` (country code + `$`).
 * Strip the `XX` prefix so UI shows `$0.99` consistently with Android.
 */
export function normalizeStorePriceString(price: string): string {
  return price.replace(/^([A-Z]{2})\s*\$\s*(?=\d)/, '$');
}

/** Default purchase timeout (ms). */
export const IAP_PURCHASE_TIMEOUT_MS = 60_000;

/** Extra window after client timeout to poll / await the store purchase. */
export const IAP_TIMEOUT_RECOVERY_MS = 90_000;

/** Dedicated storage key for entitlement persistence. */
export const IAP_STORAGE_KEY = 'iap-entitlements';

/** Durable set of consumable transaction ids already granted (prevents double-grant). */
export const IAP_CONSUMABLE_TX_KEY = 'iap-consumable-tx-v1';

export function getProductById(productId: string): ProductDefinition | undefined {
  return Object.values(PRODUCTS).find((product) => product.id === productId);
}

export function getProductByKey(key: ProductKey): ProductDefinition {
  return PRODUCTS[key];
}

export function getAllProductIds(): string[] {
  return Object.values(PRODUCTS).map((product) => product.id);
}
