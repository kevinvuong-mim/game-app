import {
  i18n,
  guest,
  missions,
  settings,
  adsModule,
  leaderboard,
  saveService,
  dailyRewards,
  gameRunService,
  deepLinkService,
  guestController,
  syncGuestToStore,
  bindIapController,
  missionController,
  gameSyncController,
  bindGuestStoreSync,
  notificationService,
  notificationController,
} from '@platform/modules';
import {
  registerAdsProvider,
  registerIapProvider,
  registerAnalyticsProviders,
} from '@platform/bootstrap/providers';
import { Capacitor } from '@capacitor/core';
import { iap } from '@platform/modules/iap';
import { logger } from '@platform/core/error';
import { apiClient } from '@platform/core/api';
import { services } from '@platform/core/services';
import { usePlatformStore } from '@platform/core/state';
import { trackSessionEnd } from '@platform/core/analytics/events';
import { bindNavigationEvents } from '@platform/modules/navigation';
import { bindAppEvents, bindAppLifecycle } from '@platform/bootstrap/app-events';

const { ads, config, events, analytics } = services;

/**
 * App layer orchestrator. Wires platform modules to the event bus.
 * Games never import this directly.
 */
class App {
  private initialized = false;
  private unsubscribers: Array<() => void> = [];
  private controllerUnsubscribers: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[App] Initializing platform...');

    if (Capacitor.isNativePlatform() && config().pushNotificationsEnabled) {
      await notificationService.attachLaunchListeners();
    }

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

    void analytics.init().catch((error) => {
      logger.error('[App] analytics init failed', error);
    });

    this.unsubscribers.push(
      guest.onReady((guestId) => {
        analytics.setUserId(guestId);
        void guest.flushPendingName();
        if (!config().iapEnabled) return;
        void iap.linkGuestUser(guestId).catch((error) => {
          logger.warn('[App] IAP guest link failed', error);
        });
      }),
      bindGuestStoreSync()
    );

    const fallbackUserId = usePlatformStore.getState().user.id || undefined;
    const analyticsUserId = guest.getGuestId() ?? fallbackUserId;
    if (config().iapEnabled) {
      registerIapProvider(analyticsUserId);
      // RevenueCat can hang offline — do not await before starting the game.
      void iap.initialize().catch((error) => {
        logger.warn('[App] IAP init failed — continuing without IAP', error);
      });
    }

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
    this.controllerUnsubscribers.push(
      guestController.bind(events),
      gameSyncController.bind(events),
      missionController.bind(events),
      notificationController.bind(events),
      deepLinkService.bind(events)
    );
    if (config().adsEnabled) {
      this.controllerUnsubscribers.push(adsModule.bind(events));
    }
    if (config().iapEnabled) {
      this.controllerUnsubscribers.push(bindIapController(events));
      await iap.replayPendingConsumables().catch((error) => {
        logger.warn('[App] Pending IAP replay failed', error);
      });
    }

    // Native: ATT → Notifications → UMP (non-blocking for game shell).
    // Web / ads-only paths still init ads without the notification step.
    void this.runPrivacyPromptSequence().catch((error) => {
      logger.error('[App] privacy prompt sequence failed', error);
    });

    this.initialized = true;
    logger.info('[App] Platform ready');
  }

  /**
   * Ordered system dialogs on native cold start:
   * 1. ATT (inside ads.init for AdMob/iOS)
   * 2. Notification permission
   * 3. Google UMP consent (when required), then ad preload
   */
  private async runPrivacyPromptSequence(): Promise<void> {
    const runtime = config();

    try {
      if (runtime.adsEnabled) {
        try {
          await ads.init();
        } catch (error) {
          logger.error('[App] ads init (ATT) failed — continuing privacy sequence', error);
        }
      }

      if (Capacitor.isNativePlatform()) {
        await notificationService.requestInitialPermissions();

        if (runtime.localNotificationsEnabled) {
          void notificationService.reconcileDailyRewardSchedule();
        }
      } else {
        notificationService.markInitialPermissionPromptComplete();
      }

      if (runtime.adsEnabled) {
        await ads.requestUmpConsentAndPreload();
      }
    } catch (error) {
      // Never leave push/local blocked if a later step throws.
      notificationService.markInitialPermissionPromptComplete();
      throw error;
    }
  }

  async destroy(): Promise<void> {
    trackSessionEnd();
    await saveService.saveLocal();
    ads.destroy();
    await analytics.flush();
    await analytics.shutdown();
    analytics.clearProviders();
    for (const unsub of this.controllerUnsubscribers) unsub();
    this.controllerUnsubscribers = [];
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.initialized = false;
  }
}

export const app = new App();
