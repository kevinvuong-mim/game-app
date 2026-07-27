import type { RewardDayProgress } from './daily-reward.model';

export interface CycleRewardDefinition {
  day: number;
  coins?: number;
  itemId?: string;
  itemQuantity?: number;
  type: 'coins' | 'random' | 'chest';
}

export interface ResolvedReward {
  day: number;
  coins?: number;
  itemId?: string;
  itemQuantity?: number;
  type: 'coins' | 'chest';
}

const RANDOM_COIN_MIN = 150;
const RANDOM_COIN_MAX = 350;

const REWARD_CYCLE: CycleRewardDefinition[] = [
  { day: 1, type: 'coins', coins: 100 },
  { day: 2, type: 'coins', coins: 200 },
  { day: 3, type: 'coins', coins: 300 },
  { day: 4, type: 'coins', coins: 500 },
  { day: 5, type: 'coins', coins: 800 },
  { day: 6, type: 'coins', coins: 1300 },
  { day: 7, type: 'coins', coins: 2100 },
];

export class RewardResolver {
  getCycle(): readonly CycleRewardDefinition[] {
    return REWARD_CYCLE;
  }

  getRewardForDay(day: number): CycleRewardDefinition {
    const normalized = ((day - 1) % 7) + 1;
    return REWARD_CYCLE.find((entry) => entry.day === normalized) ?? REWARD_CYCLE[0];
  }

  resolveClaim(day: number, rng: () => number = Math.random): ResolvedReward {
    const definition = this.getRewardForDay(day);

    if (definition.type === 'random') {
      const range = RANDOM_COIN_MAX - RANDOM_COIN_MIN + 1;
      const coins = RANDOM_COIN_MIN + Math.floor(rng() * range);
      return { day: definition.day, type: 'coins', coins };
    }

    if (definition.type === 'chest') {
      return {
        type: 'chest',
        day: definition.day,
        coins: definition.coins,
        itemId: definition.itemId,
        itemQuantity: definition.itemQuantity ?? 1,
      };
    }

    return {
      type: 'coins',
      day: definition.day,
      coins: definition.coins ?? 0,
    };
  }

  getPreviewLabel(day: number): {
    label: string;
    type: 'coins' | 'random' | 'chest';
    coins?: number;
  } {
    const definition = this.getRewardForDay(day);

    if (definition.type === 'random') {
      return { label: 'random', type: 'random' };
    }

    if (definition.type === 'chest') {
      return {
        label: 'chest',
        type: 'chest',
        coins: definition.coins,
      };
    }

    return {
      type: 'coins',
      coins: definition.coins,
      label: String(definition.coins ?? 0),
    };
  }

  buildProgress(currentDay: number): RewardDayProgress[] {
    return REWARD_CYCLE.map((entry) => {
      const preview = this.getPreviewLabel(entry.day);
      let status: RewardDayProgress['status'] = 'locked';

      if (entry.day < currentDay) {
        status = 'claimed';
      } else if (entry.day === currentDay) {
        status = 'current';
      }

      return {
        status,
        day: entry.day,
        coins: preview.coins,
        rewardType: preview.type,
        rewardLabel: preview.label,
      };
    });
  }
}

export const rewardResolver = new RewardResolver();
