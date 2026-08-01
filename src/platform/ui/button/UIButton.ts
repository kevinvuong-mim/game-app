import Phaser from 'phaser';

import type {
  UIButton,
  UIButtonIcon,
  UIButtonSize,
  UIButtonText,
  UIButtonBadge,
  UIButtonSound,
  UIButtonOptions,
  UIButtonTextStyle,
} from '../types';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { soundManager } from '@platform/ui/audio/SoundManager';

export const UIButtonBackgroundKey = {
  Primary: '__ui-button-primary',
  Rounded: '__ui-button-rounded',
  Spinner: '__ui-button-spinner',
} as const;

const SPINNER_SIZE = 28;
const PRESS_SCALE = 0.95;
const SPINNER_ROTATE_MS = 750;
const DEFAULT_SIZE: UIButtonSize = { height: 50, width: 200 };

function applyTextStyle(textObject: Phaser.GameObjects.Text, style?: UIButtonTextStyle): void {
  const fontSize = style?.fontSize !== undefined ? `${style.fontSize}px` : '20px';
  const fontFamily = style?.fontFamily ?? FREDOKA_FONT;

  textObject.setColor(style?.color ?? '#ffffff');
  textObject.setFontSize(fontSize);
  textObject.setFontFamily(fontFamily);

  if (style?.fontStyle !== undefined) {
    textObject.setFontStyle(style.fontStyle);
  }

  const borderColor = style?.border?.color ?? style?.stroke;
  const borderWidth = style?.border?.width ?? style?.strokeThickness ?? 0;

  if (borderColor !== undefined && borderWidth > 0) {
    textObject.setStroke(borderColor, borderWidth);
  }
}

function ensureDefaultButtonTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(UIButtonBackgroundKey.Primary)) {
    const width = DEFAULT_SIZE.width;
    const height = DEFAULT_SIZE.height;
    const graphics = scene.add.graphics();

    graphics.fillStyle(0x4a90d9, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.strokeRect(0, 0, width, height);
    graphics.generateTexture(UIButtonBackgroundKey.Primary, width, height);
    graphics.destroy();
  }

  if (!scene.textures.exists(UIButtonBackgroundKey.Rounded)) {
    const width = DEFAULT_SIZE.width;
    const height = DEFAULT_SIZE.height;
    const radius = 16;
    const graphics = scene.add.graphics();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(0, 0, width, height, radius);
    graphics.fillStyle(0x4a90d9, 1);
    graphics.fillRoundedRect(2, 2, width - 4, height - 4, radius - 2);
    graphics.generateTexture(UIButtonBackgroundKey.Rounded, width, height);
    graphics.destroy();
  }

  if (!scene.textures.exists(UIButtonBackgroundKey.Spinner)) {
    const size = SPINNER_SIZE;
    const center = size / 2;
    const radius = size / 2 - 3;
    const graphics = scene.add.graphics();

    graphics.lineStyle(4, 0x000000, 0.35);
    graphics.beginPath();
    graphics.arc(center, center, radius, 0, Math.PI * 2);
    graphics.strokePath();

    graphics.lineStyle(4, 0xffffff, 1);
    graphics.beginPath();
    graphics.arc(center, center, radius, -Math.PI * 0.15, Math.PI * 1.15);
    graphics.strokePath();

    graphics.generateTexture(UIButtonBackgroundKey.Spinner, size, size);
    graphics.destroy();
  }
}

function getButtonLayout(options: UIButtonOptions): {
  width: number;
  height: number;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
} {
  const width = options.size?.width ?? DEFAULT_SIZE.width;
  const height = options.size?.height ?? DEFAULT_SIZE.height;
  const originX = options.origin?.x ?? 0.5;
  const originY = options.origin?.y ?? 0.5;

  return {
    width,
    height,
    originX,
    originY,
    offsetX: -width * originX,
    offsetY: -height * originY,
  };
}

function addButtonText(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  text: UIButtonText,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): Phaser.GameObjects.Text {
  const x = offsetX + (text.offset?.x ?? width / 2);
  const y = offsetY + (text.offset?.y ?? height / 2);
  const textObject = scene.add.text(x, y, text.content);
  applyTextStyle(textObject, text.style);
  textObject.setOrigin(0.5);
  container.add(textObject);
  return textObject;
}

