import { Capacitor } from '@capacitor/core';

import {
  NOTIFICATION_CHANNEL,
  DAILY_REWARD_REMINDER_HOUR,
  DAILY_REWARD_REMINDER_MINUTE,
  planDailyRewardReminderHorizon,
  dailyRewardReminderNotificationId,
  DAILY_REWARD_REMINDER_HORIZON_DAYS,
  shouldSkipTodayDailyRewardReminder,
} from './notification.model';
import { t } from '@platform/modules/i18n';
import { logger } from '@platform/core/error';
import { dailyRewards } from '@platform/modules/daily-reward';
import { ensureAndroidNotificationChannel } from './android-notification-channel';

interface ReminderNotification {
  id: number;
  body: string;
  title: string;
  channelId: string;
  extra: { route: 'DailyReward' };
  schedule: { at: Date; allowWhileIdle: true };
}

class LocalNotificationService {
  private initialized = false;
  /** Avoid opening exact-alarm settings on every reconcile this process. */
  private exactAlarmPromptedThisSession = false;
  /** Serialize cancel+schedule so resume/claim/locale cannot interleave. */
  private reconcileQueue: Promise<void> = Promise.resolve();

  /**
   * @returns true when channel setup ran and notification permission is granted.
   * Permission must be granted before any schedule call.
   */
  async initialize(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    if (this.initialized) {
      return this.hasPermission();
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await ensureAndroidNotificationChannel();
      const permission = await LocalNotifications.requestPermissions();
      this.initialized = true;

      if (permission.display !== 'granted') {
        logger.warn('[LocalNotification] Permission not granted after request', permission);
        return false;
      }

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
   * Keep 07:00 reminders armed for the next N mornings.
   *
   * Always uses one-shot `at` + `allowWhileIdle` (never Capacitor `on` cron):
   * - Android: calendar `on` only arms the first AlarmManager shot with
   *   allowWhileIdle; later reschedules drop to setExact(RTC) and Doze eats them.
   * - iOS: Capacitor `getDateComponents` casts hour/minute with `as? Int`, which
   *   fails for bridge `NSNumber` values — empty DateComponents → cron never matches.
   *   `at` arrives as NSDate via WKWebView and builds a valid time-interval trigger.
   *
   * Calls are serialized so resume / claim / locale cannot cancel each other mid-flight.
   * `canClaim` is read when the queued job runs (not at enqueue time) so a stale
   * resume/locale snapshot cannot re-arm today's reminder after a claim.
   */
  reconcileDailyRewardSchedule(options?: { promptExactAlarm?: boolean }): Promise<void> {
    const promptExactAlarm = options?.promptExactAlarm === true;
    const run = this.reconcileQueue.then(() =>
      this.reconcileDailyRewardScheduleUnlocked({ promptExactAlarm })
    );
    this.reconcileQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async reconcileDailyRewardScheduleUnlocked(options: {
    promptExactAlarm: boolean;
  }): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const granted = await this.hasPermission();
    if (!granted) {
      // Drop any previously armed reminders if the user revoked permission.
      await this.cancelDailyRewardReminder();
      logger.info('[LocalNotification] Permission not granted — skipping daily reward reminder');
      return;
    }

    await this.ensureExactAlarmsReady(options.promptExactAlarm);

    await this.cancelDailyRewardReminder();

    // Fresh read at execute time — never trust event-time snapshots across the queue.
    const canClaim = dailyRewards.canClaim();
    const skipToday = shouldSkipTodayDailyRewardReminder(canClaim);
    await this.scheduleReminderHorizon({ fromTomorrow: skipToday });
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

  /**
   * One-shot 07:00 reminders for the next N mornings. Each alarm uses `at`
   * (real Date) so both iOS and Android get a concrete trigger.
   * Scheduled one-by-one so a single native reject cannot wipe the whole horizon.
   */
  private async scheduleReminderHorizon(options: { fromTomorrow: boolean }): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const now = new Date();
      const title = t('notifications.dailyReward.title');
      const body = t('notifications.dailyReward.body');
      const fireTimes = planDailyRewardReminderHorizon(now, {
        skipToday: options.fromTomorrow,
      });

      const notifications: ReminderNotification[] = fireTimes.map((at, index) =>
        this.buildReminder(dailyRewardReminderNotificationId(index), title, body, at)
      );

      const scheduledIds: number[] = [];
      for (const notification of notifications) {
        try {
          await LocalNotifications.schedule({ notifications: [notification] });
          scheduledIds.push(notification.id);
        } catch (error) {
          logger.warn('[LocalNotification] Failed to schedule one daily reward reminder', {
            id: notification.id,
            at: notification.schedule.at.toISOString(),
            error,
          });
        }
      }

      // Native `add` is async on iOS; brief yield before verifying pending queue.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const pending = await LocalNotifications.getPending();
      const pendingIds = new Set(
        (pending.notifications ?? [])
          .map((item) => item.id)
          .filter((id): id is number => typeof id === 'number')
      );
      const missing = scheduledIds.filter((id) => !pendingIds.has(id));

      logger.info('[LocalNotification] Daily reward horizon scheduled', {
        platform: Capacitor.getPlatform(),
        count: scheduledIds.length,
        pendingCount: pendingIds.size,
        hour: DAILY_REWARD_REMINDER_HOUR,
        minute: DAILY_REWARD_REMINDER_MINUTE,
        fromTomorrow: options.fromTomorrow,
        fireAt: notifications.map((item) => item.schedule.at.toISOString()),
        missingIds: missing,
      });

      if (scheduledIds.length === 0) {
        logger.warn('[LocalNotification] No daily reward reminders were armed');
      } else if (missing.length > 0) {
        logger.warn(
          '[LocalNotification] Some daily reward reminders missing from pending queue — OS may have dropped them',
          { missing }
        );
      }
    } catch (error) {
      logger.warn('[LocalNotification] Failed to schedule daily reward horizon', error);
    }
  }

  private buildReminder(id: number, title: string, body: string, at: Date): ReminderNotification {
    return {
      id,
      title,
      body,
      channelId: NOTIFICATION_CHANNEL.ID,
      // Clone so the bridge always receives a concrete Date instance (not a shared ref).
      schedule: { at: new Date(at.getTime()), allowWhileIdle: true },
      extra: {
        route: 'DailyReward',
      },
    };
  }

  /**
   * Android 12+: exact alarms can be revoked in system settings; at-schedules then
   * become inexact or wiped. Optionally open settings once per process (resume only —
   * never during cold-start privacy sequence).
   */
  private async ensureExactAlarmsReady(prompt: boolean): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.checkExactNotificationSetting();
      if (status.exact_alarm === 'granted') {
        return;
      }

      logger.warn(
        '[LocalNotification] Exact alarms not granted — daily reward timing may drift or be cleared by the OS',
        status
      );

      if (!prompt || this.exactAlarmPromptedThisSession) {
        return;
      }

      this.exactAlarmPromptedThisSession = true;
      await LocalNotifications.changeExactNotificationSetting();
    } catch {
      // Older native shells may not expose the exact-alarm API.
    }
  }
}

export const localNotificationService = new LocalNotificationService();
