import Phaser from 'phaser';

import {
  PANEL_BG,
  PANEL_BORDER,
  PANEL_LIST_PADDING,
  PANEL_CORNER_RADIUS,
} from '../panel/panelTheme';
import { gameConfig } from '@game/config';
import type { ToastOptions } from '../types';
import { toast } from '../toast/ToastManager';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { drawRoundedRect } from '../panel/graphics';
import { t } from '@platform/modules/i18n/i18n.service';
import { SettingsAdsSection } from './SettingsAdsSection';
import { IAP_EVENTS } from '@platform/modules/iap/iap.events';
import { SettingsAudioSection } from './SettingsAudioSection';
import { SettingsLegalSection } from './SettingsLegalSection';
import { SettingsProfileSection } from './SettingsProfileSection';
import { SettingsLanguageSection } from './SettingsLanguageSection';
import { DIVIDER_COLOR, DIVIDER_GAP, LABEL_COLOR } from './settingsShared';

/**
 * Settings UI — Shop-style beige panel matching the settings mock.
 * Orchestrates section modules; section files own their UI and interactions.
 */
export class SettingsPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly eventUnsubscribers: Array<() => void> = [];
  private readonly onNavigate: (sceneKey: string, data?: Record<string, unknown>) => void;

  private disposed = false;
  private adsSection?: SettingsAdsSection;
  private profileSection?: SettingsProfileSection;
  private languageSection?: SettingsLanguageSection;

  constructor(
    scene: Phaser.Scene,
    options: {
      onBack: () => void;
      onNavigate: (sceneKey: string, data?: Record<string, unknown>) => void;
    }
  ) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.onNavigate = options.onNavigate;
    scene.add.existing(this);
    this.build();
    this.bindIapUi();
  }

  destroy(fromScene?: boolean): void {
    this.cleanup();
    super.destroy(fromScene);
  }

  private cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const unsub of this.eventUnsubscribers) unsub();
    this.eventUnsubscribers.length = 0;

    this.profileSection?.cleanup();
    this.adsSection?.cleanup();
    this.languageSection?.cleanup();
    this.profileSection = undefined;
    this.adsSection = undefined;
    this.languageSection = undefined;
  }

  private bindIapUi(): void {
    this.eventUnsubscribers.push(
      eventBus.on(IAP_EVENTS.ENTITLEMENT_CHANGED, () => {
        this.adsSection?.refreshHideAdsToggle();
      }),
      eventBus.on(IAP_EVENTS.PURCHASE_RESTORED, () => {
        this.adsSection?.refreshHideAdsToggle();
      })
    );
  }

  /**
   * Scene changes must not run inside the same pointer/render stack — destroying
   * Text/Canvas objects mid-frame causes `ctx.drawImage` on a null canvas context.
   */
  private deferSceneAction(action: () => void): void {
    if (this.disposed) return;
    const scene = this.scene;
    if (!scene?.sys?.isActive()) return;

    this.profileSection?.endNameEdit();
    this.languageSection?.closeLanguageMenu();
    this.adsSection?.hidePurchaseModal();

    scene.time.delayedCall(0, () => {
      if (!scene.sys.isActive()) return;
      action();
    });
  }

  private goBack(): void {
    this.deferSceneAction(() => this.onBack());
  }

  private navigateTo(sceneKey: string, data?: Record<string, unknown>): void {
    this.deferSceneAction(() => this.onNavigate(sceneKey, data));
  }

  /**
   * Phaser queues `scene.restart()` for the next step — a toast shown in the same tick
   * still lands on the old scene and is destroyed by SHUTDOWN. Wait for CREATE instead.
   */
  private restartThenShowToast(options: ToastOptions): void {
    const scene = this.scene;
    if (!scene?.sys?.isActive() || scene.scene.key !== 'Settings') {
      toast.show(options);
      return;
    }

    this.deferSceneAction(() => {
      if (!scene.sys.isActive() || scene.scene.key !== 'Settings') {
        toast.show(options);
        return;
      }

      scene.events.once(Phaser.Scenes.Events.CREATE, () => {
        toast.show(options);
      });
      scene.scene.restart();
    });
  }

  /** Destroy after the current input/render tick so hit targets aren't torn down mid-event. */
  private scheduleDestroy(target?: Phaser.GameObjects.GameObject): void {
    if (!target) return;
    const scene = this.scene;
    if (!scene?.sys?.isActive()) {
      if (target.scene) target.destroy(true);
      return;
    }
    scene.time.delayedCall(0, () => {
      if (target.scene) target.destroy(true);
    });
  }

  isPurchaseModalOpen(): boolean {
    return this.adsSection?.isPurchaseModalOpen() ?? false;
  }

  hidePurchaseModal(): void {
    this.adsSection?.hidePurchaseModal();
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(width * 0.94, 440);
    const panelTop = height * 0.22;
    const contentLeft = width / 2 - panelWidth / 2 + PANEL_LIST_PADDING + 8;
    const contentRight = width / 2 + panelWidth / 2 - PANEL_LIST_PADDING - 8;
    const contentWidth = contentRight - contentLeft;

    this.add(
      createUIButton({
        scene: this.scene,
        size: { width: 80, height: 80 },
        background: { key: 'back-icon' },
        onClick: () => this.goBack(),
        position: { x: width * 0.18, y: height * 0.08 },
      })
    );

    this.buildBanner(width, height);
    const panelInsertIndex = this.length;

    const sharedHelpers = {
      endNameEdit: () => this.profileSection?.endNameEdit(),
      closeLanguageMenu: () => this.languageSection?.closeLanguageMenu(),
      scheduleDestroy: (target?: Phaser.GameObjects.GameObject) => this.scheduleDestroy(target),
      restartThenShowToast: (options: ToastOptions) => this.restartThenShowToast(options),
    };

    this.profileSection = new SettingsProfileSection(this.scene, this, () =>
      this.isPurchaseModalOpen()
    );
    const audioSection = new SettingsAudioSection(this.scene, this);
    this.adsSection = new SettingsAdsSection(this.scene, this, sharedHelpers);
    this.languageSection = new SettingsLanguageSection(this.scene, this, sharedHelpers);
    const legalSection = new SettingsLegalSection(this.scene, this, (sceneKey, data) =>
      this.navigateTo(sceneKey, data)
    );

    let cursorY = panelTop + PANEL_LIST_PADDING + 8;

    cursorY = this.profileSection.build(contentLeft, contentRight, contentWidth, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = audioSection.build(contentLeft, contentRight, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.adsSection.build(contentLeft, contentRight, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.languageSection.build(contentLeft, contentRight, contentWidth, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = legalSection.build(contentLeft, contentRight, contentWidth, cursorY);
    cursorY = this.buildVersion(width / 2, cursorY + DIVIDER_GAP);

    const panelHeight = cursorY - panelTop + PANEL_LIST_PADDING + 16;
    const panel = this.scene.add.graphics();
    drawRoundedRect(
      panel,
      width / 2 - panelWidth / 2,
      panelTop,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
    this.addAt(panel, panelInsertIndex);
  }

  private buildBanner(width: number, height: number): void {
    const bannerY = height * 0.16;
    const banner = this.scene.add.image(width / 2, bannerY, 'shop-banner');
    const targetWidth = Math.min(width * 0.72, 360);
    const targetHeight = banner.height * (targetWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 14, t('settings.title').toUpperCase(), {
          fontSize: '42px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
  }

  private buildVersion(centerX: number, y: number): number {
    const label = t('settings.version', { version: gameConfig.version });
    const text = this.scene.add
      .text(centerX, y, label, {
        fontSize: '16px',
        color: LABEL_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.75);
    this.add(text);
    return y + text.height;
  }

  private addDivider(centerX: number, y: number, width: number): number {
    this.add(this.scene.add.rectangle(centerX, y, width * 0.92, 2, DIVIDER_COLOR, 0.45));
    return y;
  }
}