function addButtonIcon(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  icon: UIButtonIcon,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): Phaser.GameObjects.Image {
  const x = offsetX + (icon.offset?.x ?? width / 2);
  const y = offsetY + (icon.offset?.y ?? height / 2);
  const iconObject = scene.add.image(x, y, icon.key);

  if (icon.size) {
    iconObject.setDisplaySize(icon.size.width, icon.size.height);
  }

  iconObject.setOrigin(0.5);
  container.add(iconObject);
  return iconObject;
}

function measureBadge(
  textObject: Phaser.GameObjects.Text,
  badge: UIButtonBadge
): { width: number; height: number } {
  const paddingH = badge.padding?.horizontal ?? 8;
  const paddingV = badge.padding?.vertical ?? 4;
  const minWidth = badge.minSize?.width ?? 0;
  const minHeight = badge.minSize?.height ?? 0;

  return {
    width: Math.max(textObject.width + paddingH * 2, minWidth),
    height: Math.max(textObject.height + paddingV * 2, minHeight),
  };
}

function toColorNumber(color: string): number {
  return Phaser.Display.Color.ValueToColor(color).color;
}

function drawBadgeBackground(
  background: Phaser.GameObjects.Graphics,
  badge: UIButtonBadge,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  background.clear();

  if (!badge.background) return;

  const radius = badge.background.radius ?? height / 2;

  background.fillStyle(toColorNumber(badge.background.color), 1);
  background.fillRoundedRect(x, y, width, height, radius);

  if (badge.background.border) {
    background.lineStyle(
      badge.background.border.width,
      toColorNumber(badge.background.border.color),
      1
    );
    background.strokeRoundedRect(x, y, width, height, radius);
  }
}

