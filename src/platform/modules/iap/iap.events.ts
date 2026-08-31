/** IAP event names — subscribe via eventBus in Phaser scenes / UI. */
export const IAP_EVENTS = {
  PURCHASE_FAILED: 'iap:purchase:failed',
  PURCHASE_RESTORED: 'iap:restore:success',
  PURCHASE_SUCCESS: 'iap:purchase:success',
  PRODUCTS_UPDATED: 'iap:products:updated',
  ENTITLEMENT_CHANGED: 'iap:entitlement:changed',
} as const;

export interface IapPurchaseSuccessPayload {
  productId: string;
  entitlement: string;
  transactionId?: string;
}

export interface IapPurchaseFailedPayload {
  error?: string;
  productId: string;
  cancelled: boolean;
}

export interface IapRestoreSuccessPayload {
  restoredEntitlements: string[];
}

export interface IapEntitlementChangedPayload {
  active: boolean;
  entitlement: string;
  entitlements: string[];
}

export interface IapProductsUpdatedPayload {
  productIds: string[];
}
