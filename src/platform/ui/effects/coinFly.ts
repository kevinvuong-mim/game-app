import Phaser from 'phaser';

export interface Point2D {
  x: number;
  y: number;
}

export interface CoinFlyOptions {
  /** Display size of each flying coin. Defaults to 28. */
  size?: number;
  /** Number of coins to spawn. Defaults to 6. */
  count?: number;
  /** Scene depth for flying coins. Defaults to 200. */
  depth?: number;
  /** Stagger between coins in ms. Defaults to 110. */
  stagger?: number;
  /** Base flight duration in ms. Defaults to 1040. */
  duration?: number;
  /** Called once after the last coin arrives. */
  onComplete?: () => void;
  /** Called when each coin reaches the target. */
  onCoinArrive?: () => void;
}

/**
 * Spawns coin icons that arc from `from` into `to` (e.g. a day cell → CoinBar).
 */
export function spawnCoinsFlyTo(
  scene: Phaser.Scene,
  from: Point2D,
  to: Point2D,
  options: CoinFlyOptions = {}
): void {
  const count = Math.max(1, options.count ?? 6);
  const size = options.size ?? 28;
  const duration = options.duration ?? 1040;
  const stagger = options.stagger ?? 110;
  const depth = options.depth ?? 200;

  for (let i = 0; i < count; i += 1) {
    const coin = scene.add.image(from.x, from.y, 'coin-icon').setDepth(depth);
    coin.setDisplaySize(size, size);
    coin.setAlpha(0.95);
    const baseScaleX = coin.scaleX;
    const baseScaleY = coin.scaleY;

    const spread = (i - (count - 1) / 2) * 18;
    const midX = (from.x + to.x) / 2 + spread;
    const midY = Math.min(from.y, to.y) - 70 - Math.abs(spread) * 0.35;
    const delay = i * stagger;
    const flight = duration + i * 40;
    const progress = { t: 0 };

    scene.tweens.add({
      targets: progress,
      t: 1,
      delay,
      duration: flight,
      ease: 'Cubic.Out',
      onUpdate: () => {
        const t = progress.t;
        const inv = 1 - t;
        coin.setPosition(
          inv * inv * from.x + 2 * inv * t * midX + t * t * to.x,
          inv * inv * from.y + 2 * inv * t * midY + t * t * to.y
        );
        const shrink = 1 - t * 0.45;
        coin.setScale(baseScaleX * shrink, baseScaleY * shrink);
      },
      onComplete: () => {
        options.onCoinArrive?.();
        coin.destroy();
        if (i === count - 1) {
          options.onComplete?.();
        }
      },
    });
  }
}

/** World translation of a Phaser game object. */
export function getWorldPosition(target: Phaser.GameObjects.GameObject): Point2D {
  const obj = target as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  const matrix = obj.getWorldTransformMatrix();
  return { x: matrix.tx, y: matrix.ty };
}
