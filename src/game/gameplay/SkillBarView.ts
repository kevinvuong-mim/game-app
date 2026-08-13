import Phaser from 'phaser';

import { FREDOKA_FONT } from '@platform/ui/fonts';
import type { UIButton } from '@platform/ui/types';
import { createUIButton } from '@platform/ui/button/UIButton';
import { SKILL_IDS, type SkillId, getSkillQuantity } from '@game/skills/skillInventory';

const SKILL_ICONS: Record<SkillId, string> = {
  boost_reveal: 'shop-item-1',
  boost_extra_time: 'shop-item-2',
  boost_lucky_clover: 'shop-item-3',
};

/** Source texture is 626×149 — slice caps so rounded corners don't stretch with width. */
const SKILL_BAR_BG_SLICE = {
  leftWidth: 74,
  topHeight: 36,
  rightWidth: 74,
  bottomHeight: 36,
} as const;
const SKILL_BAR_BG_KEY = 'skill-bar-background-image';

export type SkillBarViewCallbacks = {
  onSkillPressed: (id: SkillId) => void;
  getSelectedSkillId: () => SkillId | null;
};

/**
 * Scrollable skill inventory bar at the bottom of gameplay.
 * Panel width grows with owned skills (up to a max), then scrolls.
 */
export class SkillBarView {
  private readonly arrowPad = 36;
  private readonly arrowInset = 30;
  private readonly panelPadTop = 18;
  private readonly baseBtnSize = 84;
  private readonly panelPadBottom = 30;
  private readonly skillVisibleCount = 4;
  private readonly maxPanelWidthPx = 520;
  private readonly idealSlotSpacing = 110;
  private readonly maxPanelWidthRatio = 0.85;
  private readonly selectedSkillScale = 1.24;

