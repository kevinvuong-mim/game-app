export const NOTIFICATION_STORAGE_KEY = 'notification-state-v1';

export const MAX_DEVICE_SYNC_ATTEMPTS = 10;
export const BASE_DEVICE_SYNC_BACKOFF_MS = 30_000;
export const MAX_DEVICE_SYNC_BACKOFF_MS = 30 * 60 * 1000;

export const NOTIFICATION_IDS = {
  DAILY_REWARD: 1001,
} as const;

/** Extra one-shot ids for the daily reward reminder horizon (1001..1001+N-1). */
export const DAILY_REWARD_REMINDER_HORIZON_DAYS = 7;

/** Android notification channel — must match FCM default channel in native manifest. */
export const NOTIFICATION_CHANNEL = {
  ID: 'game_alerts',
  NAME: 'Game alerts',
  /** IMPORTANCE_HIGH — wakes screen and shows heads-up notification. */
  IMPORTANCE: 4 as const,
  /** VISIBILITY_PUBLIC — show full content on lock screen. */
  VISIBILITY: 1 as const,
  DESCRIPTION: 'Leaderboard updates and daily reward reminders',
} as const;

const NOTIFICATION_ROUTES = {
  HOME: 'Home',
  LEADERBOARD: 'Leaderboard',
  DAILY_REWARD: 'DailyReward',
} as const;

export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[keyof typeof NOTIFICATION_ROUTES];

