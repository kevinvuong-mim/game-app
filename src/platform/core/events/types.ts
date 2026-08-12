/**
 * Platform event map.
 *
 * Contract: game emits gameplay; UI calls services for feature commands;
 * services emit domain facts (e.g. daily:claim, mission:complete);
 * EventBus covers lifecycle and cross-cutting ads/IAP/sync.
 */
import type {
  IapPurchaseFailedPayload,
  IapRestoreSuccessPayload,
  IapPurchaseSuccessPayload,
  IapProductsUpdatedPayload,
  IapEntitlementChangedPayload,
} from '@platform/modules/iap/iap.events';
import type { AdContext, AdPlacement } from '@platform/core/advertising';
import type { AnalyticsEvent, AnalyticsParams } from '../analytics/types';
import type { DeepLinkPayload } from '@platform/modules/deep-link/deep-link.model';
import type { LeaderboardView } from '@platform/modules/leaderboard/leaderboard.model';

export type PlatformEvent = keyof PlatformEventMap;

export type EventHandler<T extends PlatformEvent> = (
  payload: PlatformEventMap[T]
) => void | Promise<void>;

export interface PlatformEventMap {
  // Gameplay (game layer emits, platform consumes)
  merge: { count?: number };
  'score:update': { score: number };
  'stars:earned': { stars: number };

  // Lifecycle
  'app:back': void;
  'app:ready': void;
  'app:pause': void;
  'app:resume': void;
  'game:destroy': void;
  'game:start': { gameId: string };
  'game:over': {
    score: number;
    merges?: number;
    duration: number;
    coins?: number;
    /** When true, queue the score for leaderboard sync (infinity only). */
    submitScore?: boolean;
  };

  // Platform
  'shop:restore': void;
  'boot:preload-complete': void;
  'deeplink:open': DeepLinkPayload;
  'leaderboard:update': LeaderboardView;
  'player:name:updated': { name: string };
  'mission:complete': { missionId: string };
  'ad:reward:result': {
    message?: string;
    success: boolean;
    placement: string;
    reward?: { type: string; amount: number };
  };
  'daily:claim': { day: number; streak: number };
  'iap:purchase:failed': IapPurchaseFailedPayload;
  'iap:restore:success': IapRestoreSuccessPayload;
  'iap:products:updated': IapProductsUpdatedPayload;
  'iap:purchase:success': IapPurchaseSuccessPayload;
  /** Modules emit; bootstrap binds ToastManager (avoids modules → UI imports). */
  'ui:toast': {
    message: string;
    duration?: number;
    type?: 'info' | 'success' | 'warning' | 'error';
  };
  'settings:change': { key: string; value: unknown };
  'shop:purchase': { itemId: string; price: number };
  'ad:reward': { placement: string; reward: unknown };
  'ad:context:change': { context: AdContext | string };
  'ad:show:request': { placement: AdPlacement | string };
  'iap:entitlement:changed': IapEntitlementChangedPayload;
  'ad:reward:request': { placement: AdPlacement | string };
  'mission:update': { missionId: string; progress: number };
  'game:sync:completed': { rank: number; bestScore: number };
  analytics: { event: AnalyticsEvent; params?: AnalyticsParams };
  'game:sync:dropped': { clientResultId: string; attempts: number };
}

export interface IEventBus {
  emit<T extends PlatformEvent>(event: T, payload: PlatformEventMap[T]): void;
  on<T extends PlatformEvent>(event: T, handler: EventHandler<T>): () => void;
}
