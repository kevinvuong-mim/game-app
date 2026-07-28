import Phaser from 'phaser';

import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '@platform/ui/button/UIButton';
import type { UIButton } from '@platform/ui/types';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { PANEL_BG, PANEL_BORDER, PANEL_CORNER_RADIUS } from '@platform/ui/panel/panelTheme';
import { SKILL_IDS, type SkillId, getSkillQuantity } from '@game/skills/skillInventory';

const SKILL_ICONS: Record<SkillId, string> = {
  boost_hammer: 'shop-item-1',
  boost_change: 'shop-item-2',
  boost_swap: 'shop-item-3',
  boost_size: 'shop-item-4',
  boost_undo: 'shop-item-5',
};

export type SkillBarViewCallbacks = {
  onSkillPressed: (id: SkillId) => void;
  getSelectedSkillId: () => SkillId | null;
};

/**
 * Scrollable skill inventory bar at the bottom of gameplay.
 */
export class SkillBarView {
  private skillButtons = new Map<SkillId, UIButton>();
  private skillSlots = new Map<SkillId, Phaser.GameObjects.Container>();
  private ownedSkillIds: SkillId[] = [];
  private skillHint?: Phaser.GameObjects.Text;
  private skillPanel?: Phaser.GameObjects.Graphics;
  private skillTrack?: Phaser.GameObjects.Container;
  private skillTrackBaseX = 0;
  private skillLeftArrow?: Phaser.GameObjects.Text;
  private skillRightArrow?: Phaser.GameObjects.Text;
  private skillLeftArrowZone?: Phaser.GameObjects.Zone;
  private skillRightArrowZone?: Phaser.GameObjects.Zone;
  private skillScrollIndex = 0;
  private skillSlotSpacing = 110;
  private skillBtnSize = 72;
  private skillBarTop = 0;
  private skillBarBottom = 0;
  private skillSwipeStartX = 0;
  private skillSwipeActive = false;
  private skillDidSwipe = false;
  private skillNavConsumed = false;
  private visible = false;
  private readonly skillVisibleCount = 4;
  private readonly selectedSkillScale = 1.16;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: SkillBarViewCallbacks
  ) {}

  get barBottom(): number {
    return this.skillBarBottom;
  }

  get didSwipe(): boolean {
    return this.skillDidSwipe;
  }

  get navConsumed(): boolean {
    return this.skillNavConsumed;
  }

  create(width: number, height: number): void {
    this.skillButtons.clear();
    this.skillSlots.clear();
    this.ownedSkillIds = [];
    this.skillPanel = undefined;
    this.skillTrack = undefined;
    this.skillLeftArrow = undefined;
    this.skillRightArrow = undefined;
    this.skillLeftArrowZone = undefined;
    this.skillRightArrowZone = undefined;
    this.skillScrollIndex = 0;
    this.skillSwipeActive = false;
    this.skillDidSwipe = false;
    this.skillNavConsumed = false;
    this.visible = false;

    const visible = this.skillVisibleCount;
    const btnSize = 72;
    const slotHeight = btnSize;
    const arrowPad = 36;
    const panelPadTop = 16;
    const panelPadBottom = 18;
    const panelWidth = Math.min(width * 0.78, 460);
    const panelLeft = width / 2 - panelWidth / 2;
    const innerWidth = panelWidth - arrowPad * 2;
    const spacing = innerWidth / visible;
    this.skillSlotSpacing = spacing;

    const panelHeight = panelPadTop + slotHeight + panelPadBottom;
    const panelTop = height - panelHeight - 110;
    this.skillBarTop = panelTop;
    this.skillBarBottom = panelTop + panelHeight;

    this.skillPanel = this.scene.add.graphics().setDepth(400);
    drawRoundedRect(
      this.skillPanel,
      panelLeft,
      panelTop,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );

    const trackCenterY = panelTop + panelPadTop + slotHeight / 2;
    this.skillTrackBaseX = width / 2;
    this.skillTrack = this.scene.add.container(this.skillTrackBaseX, trackCenterY).setDepth(403);
    this.skillBtnSize = btnSize;
    this.rebuildTrack();

    const windowWidth = spacing * visible;
    const windowHeight = slotHeight + 8;
    const maskShape = this.scene.add.graphics();
    maskShape.setPosition(width / 2, trackCenterY);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(-windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight);
    maskShape.setVisible(false);
    this.skillTrack.setMask(maskShape.createGeometryMask());

    const arrowStyle = {
      color: '#9e9e9e',
      fontSize: '42px',
      fontStyle: 'bold',
      fontFamily: FREDOKA_FONT,
    };
    this.skillLeftArrow = this.scene.add
      .text(panelLeft + 22, trackCenterY, '‹', arrowStyle)
      .setOrigin(0.5)
      .setDepth(404);
    this.skillRightArrow = this.scene.add
      .text(panelLeft + panelWidth - 22, trackCenterY, '›', arrowStyle)
      .setOrigin(0.5)
      .setDepth(404);

    const arrowHitW = arrowPad + 8;
    const arrowHitH = slotHeight + 24;
    this.skillLeftArrowZone = this.scene.add
      .zone(panelLeft + arrowPad / 2, trackCenterY, arrowHitW, arrowHitH)
      .setDepth(405)
      .setInteractive({ useHandCursor: true });
    this.skillRightArrowZone = this.scene.add
      .zone(panelLeft + panelWidth - arrowPad / 2, trackCenterY, arrowHitW, arrowHitH)
      .setDepth(405)
      .setInteractive({ useHandCursor: true });

    this.bindNavZone(this.skillLeftArrowZone, -1);
    this.bindNavZone(this.skillRightArrowZone, 1);

    this.applyScroll(false);

    this.skillHint = this.scene.add
      .text(width / 2, this.skillBarTop - 12, '', {
        color: '#ffffff',
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(520);

    this.updateBarVisibility();
  }

  setHint(text: string): void {
    this.skillHint?.setText(text);
  }

  refreshInventory(id?: SkillId): void {
    if (id !== undefined) {
      const qty = getSkillQuantity(id);
      if (qty <= 0) {
        this.rebuildTrack();
        return;
      }
      const button = this.skillButtons.get(id);
      if (button) {
        button.setBadgeContent(String(qty));
        button.setBadgeVisible(true);
      }
      return;
    }
    this.rebuildTrack();
  }

  updateSelectionVisual(animate = true): void {
    const selectedId = this.callbacks.getSelectedSkillId();

    for (const [id, slot] of this.skillSlots) {
      const targetScale = id === selectedId ? this.selectedSkillScale : 1;
      this.scene.tweens.killTweensOf(slot);
      if (animate) {
        this.scene.tweens.add({
          targets: slot,
          scale: targetScale,
          duration: 140,
          ease: 'Back.easeOut',
        });
      } else {
        slot.setScale(targetScale);
      }
    }
  }

  onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.visible || !this.isPointerOnBar(pointer)) return;
    this.skillSwipeStartX = pointer.x;
    this.skillSwipeActive = true;
    this.skillDidSwipe = false;
  }

  /** Returns true if the swipe consumed the pointer (caller should skip drop). */
  onPointerMove(pointer: Phaser.Input.Pointer): boolean {
    if (!this.visible) return false;
    if (this.skillSwipeActive && pointer.isDown) {
      if (Math.abs(pointer.x - this.skillSwipeStartX) > 14) {
        this.skillDidSwipe = true;
      }
      return true;
    }
    return false;
  }

  /** Returns true if the skill bar handled the pointer up. */
  onPointerUp(pointer: Phaser.Input.Pointer): boolean {
    if (!this.visible || !this.skillSwipeActive) return false;

    const dx = pointer.x - this.skillSwipeStartX;
    const didSwipe = this.skillDidSwipe && Math.abs(dx) > 40;
    this.skillSwipeActive = false;

    if (didSwipe) {
      this.scroll(dx < 0 ? 1 : -1);
      return true;
    }

    // Press started on the bar but released in the playfield — allow drop/skill targeting.
    return this.isPointerOnBar(pointer);
  }

  private bindNavZone(zone: Phaser.GameObjects.Zone, delta: number): void {
    zone.on('pointerdown', () => {
      this.skillNavConsumed = true;
      this.skillSwipeActive = false;
      this.skillDidSwipe = false;
    });
    zone.on('pointerup', () => {
      if (!this.skillNavConsumed) return;
      this.scroll(delta);
      this.scene.time.delayedCall(0, () => {
        this.skillNavConsumed = false;
      });
    });
    zone.on('pointerout', () => {
      this.skillNavConsumed = false;
    });
  }

  private getOwnedSkillIds(): SkillId[] {
    return SKILL_IDS.filter((id) => getSkillQuantity(id) > 0);
  }

  private rebuildTrack(): void {
    if (!this.skillTrack) return;

    this.skillTrack.removeAll(true);
    this.skillButtons.clear();
    this.skillSlots.clear();
    this.ownedSkillIds = this.getOwnedSkillIds();

    this.ownedSkillIds.forEach((id, index) => {
      const slot = this.createSlot(id, this.skillBtnSize);
      slot.setPosition(this.slotX(index), 0);
      this.skillTrack!.add(slot);
    });

    this.skillScrollIndex = Phaser.Math.Clamp(this.skillScrollIndex, 0, this.maxScrollIndex());
    this.applyScroll(false);
    this.updateSelectionVisual(false);
    this.updateBarVisibility();
  }

  private updateBarVisibility(): void {
    const shouldShow = this.ownedSkillIds.length > 0;
    this.visible = shouldShow;

    this.skillPanel?.setVisible(shouldShow);
    this.skillTrack?.setVisible(shouldShow);
    this.skillHint?.setVisible(shouldShow);

    if (!shouldShow) {
      this.skillSwipeActive = false;
      this.skillDidSwipe = false;
      this.skillNavConsumed = false;
      this.skillLeftArrow?.setVisible(false);
      this.skillRightArrow?.setVisible(false);
      this.skillLeftArrowZone?.setVisible(false).setActive(false).disableInteractive();
      this.skillRightArrowZone?.setVisible(false).setActive(false).disableInteractive();
      return;
    }

    this.applyScroll(false);
  }

  private createSlot(id: SkillId, btnSize: number): Phaser.GameObjects.Container {
    const slot = this.scene.add.container(0, 0);
    const qty = getSkillQuantity(id);

    const button = createUIButton({
      scene: this.scene,
      position: { x: 0, y: 0 },
      size: { width: btnSize, height: btnSize },
      background: { key: SKILL_ICONS[id] },
      badge: {
        content: String(qty),
        visible: true,
        position: { x: btnSize - 24, y: btnSize - 24 },
        minSize: { width: 26, height: 26 },
        padding: { horizontal: 4, vertical: 2 },
        background: { color: '#e53935', radius: 13 },
        textStyle: {
          fontSize: 13,
          fontStyle: 'bold',
          color: '#ffffff',
          border: { width: 2, color: '#000000' },
        },
      },
      onClick: () => {
        if (this.skillDidSwipe || this.skillNavConsumed) return;
        this.callbacks.onSkillPressed(id);
      },
    });
    slot.add(button);
    this.skillButtons.set(id, button);
    this.skillSlots.set(id, slot);

    return slot;
  }

  private isPointerOnBar(pointer: Phaser.Input.Pointer): boolean {
    if (!this.visible) return false;
    const { width } = this.scene.cameras.main;
    return (
      pointer.y >= this.skillBarTop &&
      pointer.y <= this.skillBarBottom &&
      pointer.x > 20 &&
      pointer.x < width - 20
    );
  }

  private slotX(index: number): number {
    const owned = this.ownedSkillIds.length;
    const alignCount =
      owned <= this.skillVisibleCount ? Math.max(owned, 1) : this.skillVisibleCount;
    const leftmost = alignCount <= 1 ? 0 : -((alignCount - 1) * this.skillSlotSpacing) / 2;
    return leftmost + index * this.skillSlotSpacing;
  }

  private maxScrollIndex(): number {
    return Math.max(0, this.ownedSkillIds.length - this.skillVisibleCount);
  }

  private applyScroll(animate: boolean): void {
    if (!this.skillTrack) return;
    this.skillScrollIndex = Phaser.Math.Clamp(this.skillScrollIndex, 0, this.maxScrollIndex());
    const targetX = this.skillTrackBaseX - this.skillScrollIndex * this.skillSlotSpacing;

    this.scene.tweens.killTweensOf(this.skillTrack);
    if (animate) {
      this.scene.tweens.add({
        targets: this.skillTrack,
        x: targetX,
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => this.updateSlotInput(),
      });
    } else {
      this.skillTrack.x = targetX;
    }

    this.updateSlotInput();

    const canScroll = this.maxScrollIndex() > 0;
    const atStart = this.skillScrollIndex <= 0;
    const atEnd = this.skillScrollIndex >= this.maxScrollIndex();
    this.skillLeftArrow?.setVisible(canScroll);
    this.skillRightArrow?.setVisible(canScroll);
    this.skillLeftArrow?.setAlpha(atStart ? 0.35 : 0.9);
    this.skillRightArrow?.setAlpha(atEnd ? 0.35 : 0.9);
    this.skillLeftArrowZone?.setVisible(canScroll).setActive(canScroll);
    this.skillRightArrowZone?.setVisible(canScroll).setActive(canScroll);
    if (canScroll) {
      if (atStart) this.skillLeftArrowZone?.disableInteractive();
      else this.skillLeftArrowZone?.setInteractive({ useHandCursor: true });
      if (atEnd) this.skillRightArrowZone?.disableInteractive();
      else this.skillRightArrowZone?.setInteractive({ useHandCursor: true });
    } else {
      this.skillLeftArrowZone?.disableInteractive();
      this.skillRightArrowZone?.disableInteractive();
    }
  }

  private updateSlotInput(): void {
    const start = this.skillScrollIndex;
    const end = start + this.skillVisibleCount - 1;

    this.ownedSkillIds.forEach((id, index) => {
      const button = this.skillButtons.get(id);
      if (!button) return;
      const inWindow = index >= start && index <= end;
      button.each((child: Phaser.GameObjects.GameObject) => {
        if (!(child instanceof Phaser.GameObjects.Zone)) return;
        if (inWindow) child.setInteractive({ useHandCursor: true });
        else child.disableInteractive();
      });
    });
  }

  private scroll(delta: number): void {
    const next = Phaser.Math.Clamp(this.skillScrollIndex + delta, 0, this.maxScrollIndex());
    if (next === this.skillScrollIndex) return;
    this.skillScrollIndex = next;
    this.applyScroll(true);
  }
}
