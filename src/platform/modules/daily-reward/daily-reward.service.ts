import {
  hasClaimedToday,
  type ClaimResult,
  createDefaultModel,
  applyStreakGapReset,
  type RewardProgress,
  type DailyRewardModel,
} from './daily-reward.model';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { saveService } from '@platform/modules/save';
import { getLocalDateKey } from '@platform/core/utils';
import { usePlatformStore } from '@platform/core/state';
import { rewardResolver, type RewardResolver, type ResolvedReward } from './reward-resolver';
import { dailyRewardRepository, type DailyRewardRepository } from './daily-reward.repository';

export class DailyRewardService {
  private initialized = false;
  private claimInFlight = false;
  private model: DailyRewardModel = createDefaultModel();

  constructor(
    private readonly repository: DailyRewardRepository = dailyRewardRepository,
    private readonly resolver: RewardResolver = rewardResolver
  ) {}

  async init(): Promise<void> {
    this.model = await this.repository.load();
    this.model = applyStreakGapReset(this.model);
    await this.persist();
    this.initialized = true;
    logger.info('[DailyReward] Initialized', { currentDay: this.model.currentDay });
  }

  canClaim(): boolean {
    if (!this.initialized) return false;
    if (this.claimInFlight) return false;
    if (hasClaimedToday(this.model)) return false;
    return true;
  }

  async claim(): Promise<ClaimResult | null> {
    if (this.claimInFlight) {
      logger.warn('[DailyReward] Claim already in flight');
      return null;
    }
    if (!this.canClaim()) {
      logger.warn('[DailyReward] Claim blocked');
      return null;
    }

    this.claimInFlight = true;
    try {
      if (hasClaimedToday(this.model)) {
        logger.warn('[DailyReward] Claim blocked after lock');
        return null;
      }

      const rewardDay = this.model.currentDay;
      const resolved = this.resolver.resolveClaim(rewardDay);
      this.applyReward(resolved);

      this.model.lastClaimDate = getLocalDateKey();
      this.model.currentDay = rewardDay >= 7 ? 1 : rewardDay + 1;

      await this.persist();

      const result = toClaimResult(resolved);
      eventBus.emit('daily:claim', { day: result.day, streak: rewardDay });
      logger.info('[DailyReward] Claimed', result);
      return result;
    } finally {
      this.claimInFlight = false;
    }
  }

  getRewardProgress(): RewardProgress {
    return {
      currentDay: this.model.currentDay,
      canClaim: this.canClaim(),
      days: this.resolver.buildProgress(this.model.currentDay),
    };
  }

  /** Re-evaluate streak gap when the app returns to foreground. */
  refreshOnResume(): void {
    this.model = applyStreakGapReset(this.model);
    void this.persist();
  }

  private applyReward(reward: ResolvedReward): void {
    usePlatformStore.getState().addCoins(reward.coins);
  }

  private async persist(): Promise<void> {
    // Preferences is the only durable store for daily-reward; do not mirror onto PlatformState.
    await this.repository.save(this.model);
    // Persist currency/other store changes (e.g. coins from claim).
    await saveService.saveLocal();
  }
}

function toClaimResult(reward: ResolvedReward): ClaimResult {
  return {
    day: reward.day,
    coins: reward.coins,
  };
}

export const dailyRewards = new DailyRewardService();
