import { shop } from '@platform/modules/shop';

/** Quantity of a boost item in inventory (0 if none). */
export function getBoostQuantity(id: string): number {
  return shop.getQuantity(id);
}

/** Consume one use of a boost. Returns false if none left. */
export function consumeBoost(id: string): boolean {
  return shop.consumeBoost(id);
}
