import {
  NOTIFICATION_IDS,
  NOTIFICATION_CHANNEL,
  DAILY_REWARD_REMINDER_HOUR,
  DAILY_REWARD_REMINDER_MINUTE,
  getNextDailyRewardReminderAt,
  isBeforeDailyRewardReminderHour,
  getDailyRewardReminderTimeOnDate,
  dailyRewardReminderNotificationId,
  DAILY_REWARD_REMINDER_HORIZON_DAYS,
} from './notification.model';
import { t } from '@platform/modules/i18n';
import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { ensureAndroidNotificationChannel } from './android-notification-channel';

interface ReminderNotification {
  id: number;
  body: string;
  title: string;
  channelId: string;
  extra: { route: 'DailyReward' };
  schedule:
    | { at: Date; allowWhileIdle: true }
    | { on: { hour: number; minute: number }; allowWhileIdle: true };
}

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

  /**
   * Keep a 07:00 reminder armed whenever the user still needs to claim.
   *
   * - `canClaim` (or claimed after 07:00): calendar cron at 07:00 daily — keeps
   *   firing without reopening the app.
   * - Claimed before 07:00: cancel today's fire and arm one-shots for the next
   *   N mornings so the series continues even if they stay away.
   */
  async reconcileDailyRewardSchedule(canClaim: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const granted = await this.hasPermission();
    if (!granted) {
      logger.info('[LocalNotification] Permission not granted — skipping daily reward reminder');
      return;
    }

    const claimedBeforeReminderHour = !canClaim && isBeforeDailyRewardReminderHour();

    await this.cancelDailyRewardReminder();

    if (claimedBeforeReminderHour) {
      await this.scheduleReminderHorizon({ fromTomorrow: true });
      return;
    }

    await this.scheduleDailyCronReminder();
  }

  async cancelDailyRewardReminder(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({
        notifications: Array.from({ length: DAILY_REWARD_REMINDER_HORIZON_DAYS }, (_, offset) => ({
          id: dailyRewardReminderNotificationId(offset),
        })),
      });
    } catch (error) {
      logger.warn('[LocalNotification] Failed to cancel daily reward reminder', error);
    }
  }

  /** Repeating 07:00 local via Capacitor `on` (calendar match) — not `at`+`repeats`. */
  private async scheduleDailyCronReminder(): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const notification: ReminderNotification = {
        id: NOTIFICATION_IDS.DAILY_REWARD,
        title: t('notifications.dailyReward.title'),
        body: t('notifications.dailyReward.body'),
        channelId: NOTIFICATION_CHANNEL.ID,
        schedule: {
          allowWhileIdle: true,
          on: {
            hour: DAILY_REWARD_REMINDER_HOUR,
            minute: DAILY_REWARD_REMINDER_MINUTE,
          },
        },
        extra: {
          route: 'DailyReward',
        },
      };

      await LocalNotifications.schedule({ notifications: [notification] });

      logger.info('[LocalNotification] Daily reward cron armed', {
        hour: DAILY_REWARD_REMINDER_HOUR,
        minute: DAILY_REWARD_REMINDER_MINUTE,
      });
    } catch (error) {
      logger.warn('[LocalNotification] Failed to schedule daily reward cron', error);
    }
  }

  /**
   * One-shot 07:00 reminders for the next N mornings. Used after an early claim
   * so today's 07:00 is skipped but following mornings stay covered without
   * needing the user to reopen the app.
   */
  private async scheduleReminderHorizon(options: { fromTomorrow: boolean }): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const now = new Date();
      const startOffset = options.fromTomorrow ? 1 : 0;
      const title = t('notifications.dailyReward.title');
      const body = t('notifications.dailyReward.body');

      const notifications: ReminderNotification[] = [];
      for (let day = startOffset; day < startOffset + DAILY_REWARD_REMINDER_HORIZON_DAYS; day++) {
        const dayDate = new Date(now);
        dayDate.setDate(dayDate.getDate() + day);
        const at = getDailyRewardReminderTimeOnDate(dayDate);
        if (at.getTime() <= now.getTime()) {
          continue;
        }

        notifications.push({
          id: dailyRewardReminderNotificationId(day - startOffset),
          title,
          body,
          channelId: NOTIFICATION_CHANNEL.ID,
          schedule: { at, allowWhileIdle: true },
          extra: {
            route: 'DailyReward',
          },
        });
      }

      if (notifications.length === 0) {
        notifications.push({
          id: NOTIFICATION_IDS.DAILY_REWARD,
          title,
          body,
          channelId: NOTIFICATION_CHANNEL.ID,
          schedule: {
            at: getNextDailyRewardReminderAt(now, { skipToday: true }),
            allowWhileIdle: true,
          },
          extra: {
            route: 'DailyReward',
          },
        });
      }

      await LocalNotifications.schedule({ notifications });

      const first = notifications[0]?.schedule;
      logger.info('[LocalNotification] Daily reward horizon scheduled', {
        count: notifications.length,
        firstAt: first && 'at' in first ? first.at.toISOString() : undefined,
      });
    } catch (error) {
      logger.warn('[LocalNotification] Failed to schedule daily reward horizon', error);
    }
  }
}

export const localNotificationService = new LocalNotificationService();
