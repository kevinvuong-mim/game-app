import {
  NOTIFICATION_IDS,
  NOTIFICATION_CHANNEL,
  getNextDailyRewardReminderAt,
} from './notification.model';
import { t } from '@platform/modules/i18n';
import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { ensureAndroidNotificationChannel } from './android-notification-channel';

class LocalNotificationService {
  private initialized = false;

  /** @returns true when channel + permission request completed successfully. */
  async initialize(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    if (this.initialized) {
      return true;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await ensureAndroidNotificationChannel();
      await LocalNotifications.requestPermissions();
      this.initialized = true;
      return true;
    } catch (error) {
      logger.warn('[LocalNotification] Init failed', error);
      return false;
    }
  }

  async hasPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.checkPermissions();
      return status.display === 'granted';
    } catch (error) {
      logger.warn('[LocalNotification] Permission check failed', error);
      return false;
    }
  }

  async scheduleDailyRewardReminder(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const granted = await this.hasPermission();
    if (!granted) {
      logger.info('[LocalNotification] Permission not granted — skipping daily reward reminder');
      return;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_IDS.DAILY_REWARD }] });

      const scheduleAt = getNextDailyRewardReminderAt();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_IDS.DAILY_REWARD,
            title: t('notifications.dailyReward.title'),
            body: t('notifications.dailyReward.body'),
            channelId: NOTIFICATION_CHANNEL.ID,
            schedule: { at: scheduleAt, allowWhileIdle: true },
            extra: {
              route: 'DailyReward',
            },
          },
        ],
      });

      logger.info('[LocalNotification] Daily reward reminder scheduled', {
        at: scheduleAt.toISOString(),
      });
    } catch (error) {
      logger.warn('[LocalNotification] Failed to schedule daily reward reminder', error);
    }
  }

  async cancelDailyRewardReminder(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_IDS.DAILY_REWARD }] });
    } catch (error) {
      logger.warn('[LocalNotification] Failed to cancel daily reward reminder', error);
    }
  }

  /**
   * Keep a pending reminder when the user can already claim — opening the app
   * briefly before 07:00 must not wipe today's nudge. Only (re)schedule when
   * they have already claimed today (`canClaim === false`).
   */
  async reconcileDailyRewardSchedule(canClaim: boolean): Promise<void> {
    if (canClaim) {
      return;
    }

    await this.scheduleDailyRewardReminder();
  }
}

export const localNotificationService = new LocalNotificationService();
