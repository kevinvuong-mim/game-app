import { dailyRewards } from '@platform/modules/daily-reward';

/** Whether today's daily reward is still claimable — game layer reads via @platform/ui. */
export function canClaimDailyReward(): boolean {
  return dailyRewards.canClaim();
}
