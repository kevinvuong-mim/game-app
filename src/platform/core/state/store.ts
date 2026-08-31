import { createStore } from 'zustand/vanilla';

import { DEFAULT_STATE } from './types';
import type { PlatformState } from './types';

export interface PlatformStore extends PlatformState {
  // User
  setUser: (user: Partial<PlatformState['user']>) => void;

  // Currency
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  /** Apply a consumable IAP grant once per transaction id. Returns false if already applied. */
  applyConsumableGrant: (transactionId: string, amount: number) => boolean;

  // Inventory
  addItem: (id: string, quantity?: number) => void;
  removeItem: (id: string, quantity?: number) => void;

  // Progress
  incrementGamesPlayed: () => void;
  setHighScore: (score: number) => void;
  setCurrentLevel: (level: number) => void;
  setRatePromptProgress: (
    update: Partial<
      Pick<PlatformState['progress'], 'hasRatedApp' | 'lastRatePromptGamesPlayed' | 'lastAppRating'>
    >
  ) => void;

  // Settings
  updateSettings: (settings: Partial<PlatformState['settings']>) => void;

  // Missions (snapshot only — transitions live in MissionService)
  setMissions: (missions: PlatformState['missions']['missions']) => void;

  // Bulk
  reset: () => void;
  hydrate: (state: Partial<PlatformState>) => void;
}

export const usePlatformStore = createStore<PlatformStore>()((set, get) => ({
  ...DEFAULT_STATE,

  setUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),

  addCoins: (amount) => {
    if (amount <= 0) return;
    set((s) => ({ currency: { ...s.currency, coins: s.currency.coins + amount } }));
  },

  spendCoins: (amount) => {
    if (amount <= 0) return false;
    const { currency } = get();
    if (currency.coins < amount) return false;
    set((s) => ({
      currency: { ...s.currency, coins: s.currency.coins - amount },
    }));
    return true;
  },

  applyConsumableGrant: (transactionId, amount) => {
    const txId = transactionId.trim();
    if (!txId || amount <= 0) return false;
    const applied = get().currency.appliedConsumableTxIds ?? [];
    if (applied.includes(txId)) return false;

    const nextIds = [...applied, txId];
    const capped =
      nextIds.length > MAX_APPLIED_CONSUMABLE_TX_IDS
        ? nextIds.slice(-MAX_APPLIED_CONSUMABLE_TX_IDS)
        : nextIds;

    set((s) => ({
      currency: {
        ...s.currency,
        coins: s.currency.coins + amount,
        appliedConsumableTxIds: capped,
      },
    }));
    return true;
  },

  addItem: (id, quantity = 1) =>
    set((s) => {
      const existing = s.inventory.items[id];
      return {
        inventory: {
          items: {
            ...s.inventory.items,
            [id]: {
              id,
              quantity: (existing?.quantity ?? 0) + quantity,
            },
          },
        },
      };
    }),

  removeItem: (id, quantity = 1) =>
    set((s) => {
      const existing = s.inventory.items[id];
      if (!existing) return s;
      const newQty = Math.max(0, existing.quantity - quantity);
      const items = { ...s.inventory.items };
      if (newQty === 0) {
        delete items[id];
      } else {
        items[id] = { ...existing, quantity: newQty };
      }
      return { inventory: { items } };
    }),

  setHighScore: (score) =>
    set((s) => ({
      progress: {
        ...s.progress,
        highScore: Math.max(s.progress.highScore, score),
      },
    })),

  incrementGamesPlayed: () =>
    set((s) => ({
      progress: {
        ...s.progress,
        totalGamesPlayed: s.progress.totalGamesPlayed + 1,
      },
    })),

  setCurrentLevel: (level) => set((s) => ({ progress: { ...s.progress, currentLevel: level } })),

  setRatePromptProgress: (update) =>
    set((s) => ({
      progress: {
        ...s.progress,
        ...update,
      },
    })),

  updateSettings: (settings) => set((s) => ({ settings: { ...s.settings, ...settings } })),

  setMissions: (missions) => set((s) => ({ missions: { ...s.missions, missions } })),

  hydrate: (state) =>
    set((s) => {
      const nextCurrency = sanitizeCurrency(state.currency ?? s.currency);
      const nextInventory = sanitizeInventory(state.inventory ?? s.inventory);

      return {
        ...s,
        ...state,
        currency: nextCurrency,
        inventory: nextInventory,
        progress: {
          ...DEFAULT_STATE.progress,
          ...s.progress,
          ...(state.progress ?? {}),
        },
        settings: { ...DEFAULT_STATE.settings, ...s.settings, ...(state.settings ?? {}) },
        // Drop legacy clock-lock fields from older saves (`timeManipulated`, …).
        missions: {
          missions: {
            ...DEFAULT_STATE.missions.missions,
            ...s.missions.missions,
            ...(state.missions?.missions ?? {}),
          },
        },
      };
    }),

  reset: () => set(DEFAULT_STATE),
}));

const MAX_APPLIED_CONSUMABLE_TX_IDS = 500;

function sanitizeAppliedConsumableTxIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return unique.length > MAX_APPLIED_CONSUMABLE_TX_IDS
    ? unique.slice(-MAX_APPLIED_CONSUMABLE_TX_IDS)
    : unique;
}

function sanitizeCurrency(
  currency: PlatformState['currency'] | undefined
): PlatformState['currency'] {
  const appliedConsumableTxIds = sanitizeAppliedConsumableTxIds(currency?.appliedConsumableTxIds);
  const coins = currency?.coins;
  if (typeof coins !== 'number' || !Number.isFinite(coins) || coins < 0) {
    return { coins: 0, appliedConsumableTxIds };
  }
  return { coins: Math.floor(coins), appliedConsumableTxIds };
}

function sanitizeInventory(
  inventory: PlatformState['inventory'] | undefined
): PlatformState['inventory'] {
  const items = inventory?.items;
  if (!items || typeof items !== 'object') {
    return { items: {} };
  }

  const sanitized: PlatformState['inventory']['items'] = {};
  for (const [id, item] of Object.entries(items)) {
    if (!item || typeof item !== 'object') continue;
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) continue;
    sanitized[id] = { id: String(id), quantity: Math.floor(quantity) };
  }
  return { items: sanitized };
}
