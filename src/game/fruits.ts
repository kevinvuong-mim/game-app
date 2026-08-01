/** Fruit tiers — index 0 is smallest (spawn pool), 9 is watermelon. */
export interface FruitType {
  id: string;
  /** Fallback fill color when the fruit image fails to load. */
  color: number;
  /** Physics / visual radius in world pixels. */
  radius: number;
  /** Points awarded when this fruit is created by a merge (or watermelon spawn). */
  mergeScore: number;
}

export const FRUIT_TYPES: FruitType[] = [
  { id: 'f-1', radius: 18, color: 0x8e24aa, mergeScore: 1 },
  { id: 'f-2', radius: 24, color: 0xe53935, mergeScore: 2 },
  { id: 'f-3', radius: 30, color: 0xff7043, mergeScore: 3 },
  { id: 'f-4', radius: 36, color: 0xffab91, mergeScore: 5 },
  { id: 'f-5', radius: 44, color: 0x9ccc65, mergeScore: 8 },
  { id: 'f-6', radius: 52, color: 0xf44336, mergeScore: 13 },
  { id: 'f-7', radius: 62, color: 0xff9800, mergeScore: 21 },
  { id: 'f-8', radius: 74, color: 0xc62828, mergeScore: 34 },
  { id: 'f-9', radius: 88, color: 0xffc107, mergeScore: 55 },
  { id: 'f-10', radius: 104, color: 0x43a047, mergeScore: 89 },
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
