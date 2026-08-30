import Phaser from 'phaser';

import type { ToastOptions } from '../types';
import {
  t,
  i18n,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NATIVE_NAMES,
} from '@platform/modules/i18n/i18n.service';
import { TEXT_COLOR } from '../panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '../panel/graphics';
import { settings } from '@platform/modules/settings';
import { DIVIDER_COLOR, SECTION_TITLE_COLOR } from './settingsShared';

const LANGUAGE_GLOBE_KEY = 'language-globe-icon';
const LANGUAGES = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  nativeName: LANGUAGE_NATIVE_NAMES[code],
}));

const ROW_HEIGHT = 44;
const DRAG_THRESHOLD = 8;
const MENU_CORNER_RADIUS = 12;
const VISIBLE_LANGUAGE_COUNT = 5;

export class SettingsLanguageSection {
  private readonly wheelHandler: (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number
  ) => void;

  private menuTop = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private listBaseY = 0;
  private disposed = false;
  private languageOpen = false;
  private languageLabel?: Phaser.GameObjects.Text;
  private languageMenu?: Phaser.GameObjects.Container;
  private languageList?: Phaser.GameObjects.Container;
  private languageHitArea?: Phaser.GameObjects.Rectangle;
  private languageMaskShape?: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly helpers: {
      endNameEdit: () => void;
      scheduleDestroy: (target?: Phaser.GameObjects.GameObject) => void;
      restartThenShowToast: (options: ToastOptions) => void;
    }
  ) {
    this.wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.languageOpen || !this.languageHitArea) return;
      if (!this.languageHitArea.getBounds().contains(pointer.x, pointer.y)) return;
      this.setScroll(this.scrollY + deltaY * 0.5);
    };
  }

  cleanup(): void {
    this.disposed = true;
    this.teardownMenu();
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.languageLabel = undefined;
  }

  closeLanguageMenu(): void {
    const menu = this.languageMenu;
    this.teardownMenu();
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.helpers.scheduleDestroy(menu);
  }

  build(left: number, right: number, contentWidth: number, startY: number): number {
    let y = startY;

    this.parent.add(
      this.scene.add
        .text(left, y, t('settings.language').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 36;

    const dropdownHeight = 52;
    const centerX = (left + right) / 2;
    const centerY = y + dropdownHeight / 2;

    const bg = this.scene.add.graphics();
    drawRoundedRect(bg, left, y, contentWidth, dropdownHeight, 12, 0xffffff, DIVIDER_COLOR, 2);
    this.parent.add(bg);

    const globe = this.scene.add.image(left + 28, centerY, LANGUAGE_GLOBE_KEY);
    globe.setDisplaySize(28, 28);
    this.parent.add(globe);

    const currentCode = i18n.getCurrentLanguage();
    const currentLabel =
      LANGUAGES.find((lang) => lang.code === currentCode)?.nativeName ?? LANGUAGE_NATIVE_NAMES.en;

    this.languageLabel = this.scene.add
      .text(left + 56, centerY, currentLabel, {
        fontSize: '20px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0, 0.5);
    this.parent.add(this.languageLabel);

    const chevron = this.scene.add.graphics();
    chevron.fillStyle(0x1c1b18, 1);
    chevron.fillTriangle(right - 28, centerY - 4, right - 16, centerY - 4, right - 22, centerY + 6);
    this.parent.add(chevron);

    const hit = this.scene.add
      .rectangle(centerX, centerY, contentWidth, dropdownHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.toggleLanguageMenu(left, right, y + dropdownHeight + 4));
    this.parent.add(hit);

    return y + dropdownHeight;
  }

  private teardownMenu(): void {
    this.scene?.input?.off('wheel', this.wheelHandler);
    this.languageList?.clearMask(true);
    this.languageMaskShape?.destroy();
    this.languageMaskShape = undefined;
    this.languageList = undefined;
    this.languageHitArea = undefined;
    this.scrollY = 0;
    this.maxScroll = 0;
  }

  private toggleLanguageMenu(left: number, right: number, top: number): void {
    if (this.disposed) return;
    if (this.languageOpen) {
      this.closeLanguageMenu();
      return;
    }

    this.helpers.endNameEdit();
    this.languageOpen = true;

    const menuWidth = right - left;
    const visibleCount = Math.min(VISIBLE_LANGUAGE_COUNT, LANGUAGES.length);
    const visibleHeight = visibleCount * ROW_HEIGHT;
    const contentHeight = LANGUAGES.length * ROW_HEIGHT;
    this.menuTop = top;
    this.listBaseY = top;
    this.maxScroll = Math.max(0, contentHeight - visibleHeight);

    const menu = this.scene.add.container(0, 0).setDepth(20);

    const bg = this.scene.add.graphics();
    drawRoundedRect(
      bg,
      left,
      top,
      menuWidth,
      visibleHeight,
      MENU_CORNER_RADIUS,
      0xffffff,
      DIVIDER_COLOR,
      2
    );
    menu.add(bg);

    this.languageMaskShape = this.scene.make.graphics({}, false);
    this.languageMaskShape.fillStyle(0xffffff);
    this.languageMaskShape.fillRoundedRect(
      left + 2,
      top + 2,
      menuWidth - 4,
      visibleHeight - 4,
      MENU_CORNER_RADIUS - 2
    );
    const mask = this.languageMaskShape.createGeometryMask();

    this.languageList = this.scene.add.container(0, this.listBaseY);
    this.languageList.setMask(mask);
    menu.add(this.languageList);

    LANGUAGES.forEach((lang, index) => {
      const rowY = ROW_HEIGHT * index + ROW_HEIGHT / 2;
      const active = i18n.getCurrentLanguage() === lang.code;
      const label = lang.nativeName;

      this.languageList?.add(
        this.scene.add
          .text(left + 20, rowY, active ? `${label} ✓` : label, {
            fontSize: '18px',
            fontStyle: 'bold',
            color: TEXT_COLOR,
            fontFamily: FREDOKA_FONT,
          })
          .setOrigin(0, 0.5)
      );
    });

    this.languageHitArea = this.scene.add
      .rectangle(
        left + menuWidth / 2,
        top + visibleHeight / 2,
        menuWidth,
        visibleHeight,
        0x000000,
        0
      )
      .setInteractive({ useHandCursor: true });
    menu.add(this.languageHitArea);
    this.bindMenuScroll();

    this.scrollToCurrentLanguage();

    this.languageMenu = menu;
    this.parent.add(menu);
  }

  private bindMenuScroll(): void {
    let dragStartY = 0;
    let scrollStartY = 0;
    let dragged = false;

    this.languageHitArea?.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragStartY = pointer.y;
      scrollStartY = this.scrollY;
      dragged = false;
    });

    this.languageHitArea?.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const deltaY = dragStartY - pointer.y;
      if (Math.abs(deltaY) > DRAG_THRESHOLD) {
        dragged = true;
      }
      this.setScroll(scrollStartY + deltaY);
    });

    this.languageHitArea?.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (dragged || this.disposed) return;
      this.selectLanguageAt(pointer.y);
    });

    this.scene.input.on('wheel', this.wheelHandler);
  }

  private scrollToCurrentLanguage(): void {
    const currentIndex = LANGUAGES.findIndex((lang) => lang.code === i18n.getCurrentLanguage());
    if (currentIndex < 0) return;
    const visibleHeight = Math.min(VISIBLE_LANGUAGE_COUNT, LANGUAGES.length) * ROW_HEIGHT;
    this.setScroll((currentIndex + 1) * ROW_HEIGHT - visibleHeight);
  }

  private selectLanguageAt(pointerY: number): void {
    const localY = pointerY - this.menuTop + this.scrollY;
    const index = Math.floor(localY / ROW_HEIGHT);
    const lang = LANGUAGES[index];
    if (!lang) return;

    const active = i18n.getCurrentLanguage() === lang.code;
    this.closeLanguageMenu();
    if (active || this.disposed) return;

    void (async () => {
      await settings.setLanguage(lang.code);
      if (this.disposed || !this.scene.sys.isActive()) return;
      this.helpers.restartThenShowToast({
        message: lang.nativeName,
        type: 'success',
        duration: 1500,
      });
    })();
  }

  private setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.languageList?.setY(this.listBaseY - this.scrollY);
  }
}
