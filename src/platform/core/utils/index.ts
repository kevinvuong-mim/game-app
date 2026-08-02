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

/** Compact labels from 10K: 9_999 → 9999, 12_000 → 12K, 1_500_000 → 1.5M, … */
export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  const formatScaled = (scaled: number, suffix: string): string => {
    const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${sign}${text}${suffix}`;
  };

  if (abs >= 1e12) return formatScaled(abs / 1e12, 'T');
  if (abs >= 1e9) return formatScaled(abs / 1e9, 'B');
  if (abs >= 1e6) return formatScaled(abs / 1e6, 'M');
  if (abs >= 1e4) return formatScaled(abs / 1e3, 'K');
  return `${sign}${Math.round(abs)}`;
}
