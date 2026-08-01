import Phaser from 'phaser';

import { toast } from '../toast/ToastManager';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { drawRoundedRect } from '../panel/graphics';
import { t } from '@platform/modules/i18n/i18n.service';
import { guest, PLAYER_NAME_MAX_LENGTH } from '@platform/modules/guest';
import { SECTION_TITLE_COLOR, LABEL_COLOR, DIVIDER_COLOR, INPUT_TEXT } from './settingsShared';

const INPUT_HEIGHT = 58;
const SAVE_BTN_WIDTH = 100;
const SAVE_BTN_HEIGHT = 66;
const MAX_NAME_LENGTH = PLAYER_NAME_MAX_LENGTH;

export class SettingsProfileSection {
  private draftName = '';
  private saving = false;
  private disposed = false;
  private nameEditing = false;
  private editInput?: HTMLInputElement;
  private nameCaret?: Phaser.GameObjects.Text;
  private nameCaretTimer?: Phaser.Time.TimerEvent;
  private nameFieldText?: Phaser.GameObjects.Text;
  private focusCheckTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly isBlocked: () => boolean
  ) {}

  cleanup(): void {
    this.disposed = true;
    this.focusCheckTimer?.remove(false);
    this.focusCheckTimer = undefined;
    this.stopCaretBlink();
    this.teardownNameEditInput();
    this.nameEditing = false;
    this.nameFieldText = undefined;
    this.nameCaret = undefined;
  }

  endNameEdit(): void {
    this.teardownNameEditInput();
    this.nameEditing = false;
    this.stopCaretBlink();
    if (!this.disposed) {
      this.refreshNameFieldText();
    }
  }

  build(left: number, right: number, contentWidth: number, startY: number): number {
    let y = startY;

    this.parent.add(
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

    this.parent.add(
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
    this.parent.add(nameField);
    this.refreshNameFieldText();

    this.parent.add(
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
    if (this.disposed || this.isBlocked()) return;
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

  private async handleSave(): Promise<void> {
    if (this.disposed || this.saving) return;

    this.endNameEdit();
    const name = this.draftName.trim();
    if (!name) {
      toast.show({ message: t('settings.playerNameRequired'), type: 'warning' });
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
