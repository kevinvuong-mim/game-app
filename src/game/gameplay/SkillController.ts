import type Phaser from 'phaser';

import { t } from '@platform/ui';
import type { FruitFactory } from './FruitFactory';
import type { SkillBarView } from './SkillBarView';
import type { ActiveSkill, FruitBody } from './types';
import { toast } from '@platform/ui/toast/ToastManager';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { FRUIT_TYPES, randomSpawnLevelExcept } from '@game/fruits';
import { type SkillId, getSkillQuantity, consumeSkill } from '@game/skills/skillInventory';

export type SkillControllerCallbacks = {
  canDrop: () => boolean;
  canUndo: () => boolean;
  isActive: () => boolean;
  hideDropper: () => void;
  undoLastMove: () => void;
  getNextLevel: () => number;
  refreshDropper: () => void;
  getCurrentLevel: () => number;
  pushUndoCheckpoint: () => void;
  setLevels: (current: number, next: number) => void;
};

export class SkillController {
  private activeSkill: ActiveSkill = null;

  constructor(
    private readonly factory: FruitFactory,
    private readonly skillBar: SkillBarView,
    private readonly callbacks: SkillControllerCallbacks
  ) {}

  get active(): ActiveSkill {
    return this.activeSkill;
  }

  get selectedSkillId(): SkillId | null {
    return this.activeSkill ? this.skillKindToId(this.activeSkill) : null;
  }

  reset(): void {
    this.clearSelectionTint();
    this.activeSkill = null;
  }

  clear(): void {
    this.clearSelectionTint();
    this.activeSkill = null;
    this.skillBar.setHint('');
    this.skillBar.updateSelectionVisual();
    if (this.callbacks.canDrop()) this.callbacks.refreshDropper();
  }

  onSkillPressed(id: SkillId): void {
    if (!this.callbacks.isActive()) return;
    if (getSkillQuantity(id) <= 0) return;

    if (id === 'boost_change') {
      // Consume before checkpoint so a failed consume never clobbers undo state.
      if (!consumeSkill(id)) return;

      // Cancel targeting skills so the dropper can show the new fruit.
      this.clearSelectionTint();
      this.activeSkill = null;
      this.skillBar.setHint('');
      this.skillBar.updateSelectionVisual();

      this.callbacks.pushUndoCheckpoint();
      // Reroll the hanging fruit across the spawn pool — never just swap with
      // next (that only oscillates between two fruits).
      const rolled = randomSpawnLevelExcept(this.callbacks.getCurrentLevel());
      this.callbacks.setLevels(rolled, this.callbacks.getNextLevel());
      this.callbacks.refreshDropper();
      this.skillBar.refreshInventory(id);
      soundManager.playChangeTurns();
      return;
    }

    if (id === 'boost_undo') {
      if (!this.callbacks.canUndo()) {
        toast.show({ message: t('game.skillUndoNothing'), type: 'error' });
        return;
      }
      if (!consumeSkill(id)) return;
      this.callbacks.undoLastMove();
      this.clear();
      this.skillBar.refreshInventory(id);
      this.skillBar.setHint('');
      soundManager.playReverse();
      return;
    }

    if (this.activeSkill && this.skillKindToId(this.activeSkill) === id) {
      this.clear();
      return;
    }

    this.clearSelectionTint();
    this.activeSkill =
      id === 'boost_hammer'
        ? { kind: 'hammer' }
        : id === 'boost_swap'
          ? { kind: 'swap' }
          : { kind: 'size' };

    const hints: Record<Exclude<ActiveSkill, null>['kind'], string> = {
      hammer: t('game.skillHintHammer'),
      swap: t('game.skillHintSwap'),
      size: t('game.skillHintSize'),
    };
    this.skillBar.setHint(hints[this.activeSkill.kind]);
    this.callbacks.hideDropper();
    this.skillBar.updateSelectionVisual();
  }

  handlePointer(pointer: Phaser.Input.Pointer): void {
    if (!this.activeSkill) return;

    const fruit = this.factory.pickAt(pointer.x, pointer.y);
    if (!fruit) return;

    const skillId = this.skillKindToId(this.activeSkill);

    if (this.activeSkill.kind === 'hammer') {
      if (!consumeSkill(skillId)) return;
      this.callbacks.pushUndoCheckpoint();
      this.factory.burst(fruit);
      this.skillBar.refreshInventory(skillId);
      this.clear();
      soundManager.playDisappear();
      return;
    }

    if (this.activeSkill.kind === 'size') {
      if (fruit.fruitLevel >= FRUIT_TYPES.length - 1) return;
      if (!consumeSkill(skillId)) return;
      this.callbacks.pushUndoCheckpoint();
      const next = fruit.fruitLevel + 1;
      const { x, y } = fruit;
      const multiplier = fruit.scoreMultiplier;
      this.factory.destroy(fruit);
      this.factory.spawn(x, y, next, multiplier);
      this.skillBar.refreshInventory(skillId);
      this.clear();
      soundManager.playIncreaseSize();
      return;
    }

    if (this.activeSkill.kind === 'swap') {
      this.handleSwap(fruit, skillId);
    }
  }

  private handleSwap(fruit: FruitBody, skillId: SkillId): void {
    if (!this.activeSkill || this.activeSkill.kind !== 'swap') return;

    if (!this.activeSkill.selected) {
      this.activeSkill.selected = fruit;
      fruit.setTint(0x90caf9);
      this.skillBar.setHint(t('game.skillHintSwapSecond'));
      return;
    }

    // First pick may have been merged/destroyed while waiting for the second tap.
    if (!this.factory.isAlive(this.activeSkill.selected)) {
      this.activeSkill.selected = fruit;
      fruit.setTint(0x90caf9);
      this.skillBar.setHint(t('game.skillHintSwapSecond'));
      return;
    }

    if (this.activeSkill.selected === fruit) return;

    const a = this.activeSkill.selected;
    if (!this.factory.isAlive(a) || !this.factory.isAlive(fruit)) {
      this.clear();
      return;
    }

    if (!consumeSkill(skillId)) {
      this.clear();
      return;
    }

    this.callbacks.pushUndoCheckpoint();

    a.clearTint();
    const ax = a.x;
    const ay = a.y;
    a.setPosition(fruit.x, fruit.y);
    fruit.setPosition(ax, ay);
    a.setVelocity(0, 0);
    fruit.setVelocity(0, 0);

    this.skillBar.refreshInventory(skillId);
    this.clear();
    soundManager.playSwoosh();
  }

  private clearSelectionTint(): void {
    if (this.activeSkill?.kind === 'swap' && this.activeSkill.selected) {
      const selected = this.activeSkill.selected;
      if (selected.active) {
        selected.clearTint();
      }
    }
  }

  private skillKindToId(skill: Exclude<ActiveSkill, null>): SkillId {
    switch (skill.kind) {
      case 'hammer':
        return 'boost_hammer';
      case 'swap':
        return 'boost_swap';
      case 'size':
        return 'boost_size';
    }
  }
}
