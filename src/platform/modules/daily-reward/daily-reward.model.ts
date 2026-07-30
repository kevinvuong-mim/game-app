import { getLocalDateKey } from '@platform/core/utils';

export const DAILY_REWARD_MODEL_VERSION = 2;
export const DAILY_REWARD_STORAGE_KEY = 'daily-reward-v2';

export interface DailyRewardModel {
  version: number;
  /** Next reward day in the 7-day cycle (1–7). */
  currentDay: number;
  /** Set when clock manipulation is detected; blocks further claims. */
  timeManipulated: boolean;
  /** `Date.now()` at the moment of the last successful claim. */
  lastClaimWallClock: number;
  /** Local calendar date of the last claim (`YYYY-MM-DD`). */
  lastClaimDate: string | null;
  /** `Date.now()` from the previous app session. */
  lastSessionTimestamp: number;
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
  timeManipulated: boolean;
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
    lastClaimWallClock: 0,
    timeManipulated: false,
    lastSessionTimestamp: 0,
    version: DAILY_REWARD_MODEL_VERSION,
  };
}

export function hasClaimedToday(model: DailyRewardModel, at: number = Date.now()): boolean {
  if (!model.lastClaimDate) return false;
  return model.lastClaimDate === getLocalDateKey(at);
}
