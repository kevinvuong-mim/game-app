import { shop } from '@platform/ui';

export const SKILL_IDS = ['boost_reveal', 'boost_extra_time', 'boost_lucky_clover'] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export function getSkillQuantity(id: SkillId): number {
  return shop.getQuantity(id);
}

export function consumeSkill(id: SkillId): boolean {
  return shop.consumeBoost(id);
}
