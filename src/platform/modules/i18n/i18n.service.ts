import { logger } from '@platform/core/error';
import { usePlatformStore } from '@platform/core/state';

interface TranslationNode {
  [key: string]: string | TranslationNode;
}

export const SUPPORTED_LANGUAGES = ['en', 'ja', 'ko', 'de', 'fr', 'it', 'vi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Native names so the language picker stays readable after a mistaken switch. */
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  vi: 'Tiếng Việt',
};

const NUMBER_FORMAT_LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  vi: 'vi-VN',
};

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);

/** Lazy loaders — each locale is a separate chunk in production builds */
const LOCALE_LOADERS: Record<SupportedLanguage, () => Promise<{ default: TranslationNode }>> = {
  en: () => import('./locales/en.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  de: () => import('./locales/de.json'),
  fr: () => import('./locales/fr.json'),
  it: () => import('./locales/it.json'),
  vi: () => import('./locales/vi.json'),
};

class LocalizationService {
  private currentLanguage: SupportedLanguage = 'en';
  private fallbackLanguage: SupportedLanguage = 'en';
  private catalogs = new Map<string, TranslationNode>();

  async init(language?: string): Promise<void> {
    await this.loadLanguage(this.fallbackLanguage);

    // Before hydrate, use device locale (or explicit override).
    // `settings.init()` re-applies `settings.language` from game-save after loadLocal.
    await this.setLanguage(language ?? this.detectDeviceLanguage());
  }

  async setLanguage(language: string): Promise<void> {
    const lang = this.normalizeLanguage(language);

    if (!this.catalogs.has(lang)) {
      await this.loadLanguage(lang);
    }

    if (!this.catalogs.has(lang)) {
      logger.warn(`[i18n] Language unavailable: ${language}, using ${this.fallbackLanguage}`);
      this.currentLanguage = this.fallbackLanguage;
      return;
    }

    this.currentLanguage = lang;
    usePlatformStore.getState().updateSettings({ language: lang });
    logger.info(`[i18n] Language set to: ${lang}`);
  }

  /** Device locale when supported; otherwise fallback (`en`). */
  private detectDeviceLanguage(): SupportedLanguage {
    for (const candidate of this.getDeviceLanguageCandidates()) {
      const code = candidate.split('-')[0]?.toLowerCase();
      if (code && SUPPORTED_LANGUAGE_SET.has(code)) {
        return code as SupportedLanguage;
      }
    }
    return this.fallbackLanguage;
  }

  private getDeviceLanguageCandidates(): string[] {
    if (typeof navigator === 'undefined') return [];

    const candidates: string[] = [];
    if (navigator.languages?.length) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
    return candidates;
  }

  private normalizeLanguage(language: string): SupportedLanguage {
    const code = language.split('-')[0].toLowerCase();
    if (SUPPORTED_LANGUAGE_SET.has(code)) {
      return code as SupportedLanguage;
    }
    return this.fallbackLanguage;
  }

  private async loadLanguage(language: string): Promise<void> {
    if (this.catalogs.has(language)) return;

    const loader = LOCALE_LOADERS[language as SupportedLanguage];
    if (!loader) {
      logger.warn(`[i18n] Unsupported language: ${language}`);
      return;
    }

    try {
      const module = await loader();
      this.catalogs.set(language, module.default);
      logger.debug(`[i18n] Loaded locale: ${language}`);
    } catch (error) {
      logger.warn(`[i18n] Failed to load language: ${language}`, error);
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const catalog = this.catalogs.get(this.currentLanguage);
    const fallback = this.catalogs.get(this.fallbackLanguage);

    const value = this.resolve(key, catalog) ?? this.resolve(key, fallback) ?? key;

    if (!params) return value;

    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
      value
    );
  }

  private resolve(key: string, map?: TranslationNode): string | undefined {
    if (!map) return undefined;

    const parts = key.split('.');
    let current: string | TranslationNode = map;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = current[part];
      if (current === undefined) return undefined;
    }

    return typeof current === 'string' ? current : undefined;
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  getNumberFormatLocale(): string {
    return NUMBER_FORMAT_LOCALES[this.currentLanguage];
  }
}

export const i18n = new LocalizationService();

/** Shorthand translation function */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params);
}

export function getNumberFormatLocale(): string {
  return i18n.getNumberFormatLocale();
}
