import {
  hasClaimedToday,
  type ClaimResult,
  createDefaultModel,
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
    const storeState = usePlatformStore.getState().dailyRewards;
    const migratedFromStore = this.repository.migrateFromStoreState(storeState);
    const fromRepository = await this.repository.load();
    const hasPrefs = await this.repository.hasPersistedModel();

    // Preferences is the durable source of truth; game-save is a fallback when Preferences is empty.
    this.model = hasPrefs ? fromRepository : (migratedFromStore ?? fromRepository);

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
    await this.repository.save(this.model);
    usePlatformStore.getState().setDailyRewardState(this.repository.toStoreState(this.model));
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
