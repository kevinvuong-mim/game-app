import Phaser from 'phaser';

import type { ContainerBounds } from './types';
import { FRUIT_TYPES, fruitTextureKey } from '@game/fruits';

export type DropControllerCallbacks = {
  canDrop: () => boolean;
  isActive: () => boolean;
  onFirstDrop: () => void;
  onBeforeDrop: () => void;
  advanceLevels: () => void;
  hasActiveSkill: () => boolean;
  getCurrentLevel: () => number;
  onDropped: (level: number) => void;
  setCanDrop: (value: boolean) => void;
};

export class DropController {
  private dropY = 0;
  private dropperX = 0;
  private dropperFruit?: Phaser.GameObjects.Image;
  private dropGuide?: Phaser.GameObjects.Graphics;
  private bounds: ContainerBounds = { left: 0, right: 0, top: 0, bottom: 0, centerX: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: DropControllerCallbacks
  ) {}

  get x(): number {
    return this.dropperX;
  }

  get y(): number {
    return this.dropY;
  }

  get containerBounds(): ContainerBounds {
    return this.bounds;
  }

  setupVisuals(bounds: ContainerBounds, dropY: number): void {
    this.bounds = bounds;
    this.dropY = dropY;
    this.dropperX = bounds.centerX;
    this.dropGuide = this.scene.add.graphics().setDepth(15);
    this.dropperFruit = this.scene.add
      .image(this.dropperX, this.dropY, fruitTextureKey(0))
      .setDepth(20);
  }

  refreshVisual(): void {
    if (!this.dropperFruit) return;
    const level = this.callbacks.getCurrentLevel();
    const fruit = FRUIT_TYPES[level];
    this.dropperFruit.setTexture(fruitTextureKey(level));
    this.dropperFruit.setDisplaySize(fruit.radius * 2, fruit.radius * 2);
    this.dropperFruit.setPosition(this.dropperX, this.dropY);
    this.dropperFruit.setVisible(this.callbacks.canDrop() && this.callbacks.isActive());
  }

  updateGuide(): void {
    if (!this.dropGuide) return;
    this.dropGuide.clear();
    if (
      !this.callbacks.canDrop() ||
      !this.callbacks.isActive() ||
      this.callbacks.hasActiveSkill()
    ) {
      return;
    }

    const fruit = FRUIT_TYPES[this.callbacks.getCurrentLevel()];
    this.dropGuide.lineStyle(2, 0xe53935, 0.85);
    this.dropGuide.beginPath();
    const startY = this.dropY + fruit.radius + 4;
    const endY = this.bounds.bottom - 8;
    const dash = 10;
    const gap = 8;
    let y = startY;
    let draw = true;
    while (y < endY) {
      const next = Math.min(y + (draw ? dash : gap), endY);
      if (draw) {
        this.dropGuide.moveTo(this.dropperX, y);
        this.dropGuide.lineTo(this.dropperX, next);
      }
      y = next;
      draw = !draw;
    }
    this.dropGuide.strokePath();
  }

  hide(): void {
    this.dropperFruit?.setVisible(false);
    this.dropGuide?.clear();
  }

  /** Restore dropper X after loading a mid-run save. */
  setDropperX(x: number): void {
    this.dropperX = this.clampX(x);
    this.dropperFruit?.setX(this.dropperX);
  }

  handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (
      !this.callbacks.isActive() ||
      !this.callbacks.canDrop() ||
      this.callbacks.hasActiveSkill()
    ) {
      return;
    }
    if (pointer.y > this.bounds.bottom + 20) return;
    this.dropperX = this.clampX(pointer.x);
    this.dropperFruit?.setX(this.dropperX);
  }

  tryDrop(pointer: Phaser.Input.Pointer): boolean {
    if (!this.callbacks.isActive() || !this.callbacks.canDrop()) return false;
    if (pointer.y > this.bounds.bottom + 20) return false;

    this.dropperX = this.clampX(pointer.x);
    this.dropFruit();
    return true;
  }

  private clampX(x: number): number {
    const radius = FRUIT_TYPES[this.callbacks.getCurrentLevel()].radius;
    return Phaser.Math.Clamp(x, this.bounds.left + radius + 2, this.bounds.right - radius - 2);
  }

  private dropFruit(): void {
    if (!this.callbacks.canDrop() || !this.callbacks.isActive()) return;

    // Start the session before the checkpoint so undo cannot rewind
    // `sessionStarted` and re-emit `game:start` on the next drop.
    this.callbacks.onFirstDrop();
    this.callbacks.onBeforeDrop();

    this.callbacks.setCanDrop(false);
    this.dropperFruit?.setVisible(false);
    this.dropGuide?.clear();

    const level = this.callbacks.getCurrentLevel();
    this.callbacks.onDropped(level);
    this.callbacks.advanceLevels();

    this.scene.time.delayedCall(600, () => {
      // Restore drop arm even if quit modal made isActive() false — otherwise
      // cancel leaves canDrop stuck and the dropper never comes back.
      if (!this.scene.sys.isActive()) return;
      this.callbacks.setCanDrop(true);
      this.refreshVisual();
    });
  }
}
