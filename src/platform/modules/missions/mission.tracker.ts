import type { IEventBus } from '@platform/core/events';
import type { MissionBehaviorType } from './mission.model';

export type MissionProgressHandler = (
  type: MissionBehaviorType,
  amount: number,
  mode?: 'increment' | 'set'
) => void;

/**
 * Subscribes to platform events and forwards progress to the mission service.
 * Add new mission types here by binding the relevant event.
 */
export class MissionTracker {
  bind(events: IEventBus, onProgress: MissionProgressHandler): () => void {
    const unsubs = [
      events.on('ad:reward', () => {
        onProgress('WATCH_AD', 1);
      }),

      events.on('game:start', () => {
        onProgress('PLAY_GAME', 1);
      }),

      events.on('score:update', ({ score }) => {
        onProgress('REACH_SCORE', score, 'set');
      }),

      events.on('merge', ({ count }) => {
        onProgress('MERGE', count ?? 1);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }
}

export const missionTracker = new MissionTracker();
