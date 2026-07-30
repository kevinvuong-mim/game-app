/** Fruit tiers — index 0 is smallest (spawn pool), 9 is watermelon. */
export interface FruitType {
  id: string;
  /** Physics / visual radius in world pixels. */
  radius: number;
  /** Fallback fill color when the fruit image fails to load. */
  color: number;
  /** Points awarded when this fruit is created by a merge (or watermelon spawn). */
  mergeScore: number;
}

export const FRUIT_TYPES: FruitType[] = [
  { id: 'grapes', radius: 18, color: 0x8e24aa, mergeScore: 1 },
  { id: 'cherry', radius: 24, color: 0xe53935, mergeScore: 2 },
  { id: 'strawberry', radius: 30, color: 0xff7043, mergeScore: 3 },
  { id: 'peach', radius: 36, color: 0xffab91, mergeScore: 5 },
  { id: 'kiwi', radius: 44, color: 0x9ccc65, mergeScore: 8 },
  { id: 'tomato', radius: 52, color: 0xf44336, mergeScore: 13 },
  { id: 'orange', radius: 62, color: 0xff9800, mergeScore: 21 },
  { id: 'apple', radius: 74, color: 0xc62828, mergeScore: 34 },
  { id: 'pineapple', radius: 88, color: 0xffc107, mergeScore: 55 },
  { id: 'watermelon', radius: 104, color: 0x43a047, mergeScore: 89 },
];

/** Only the smallest fruits can appear as the next drop. */
export const SPAWN_MAX_LEVEL = 4;

/** Texture key for fruit level 0..9 → fruit-1 .. fruit-10. */
export function fruitTextureKey(level: number): string {
  return `fruit-${level + 1}`;
}

export function fruitImagePath(level: number): string {
  return `/assets/images/fruit-${level + 1}.png`;
}

export function randomSpawnLevel(): number {
  return Math.floor(Math.random() * (SPAWN_MAX_LEVEL + 1));
}
