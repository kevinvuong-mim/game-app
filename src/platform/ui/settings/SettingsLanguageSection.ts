import Phaser from 'phaser';

import { TEXT_COLOR } from '../panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '../panel/graphics';
import type { ToastOptions } from '../types';
import { t, i18n } from '@platform/modules/i18n/i18n.service';
import { settings } from '@platform/modules/settings';
import { SECTION_TITLE_COLOR, DIVIDER_COLOR } from './settingsShared';

const LANGUAGE_GLOBE_KEY = 'language-globe-icon';
const LANGUAGES = [
  { code: 'en', labelKey: 'settings.languageEn' as const },
  { code: 'vi', labelKey: 'settings.languageVi' as const },
] as const;

export class SettingsLanguageSection {
  private disposed = false;
  private languageOpen = false;
  private languageMenu?: Phaser.GameObjects.Container;
  private languageLabel?: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly helpers: {
      endNameEdit: () => void;
      scheduleDestroy: (target?: Phaser.GameObjects.GameObject) => void;
      restartThenShowToast: (options: ToastOptions) => void;
    }
  ) {}

  cleanup(): void {
    this.disposed = true;
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.languageLabel = undefined;
  }

  closeLanguageMenu(): void {
    const menu = this.languageMenu;
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
    const currentLabel = t(
      LANGUAGES.find((lang) => lang.code === currentCode)?.labelKey ?? 'settings.languageEn'
    );

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

  private toggleLanguageMenu(left: number, right: number, top: number): void {
    if (this.disposed) return;
    if (this.languageOpen) {
      this.closeLanguageMenu();
      return;
    }

    this.helpers.endNameEdit();
    this.languageOpen = true;
    const menuWidth = right - left;
    const rowHeight = 48;
    const menuHeight = LANGUAGES.length * rowHeight;
    const menu = this.scene.add.container(0, 0).setDepth(20);

    const bg = this.scene.add.graphics();
    drawRoundedRect(bg, left, top, menuWidth, menuHeight, 12, 0xffffff, DIVIDER_COLOR, 2);
    menu.add(bg);

    LANGUAGES.forEach((lang, index) => {
      const rowY = top + rowHeight * index + rowHeight / 2;
      const active = i18n.getCurrentLanguage() === lang.code;
      const label = t(lang.labelKey);

      const rowHit = this.scene.add
        .rectangle(left + menuWidth / 2, rowY, menuWidth, rowHeight, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      menu.add(rowHit);

      menu.add(
        this.scene.add
          .text(left + 20, rowY, active ? `${label} ✓` : label, {
            fontSize: '18px',
            fontStyle: 'bold',
            color: TEXT_COLOR,
            fontFamily: FREDOKA_FONT,
          })
          .setOrigin(0, 0.5)
      );

      rowHit.on('pointerdown', () => {
        void (async () => {
          this.closeLanguageMenu();
          if (active || this.disposed) return;
          await settings.setLanguage(lang.code);
          if (this.disposed || !this.scene.sys.isActive()) return;
          this.helpers.restartThenShowToast({ message: label, type: 'success', duration: 1500 });
        })();
      });
    });

    this.languageMenu = menu;
    this.parent.add(menu);
  }
}
