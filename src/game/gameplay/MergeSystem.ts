import Phaser from 'phaser';

import { FRUIT_TYPES } from '@game/fruits';
import { eventBus } from '@platform/core/events';
import type { FruitFactory } from './FruitFactory';
import type { FruitBody } from './types';

export type MergeSystemCallbacks = {
  isActive: () => boolean;
  onScore: (points: number) => void;
  onMerge: () => void;
};

export class MergeSystem {
  private pendingMerges = new Set<string>();
  private mergeQueue: Array<{ a: FruitBody; b: FruitBody }> = [];

  constructor(
    private readonly fruits: Set<FruitBody>,
    private readonly factory: FruitFactory,
    private readonly callbacks: MergeSystemCallbacks
  ) {}

  reset(): void {
    this.pendingMerges.clear();
    this.mergeQueue = [];
  }

  handleCollision(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    if (!this.callbacks.isActive()) return;

    const fruitA = this.bodyToFruit(bodyA);
    const fruitB = this.bodyToFruit(bodyB);
    if (!fruitA || !fruitB) return;
    this.tryQueueMerge(fruitA, fruitB);
  }

  /** Distance-based merge detection — works even when collisionstart was missed. */
  queueProximityMerges(): void {
    const list = [...this.fruits];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.active || a.isMerging) continue;

      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.active || b.isMerging) continue;
        if (a.fruitLevel !== b.fruitLevel) continue;
        if (a.fruitLevel >= FRUIT_TYPES.length - 1) continue;

        const radius = FRUIT_TYPES[a.fruitLevel].radius;
        const maxDist = radius * 2 + 2;
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (dist <= maxDist) {
          this.tryQueueMerge(a, b);
        }
      }
    }
  }

  flushMergeQueue(): void {
    if (this.mergeQueue.length === 0) return;
    const queue = this.mergeQueue;
    this.mergeQueue = [];

    for (const { a, b } of queue) {
      if (!a.active || !b.active || !this.fruits.has(a) || !this.fruits.has(b)) {
        if (a.active && this.fruits.has(a)) a.isMerging = false;
        if (b.active && this.fruits.has(b)) b.isMerging = false;
        continue;
      }

      this.mergeFruits(a, b);
    }

    this.pendingMerges.clear();
  }

  private tryQueueMerge(fruitA: FruitBody, fruitB: FruitBody): void {
    if (!fruitA.active || !fruitB.active) return;
    if (fruitA.isMerging || fruitB.isMerging) return;
    if (fruitA.fruitLevel !== fruitB.fruitLevel) return;
    if (fruitA.fruitLevel >= FRUIT_TYPES.length - 1) return;
    if (!this.fruits.has(fruitA) || !this.fruits.has(fruitB)) return;

    const key = [fruitA.name, fruitB.name].sort().join(':');
    if (this.pendingMerges.has(key)) return;
    this.pendingMerges.add(key);

    fruitA.isMerging = true;
    fruitB.isMerging = true;
    this.mergeQueue.push({ a: fruitA, b: fruitB });
  }

  private mergeFruits(a: FruitBody, b: FruitBody): void {
    const nextLevel = a.fruitLevel + 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const multiplier = Math.max(a.scoreMultiplier, b.scoreMultiplier);

    this.factory.destroy(a);
    this.factory.destroy(b);

    const created = this.factory.spawn(midX, midY, nextLevel, multiplier);
    if (created.body) {
      created.setVelocity(0, -2);
    }

    const points = FRUIT_TYPES[nextLevel].mergeScore * multiplier;
    this.callbacks.onScore(points);
    this.callbacks.onMerge();
    eventBus.emit('merge', { count: 1 });
  }

  private bodyToFruit(body: MatterJS.BodyType): FruitBody | null {
    const typed = body as MatterJS.BodyType & {
      gameObject?: Phaser.GameObjects.GameObject;
      parent?: MatterJS.BodyType & { gameObject?: Phaser.GameObjects.GameObject };
    };
    const go = typed.gameObject ?? typed.parent?.gameObject;
    if (!go || !(go instanceof Phaser.Physics.Matter.Image)) return null;
    const fruit = go as FruitBody;
    if (typeof fruit.fruitLevel !== 'number') return null;
    if (!this.fruits.has(fruit)) return null;
    return fruit;
  }
}