function addButtonBadge(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  badge: UIButtonBadge,
  offsetX: number,
  offsetY: number
): { textObject: Phaser.GameObjects.Text; background?: Phaser.GameObjects.Graphics } {
  const content = badge.content ?? '';
  const textObject = scene.add.text(0, 0, content);
  applyTextStyle(textObject, badge.textStyle);
  textObject.setOrigin(0.5);

  const { width: badgeWidth, height: badgeHeight } = measureBadge(textObject, badge);
  const badgeX = offsetX + (badge.position?.x ?? 0);
  const badgeY = offsetY + (badge.position?.y ?? 0);

  let background: Phaser.GameObjects.Graphics | undefined;
  if (badge.background) {
    background = scene.add.graphics();
    drawBadgeBackground(background, badge, badgeX, badgeY, badgeWidth, badgeHeight);

    if (badge.depth !== undefined) {
      background.setDepth(badge.depth);
    }

    container.add(background);
  }

  textObject.setPosition(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

  if (badge.depth !== undefined) {
    textObject.setDepth(badge.depth);
  }

  const visible = badge.visible !== false;
  textObject.setVisible(visible);
  background?.setVisible(visible);

  container.add(textObject);

  return { textObject, background };
}

function bindButtonInteractions(
  scene: Phaser.Scene,
  inputTarget: Phaser.GameObjects.GameObject,
  visualTarget: Phaser.GameObjects.GameObject,
  onClick?: () => void,
  sound: UIButtonSound = 'pop'
): void {
  let isPressed = false;

  const release = (shouldClick: boolean) => {
    if (!isPressed) return;
    isPressed = false;
    if (shouldClick) {
      onClick?.();
    }
    scene.tweens.killTweensOf(visualTarget);
    scene.tweens.add({
      targets: visualTarget,
      scale: 1,
      duration: 100,
      ease: 'Back.easeOut',
    });
  };

  inputTarget.on('pointerdown', () => {
    if (sound === 'pop') {
      soundManager.playPop();
    } else if (sound === 'coin-drop') {
      soundManager.playCoinDrop();
    }

    isPressed = true;
    scene.tweens.killTweensOf(visualTarget);
    scene.tweens.add({
      targets: visualTarget,
      scale: PRESS_SCALE,
      duration: 80,
      ease: 'Power2',
    });
  });

  inputTarget.on('pointerup', () => release(true));
  inputTarget.on('pointerout', () => release(false));
}

function createHitZone(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): Phaser.GameObjects.Zone {
  const hitZone = scene.add.zone(offsetX + width / 2, offsetY + height / 2, width, height);
  hitZone.setInteractive({ useHandCursor: true });
  container.add(hitZone);
  return hitZone;
}

export function createUIButton(options: UIButtonOptions): UIButton {
  const { scene, position, background, text, icon, badge, depth, disabled, onClick, sound } =
    options;

  ensureDefaultButtonTextures(scene);

  const { width, height, offsetX, offsetY } = getButtonLayout(options);
  const container = scene.add.container(position.x, position.y) as UIButton;

  if (depth !== undefined) {
    container.setDepth(depth);
  }

  const backgroundImage = scene.add.image(
    offsetX + width / 2,
    offsetY + height / 2,
    background.key
  );
  backgroundImage.setDisplaySize(width, height);
  container.add(backgroundImage);

  const textObject = text
    ? addButtonText(scene, container, text, offsetX, offsetY, width, height)
    : undefined;

  const iconObject = icon
    ? addButtonIcon(scene, container, icon, offsetX, offsetY, width, height)
    : undefined;

  const badgeParts = badge ? addButtonBadge(scene, container, badge, offsetX, offsetY) : undefined;

  let hitZone: Phaser.GameObjects.Zone | undefined;
  let enabled = !disabled;
  let loading = false;
  let spinner: Phaser.GameObjects.Image | undefined;
  let spinnerTween: Phaser.Tweens.Tween | undefined;

  const ensureInteractive = () => {
    if (!hitZone) {
      hitZone = createHitZone(scene, container, offsetX, offsetY, width, height);
      bindButtonInteractions(scene, hitZone, container, onClick, sound);
    } else {
      hitZone.setInteractive({ useHandCursor: true });
    }
  };

  const disableInteractive = () => {
    hitZone?.disableInteractive();
    scene.tweens.killTweensOf(container);
    container.setScale(1);
  };

  const ensureSpinner = () => {
    if (spinner) return spinner;

    spinner = scene.add.image(
      offsetX + width / 2,
      offsetY + height / 2,
      UIButtonBackgroundKey.Spinner
    );
    spinner.setDisplaySize(SPINNER_SIZE, SPINNER_SIZE);
    spinner.setVisible(false);
    container.add(spinner);
    return spinner;
  };

  const stopSpinner = () => {
    if (spinnerTween) {
      spinnerTween.stop();
      spinnerTween = undefined;
    }
    if (spinner) {
      scene.tweens.killTweensOf(spinner);
      spinner.setAngle(0);
      spinner.setVisible(false);
    }
  };

  if (enabled) {
    ensureInteractive();
  } else {
    container.setAlpha(0.5);
  }

  container.setEnabled = (nextEnabled: boolean) => {
    if (nextEnabled === enabled) return;
    enabled = nextEnabled;

    if (loading) return;

    if (enabled) {
      container.setAlpha(1);
      ensureInteractive();
      return;
    }

    disableInteractive();
    container.setAlpha(0.5);
  };

  container.setLoading = (nextLoading: boolean) => {
    if (nextLoading === loading) return;
    loading = nextLoading;

    if (loading) {
      textObject?.setVisible(false);
      iconObject?.setVisible(false);
      disableInteractive();
      container.setAlpha(1);

      const spinnerImage = ensureSpinner();
      spinnerImage.setAngle(0);
      spinnerImage.setVisible(true);
      scene.tweens.killTweensOf(spinnerImage);
      spinnerTween = scene.tweens.add({
        targets: spinnerImage,
        angle: '+=360',
        duration: SPINNER_ROTATE_MS,
        repeat: -1,
        ease: 'Linear',
      });
      return;
    }

    stopSpinner();
    textObject?.setVisible(true);
    iconObject?.setVisible(true);

    if (enabled) {
      container.setAlpha(1);
      ensureInteractive();
      return;
    }

    container.setAlpha(0.5);
  };

  container.setText = (content: string) => {
    if (!textObject) return;
    textObject.setText(content);
  };

  container.setBadgeContent = (content: string) => {
    if (!badgeParts || !badge) return;

    badgeParts.textObject.setText(content);

    const { width: badgeWidth, height: badgeHeight } = measureBadge(badgeParts.textObject, badge);
    const badgeX = offsetX + (badge.position?.x ?? 0);
    const badgeY = offsetY + (badge.position?.y ?? 0);

    badgeParts.textObject.setPosition(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

    if (badgeParts.background) {
      drawBadgeBackground(badgeParts.background, badge, badgeX, badgeY, badgeWidth, badgeHeight);
    }
  };

  container.setBadgeVisible = (visible: boolean) => {
    if (!badgeParts) return;
    badgeParts.textObject.setVisible(visible);
    badgeParts.background?.setVisible(visible);
  };

  return container;
}
