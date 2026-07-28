import type Phaser from 'phaser';

import { FRUIT_TYPES } from '@game/fruits';
import type { FruitBody } from './types';

export type DangerLineCallbacks = {
  isActive: () => boolean;
  onGameOver: (violators: FruitBody[]) => void;
};

export class DangerLineSystem {
  private dangerY = 0;
  /** Epoch ms — lose checks skipped until this time (post-drop settle grace). */
  private graceUntil = 0;

  constructor(
    private readonly fruits: Set<FruitBody>,
    private readonly callbacks: DangerLineCallbacks
  ) {}

  setDangerY(y: number): void {
    this.dangerY = y;
  }

  /** Brief settle window after a drop so the pile can fall before lose checks. */
  armGrace(ms: number): void {
    this.graceUntil = Date.now() + ms;
  }

  check(): void {
    if (!this.callbacks.isActive() || Date.now() < this.graceUntil) return;

    const violators: FruitBody[] = [];
    for (const fruit of this.fruits) {
      if (fruit.isMerging || !fruit.active || !fruit.body) continue;
      const body = fruit.body as MatterJS.BodyType;
      if (!body.velocity) continue;
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 0.35) continue;
      const def = FRUIT_TYPES[fruit.fruitLevel];
      if (!def) continue;
      if (fruit.y - def.radius < this.dangerY) {
        violators.push(fruit);
      }
    }

    if (violators.length > 0) {
      this.callbacks.onGameOver(violators);
    }
  }

  flashViolators(scene: Phaser.Scene, violators: FruitBody[], flashMs = 3000): void {
    const blinkMs = 180;
    const targets = violators.filter((fruit) => fruit.active);
    for (const fruit of targets) {
      fruit.setTint(0xff3b3b);
      scene.tweens.add({
        targets: fruit,
        alpha: 0.2,
        duration: blinkMs,
        yoyo: true,
        repeat: Math.ceil(flashMs / (blinkMs * 2)) - 1,
      });
    }
  }
}
