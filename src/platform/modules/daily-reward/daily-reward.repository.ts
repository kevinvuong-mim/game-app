import {
  createDefaultModel,
  type DailyRewardModel,
  DAILY_REWARD_STORAGE_KEY,
  DAILY_REWARD_MODEL_VERSION,
} from './daily-reward.model';
import { Preferences } from '@capacitor/preferences';
import type { DailyRewardState } from '@platform/core/state';

export class DailyRewardRepository {
  async hasPersistedModel(): Promise<boolean> {
    const { value } = await Preferences.get({ key: DAILY_REWARD_STORAGE_KEY });
    return value !== null && value !== undefined;
  }

  async load(): Promise<DailyRewardModel> {
    const stored = await this.readModel(DAILY_REWARD_STORAGE_KEY);
    return stored ?? createDefaultModel();
  }

  async save(model: DailyRewardModel): Promise<void> {
    await Preferences.set({
      key: DAILY_REWARD_STORAGE_KEY,
      value: JSON.stringify(model),
    });
  }

  migrateFromStoreState(state: DailyRewardState | undefined): DailyRewardModel | null {
    if (!state || state.version < DAILY_REWARD_MODEL_VERSION) return null;

    return {
      version: state.version,
      lastClaimDate: state.lastClaimDate,
      currentDay: clampDay(state.currentDay),
      timeManipulated: state.timeManipulated ?? false,
      lastClaimWallClock: state.lastClaimWallClock ?? 0,
      lastSessionTimestamp: state.lastSessionTimestamp ?? 0,
    };
  }

  toStoreState(model: DailyRewardModel): DailyRewardState {
    return {
      version: model.version,
      currentDay: model.currentDay,
      lastClaimDate: model.lastClaimDate,
      timeManipulated: model.timeManipulated,
      lastClaimWallClock: model.lastClaimWallClock,
      lastSessionTimestamp: model.lastSessionTimestamp,
    };
  }

  private async readModel(key: string): Promise<DailyRewardModel | null> {
    const { value } = await Preferences.get({ key });
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as DailyRewardModel;
      if (!parsed || typeof parsed.currentDay !== 'number') return null;
      return {
        ...createDefaultModel(),
        ...parsed,
        currentDay: clampDay(parsed.currentDay),
      };
    } catch {
      return null;
    }
  }
}

function clampDay(day: number): number {
  if (!Number.isFinite(day) || day < 1) return 1;
  if (day > 7) return ((day - 1) % 7) + 1;
  return Math.floor(day);
}

export const dailyRewardRepository = new DailyRewardRepository();
