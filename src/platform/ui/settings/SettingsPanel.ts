import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  PANEL_LIST_PADDING,
} from '../panel/panelTheme';
import { toast } from '../toast/ToastManager';
import { guest } from '@platform/modules/guest';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '../panel/graphics';
import type { UIButton, ToastOptions } from '../types';
import { createUIButton } from '../button/UIButton';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { t, i18n } from '@platform/modules/i18n/i18n.service';
import { settings } from '@platform/modules/settings';
import { shop } from '@platform/modules/shop';
import { ads } from '@platform/core/advertising';
import { iap } from '@platform/modules/iap';
import { REMOVE_ADS_PRICE } from '@platform/modules/iap/iap.config';
const LANGUAGE_GLOBE_KEY = 'language-globe-icon';
const NO_ADS_ICON_KEY = 'no-ads-icon';

const SECTION_TITLE_COLOR = '#1c1b18';
const LABEL_COLOR = '#3a372f';
const DIVIDER_COLOR = 0xb5974f;
const INPUT_TEXT = '#1c1b18';

const TOGGLE_WIDTH = 72;
const TOGGLE_HEIGHT = 36;
const TOGGLE_KNOB = 14;
const TOGGLE_ON = 0x1f6b32;
const TOGGLE_OFF = 0x8a8a8a;
const TOGGLE_LOCKED_ALPHA = 0.45;

const MAX_NAME_LENGTH = 32;
const SAVE_BTN_WIDTH = 100;
const SAVE_BTN_HEIGHT = 66;
const INPUT_HEIGHT = 58;
const LEGAL_BTN_HEIGHT = 78;
const LEGAL_BTN_GAP = 12;
const ROW_ICON_SIZE = 36;
const DIVIDER_GAP = 30;
const REMOVE_ADS_ITEM_ID = 'remove_ads';
const LANGUAGES = [
  { code: 'en', labelKey: 'settings.languageEn' as const },
  { code: 'vi', labelKey: 'settings.languageVi' as const },
] as const;

/**
 * Settings UI — Shop-style beige panel matching the settings mock.
 */
