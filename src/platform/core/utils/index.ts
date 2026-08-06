import { usePlatformStore } from '@platform/core/state';

export enum DeviceType {
  PHONE,
  TABLET,
}

/** Classify by screen width (dp-like CSS pixels). Tablet if >= 600. */
export function getDeviceType(): DeviceType {
  return window.screen.width >= 600 ? DeviceType.TABLET : DeviceType.PHONE;
}

/** Local calendar day key (`YYYY-MM-DD`). */
export function getLocalDateKey(at: number = Date.now()): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getNumberLocale(): string {
  return usePlatformStore.getState().settings.language === 'vi' ? 'vi-VN' : 'en-US';
}

/** Compact from 1M (locale-aware): 999_999 → 999.999 / 999,999; 1_500_000 → 1,5 Tr / 1.5M; … */
export function formatNumber(value: number): string {
  const locale = getNumberLocale();
  const abs = Math.abs(value);

  if (abs >= 1e6) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
