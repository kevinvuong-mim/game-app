import type { MissionProgress } from '@platform/modules/missions/mission.model';

interface UserState {
  id: string;
  createdAt: number;
  avatarUrl?: string;
  displayName: string;
  lastLoginAt: number;
}

interface CurrencyState {
  coins: number;
}

interface InventoryItem {
  id: string;
  quantity: number;
}

interface InventoryState {
  items: Record<string, InventoryItem>;
}

interface ProgressState {
  highScore: number;
  currentLevel: number;
  /** User already submitted an in-app rating (stop further prompts). */
  hasRatedApp: boolean;
  /** Last star rating submitted in-app (1–5), if any. */
  lastAppRating?: number;
  totalGamesPlayed: number;
  unlockedFeatures: string[];
  /** Last `totalGamesPlayed` value when the rate modal was shown or deferred. */
  lastRatePromptGamesPlayed: number;
}

export interface SettingsState {
  language: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
}

export type { MissionProgress };

interface MissionsState {
  missions: Record<string, MissionProgress>;
}

export interface PlatformState {
  user: UserState;
  currency: CurrencyState;
  progress: ProgressState;
  missions: MissionsState;
  settings: SettingsState;
  inventory: InventoryState;
}

export const DEFAULT_STATE: PlatformState = {
  missions: {
    missions: {},
  },
  settings: {
    language: 'en',
    soundEnabled: true,
    musicEnabled: true,
  },
  currency: { coins: 0 },
  inventory: { items: {} },
  user: {
    id: '',
    displayName: 'Player',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  },
  progress: {
    highScore: 0,
    currentLevel: 1,
    hasRatedApp: false,
    totalGamesPlayed: 0,
    unlockedFeatures: [],
    lastRatePromptGamesPlayed: 0,
  },
};
