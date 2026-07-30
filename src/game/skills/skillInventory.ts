import { consumeBoost, getBoostQuantity } from '@platform/ui/shop/boostInventory';

export const SKILL_IDS = [
  'boost_hammer',
  'boost_change',
  'boost_swap',
  'boost_size',
  'boost_undo',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export function getSkillQuantity(id: SkillId): number {
  return getBoostQuantity(id);
}

export function consumeSkill(id: SkillId): boolean {
  return consumeBoost(id);
}
