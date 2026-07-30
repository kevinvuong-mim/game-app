import Phaser from 'phaser';

import { FRUIT_TYPES, fruitTextureKey } from '@game/fruits';
import type { FruitBody } from './types';

export class FruitFactory {
  private fruitSeq = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fruits: Set<FruitBody>
  ) {}

  reset(): void {
    this.fruitSeq = 0;
  }

  /** Prefer preloaded fruit-n.png; fall back to a colored circle if the image is missing. */
  ensureTextures(): void {
    for (let level = 0; level < FRUIT_TYPES.length; level++) {
      const key = fruitTextureKey(level);
      if (this.scene.textures.exists(key)) continue;

      const fruit = FRUIT_TYPES[level];
      const r = Math.ceil(fruit.radius);
      const size = r * 2;
      const g = this.scene.make.graphics({ x: 0, y: 0 });

      g.fillStyle(fruit.color, 1);
      g.fillCircle(r, r, r);
      g.lineStyle(Math.max(2, r * 0.06), 0xffffff, 0.35);
      g.strokeCircle(r, r, r - 1);

      const eyeR = Math.max(2, r * 0.12);
      const eyeY = r - r * 0.12;
      g.fillStyle(0x1a1a1a, 1);
      g.fillCircle(r - r * 0.28, eyeY, eyeR);
      g.fillCircle(r + r * 0.28, eyeY, eyeR);
      g.lineStyle(Math.max(2, r * 0.08), 0x1a1a1a, 1);
      g.beginPath();
      g.arc(r, r + r * 0.18, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI, false);
      g.strokePath();

      g.generateTexture(key, size, size);
      g.destroy();
    }
  }

  spawn(x: number, y: number, level: number, scoreMultiplier = 1): FruitBody {
    const def = FRUIT_TYPES[level];
    if (!def) {
      throw new Error(`Invalid fruit level: ${level}`);
    }
    const image = this.scene.matter.add.image(x, y, fruitTextureKey(level)) as FruitBody;
    image.setDisplaySize(def.radius * 2, def.radius * 2);

    image.setCircle(def.radius, {
      restitution: 0.12,
      friction: 0.08,
      frictionAir: 0.012,
      density: 0.002,
      label: `fruit_${level}`,
      slop: 0.05,
    });

    image.setDepth(5);
    image.setName(`fruit_${this.fruitSeq++}`);
    image.fruitLevel = level;
    image.isMerging = false;
    image.scoreMultiplier = scoreMultiplier;
    image.setInteractive({ useHandCursor: true });
    this.fruits.add(image);
    return image;
  }

  destroy(fruit: FruitBody): void {
    this.fruits.delete(fruit);
    fruit.isMerging = true;
    if (fruit.active) {
      fruit.destroy();
    }
  }

  /** True when the body is still in the live fruit set and not mid-merge. */
  isAlive(fruit: FruitBody): boolean {
    return this.fruits.has(fruit) && fruit.active && !fruit.isMerging;
  }

  burst(fruit: FruitBody): void {
    const { x, y } = fruit;
    this.destroy(fruit);
    const burst = this.scene.add.circle(x, y, 8, 0xffffff, 0.8).setDepth(30);
    this.scene.tweens.add({
      targets: burst,
      scale: 4,
      alpha: 0,
      duration: 250,
      onComplete: () => burst.destroy(),
    });
  }

  pickAt(x: number, y: number): FruitBody | null {
    let best: FruitBody | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const fruit of this.fruits) {
      if (fruit.isMerging) continue;
      const r = FRUIT_TYPES[fruit.fruitLevel].radius;
      const dist = Phaser.Math.Distance.Between(x, y, fruit.x, fruit.y);
      if (dist <= r + 8 && dist < bestDist) {
        best = fruit;
        bestDist = dist;
      }
    }
    return best;
  }
}