/** FCM push types sent by game-api — local-only notifications use `route` only. */
export const NOTIFICATION_TYPES = {
  RANK_PUSH: 'rank_push',
  TOP_100_EXITED: 'top_100_exited',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const DAILY_REWARD_REMINDER_HOUR = 7;
export const DAILY_REWARD_REMINDER_MINUTE = 0;

export type DeviceLocale = 'EN' | 'VI';
export type DevicePlatform = 'IOS' | 'ANDROID';

export interface NotificationState {
  syncAttempts: number;
  lastAttemptAt?: string;
  lastErrorCode?: string;
  nextAttemptAt?: string;
  unregisterPending: boolean;
  pendingToken: string | null;
  lastSyncedToken: string | null;
  platform: DevicePlatform | null;
  pendingLocale: DeviceLocale | null;
  lastSyncedLocale: DeviceLocale | null;
}

export function createDefaultNotificationState(): NotificationState {
  return {
    platform: null,
    syncAttempts: 0,
    pendingToken: null,
    pendingLocale: null,
    lastSyncedToken: null,
    lastSyncedLocale: null,
    unregisterPending: false,
  };
}

export function normalizeNotificationState(value: unknown): NotificationState {
  if (!value || typeof value !== 'object') {
    return createDefaultNotificationState();
  }

  const raw = value as Partial<NotificationState>;

  return {
    unregisterPending: Boolean(raw.unregisterPending),
    syncAttempts: typeof raw.syncAttempts === 'number' ? raw.syncAttempts : 0,
    pendingToken: typeof raw.pendingToken === 'string' ? raw.pendingToken : null,
    platform: raw.platform === 'IOS' || raw.platform === 'ANDROID' ? raw.platform : null,
    lastAttemptAt: typeof raw.lastAttemptAt === 'string' ? raw.lastAttemptAt : undefined,
    lastErrorCode: typeof raw.lastErrorCode === 'string' ? raw.lastErrorCode : undefined,
    nextAttemptAt: typeof raw.nextAttemptAt === 'string' ? raw.nextAttemptAt : undefined,
    lastSyncedToken: typeof raw.lastSyncedToken === 'string' ? raw.lastSyncedToken : null,
    pendingLocale:
      raw.pendingLocale === 'EN' || raw.pendingLocale === 'VI' ? raw.pendingLocale : null,
    lastSyncedLocale:
      raw.lastSyncedLocale === 'EN' || raw.lastSyncedLocale === 'VI' ? raw.lastSyncedLocale : null,
  };
}

export function deviceSyncNeeded(state: NotificationState): boolean {
  if (state.unregisterPending) {
    return true;
  }

  if (!state.pendingToken || !state.pendingLocale || !state.platform) {
    return false;
  }

  return (
    state.lastSyncedToken !== state.pendingToken || state.lastSyncedLocale !== state.pendingLocale
  );
}

export interface PushNotificationPayload {
  /** Present on rank_push FCM data payloads from game-api. */
  rank?: number;
  type?: NotificationType;
  route?: NotificationRoute;
}

export function mapLocaleToDeviceLocale(language: string): DeviceLocale {
  return language.toLowerCase().startsWith('vi') ? 'VI' : 'EN';
}

/**
 * Minimum lead time before a one-shot may be armed.
 * Avoids Capacitor/iOS rejecting "Scheduled time must be *after* current time"
 * when JS builds the Date and native evaluates it a moment later.
 */
export const DAILY_REWARD_REMINDER_MIN_LEAD_MS = 2_000;

/** Today's reminder wall-clock (local), regardless of whether it is still in the future. */
export function getDailyRewardReminderTimeOnDate(day: Date): Date {
  const scheduled = new Date(day);
  scheduled.setHours(DAILY_REWARD_REMINDER_HOUR, DAILY_REWARD_REMINDER_MINUTE, 0, 0);
  scheduled.setSeconds(0, 0);
  return scheduled;
}

export function isBeforeDailyRewardReminderHour(now = new Date()): boolean {
  return now.getTime() < getDailyRewardReminderTimeOnDate(now).getTime();
}

/**
 * Skip today's 07:00 when the user already claimed, or when 07:00 has already
 * passed (missed window — arm from tomorrow).
 */
export function shouldSkipTodayDailyRewardReminder(canClaim: boolean, now = new Date()): boolean {
  return !canClaim || !isBeforeDailyRewardReminderHour(now);
}

/**
 * Next 07:00 local. If `skipToday` (already claimed today) or 07:00 has passed,
 * returns tomorrow 07:00.
 */
export function getNextDailyRewardReminderAt(
  now = new Date(),
  options?: { skipToday?: boolean }
): Date {
  const todayAtSeven = getDailyRewardReminderTimeOnDate(now);
  if (options?.skipToday || todayAtSeven.getTime() <= now.getTime()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getDailyRewardReminderTimeOnDate(tomorrow);
  }
  return todayAtSeven;
}

/**
 * Concrete local fire times for the rolling reminder horizon.
 * Always returns `horizonDays` future mornings when possible (pads past
 * `minLeadMs` drops near 07:00). Falls back to at least tomorrow 07:00.
 */
export function planDailyRewardReminderHorizon(
  now: Date,
  options: { skipToday: boolean; horizonDays?: number; minLeadMs?: number }
): Date[] {
  const horizonDays = options.horizonDays ?? DAILY_REWARD_REMINDER_HORIZON_DAYS;
  const minLeadMs = options.minLeadMs ?? DAILY_REWARD_REMINDER_MIN_LEAD_MS;
  const earliest = now.getTime() + minLeadMs;
  const times: Date[] = [];

  // Walk forward day offsets until we collect a full horizon (today may be
  // filtered when within minLeadMs of 07:00).
  let day = options.skipToday ? 1 : 0;
  const maxDay = day + horizonDays + 2;
  while (times.length < horizonDays && day <= maxDay) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + day);
    const at = getDailyRewardReminderTimeOnDate(dayDate);
    if (at.getTime() > earliest) {
      times.push(at);
    }
    day += 1;
  }

  if (times.length === 0) {
    times.push(getNextDailyRewardReminderAt(now, { skipToday: true }));
  }

  return times;
}

export function dailyRewardReminderNotificationId(dayOffset: number): number {
  return NOTIFICATION_IDS.DAILY_REWARD + dayOffset;
}

export function resolveNotificationRoute(
  type?: NotificationType,
  route?: string
): NotificationRoute {
  if (route === NOTIFICATION_ROUTES.HOME) return NOTIFICATION_ROUTES.HOME;
  if (route === NOTIFICATION_ROUTES.LEADERBOARD) return NOTIFICATION_ROUTES.LEADERBOARD;
  if (route === NOTIFICATION_ROUTES.DAILY_REWARD) return NOTIFICATION_ROUTES.DAILY_REWARD;

  switch (type) {
    case NOTIFICATION_TYPES.TOP_100_EXITED:
    case NOTIFICATION_TYPES.RANK_PUSH:
      return NOTIFICATION_ROUTES.LEADERBOARD;

    default:
      return NOTIFICATION_ROUTES.HOME;
  }
}
