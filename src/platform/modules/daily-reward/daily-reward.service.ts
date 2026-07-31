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
import { getLocalDateKey } from '@platform/core/utils';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';
import { rewardResolver, type RewardResolver, type ResolvedReward } from './reward-resolver';
import { dailyRewardRepository, type DailyRewardRepository } from './daily-reward.repository';

const BACKWARD_CLOCK_TOLERANCE_MS = 60_000;

export class DailyRewardService {
  private initialized = false;
  private model: DailyRewardModel = createDefaultModel();

  constructor(
    private readonly repository: DailyRewardRepository = dailyRewardRepository,
    private readonly resolver: RewardResolver = rewardResolver
  ) {}

  async init(): Promise<void> {
    const hasPrefs = await this.repository.hasPersistedModel();
    if (hasPrefs) {
      this.model = await this.repository.load();
    } else {
      // One-time migration from legacy game-save snapshot, then Preferences is sole durable store.
      const migrated = this.repository.migrateFromStoreState(
        usePlatformStore.getState().dailyRewards
      );
      this.model = migrated ?? (await this.repository.load());
    }

    this.model = applyStreakGapReset(this.model);

    if (this.detectTimeManipulation()) {
      this.model.timeManipulated = true;
    } else {
      this.model.timeManipulated = false;
      this.model.lastSessionTimestamp = Date.now();
    }

    await this.persist();
    this.initialized = true;
    logger.info('[DailyReward] Initialized', { currentDay: this.model.currentDay });
  }

  canClaim(): boolean {
    if (!this.initialized) return false;
    if (this.model.timeManipulated) return false;
    if (hasClaimedToday(this.model)) return false;
    return true;
  }

  async claim(): Promise<ClaimResult | null> {
    if (!this.canClaim()) {
      logger.warn('[DailyReward] Claim blocked');
      return null;
    }

    const rewardDay = this.model.currentDay;
    const resolved = this.resolver.resolveClaim(rewardDay);
    this.applyReward(resolved);

    const now = Date.now();
    this.model.lastClaimDate = getLocalDateKey();
    this.model.lastClaimWallClock = now;
    this.model.lastSessionTimestamp = now;
    this.model.currentDay = rewardDay >= 7 ? 1 : rewardDay + 1;

    await this.persist();

    const result = toClaimResult(resolved);
    eventBus.emit('daily:claim', { day: result.day, streak: rewardDay });
    logger.info('[DailyReward] Claimed', result);
    return result;
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

    if (this.detectTimeManipulation()) {
      this.model.timeManipulated = true;
    } else {
      // Clock is consistent again — clear a previous lock so claims can resume.
      this.model.timeManipulated = false;
      this.model.lastSessionTimestamp = Date.now();
    }
    void this.persist();
  }

  private detectTimeManipulation(now = Date.now()): boolean {
    const { lastSessionTimestamp, lastClaimWallClock } = this.model;

    if (lastSessionTimestamp > 0 && now < lastSessionTimestamp - BACKWARD_CLOCK_TOLERANCE_MS) {
      return true;
    }

    if (lastClaimWallClock > 0 && now < lastClaimWallClock - BACKWARD_CLOCK_TOLERANCE_MS) {
      return true;
    }

    if (lastClaimWallClock > now + BACKWARD_CLOCK_TOLERANCE_MS) {
      return true;
    }

    return false;
  }

  private applyReward(reward: ResolvedReward): void {
    usePlatformStore.getState().addCoins(reward.coins);
  }

  private async persist(): Promise<void> {
    // Preferences is the only durable store for daily-reward; game-save no longer mirrors it.
    await this.repository.save(this.model);
    usePlatformStore.getState().setDailyRewardState(this.repository.toStoreState(this.model));
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