  private skillBarTop = 0;
  private skillBtnSize = 84;
  private skillBarBottom = 0;
  private skillPanelLeft = 0;
  private skillPanelWidth = 0;
  private skillTrackBaseX = 0;
  private skillScrollIndex = 0;
  private skillTrackCenterY = 0;
  private layoutScreenWidth = 0;
  private layoutScreenHeight = 0;
  private skillSlotSpacing = 110;
  private skillNavConsumed = false;
  private ownedSkillIds: SkillId[] = [];
  private skillHint?: Phaser.GameObjects.Text;
  private skillLeftArrow?: Phaser.GameObjects.Text;
  private skillTrack?: Phaser.GameObjects.Container;
  private skillRightArrow?: Phaser.GameObjects.Text;
  private skillButtons = new Map<SkillId, UIButton>();
  private skillPanelBg?: Phaser.GameObjects.NineSlice;
  private skillTrackMask?: Phaser.GameObjects.Graphics;
  private skillLeftArrowZone?: Phaser.GameObjects.Zone;
  private skillRightArrowZone?: Phaser.GameObjects.Zone;
  private skillSlots = new Map<SkillId, Phaser.GameObjects.Container>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: SkillBarViewCallbacks
  ) {}

  get barBottom(): number {
    return this.skillBarBottom;
  }

  create(width: number, height: number): void {
    this.skillButtons.clear();
    this.skillSlots.clear();
    this.ownedSkillIds = [];
    this.skillPanelBg = undefined;
    this.skillTrack = undefined;
    this.skillTrackMask = undefined;
    this.skillLeftArrow = undefined;
    this.skillRightArrow = undefined;
    this.skillLeftArrowZone = undefined;
    this.skillRightArrowZone = undefined;
    this.skillScrollIndex = 0;
    this.skillNavConsumed = false;
    this.layoutScreenWidth = width;
    this.layoutScreenHeight = height;

    const btnSize = this.baseBtnSize;
    this.skillBtnSize = btnSize;
    const slotHeight = btnSize;

    this.ownedSkillIds = this.getOwnedSkillIds();
    this.layoutPanelMetrics();

    this.skillPanelBg = this.scene.add
      .nineslice(
        0,
        0,
        SKILL_BAR_BG_KEY,
        undefined,
        this.skillPanelWidth,
        this.panelPadTop + this.skillBtnSize + this.panelPadBottom,
        SKILL_BAR_BG_SLICE.leftWidth,
        SKILL_BAR_BG_SLICE.rightWidth,
        SKILL_BAR_BG_SLICE.topHeight,
        SKILL_BAR_BG_SLICE.bottomHeight
      )
      .setDepth(400);
    this.redrawPanel();

    this.skillTrackBaseX = width / 2;
    this.skillTrackCenterY = this.skillBarTop + this.panelPadTop + slotHeight / 2;
    this.skillTrack = this.scene.add
      .container(this.skillTrackBaseX, this.skillTrackCenterY)
      .setDepth(403);

    this.skillTrackMask = this.scene.add.graphics().setVisible(false);
    this.updateTrackMask();
    this.skillTrack.setMask(this.skillTrackMask.createGeometryMask());

    const arrowStyle = {
      color: '#9e9e9e',
      fontSize: '42px',
      fontStyle: 'bold',
      fontFamily: FREDOKA_FONT,
    };
    this.skillLeftArrow = this.scene.add
      .text(this.skillPanelLeft + this.arrowInset, this.skillTrackCenterY, '‹', arrowStyle)
      .setOrigin(0.5)
      .setDepth(404);
    this.skillRightArrow = this.scene.add
      .text(
        this.skillPanelLeft + this.skillPanelWidth - this.arrowInset,
        this.skillTrackCenterY,
        '›',
        arrowStyle
      )
      .setOrigin(0.5)
      .setDepth(404);

    const arrowHitW = this.arrowPad + 8;
    const arrowHitH = slotHeight + 24;
    this.skillLeftArrowZone = this.scene.add
      .zone(this.skillPanelLeft + this.arrowInset, this.skillTrackCenterY, arrowHitW, arrowHitH)
      .setDepth(405)
      .setInteractive({ useHandCursor: true });
    this.skillRightArrowZone = this.scene.add
      .zone(
        this.skillPanelLeft + this.skillPanelWidth - this.arrowInset,
        this.skillTrackCenterY,
        arrowHitW,
        arrowHitH
      )
      .setDepth(405)
      .setInteractive({ useHandCursor: true });

    this.bindNavZone(this.skillLeftArrowZone, -1);
    this.bindNavZone(this.skillRightArrowZone, 1);

    this.rebuildTrack();

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

  /** Visible slots that fit in the panel (owned count, capped at skillVisibleCount). */
  private displayedSlotCount(): number {
    return Math.min(Math.max(this.ownedSkillIds.length, 1), this.skillVisibleCount);
  }

  private maxPanelWidth(): number {
    return Math.min(this.layoutScreenWidth * this.maxPanelWidthRatio, this.maxPanelWidthPx);
  }

  private layoutPanelMetrics(): void {
    const slotCount = this.displayedSlotCount();
    const idealWidth = slotCount * this.idealSlotSpacing + this.arrowPad * 2;
    this.skillPanelWidth = Math.min(idealWidth, this.maxPanelWidth());
    this.skillPanelLeft = this.layoutScreenWidth / 2 - this.skillPanelWidth / 2;

    const innerWidth = this.skillPanelWidth - this.arrowPad * 2;
    this.skillSlotSpacing = innerWidth / slotCount;

    const panelHeight = this.panelPadTop + this.skillBtnSize + this.panelPadBottom;
    this.skillBarTop = this.layoutScreenHeight - panelHeight - 50;
    this.skillBarBottom = this.skillBarTop + panelHeight;
  }

  private redrawPanel(): void {
    if (!this.skillPanelBg) return;
    const panelHeight = this.skillBarBottom - this.skillBarTop;
    // NineSlice keeps corner caps fixed; only the center stretches with width.
    this.skillPanelBg
      .setPosition(
        this.skillPanelLeft + this.skillPanelWidth / 2,
        this.skillBarTop + panelHeight / 2
      )
      .setSize(this.skillPanelWidth, panelHeight);
  }

  private updateTrackMask(): void {
    if (!this.skillTrackMask) return;
    const windowWidth = this.skillSlotSpacing * this.displayedSlotCount();
    const windowHeight = this.skillBtnSize + 8;
    this.skillTrackMask.clear();
    this.skillTrackMask.setPosition(this.layoutScreenWidth / 2, this.skillTrackCenterY);
    this.skillTrackMask.fillStyle(0xffffff, 1);
    this.skillTrackMask.fillRect(-windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight);
  }

  private repositionNav(): void {
    const leftX = this.skillPanelLeft + this.arrowInset;
    const rightX = this.skillPanelLeft + this.skillPanelWidth - this.arrowInset;

    this.skillLeftArrow?.setPosition(leftX, this.skillTrackCenterY);
    this.skillRightArrow?.setPosition(rightX, this.skillTrackCenterY);
    this.skillLeftArrowZone?.setPosition(leftX, this.skillTrackCenterY);
    this.skillRightArrowZone?.setPosition(rightX, this.skillTrackCenterY);
  }

  private relayoutForContent(): void {
    if (!this.layoutScreenWidth) return;
    this.layoutPanelMetrics();
    this.redrawPanel();
    this.updateTrackMask();
    this.repositionNav();
    this.skillHint?.setPosition(this.layoutScreenWidth / 2, this.skillBarTop - 12);
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

  private bindNavZone(zone: Phaser.GameObjects.Zone, delta: number): void {
    zone.on('pointerdown', () => {
      this.skillNavConsumed = true;
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
    this.relayoutForContent();

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

    this.skillPanelBg?.setVisible(shouldShow);
    this.skillTrack?.setVisible(shouldShow);
    this.skillHint?.setVisible(shouldShow);

    if (!shouldShow) {
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
      background: { key: SKILL_ICONS[id], fit: 'contain' },
      // Instant skills play their own SFX — skip the default button pop.
      sound: id === 'boost_extra_time' ? false : 'pop',
      badge: {
        content: String(qty),
        visible: true,
        position: { x: btnSize - 30, y: btnSize - 30 },
        minSize: { width: 28, height: 28 },
        padding: { horizontal: 4, vertical: 2 },
        background: { color: '#e53935', radius: 14 },
        textStyle: {
          fontSize: 14,
          fontStyle: 'bold',
          color: '#ffffff',
          border: { width: 2, color: '#000000' },
        },
      },
      onClick: () => {
        if (this.skillNavConsumed) return;
        this.callbacks.onSkillPressed(id);
      },
    });
    slot.add(button);
    this.skillButtons.set(id, button);
    this.skillSlots.set(id, slot);

    return slot;
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
