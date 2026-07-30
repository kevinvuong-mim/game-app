import {
  i18n,
  guest,
  missions,
  settings,
  leaderboard,
  saveService,
  gameRunService,
  dailyRewards,
  guestController,
  bindAdsController,
  bindIapController,
  missionController,
  deepLinkController,
  gameSyncController,
  dailyRewardController,
  leaderboardController,
  notificationController,
} from '@platform/modules';
import {
  registerAdsProvider,
  registerIapProvider,
  registerAnalyticsProviders,
} from '@platform/bootstrap/providers';
import { logger } from '@platform/core/error';
import { apiClient } from '@platform/core/api';
import { services } from '@platform/core/services';
import { usePlatformStore } from '@platform/core/state';
import { iap } from '@platform/modules/iap';
import { trackSessionEnd } from '@platform/core/analytics/events';
import { bindAppEvents, bindAppLifecycle } from '@platform/bootstrap/app-events';
import { bindNavigationEvents } from '@platform/modules/navigation';
import { syncGuestToStore, bindGuestStoreSync } from '@platform/modules/guest/guest-store-sync';

const { ads, config, events, analytics } = services;

/**
 * App layer orchestrator. Wires platform modules to the event bus.
 * Games never import this directly.
 */
class App {
  private initialized = false;
  private dailyRewardUnsubscribe?: () => void;
  private unsubscribers: Array<() => void> = [];
  private controllerUnsubscribers: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[App] Initializing platform...');

    const store = usePlatformStore.getState();
    if (!store.user.displayName) {
      store.setUser({ displayName: 'Player' });
    }

    registerAnalyticsProviders();
    registerAdsProvider();

    apiClient.setAuthRecoveryHandler(() => guest.recoverFromUnauthorized());

    // Local-only inits that local play needs before Phaser boots.
    // Ads / analytics / IAP may touch the network — never block the game shell on them.
    const localInits = await Promise.allSettled([i18n.init(), leaderboard.init(), guest.init()]);
    for (const [index, result] of localInits.entries()) {
      if (result.status === 'rejected') {
        const labels = ['i18n', 'leaderboard', 'guest'];
        logger.error(`[App] ${labels[index]} init failed`, result.reason);
      }
    }

    void ads.init().catch((error) => {
      logger.error('[App] ads init failed', error);
    });
    void analytics.init().catch((error) => {
      logger.error('[App] analytics init failed', error);
    });

    this.unsubscribers.push(
      guest.onReady((guestId) => {
        analytics.setUserId(guestId);
        void guest.flushPendingName();
        void iap.linkGuestUser(guestId).catch((error) => {
          logger.warn('[App] IAP guest link failed', error);
        });
      }),
      bindGuestStoreSync()
    );

    const fallbackUserId = usePlatformStore.getState().user.id || undefined;
    const analyticsUserId = guest.getGuestId() ?? fallbackUserId;
    registerIapProvider(analyticsUserId);
    // RevenueCat can hang offline — do not await before starting the game.
    void iap.initialize().catch((error) => {
      logger.warn('[App] IAP init failed — continuing without IAP', error);
    });

    const { adsModule } = await import('@platform/modules/ads');
    await adsModule.init();

    if (analyticsUserId) {
      analytics.setUserId(analyticsUserId);
    }
    analytics.setUserProperty('game_id', config().gameId);

    await saveService.loadLocal();
    await gameRunService.load();
    syncGuestToStore();
    // Name flush may call saveLocal — only safe after hydrate.
    void guest.flushPendingName();
    await dailyRewards.init();
    await settings.init();
    missions.init();

    this.unsubscribers.push(bindAppEvents());
    this.unsubscribers.push(bindAppLifecycle());
    this.unsubscribers.push(bindNavigationEvents());
    this.dailyRewardUnsubscribe = dailyRewardController.bind(events);
    this.controllerUnsubscribers.push(
      guestController.bind(events),
      leaderboardController.bind(events),
      gameSyncController.bind(events),
      bindAdsController(events),
      bindIapController(events),
      missionController.bind(events),
      notificationController.bind(events),
      deepLinkController.bind(events)
    );

    this.initialized = true;
    logger.info('[App] Platform ready');
  }

  async destroy(): Promise<void> {
    trackSessionEnd();
    await saveService.saveLocal();
    ads.destroy();
    await analytics.flush();
    await analytics.shutdown();
    analytics.clearProviders();
    this.dailyRewardUnsubscribe?.();
    this.dailyRewardUnsubscribe = undefined;
    for (const unsub of this.controllerUnsubscribers) unsub();
    this.controllerUnsubscribers = [];
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.initialized = false;
  }
}

export const app = new App();
