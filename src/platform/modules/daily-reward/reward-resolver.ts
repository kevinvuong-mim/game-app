import type { RewardDayProgress } from './daily-reward.model';

export interface CycleRewardDefinition {
  day: number;
  coins: number;
}

export interface ResolvedReward {
  day: number;
  coins: number;
}

const REWARD_CYCLE: CycleRewardDefinition[] = [
  { day: 1, coins: 100 },
  { day: 2, coins: 200 },
  { day: 3, coins: 300 },
  { day: 4, coins: 500 },
  { day: 5, coins: 800 },
  { day: 6, coins: 1300 },
  { day: 7, coins: 2100 },
];

export class RewardResolver {
  getRewardForDay(day: number): CycleRewardDefinition {
    const normalized = ((day - 1) % 7) + 1;
    return REWARD_CYCLE.find((entry) => entry.day === normalized) ?? REWARD_CYCLE[0];
  }

  resolveClaim(day: number): ResolvedReward {
    const definition = this.getRewardForDay(day);
    return {
      day: definition.day,
      coins: definition.coins,
    };
  }

  buildProgress(currentDay: number): RewardDayProgress[] {
    return REWARD_CYCLE.map((entry) => {
      let status: RewardDayProgress['status'] = 'locked';

      if (entry.day < currentDay) {
        status = 'claimed';
      } else if (entry.day === currentDay) {
        status = 'current';
      }

      return {
        status,
        day: entry.day,
        coins: entry.coins,
      };
    });
  }
}

export const rewardResolver = new RewardResolver();
