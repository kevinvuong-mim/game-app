import Phaser from 'phaser';

import {
  TOGGLE_WIDTH,
  ROW_ICON_SIZE,
  SECTION_TITLE_COLOR,
  createSettingsToggle,
} from './settingsShared';
import { TEXT_COLOR } from '../panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { settings } from '@platform/modules/settings';
import { t } from '@platform/modules/i18n/i18n.service';
import { soundManager } from '@platform/ui/audio/SoundManager';

export class SettingsAudioSection {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container
  ) {}

  build(left: number, right: number, startY: number): number {
    let y = startY;
    const current = settings.getSettings();

    this.parent.add(
      this.scene.add
        .text(left, y, t('settings.sound').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 40;

    y = this.buildAudioRow(
      left,
      right,
      y,
      'musical-note-icon',
      t('settings.music'),
      current.musicEnabled,
      async (enabled) => {
        await settings.setMusicEnabled(enabled);
        soundManager.syncMusic();
      }
    );
    y += 8;

    y = this.buildAudioRow(
      left,
      right,
      y,
      'speaker-icon',
      t('settings.soundEffects'),
      current.soundEnabled,
      async (enabled) => {
        await settings.setSoundEnabled(enabled);
      }
    );

    return y;
  }

  private buildAudioRow(
    left: number,
    right: number,
    y: number,
    iconKey: string,
    label: string,
    enabled: boolean,
    onToggle: (enabled: boolean) => void | Promise<void>
  ): number {
    const rowHeight = 48;
    const centerY = y + rowHeight / 2;

    const icon = this.scene.add.image(left + ROW_ICON_SIZE / 2, centerY, iconKey);
    icon.setDisplaySize(ROW_ICON_SIZE, ROW_ICON_SIZE);
    this.parent.add(icon);

    this.parent.add(
      this.scene.add
        .text(left + ROW_ICON_SIZE + 12, centerY, label, {
          fontSize: '20px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0.5)
    );

    this.parent.add(
      createSettingsToggle(this.scene, right - TOGGLE_WIDTH / 2, centerY, {
        initial: enabled,
        onChange: (next) => {
          void onToggle(next);
        },
      })
    );

    return y + rowHeight;
  }
}