export class SettingsPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly onNavigate: (sceneKey: string, data?: Record<string, unknown>) => void;

  private disposed = false;
  private saving = false;
  private purchasingAds = false;
  private restoringPurchases = false;
  private languageOpen = false;
  private nameEditing = false;
  private draftName = '';
  private nameFieldText?: Phaser.GameObjects.Text;
  private nameCaret?: Phaser.GameObjects.Text;
  private nameCaretTimer?: Phaser.Time.TimerEvent;
  private focusCheckTimer?: Phaser.Time.TimerEvent;
  private editInput?: HTMLInputElement;
  private languageMenu?: Phaser.GameObjects.Container;
  private languageLabel?: Phaser.GameObjects.Text;
  private purchaseModal?: Phaser.GameObjects.Container;
  private buyAdsButton?: UIButton;

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
  }

  destroy(fromScene?: boolean): void {
    this.cleanup();
    super.destroy(fromScene);
  }

  private cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.focusCheckTimer?.remove(false);
    this.focusCheckTimer = undefined;
    this.stopCaretBlink();
    this.teardownNameEditInput();
    this.nameEditing = false;

    // Parent destroy will tear down children — clear refs so we don't double-destroy
    // interactive nodes mid-input (which nulls the canvas context Phaser still draws to).
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.purchaseModal = undefined;
    this.buyAdsButton = undefined;
    this.nameFieldText = undefined;
    this.nameCaret = undefined;
    this.languageLabel = undefined;
  }

  /**
   * Scene changes must not run inside the same pointer/render stack — destroying
   * Text/Canvas objects mid-frame causes `ctx.drawImage` on a null canvas context.
   */
  private deferSceneAction(action: () => void): void {
    if (this.disposed) return;
    const scene = this.scene;
    if (!scene?.sys?.isActive()) return;

    this.endNameEdit();
    this.scheduleDestroy(this.languageMenu);
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.scheduleDestroy(this.purchaseModal);
    this.purchaseModal = undefined;
    this.buyAdsButton = undefined;

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
    return !!this.purchaseModal?.visible;
  }

  hidePurchaseModal(): void {
    if (this.purchasingAds) return;
    const modal = this.purchaseModal;
    this.purchaseModal = undefined;
    this.buyAdsButton = undefined;
    this.scheduleDestroy(modal);
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

    let cursorY = panelTop + PANEL_LIST_PADDING + 8;

    cursorY = this.buildProfileSection(contentLeft, contentRight, contentWidth, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.buildAudioSection(contentLeft, contentRight, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.buildAdsSection(contentLeft, contentRight, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.buildLanguageSection(contentLeft, contentRight, contentWidth, cursorY);
    cursorY = this.addDivider(width / 2, cursorY + DIVIDER_GAP, contentWidth + 24) + DIVIDER_GAP;
    cursorY = this.buildLegalSection(contentLeft, contentRight, contentWidth, cursorY);

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

  private buildProfileSection(
    left: number,
    right: number,
    contentWidth: number,
    startY: number
  ): number {
    let y = startY;

    this.add(
      this.scene.add
        .text(left, y, t('settings.profile').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 34;

    this.add(
      this.scene.add
        .text(left, y, t('settings.playerName'), {
          fontSize: '16px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 28;

    const saveWidth = SAVE_BTN_WIDTH;
    const gap = 10;
    const fieldWidth = Math.max(140, contentWidth - saveWidth - gap);
    const rowCenterY = y + INPUT_HEIGHT / 2;

    this.draftName = guest.getName() ?? '';

    const nameField = this.scene.add.container(left + fieldWidth / 2, rowCenterY);
    const fieldBg = this.scene.add.graphics();
    drawRoundedRect(
      fieldBg,
      -fieldWidth / 2,
      -INPUT_HEIGHT / 2,
      fieldWidth,
      INPUT_HEIGHT,
      12,
      0xffffff,
      DIVIDER_COLOR,
      2
    );
    nameField.add(fieldBg);

    this.nameFieldText = this.scene.add
      .text(-fieldWidth / 2 + 14, 0, '', {
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        color: INPUT_TEXT,
      })
      .setOrigin(0, 0.5);
    nameField.add(this.nameFieldText);

    this.nameCaret = this.scene.add
      .text(0, 0, '|', {
        fontSize: '18px',
        fontStyle: 'bold',
        fontFamily: FREDOKA_FONT,
        color: INPUT_TEXT,
      })
      .setOrigin(0, 0.5)
      .setVisible(false);
    nameField.add(this.nameCaret);

    const hit = this.scene.add
      .rectangle(0, 0, fieldWidth, INPUT_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.beginNameEdit());
    nameField.add(hit);
    this.add(nameField);
    this.refreshNameFieldText();

    this.add(
      createUIButton({
        scene: this.scene,
        position: { x: right - saveWidth / 2, y: rowCenterY },
        size: { width: saveWidth, height: SAVE_BTN_HEIGHT },
        background: { key: 'leaderboard-button-background' },
        text: {
          content: t('settings.playerNameSave').toUpperCase(),
          style: {
            fontSize: 22,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        onClick: () => {
          void this.handleSave();
        },
      })
    );

    return y + INPUT_HEIGHT;
  }

  private refreshNameFieldText(): void {
    if (this.disposed || !this.nameFieldText?.active) return;

    const trimmed = this.draftName;
    const empty = trimmed.length === 0;
    this.nameFieldText.setColor(empty && !this.nameEditing ? LABEL_COLOR : INPUT_TEXT);
    this.nameFieldText.setText(
      empty && !this.nameEditing ? t('settings.playerNamePlaceholder') : trimmed
    );

    if (this.nameCaret?.active && this.nameFieldText) {
      const caretX = this.nameFieldText.x + this.nameFieldText.width + (empty ? 0 : 1);
      this.nameCaret.setPosition(caretX, 0);
    }
  }

  private beginNameEdit(): void {
    if (this.disposed || this.purchaseModal) return;
    if (this.nameEditing && this.editInput) return;
    // Recover if a previous focus attempt left editing stuck without an input.
    if (this.nameEditing && !this.editInput) {
      this.nameEditing = false;
      this.stopCaretBlink();
    }

    this.nameEditing = true;
    this.refreshNameFieldText();
    this.startCaretBlink();

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.value = this.draftName;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', t('settings.playerName'));
    // Off-canvas: opens the OS keyboard without drawing over Phaser UI.
    input.style.cssText = [
      'position: fixed',
      'left: 0',
      'top: 0',
      'width: 1px',
      'height: 1px',
      'opacity: 0',
      'border: 0',
      'padding: 0',
      'margin: 0',
      'pointer-events: none',
      'z-index: 0',
    ].join(';');

    const onInput = (): void => {
      if (this.disposed || this.editInput !== input) return;
      this.draftName = input.value.slice(0, MAX_NAME_LENGTH);
      this.refreshNameFieldText();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    };
    const onBlur = (): void => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      if (this.editInput === input) {
        this.endNameEdit();
      }
    };

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur);
    document.body.appendChild(input);
    this.editInput = input;
    input.focus({ preventScroll: true });

    this.focusCheckTimer?.remove(false);
    this.focusCheckTimer = this.scene.time.delayedCall(150, () => {
      this.focusCheckTimer = undefined;
      if (this.disposed || this.editInput !== input) return;
      if (document.activeElement !== input) {
        this.endNameEdit();
      }
    });
  }

  private teardownNameEditInput(): void {
    const input = this.editInput;
    this.editInput = undefined;
    if (input?.isConnected) {
      input.remove();
    }
  }

  private endNameEdit(): void {
    this.teardownNameEditInput();
    this.nameEditing = false;
    this.stopCaretBlink();
    if (!this.disposed) {
      this.refreshNameFieldText();
    }
  }

  private startCaretBlink(): void {
    this.stopCaretBlink();
    if (this.disposed || !this.scene?.sys?.isActive()) return;
    this.nameCaret?.setVisible(true);
    this.nameCaretTimer = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.disposed || !this.nameCaret?.active) return;
        this.nameCaret.setVisible(!this.nameCaret.visible);
      },
    });
  }

  private stopCaretBlink(): void {
    this.nameCaretTimer?.remove(false);
    this.nameCaretTimer = undefined;
    if (this.nameCaret?.active) {
      this.nameCaret.setVisible(false);
    }
  }

  private buildAudioSection(left: number, right: number, startY: number): number {
    let y = startY;
    const current = settings.getSettings();

    this.add(
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
    this.add(icon);

    this.add(
      this.scene.add
        .text(left + ROW_ICON_SIZE + 12, centerY, label, {
          fontSize: '20px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0.5)
    );

    this.add(
      createToggle(this.scene, right - TOGGLE_WIDTH / 2, centerY, {
        initial: enabled,
        onChange: (next) => {
          void onToggle(next);
        },
      })
    );

    return y + rowHeight + 8;
  }

  private buildAdsSection(left: number, right: number, startY: number): number {
    let y = startY;
    const hasRemoveAds = shop.isOwned(REMOVE_ADS_ITEM_ID);

    this.add(
      this.scene.add
        .text(left, y, t('settings.ads').toUpperCase(), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0)
    );
    y += 40;

    const rowHeight = 48;
    const centerY = y + rowHeight / 2;

    const icon = this.scene.add.image(left + ROW_ICON_SIZE / 2, centerY, NO_ADS_ICON_KEY);
    icon.setDisplaySize(ROW_ICON_SIZE, ROW_ICON_SIZE);
    this.add(icon);

    this.add(
      this.scene.add
        .text(left + ROW_ICON_SIZE + 12, centerY, t('settings.hideAds'), {
          fontSize: '20px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0, 0.5)
    );

    this.add(
      createToggle(this.scene, right - TOGGLE_WIDTH / 2, centerY, {
        initial: hasRemoveAds && ads.isAdsRemoved(),
        locked: !hasRemoveAds,
        onChange: (hideAds) => {
          ads.setAdsRemoved(hideAds);
        },
        onLockedTap: () => {
          this.showRemoveAdsPurchaseModal();
        },
      })
    );

    return y + rowHeight + 8;
  }

  private async restorePurchases(): Promise<void> {
    if (this.disposed || this.restoringPurchases || !iap.isEnabled()) return;
    this.restoringPurchases = true;

    toast.show({ message: t('settings.restoringPurchases'), type: 'info', duration: 2500 });

    try {
      const result = await iap.restore();
      if (!result.success) {
        toast.show({ message: t('settings.restorePurchasesFailed'), type: 'error' });
        return;
      }

      const restoredSomething = result.restoredEntitlements.length > 0;
      const restoreToast: ToastOptions = {
        type: restoredSomething ? 'success' : 'info',
        message: restoredSomething
          ? t('settings.restorePurchasesSuccess')
          : t('settings.restorePurchasesEmpty'),
      };

      if (
        restoredSomething &&
        !this.disposed &&
        this.scene.sys.isActive() &&
        this.scene.scene.key === 'Settings'
      ) {
        this.restartThenShowToast(restoreToast);
      } else {
        toast.show(restoreToast);
      }
    } finally {
      this.restoringPurchases = false;
    }
  }

  private showRemoveAdsPurchaseModal(): void {
    if (
      this.disposed ||
      this.purchaseModal ||
      this.purchasingAds ||
      shop.isOwned(REMOVE_ADS_ITEM_ID)
    ) {
      return;
    }

    this.endNameEdit();
    this.closeLanguageMenu();

    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(340, width * 0.82);
    const showRestore = iap.isEnabled();
    const panelHeight = showRestore ? 318 : 280;
    const panelX = width / 2 - panelWidth / 2;
    const panelY = height / 2 - panelHeight / 2;
    const modal = this.scene.add.container(0, 0).setDepth(200);

    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hidePurchaseModal());

    const panelGfx = this.scene.add.graphics();
    drawRoundedRect(panelGfx, panelX, panelY, panelWidth, panelHeight, 20, PANEL_BG, PANEL_BORDER);

    const panelHit = this.scene.add
      .rectangle(width / 2, height / 2, panelWidth, panelHeight, 0x000000, 0)
      .setInteractive();

    modal.add([overlay, panelGfx, panelHit]);

    modal.add(
      createUIButton({
        scene: this.scene,
        position: { x: panelX + panelWidth - 6, y: panelY + 6 },
        size: { width: 56, height: 56 },
        background: { key: 'close-icon' },
        onClick: () => this.hidePurchaseModal(),
      })
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 56, t('shop.items.remove_ads.name'), {
          fontSize: '24px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: panelWidth - 40 },
        })
        .setOrigin(0.5, 0)
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 100, t('shop.items.remove_ads.description'), {
          fontSize: '15px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5, 0)
    );

    modal.add(
      this.scene.add
        .text(width / 2, panelY + 148, t('settings.removeAdsPrice', { price: REMOVE_ADS_PRICE }), {
          fontSize: '22px',
          fontStyle: 'bold',
          color: SECTION_TITLE_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5, 0)
    );

    const buyWidth = Math.min(220, panelWidth * 0.7);
    const buyY = showRestore ? panelY + panelHeight - 88 : panelY + panelHeight - 52;
    this.buyAdsButton = createUIButton({
      scene: this.scene,
      position: { x: width / 2, y: buyY },
      size: { width: buyWidth, height: 64 },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('shop.buy').toUpperCase(),
        style: {
          fontSize: 22,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => {
        void this.purchaseRemoveAds();
      },
    });
    modal.add(this.buyAdsButton);

    if (showRestore) {
      const restoreY = panelY + panelHeight - 28;
      const hint = this.scene.add
        .text(width / 2, restoreY, t('settings.restorePurchasesHint'), {
          fontSize: '14px',
          color: LABEL_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      hint.on('pointerdown', () => {
        if (this.purchasingAds) return;
        this.hidePurchaseModal();
        void this.restorePurchases();
      });
      modal.add(hint);
    }

    this.purchaseModal = modal;
    this.add(modal);
  }

  private async purchaseRemoveAds(): Promise<void> {
    if (this.purchasingAds || shop.isOwned(REMOVE_ADS_ITEM_ID)) return;
    this.purchasingAds = true;
    this.buyAdsButton?.setLoading(true);

    let success = false;
    try {
      success = await shop.purchase(REMOVE_ADS_ITEM_ID);
      if (!success) {
        toast.show({ message: t('shop.purchaseFailed'), type: 'error' });
        return;
      }

      const successToast: ToastOptions = {
        type: 'success',
        message: t('shop.purchaseSuccess', { name: t('shop.items.remove_ads.name') }),
      };

      // Toast is scene-owned; Phaser queues restart so we must wait for CREATE.
      if (
        !this.disposed &&
        this.scene.sys.isActive() &&
        this.scene.scene.key === 'Settings'
      ) {
        this.restartThenShowToast(successToast);
      } else {
        toast.show(successToast);
      }
    } finally {
      this.purchasingAds = false;
      this.buyAdsButton?.setLoading(false);
    }

    if (success) {
      this.hidePurchaseModal();
    }
  }

  private buildLanguageSection(
    left: number,
    right: number,
    contentWidth: number,
    startY: number
  ): number {
    let y = startY;

    this.add(
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
    this.add(bg);

    const globe = this.scene.add.image(left + 28, centerY, LANGUAGE_GLOBE_KEY);
    globe.setDisplaySize(28, 28);
    this.add(globe);

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
    this.add(this.languageLabel);

    const chevron = this.scene.add.graphics();
    chevron.fillStyle(0x1c1b18, 1);
    chevron.fillTriangle(right - 28, centerY - 4, right - 16, centerY - 4, right - 22, centerY + 6);
    this.add(chevron);

    const hit = this.scene.add
      .rectangle(centerX, centerY, contentWidth, dropdownHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.toggleLanguageMenu(left, right, y + dropdownHeight + 4));
    this.add(hit);

    return y + dropdownHeight;
  }

  private buildLegalSection(
    left: number,
    right: number,
    contentWidth: number,
    startY: number
  ): number {
    let y = startY;

    this.add(
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

    this.add(
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

    this.add(
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

  private toggleLanguageMenu(left: number, right: number, top: number): void {
    if (this.disposed) return;
    if (this.languageOpen) {
      this.closeLanguageMenu();
      return;
    }

    this.endNameEdit();
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
          this.restartThenShowToast({ message: label, type: 'success', duration: 1500 });
        })();
      });
    });

    this.languageMenu = menu;
    this.add(menu);
  }

  private closeLanguageMenu(): void {
    const menu = this.languageMenu;
    this.languageMenu = undefined;
    this.languageOpen = false;
    this.scheduleDestroy(menu);
  }

  private addDivider(centerX: number, y: number, width: number): number {
    this.add(this.scene.add.rectangle(centerX, y, width * 0.92, 2, DIVIDER_COLOR, 0.45));
    return y;
  }

  private async handleSave(): Promise<void> {
    if (this.disposed || this.saving) return;

    this.endNameEdit();
    const name = this.draftName.trim();
    if (!name) {
      toast.show({ message: t('settings.playerNameRequired'), type: 'warning' });
      return;
    }

    if (guest.getStatus() !== 'ready') {
      toast.show({ message: t('settings.playerNameOffline'), type: 'warning' });
      return;
    }

    this.saving = true;
    try {
      const result = await guest.updateName(name);
      this.draftName = name;
      this.refreshNameFieldText();
      toast.show({
        message: result.synced
          ? t('settings.playerNameUpdated')
          : t('settings.playerNameSavedLocally'),
        type: 'success',
      });
    } catch {
      toast.show({ message: t('settings.playerNameFailed'), type: 'error' });
    } finally {
      this.saving = false;
    }
  }
}

function createToggle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: {
    initial: boolean;
    locked?: boolean;
    onChange: (enabled: boolean) => void;
    onLockedTap?: () => void;
  }
): Phaser.GameObjects.Container {
  let enabled = options.initial;
  const locked = !!options.locked;
  const container = scene.add.container(x, y);
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

  draw();
  container.add([track, knob]);
  if (locked) {
    container.setAlpha(TOGGLE_LOCKED_ALPHA);
  }

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

  return container;
}
