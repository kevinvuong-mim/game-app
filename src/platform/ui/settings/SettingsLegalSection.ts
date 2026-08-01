import Phaser from 'phaser';

import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { SECTION_TITLE_COLOR } from './settingsShared';
import { t } from '@platform/modules/i18n/i18n.service';

const LEGAL_BTN_GAP = 12;
const LEGAL_BTN_HEIGHT = 78;

export class SettingsLegalSection {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly navigateTo: (sceneKey: string, data?: Record<string, unknown>) => void
  ) {}

  build(left: number, right: number, contentWidth: number, startY: number): number {
    let y = startY;

    this.parent.add(
      this.scene.add
        .text(left, y, t('settings.termsPrivacy').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 36;

    const btnWidth = (contentWidth - LEGAL_BTN_GAP) / 2;
    const centerY = y + LEGAL_BTN_HEIGHT / 2;

    this.parent.add(
      createUIButton({
        scene: this.scene,
        position: { x: left + btnWidth / 2, y: centerY },
        size: { width: btnWidth, height: LEGAL_BTN_HEIGHT },
        background: { key: 'leaderboard-button-background' },
        text: {
          content: t('settings.terms').toUpperCase(),
          style: {
            fontSize: 18,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => this.navigateTo('Legal', { tab: 'terms' }),
      })
    );

    this.parent.add(
      createUIButton({
        scene: this.scene,
        position: { x: right - btnWidth / 2, y: centerY },
        size: { width: btnWidth, height: LEGAL_BTN_HEIGHT },
        background: { key: 'leaderboard-button-background' },
        text: {
          content: t('settings.privacy').toUpperCase(),
          style: {
            fontSize: 18,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => this.navigateTo('Legal', { tab: 'privacy' }),
      })
    );

    return y + LEGAL_BTN_HEIGHT;
  }
}
