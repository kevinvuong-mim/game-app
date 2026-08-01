import {
  createDefaultModel,
  type DailyRewardModel,
  DAILY_REWARD_STORAGE_KEY,
  DAILY_REWARD_MODEL_VERSION,
  DAILY_REWARD_LEGACY_PREFERENCES_KEY,
} from './daily-reward.model';
import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';
import { Preferences } from '@capacitor/preferences';

/** Legacy shape formerly mirrored onto PlatformState / game-save. */
export interface LegacyDailyRewardSnapshot {
  version: number;
  currentDay: number;
  timeManipulated: boolean;
  lastClaimWallClock: number;
  lastClaimDate: string | null;
  lastSessionTimestamp: number;
}

export class DailyRewardRepository {
  private durableProvider() {
    return storage.getDurableProviderType();
  }

  async hasPersistedModel(): Promise<boolean> {
    const stored = await storage.load<DailyRewardModel>(
      DAILY_REWARD_STORAGE_KEY,
      this.durableProvider()
    );
    if (stored) return true;

    const legacy = await this.readLegacyPreferencesModel();
    return legacy !== null;
  }

  async load(): Promise<DailyRewardModel> {
    const durable = this.durableProvider();
    const stored = await storage.load<DailyRewardModel>(DAILY_REWARD_STORAGE_KEY, durable);
    if (stored && typeof stored.currentDay === 'number') {
      return this.normalize(stored);
    }

    const fromLegacyPrefs = await this.readLegacyPreferencesModel();
    if (fromLegacyPrefs) {
      await storage.save(DAILY_REWARD_STORAGE_KEY, fromLegacyPrefs, durable);
      await Preferences.remove({ key: DAILY_REWARD_LEGACY_PREFERENCES_KEY });
      logger.info('[DailyReward] Migrated from legacy Preferences key');
      return fromLegacyPrefs;
    }

    const fromGameSave = await this.readLegacyGameSaveSnapshot();
    if (fromGameSave) {
      await storage.save(DAILY_REWARD_STORAGE_KEY, fromGameSave, durable);
      logger.info('[DailyReward] Migrated from legacy game-save snapshot');
      return fromGameSave;
    }

    return createDefaultModel();
  }

  async save(model: DailyRewardModel): Promise<void> {
    await storage.save(DAILY_REWARD_STORAGE_KEY, model, this.durableProvider());
  }

  migrateFromStoreState(state: LegacyDailyRewardSnapshot | undefined): DailyRewardModel | null {
    if (!state || state.version < DAILY_REWARD_MODEL_VERSION) return null;

    return this.normalize({
      version: state.version,
      lastClaimDate: state.lastClaimDate,
      currentDay: state.currentDay,
      timeManipulated: state.timeManipulated ?? false,
      lastClaimWallClock: state.lastClaimWallClock ?? 0,
      lastSessionTimestamp: state.lastSessionTimestamp ?? 0,
    });
  }

  private async readLegacyPreferencesModel(): Promise<DailyRewardModel | null> {
    const { value } = await Preferences.get({ key: DAILY_REWARD_LEGACY_PREFERENCES_KEY });
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as DailyRewardModel;
      if (!parsed || typeof parsed.currentDay !== 'number') return null;
      return this.normalize(parsed);
    } catch {
      return null;
    }
  }

  private async readLegacyGameSaveSnapshot(): Promise<DailyRewardModel | null> {
    const save = await storage.load<{ state?: { dailyRewards?: LegacyDailyRewardSnapshot } }>(
      'game-save',
      this.durableProvider()
    );
    return this.migrateFromStoreState(save?.state?.dailyRewards);
  }

  private normalize(model: DailyRewardModel): DailyRewardModel {
    return {
      ...createDefaultModel(),
      ...model,
      currentDay: clampDay(model.currentDay),
    };
  }
}

function clampDay(day: number): number {
  if (!Number.isFinite(day) || day < 1) return 1;
  if (day > 7) return ((day - 1) % 7) + 1;
  return Math.floor(day);
}

export const dailyRewardRepository = new DailyRewardRepository();
