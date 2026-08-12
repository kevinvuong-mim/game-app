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
  /** Last map the player viewed on the map screen (1-based). */
  lastMapId: number;
  /** Best stars per map. Key is map id as string; value is stars[levelIndex] (0–3). */
  campaignStars: Record<string, number[]>;
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
  progress: {
    highScore: 0,
    currentLevel: 1,
    lastMapId: 1,
    campaignStars: {},
    totalGamesPlayed: 0,
    unlockedFeatures: [],
    hasRatedApp: false,
    lastRatePromptGamesPlayed: 0,
  },
  currency: { coins: 0 },
  inventory: { items: {} },
  user: {
    id: '',
    displayName: 'Player',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  },
  settings: {
    language: 'en',
    soundEnabled: true,
    musicEnabled: true,
  },
};
