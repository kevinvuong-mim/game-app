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
  private readonly initialPermissionPrompt = new Promise<void>((resolve) => {
    this.resolveInitialPermissionPrompt = resolve;
  });

  private pushInitialized = false;
  private localInitialized = false;
  private resolveInitialPermissionPrompt: (() => void) | null = null;

  /**
   * Release waiters when the ATT → Notifications sequence finished (or was skipped).
   * Safe to call more than once.
   */
  markInitialPermissionPromptComplete(): void {
    this.resolveInitialPermissionPrompt?.();
    this.resolveInitialPermissionPrompt = null;
  }

  /**
   * Show the system notification permission dialog(s) without registering FCM
   * or scheduling local reminders. Used by App bootstrap between ATT and UMP.
   */
  async requestInitialPermissions(): Promise<void> {
    const config = getConfig();

    try {
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      if (config.localNotificationsEnabled) {
        await localNotificationService.initialize();
      }

      if (config.pushNotificationsEnabled) {
        await pushNotificationService.requestPermission();
      }
    } finally {
      this.markInitialPermissionPromptComplete();
    }
  }

  /**
   * Local notifications do not require guest or network.
   * Retries permission/channel setup on later reconciles until granted once.
   */
  async initializeLocal(): Promise<void> {
    await this.initialPermissionPrompt;

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
    await this.initialPermissionPrompt;

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
    if (!granted) {
      // Keep pushInitialized false so resume retries after the user enables
      // notifications in system settings (same pattern as initializeLocal).
      return;
    }

    await pushNotificationService.syncDeviceState();
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

  /**
   * Re-arm the daily reward reminder horizon.
   * `canClaim` is resolved when the local schedule job runs (not here), so
   * resume/locale snapshots cannot race past a later claim.
   */
  async reconcileDailyRewardSchedule(options?: { promptExactAlarm?: boolean }): Promise<void> {
    const config = getConfig();

    if (!config.localNotificationsEnabled) {
      return;
    }

    await this.initializeLocal();
    await localNotificationService.reconcileDailyRewardSchedule(options);
  }

  async onAppResume(): Promise<void> {
    const config = getConfig();

    if (config.pushNotificationsEnabled) {
      // Heal deny-then-enable: initializePush is a no-op once granted.
      await this.initializePush();
      await pushNotificationService.refreshTokenIfNeeded();
      await deviceSyncService.flush();
    }

    if (config.localNotificationsEnabled) {
      // Resume is the right time to heal wiped exact alarms / open settings once.
      await this.reconcileDailyRewardSchedule({ promptExactAlarm: true });
    }
  }

  async onLocaleChanged(): Promise<void> {
    const config = getConfig();

    if (config.pushNotificationsEnabled) {
      await this.initializePush();
      await pushNotificationService.refreshTokenIfNeeded();
      void deviceSyncService.flush().catch(() => undefined);
    }

    if (config.localNotificationsEnabled) {
      // Re-arm so pending title/body pick up the new locale.
      await this.reconcileDailyRewardSchedule();
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
