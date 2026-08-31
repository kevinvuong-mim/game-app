import { iap } from './iap.service';
import { IAP_EVENTS } from './iap.events';
import { logger } from '@platform/core/error';
import { shop } from '@platform/modules/shop';
import { services } from '@platform/core/services';
import { ENTITLEMENT_REMOVE_ADS } from './iap.config';
import type { IEventBus } from '@platform/core/events';

const { ads } = services;

function syncAdsWithEntitlements(): void {
  const removeAds = iap.has(ENTITLEMENT_REMOVE_ADS);
  ads.setAdsRemoved(removeAds);

  if (removeAds) {
    void ads.hideBanner();
    ads.destroyBanner();
  }
}

/**
 * Wires IAP entitlements to ads and shop grants. Call once during App.init().
 */
export function bindIapController(events: IEventBus): () => void {
  syncAdsWithEntitlements();

  const unsubscribers = [
    events.on(IAP_EVENTS.ENTITLEMENT_CHANGED, () => {
      syncAdsWithEntitlements();
    }),

    events.on(IAP_EVENTS.PURCHASE_SUCCESS, ({ productId }) => {
      shop.fulfillIapProduct(productId);
    }),

    events.on(IAP_EVENTS.PURCHASE_RESTORED, () => {
      // Re-sync even when entitlements were already known (no ENTITLEMENT_CHANGED).
      syncAdsWithEntitlements();
      events.emit('shop:restore', undefined);
    }),
  ];

  void iap.replayPendingConsumables().catch((error) => {
    logger.warn('[IAP] Pending consumable replay failed', error);
  });

  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}
