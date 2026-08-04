import {
  NOTIFICATION_TYPES,
  resolveNotificationRoute,
  type PushNotificationPayload,
} from './notification.model';
import { t } from '@platform/modules/i18n';
import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { deviceSyncService } from './device-sync.service';
import { navigationService } from '@platform/modules/navigation';
import { pushNotificationService } from './push-notification.service';
import { localNotificationService } from './local-notification.service';

class NotificationService {
  private pushInitialized = false;
  private localInitialized = false;

  /**
   * Local notifications do not require guest or network.
   * Retries permission/channel setup on later reconciles until granted once.
   */
  async initializeLocal(): Promise<void> {
    const config = getConfig();

    if (!Capacitor.isNativePlatform() || this.localInitialized) {
      return;
    }

    if (!config.localNotificationsEnabled) {
      return;
    }

    const ok = await localNotificationService.initialize();
    if (!ok) {
      // Keep localInitialized false so the next resume/claim retries after the
      // user enables notifications in system settings.
      return;
    }

    this.localInitialized = true;
    logger.info('[Notification] Local notifications initialized');
  }

  /** Push registration requires guest auth for device token sync. */
  async initializePush(): Promise<void> {
    const config = getConfig();

    if (!Capacitor.isNativePlatform() || this.pushInitialized) {
      return;
    }

    if (!config.pushNotificationsEnabled) {
      return;
    }

    pushNotificationService.setHandlers({
      onReceived: (payload) => this.handleForegroundNotification(payload),
      onAction: (payload) => this.handleNotificationTap(payload),
    });

    const granted = await pushNotificationService.initialize();
    if (granted) {
      await pushNotificationService.syncDeviceState();
    }

    void deviceSyncService.flush().catch(() => undefined);

    this.pushInitialized = true;
    logger.info('[Notification] Push notifications initialized');
  }

  /**
   * After guest auth recovery the device must re-register against the new guest.
   * `initializePush` is a no-op once `pushInitialized` is set, so re-enqueue explicitly.
   */
  async rebindPushAfterGuestRecovery(): Promise<void> {
    const config = getConfig();
    if (!Capacitor.isNativePlatform() || !config.pushNotificationsEnabled) {
      return;
    }

    if (!this.pushInitialized) {
      await this.initializePush();
      return;
    }

    await pushNotificationService.refreshTokenIfNeeded();
    void deviceSyncService.flush().catch(() => undefined);
    logger.info('[Notification] Re-bound push device token after guest recovery');
  }

  async reconcileDailyRewardSchedule(canClaim: boolean): Promise<void> {
    const config = getConfig();

    if (!config.localNotificationsEnabled) {
      return;
    }

    await this.initializeLocal();
    await localNotificationService.reconcileDailyRewardSchedule(canClaim);
  }

  async onAppResume(canClaimDailyReward: boolean): Promise<void> {
    const config = getConfig();

    if (config.pushNotificationsEnabled) {
      await pushNotificationService.refreshTokenIfNeeded();
      await deviceSyncService.flush();
    }

    if (config.localNotificationsEnabled) {
      await this.reconcileDailyRewardSchedule(canClaimDailyReward);
    }
  }

  async onLocaleChanged(canClaimDailyReward: boolean): Promise<void> {
    const config = getConfig();

    if (config.pushNotificationsEnabled) {
      await pushNotificationService.refreshTokenIfNeeded();
      void deviceSyncService.flush().catch(() => undefined);
    }

    if (config.localNotificationsEnabled) {
      // Re-arm so pending title/body pick up the new locale.
      await this.reconcileDailyRewardSchedule(canClaimDailyReward);
    }
  }

  handleNotificationTap(payload: PushNotificationPayload): void {
    const scene = resolveNotificationRoute(payload.type, payload.route);
    navigationService.navigateToScene(scene, { returnTo: 'Home' });
  }

  private handleForegroundNotification(payload: PushNotificationPayload): void {
    logger.info('[Notification] Received in foreground', payload);

    const message = this.resolveForegroundMessage(payload);
    if (message) {
      eventBus.emit('ui:toast', { message, type: 'info', duration: 4000 });
    }
  }

  private resolveForegroundMessage(payload: PushNotificationPayload): string | null {
    switch (payload.type) {
      case NOTIFICATION_TYPES.TOP_100_EXITED:
        return t('notifications.top100Exited.body');
      case NOTIFICATION_TYPES.RANK_PUSH:
        return typeof payload.rank === 'number'
          ? t('notifications.rankPush.body', { rank: payload.rank })
          : t('notifications.rankPush.bodyFallback');
      default:
        return null;
    }
  }
}

export const notificationService = new NotificationService();
