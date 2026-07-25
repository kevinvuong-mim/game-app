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
  totalGamesPlayed: number;
  unlockedFeatures: string[];
}

export interface SettingsState {
  language: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
}

type MissionStatus = 'active' | 'claimed' | 'completed';

export interface MissionProgress {
  id: string;
  type: string;
  target: number;
  progress: number;
  claimedAt?: number;
  createdAt?: number;
  completedAt?: number;
  status: MissionStatus;
  lastResetDayKey?: string | null;
}

interface MissionsState {
  missions: Record<string, MissionProgress>;
}

export interface DailyRewardState {
  version: number;
  currentDay: number;
  timeManipulated: boolean;
  lastClaimWallClock: number;
  lastClaimDate: string | null;
  lastSessionTimestamp: number;
}

export interface PlatformState {
  user: UserState;
  currency: CurrencyState;
  progress: ProgressState;
  missions: MissionsState;
  settings: SettingsState;
  inventory: InventoryState;
  dailyRewards: DailyRewardState;
}

export const DEFAULT_STATE: PlatformState = {
  missions: {
    missions: {},
  },
  progress: {
    highScore: 0,
    currentLevel: 1,
    totalGamesPlayed: 0,
    unlockedFeatures: [],
  },
  currency: { coins: 0 },
  inventory: { items: {} },
  user: {
    id: '',
    displayName: 'Player',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  },
  dailyRewards: {
    version: 2,
    currentDay: 1,
    lastClaimDate: null,
    lastClaimWallClock: 0,
    timeManipulated: false,
    lastSessionTimestamp: 0,
  },
  settings: {
    language: 'en',
    soundEnabled: true,
    musicEnabled: true,
  },
};
