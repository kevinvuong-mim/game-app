import {
  type MissionProgress,
  createMissionProgress,
  type MissionDefinition,
  type MissionResetPolicy,
} from './mission.model';
import missionsData from './missions.json';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getLocalDateKey } from '@platform/core/utils';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';

export class MissionService {
  private definitions: MissionDefinition[] = missionsData as MissionDefinition[];

  init(): void {
    this.initializeMissions();
    let changed = this.applyResets();
    if (this.syncReachScoreFromHighScore()) changed = true;
    if (this.recordDailyLogin()) changed = true;
    if (changed) {
      void saveService.saveLocal();
    }
  }

  getMissions(): MissionProgress[] {
    const { missions } = usePlatformStore.getState().missions;
    return this.definitions
      .map((def) => missions[def.id])
      .filter((mission): mission is MissionProgress => !!mission);
  }

  getDefinition(id: string): MissionDefinition | undefined {
    return this.definitions.find((d) => d.id === id);
  }

  getDefinitionsByType(type: string): MissionDefinition[] {
    return this.definitions.filter((d) => d.type === type);
  }

  /** Returns true when any mission was reset or stamped. */
  applyResets(at?: number): boolean {
    const currentDayKey = getLocalDateKey(at);
    const missions = { ...usePlatformStore.getState().missions.missions };
    let changed = false;

    for (const def of this.definitions) {
      const policy = def.resetPolicy ?? 'never';
      if (policy === 'never') continue;

      const mission = missions[def.id];
      if (!mission) continue;

      const result = this.applyResetPolicy(policy, mission, currentDayKey);
      if (result.changed) {
        missions[def.id] = result.mission;
        changed = true;
        eventBus.emit('mission:update', { missionId: def.id, progress: result.mission.progress });
      }
    }

    if (changed) {
      usePlatformStore.getState().setMissions(missions);
      logger.info('mission_reset', { dayKey: currentDayKey });
    }

    return changed;
  }

  /** Marks daily-login missions complete for the current calendar day (opening the app). */
  recordDailyLogin(): boolean {
    return this.setProgressByType('DAILY_LOGIN', 1);
  }

  /** Seeds REACH_SCORE missions from the player's saved high score. */
  syncReachScoreFromHighScore(): boolean {
    const highScore = usePlatformStore.getState().progress.highScore;
    return this.setProgressByType('REACH_SCORE', highScore);
  }

  incrementProgressByType(type: string, amount: number): boolean {
    let updated = false;

    for (const def of this.getDefinitionsByType(type)) {
      if (this.incrementProgress(def.id, amount)) {
        updated = true;
      }
    }

    return updated;
  }

  /** Sets progress to `value` when higher than the current progress (absolute goals). */
  setProgressByType(type: string, value: number): boolean {
    let updated = false;

    for (const def of this.getDefinitionsByType(type)) {
      if (this.setProgress(def.id, value)) {
        updated = true;
      }
    }

    return updated;
  }

  claimMission(id: string): boolean {
    const store = usePlatformStore.getState();
    const mission = store.missions.missions[id];
    if (!mission || mission.status !== 'completed') return false;

    const def = this.getDefinition(id);
    if (def?.reward.type === 'coins') {
      store.addCoins(def.reward.amount);
    }

    store.claimMission(id);

    if ((def?.resetPolicy ?? 'never') === 'onClaim') {
      const { missions: all, setMissions } = usePlatformStore.getState();
      const current = all.missions[id];
      if (current) {
        setMissions({
          ...all.missions,
          [id]: {
            ...current,
            progress: 0,
            status: 'active',
            completedAt: undefined,
            claimedAt: undefined,
          },
        });
        eventBus.emit('mission:update', { missionId: id, progress: 0 });
      }
    }

    logger.info('mission_claimed', { missionId: id });
    return true;
  }

  private initializeMissions(): void {
    const existing = usePlatformStore.getState().missions.missions;
    const missions: Record<string, MissionProgress> = {};

    for (const def of this.definitions) {
      const saved = existing[def.id];
      if (saved) {
        missions[def.id] = {
          ...saved,
          type: def.type,
          target: def.target,
        };
      } else {
        missions[def.id] = createMissionProgress(def);
      }
    }

    usePlatformStore.getState().setMissions(missions);
  }

  private applyResetPolicy(
    policy: MissionResetPolicy,
    mission: MissionProgress,
    currentDayKey: string
  ): { changed: boolean; mission: MissionProgress } {
    switch (policy) {
      case 'daily':
        return this.applyDailyReset(mission, currentDayKey);
      default:
        return { changed: false, mission };
    }
  }

  private applyDailyReset(
    mission: MissionProgress,
    currentDayKey: string
  ): { changed: boolean; mission: MissionProgress } {
    if (!mission.lastResetDayKey) {
      return {
        changed: true,
        mission: { ...mission, lastResetDayKey: currentDayKey },
      };
    }

    if (mission.lastResetDayKey === currentDayKey) {
      return { changed: false, mission };
    }

    return {
      changed: true,
      mission: {
        ...mission,
        progress: 0,
        status: 'active',
        completedAt: undefined,
        claimedAt: undefined,
        lastResetDayKey: currentDayKey,
      },
    };
  }

  private incrementProgress(missionId: string, amount: number): boolean {
    const mission = usePlatformStore.getState().missions.missions[missionId];
    if (!mission || mission.status !== 'active') return false;

    usePlatformStore.getState().updateMissionProgress(missionId, mission.progress + amount);
    this.checkCompletion(missionId);
    return true;
  }

  private setProgress(missionId: string, value: number): boolean {
    const mission = usePlatformStore.getState().missions.missions[missionId];
    if (!mission || mission.status !== 'active') return false;
    if (value <= mission.progress) return false;

    usePlatformStore.getState().updateMissionProgress(missionId, value);
    this.checkCompletion(missionId);
    return true;
  }

  private checkCompletion(missionId: string): void {
    const mission = usePlatformStore.getState().missions.missions[missionId];
    if (!mission) return;

    if (mission.progress >= mission.target && mission.status === 'active') {
      usePlatformStore.getState().completeMission(missionId);
      eventBus.emit('mission:complete', { missionId });
      logger.info('mission_completed', { missionId });
    }

    const updated = usePlatformStore.getState().missions.missions[missionId];
    if (updated) {
      eventBus.emit('mission:update', { missionId, progress: updated.progress });
      logger.info('mission_progress_updated', { missionId, progress: updated.progress });
    }
  }
}

export const missions = new MissionService();
