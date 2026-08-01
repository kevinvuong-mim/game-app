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
import { ClockIntegritySession, getLocalDateKey } from '@platform/core/utils';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';
import { rewardResolver, type RewardResolver, type ResolvedReward } from './reward-resolver';
import { dailyRewardRepository, type DailyRewardRepository } from './daily-reward.repository';

export class DailyRewardService {
  private initialized = false;
  private claimInFlight = false;
  private model: DailyRewardModel = createDefaultModel();
  private readonly clockSession = new ClockIntegritySession();

  constructor(
    private readonly repository: DailyRewardRepository = dailyRewardRepository,
    private readonly resolver: RewardResolver = rewardResolver
  ) {}

  async init(): Promise<void> {
    this.model = await this.repository.load();
    this.model = applyStreakGapReset(this.model);

    if (this.detectClockSkew()) {
      // Sticky lock — never auto-clear once set (avoids "fix clock then claim").
      this.model.timeManipulated = true;
    } else if (!this.model.timeManipulated) {
      this.model.lastSessionTimestamp = Date.now();
    }

    await this.persist();
    this.initialized = true;
    logger.info('[DailyReward] Initialized', { currentDay: this.model.currentDay });
  }

  canClaim(): boolean {
    if (!this.initialized) return false;
    if (this.claimInFlight) return false;
    if (this.model.timeManipulated) return false;
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
      if (this.model.timeManipulated || hasClaimedToday(this.model)) {
        logger.warn('[DailyReward] Claim blocked after lock');
        return null;
      }

      const rewardDay = this.model.currentDay;
      const resolved = this.resolver.resolveClaim(rewardDay);
      this.applyReward(resolved);

      const wallNow = Date.now();
      this.model.lastClaimDate = getLocalDateKey();
      this.model.lastClaimWallClock = wallNow;
      this.model.lastSessionTimestamp = wallNow;
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
      timeManipulated: this.model.timeManipulated,
      days: this.resolver.buildProgress(this.model.currentDay),
    };
  }

  refreshSessionTimestamp(): void {
    this.model = applyStreakGapReset(this.model);

    if (this.detectClockSkew()) {
      this.model.timeManipulated = true;
    } else if (!this.model.timeManipulated) {
      this.model.lastSessionTimestamp = Date.now();
    }
    void this.persist();
  }

  private detectClockSkew(wallNow = Date.now()): boolean {
    return this.clockSession.check({
      now: wallNow,
      lastSessionTimestamp: this.model.lastSessionTimestamp,
      lastClaimWallClock: this.model.lastClaimWallClock,
    });
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
