import {
  type MissionProgress,
  createMissionProgress,
  type MissionDefinition,
  type MissionResetPolicy,
} from './mission.model';
import missionsData from './missions.json';
import { logger } from '@platform/core/error';
import { guest } from '@platform/modules/guest';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { saveService } from '@platform/modules/save';
import { getLocalDateKey } from '@platform/core/utils';
import { usePlatformStore } from '@platform/core/state';

export class MissionService {
  private definitions: MissionDefinition[] = missionsData as MissionDefinition[];

  init(): void {
    this.initializeMissions();
    let changed = this.applyResets();
    if (this.recordDailyLogin()) changed = true;
    if (changed) {
      void saveService.saveLocal();
    }
  }

  getMissions(options?: { retainClaimedIds?: ReadonlySet<string> }): MissionProgress[] {
    const { missions } = usePlatformStore.getState().missions;
    return this.definitions
      .map((def) => missions[def.id])
      .filter((mission): mission is MissionProgress => !!mission)
      .filter((mission) => this.isMissionVisible(mission, options?.retainClaimedIds));
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

    const claimedAt = Date.now();
    let nextMission: MissionProgress = {
      ...mission,
      status: 'claimed',
      claimedAt,
    };

    if ((def?.resetPolicy ?? 'never') === 'onClaim') {
      nextMission = {
        ...nextMission,
        progress: 0,
        status: 'active',
        completedAt: undefined,
        claimedAt: undefined,
      };
    }

    store.setMissions({
      ...store.missions.missions,
      [id]: nextMission,
    });

    if (nextMission.status === 'active') {
      eventBus.emit('mission:update', { missionId: id, progress: 0 });
    }

    logger.info('mission_claimed', { missionId: id });
    return true;
  }

  /**
   * UPDATE_NAME is one-shot: hide after claim (unless retained for the current
   * panel session so the player can see "Claimed"), and hide when the player
   * already has a custom name (unless awaiting claim after just renaming).
   */
  private isMissionVisible(
    mission: MissionProgress,
    retainClaimedIds?: ReadonlySet<string>
  ): boolean {
    const def = this.getDefinition(mission.id);
    if (def?.type === 'WATCH_AD' && !getConfig().adsEnabled) return false;
    if (def?.type !== 'UPDATE_NAME') return true;
    if (mission.status === 'claimed') {
      return retainClaimedIds?.has(mission.id) ?? false;
    }
    if (mission.status === 'completed') return true;
    return !guest.getName();
  }

  private initializeMissions(): void {
    const existing = usePlatformStore.getState().missions.missions;
    const missions: Record<string, MissionProgress> = {};

    for (const def of this.definitions) {
      const saved = existing[def.id];
      if (saved) {
        const targetChanged = saved.target !== def.target;
        missions[def.id] = {
          ...saved,
          type: def.type,
          target: def.target,
          progress:
            def.type === 'EARN_STARS' && saved.status === 'active' && targetChanged
              ? 0
              : Math.min(saved.progress, def.target),
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

    this.writeMissionProgress(missionId, mission.progress + amount);
    this.checkCompletion(missionId);
    return true;
  }

  private setProgress(missionId: string, value: number): boolean {
    const mission = usePlatformStore.getState().missions.missions[missionId];
    if (!mission || mission.status !== 'active') return false;
    if (value <= mission.progress) return false;

    this.writeMissionProgress(missionId, value);
    this.checkCompletion(missionId);
    return true;
  }

  private writeMissionProgress(missionId: string, progress: number): void {
    const store = usePlatformStore.getState();
    const mission = store.missions.missions[missionId];
    if (!mission || mission.status !== 'active') return;

    store.setMissions({
      ...store.missions.missions,
      [missionId]: {
        ...mission,
        progress: Math.min(progress, mission.target),
      },
    });
  }

  private checkCompletion(missionId: string): void {
    const store = usePlatformStore.getState();
    const mission = store.missions.missions[missionId];
    if (!mission) return;

    if (mission.progress >= mission.target && mission.status === 'active') {
      store.setMissions({
        ...store.missions.missions,
        [missionId]: {
          ...mission,
          progress: mission.target,
          status: 'completed',
          completedAt: Date.now(),
        },
      });
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
