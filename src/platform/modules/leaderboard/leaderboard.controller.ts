import type { IEventBus } from '@platform/core/events';
import { leaderboard, type LeaderboardService } from './leaderboard.service';

/**
 * Connects the leaderboard service to the event bus so the UI stays decoupled
 * from data fetching:
 *
 * - `leaderboard:refresh` → stale-while-revalidate (cache first, then network).
 */
class LeaderboardController {
  constructor(private readonly service: LeaderboardService = leaderboard) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('leaderboard:refresh', (payload) => {
        void this.service.refreshLeaderboard(payload?.page).catch(() => undefined);
      }),

      events.on('app:resume', () => {
        // Soft refresh — show cache immediately; skip network when offline.
        void this.service.fetchLeaderboard({ force: false }).catch(() => undefined);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }
}

export const leaderboardController = new LeaderboardController();
