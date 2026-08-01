import Phaser from 'phaser';

import { soundManager } from '@platform/ui/audio/SoundManager';

export const DIVIDER_GAP = 30;
export const TOGGLE_KNOB = 14;
export const TOGGLE_WIDTH = 72;
export const TOGGLE_HEIGHT = 36;
export const ROW_ICON_SIZE = 36;
export const TOGGLE_ON = 0x1f6b32;
export const TOGGLE_OFF = 0x8a8a8a;
export const INPUT_TEXT = '#1c1b18';
export const LABEL_COLOR = '#3a372f';
export const DIVIDER_COLOR = 0xb5974f;
export const TOGGLE_LOCKED_ALPHA = 0.45;
export const SECTION_TITLE_COLOR = '#1c1b18';
export const REMOVE_ADS_ITEM_ID = 'remove_ads';

export interface SettingsToggle extends Phaser.GameObjects.Container {
  setEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
}

export function createSettingsToggle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: {
    initial: boolean;
    locked?: boolean;
    onChange: (enabled: boolean) => void;
    onLockedTap?: () => void;
  }
): SettingsToggle {
  let enabled = options.initial;
  let locked = !!options.locked;
  const container = scene.add.container(x, y) as SettingsToggle;
  const track = scene.add.graphics();
  const knob = scene.add.circle(0, 0, TOGGLE_KNOB, 0xffffff);
  knob.setStrokeStyle(2, 0xdfe8df);

  const draw = (): void => {
    track.clear();
    track.fillStyle(enabled ? TOGGLE_ON : TOGGLE_OFF, 1);
    track.fillRoundedRect(
      -TOGGLE_WIDTH / 2,
      -TOGGLE_HEIGHT / 2,
      TOGGLE_WIDTH,
      TOGGLE_HEIGHT,
      TOGGLE_HEIGHT / 2
    );
    track.lineStyle(2, enabled ? 0x145024 : 0x6e6e6e, 1);
    track.strokeRoundedRect(
      -TOGGLE_WIDTH / 2,
      -TOGGLE_HEIGHT / 2,
      TOGGLE_WIDTH,
      TOGGLE_HEIGHT,
      TOGGLE_HEIGHT / 2
    );

    const knobX = enabled
      ? TOGGLE_WIDTH / 2 - TOGGLE_KNOB - 4
      : -TOGGLE_WIDTH / 2 + TOGGLE_KNOB + 4;
    knob.setPosition(knobX, 0);
  };

  const applyLockedVisual = (): void => {
    container.setAlpha(locked ? TOGGLE_LOCKED_ALPHA : 1);
  };

  draw();
  applyLockedVisual();
  container.add([track, knob]);

  const hit = scene.add
    .rectangle(0, 0, TOGGLE_WIDTH + 8, TOGGLE_HEIGHT + 8, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => {
    soundManager.playPop();
    if (locked) {
      options.onLockedTap?.();
      return;
    }
    enabled = !enabled;
    draw();
    options.onChange(enabled);
  });
  container.add(hit);

  container.setEnabled = (next: boolean) => {
    enabled = next;
    draw();
  };
  container.setLocked = (next: boolean) => {
    locked = next;
    applyLockedVisual();
  };

  return container;
}
