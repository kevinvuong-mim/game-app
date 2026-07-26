import type Phaser from 'phaser';

export type FruitBody = Phaser.Physics.Matter.Image & {
  fruitLevel: number;
  isMerging: boolean;
  scoreMultiplier: number;
};

export type ActiveSkill =
  | { kind: 'hammer' }
  | { kind: 'swap'; selected?: FruitBody }
  | { kind: 'size' }
  | null;

/** Inner play-area ratios relative to glass-container.png display size. */
export const CONTAINER_INSET = {
  left: 0.09,
  right: 0.09,
  top: 0.06,
  bottom: 0.1,
};

export type ContainerBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
};
