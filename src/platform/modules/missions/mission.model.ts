import { getLocalDateKey } from '@platform/core/utils';

export type MissionBehaviorType =
  'MERGE' | 'WATCH_AD' | 'PLAY_GAME' | 'REACH_SCORE' | 'DAILY_LOGIN' | 'UPDATE_NAME';

type MissionStatus = 'active' | 'completed' | 'claimed';

export type MissionResetPolicy = 'daily' | 'never' | 'onClaim';

interface MissionReward {
  type: 'coins';
  amount: number;
}

export interface MissionDefinition {
  id: string;
  /** Texture key for the mission row icon. */
  icon?: string;
  target: number;
  /** Scene to open when the player taps "Go". */
  goScene?: string;
  titleKey: string;
  reward: MissionReward;
  resetPolicy?: MissionResetPolicy;
  type: MissionBehaviorType | string;
}

export interface MissionProgress {
  id: string;
  type: string;
  target: number;
  progress: number;
  claimedAt?: number;
  createdAt?: number;
  completedAt?: number;
  status: MissionStatus;
  /** Local calendar day key (`YYYY-MM-DD`) of the last reset. */
  lastResetDayKey?: string | null;
}

export function createMissionProgress(def: MissionDefinition): MissionProgress {
  return {
    id: def.id,
    progress: 0,
    type: def.type,
    createdAt: Date.now(),
    status: 'active',
    target: def.target,
    lastResetDayKey: getLocalDateKey(),
  };
}
