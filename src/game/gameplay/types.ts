import type Phaser from 'phaser';

export type FruitBody = Phaser.Physics.Matter.Image & {
  isMerging: boolean;
  fruitLevel: number;
  scoreMultiplier: number;
};

export type ActiveSkill =
  { kind: 'hammer' } | { kind: 'swap'; selected?: FruitBody } | { kind: 'size' } | null;

/** Inner play-area ratios relative to glass-container.png display size. */
export const CONTAINER_INSET = {
  top: 0.08,
  left: 0.08,
  right: 0.08,
  bottom: 0.09,
};

export type ContainerBounds = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  centerX: number;
};
