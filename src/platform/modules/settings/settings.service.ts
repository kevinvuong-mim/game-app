import { i18n } from '../i18n/i18n.service';
import { eventBus } from '@platform/core/events';
import { saveService } from '@platform/modules/save';
import { usePlatformStore } from '@platform/core/state';
import type { SettingsState } from '@platform/core/state';

class SettingsService {
  async init(): Promise<void> {
    const { language } = this.getSettings();
    await i18n.setLanguage(language);
  }

  getSettings(): SettingsState {
    return usePlatformStore.getState().settings;
  }

  async setLanguage(language: string): Promise<void> {
    await i18n.setLanguage(language);
    await saveService.saveLocal();
    eventBus.emit('settings:change', { key: 'language', value: i18n.getCurrentLanguage() });
  }

  async setSoundEnabled(enabled: boolean): Promise<void> {
    usePlatformStore.getState().updateSettings({ soundEnabled: enabled });
    eventBus.emit('settings:change', { key: 'soundEnabled', value: enabled });
  }

  async setMusicEnabled(enabled: boolean): Promise<void> {
    usePlatformStore.getState().updateSettings({ musicEnabled: enabled });
    eventBus.emit('settings:change', { key: 'musicEnabled', value: enabled });
  }
}

export const settings = new SettingsService();
