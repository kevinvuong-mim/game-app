import type Phaser from 'phaser';

export type UIButton = Phaser.GameObjects.Container & {
  setText(content: string): void;
  setEnabled(enabled: boolean): void;
  setBadgeContent(content: string): void;
  setBadgeVisible(visible: boolean): void;
};

export type UIToastType = 'info' | 'error' | 'success' | 'warning';

export type UIButtonSize = {
  width: number;
  height: number;
};

export type ToastPosition = 'top' | 'bottom';

export type UIButtonPosition = {
  x: number;
  y: number;
};

export type UIButtonTextStyle = {
  color?: string;
  stroke?: string;
  fontSize?: number;
  fontStyle?: string;
  fontFamily?: string;
  strokeThickness?: number;
  border?: { color: string; width: number };
};

export interface ToastOffset {
  x?: number;
  y?: number;
}

export interface UIButtonIcon {
  key: string;
  size?: UIButtonSize;
  /** Center position relative to the button's top-left corner. Defaults to the button center. */
  offset?: UIButtonPosition;
}

export interface UIButtonText {
  content: string;
  /** Center position relative to the button's top-left corner. Defaults to the button center. */
  offset?: UIButtonPosition;
  style?: UIButtonTextStyle;
}

export interface ToastOptions {
  message: string;
  duration?: number;
  type?: UIToastType;
  offset?: ToastOffset;
  position?: ToastPosition;
}

export interface UIButtonBadge {
  depth?: number;
  content?: string;
  visible?: boolean;
  minSize?: {
    width?: number;
    height?: number;
  };
  background?: {
    color: string;
    radius?: number;
    border?: {
      color: string;
      width: number;
    };
  };
  /** Top-left position relative to the button's top-left corner. */
  position?: UIButtonPosition;
  padding?: {
    vertical: number;
    horizontal: number;
  };
  textStyle?: UIButtonTextStyle;
}

export type UIButtonSound = 'pop' | 'coin-drop' | false;

export interface UIButtonOptions {
  origin?: {
    x: number;
    y: number;
  };
  background: {
    key: string;
  };
  depth?: number;
  disabled?: boolean;
  icon?: UIButtonIcon;
  scene: Phaser.Scene;
  size?: UIButtonSize;
  text?: UIButtonText;
  onClick?: () => void;
  sound?: UIButtonSound;
  badge?: UIButtonBadge;
  position: UIButtonPosition;
}
