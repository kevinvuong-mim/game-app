import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { guest } from '@platform/modules/guest';
import { getConfig } from '@platform/core/config';
import type { IEventBus } from '@platform/core/events';
import { deviceSyncService } from './device-sync.service';
import type { PluginListenerHandle } from '@capacitor/core';
import { notificationService } from './notification.service';
import { navigationService } from '@platform/modules/navigation/navigation.service';
import { resolveNotificationRoute, type PushNotificationPayload } from './notification.model';

class NotificationController {
  private onlineHandler?: () => void;
  private networkListener?: PluginListenerHandle;
  private localActionListener?: PluginListenerHandle;

  bind(events: IEventBus): () => void {
    const config = getConfig();

    if (!Capacitor.isNativePlatform()) {
      return () => {};
    }

    if (!config.pushNotificationsEnabled && !config.localNotificationsEnabled) {
      return () => {};
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      events.on('app:resume', () => {
        void notificationService.onAppResume();
      })
    );

    if (config.localNotificationsEnabled) {
      // Permission + first reconcile are driven by App after ATT
      // (ATT → Notifications → UMP). Only wire claim/resume listeners here.

      unsubs.push(
        events.on('daily:claim', () => {
          // Re-arm from live canClaim when the queued job runs (skip today if still claimed).
          void notificationService.reconcileDailyRewardSchedule();
        })
      );

      void this.bindLocalNotificationActions();
    }

    let guestReadyUnsub = () => {};

    if (config.pushNotificationsEnabled) {
      // Permission is requested in App privacy sequence; register after guest auth.
      guestReadyUnsub = guest.onReady(() => {
        void notificationService.initializePush();
        void deviceSyncService.flush().catch(() => undefined);
      });

      this.bindDeviceSyncListeners();
      void deviceSyncService.flush().catch(() => undefined);
    }

    unsubs.push(
      events.on('settings:change', ({ key }) => {
        if (key === 'language') {
          void notificationService.onLocaleChanged();
        }
      })
    );

    return () => {
      guestReadyUnsub();
      for (const unsub of unsubs) unsub();
      if (this.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = undefined;
      }
      void this.networkListener?.remove();
      this.networkListener = undefined;
      void this.localActionListener?.remove();
      this.localActionListener = undefined;
    };
  }

  private bindDeviceSyncListeners(): void {
    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        logger.info('[DeviceSync] Network online — flushing device queue');
        void deviceSyncService.flush().catch(() => undefined);
      };
      window.addEventListener('online', this.onlineHandler);
    }

    void this.bindNativeNetworkListener();
  }

  private async bindNativeNetworkListener(): Promise<void> {
    try {
      const { Network } = await import('@capacitor/network');
      this.networkListener = await Network.addListener('networkStatusChange', ({ connected }) => {
        if (!connected) return;
        logger.info('[DeviceSync] Native network connected — flushing device queue');
        void deviceSyncService.flush().catch(() => undefined);
      });
    } catch {
      // Web builds and older native shells keep using the window 'online' fallback.
    }
  }

  private async bindLocalNotificationActions(): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');

      // Drop a previous handle if bind() is called again before teardown completes.
      await this.localActionListener?.remove();
      this.localActionListener = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event) => {
          const payload: PushNotificationPayload = {
            type:
              typeof event.notification.extra?.type === 'string'
                ? (event.notification.extra.type as PushNotificationPayload['type'])
                : undefined,
            route:
              typeof event.notification.extra?.route === 'string'
                ? (event.notification.extra.route as PushNotificationPayload['route'])
                : undefined,
          };

          const scene = resolveNotificationRoute(payload.type, payload.route);
          navigationService.navigateToScene(scene, { returnTo: 'Home' });
        }
      );
    } catch (error) {
      logger.warn('[NotificationController] Failed to bind local notification actions', error);
    }
  }
}

export const notificationController = new NotificationController();
