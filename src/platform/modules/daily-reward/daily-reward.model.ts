import { getLocalDateKey } from '@platform/core/utils';

export const DAILY_REWARD_MODEL_VERSION = 2;
/** Durable StorageService key (becomes `gsk:daily-reward` on preferences/localStorage providers). */
export const DAILY_REWARD_STORAGE_KEY = 'daily-reward';
/** Pre-StorageService Capacitor Preferences key (no `gsk:` prefix). */
export const DAILY_REWARD_LEGACY_PREFERENCES_KEY = 'daily-reward-v2';

export interface DailyRewardModel {
  version: number;
  /** Next reward day in the 7-day cycle (1–7). */
  currentDay: number;
  /** Local calendar date of the last claim (`YYYY-MM-DD`). */
  lastClaimDate: string | null;
}

type RewardDayStatus = 'locked' | 'claimed' | 'current';

export interface RewardDayProgress {
  day: number;
  coins: number;
  status: RewardDayStatus;
}

export interface RewardProgress {
  canClaim: boolean;
  currentDay: number;
  days: RewardDayProgress[];
}

export interface ClaimResult {
  day: number;
  coins: number;
}

export function createDefaultModel(): DailyRewardModel {
  return {
    currentDay: 1,
    lastClaimDate: null,
    version: DAILY_REWARD_MODEL_VERSION,
  };
}

export function hasClaimedToday(model: DailyRewardModel, at: number = Date.now()): boolean {
  if (!model.lastClaimDate) return false;
  return model.lastClaimDate === getLocalDateKey(at);
}

/** Local calendar key for the day before `at`. */
export function getYesterdayLocalDateKey(at: number = Date.now()): string {
  const date = new Date(at);
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date.getTime());
}

/**
 * If the player skipped one or more calendar days since the last claim,
 * restart the 7-day cycle at day 1.
 */
export function applyStreakGapReset(
  model: DailyRewardModel,
  at: number = Date.now()
): DailyRewardModel {
  if (!model.lastClaimDate) return model;
  if (hasClaimedToday(model, at)) return model;
  if (model.lastClaimDate === getYesterdayLocalDateKey(at)) return model;
  if (model.currentDay === 1) return model;
  return { ...model, currentDay: 1 };
}
