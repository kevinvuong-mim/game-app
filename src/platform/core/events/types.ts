/**
 * Platform event map.
 *
 * Contract: game emits gameplay; controllers handle commands (*:request → *:result);
 * services emit domain facts (e.g. daily:claim, mission:complete).
 */
import type {
  IapPurchaseFailedPayload,
  IapRestoreSuccessPayload,
  IapPurchaseSuccessPayload,
  IapEntitlementChangedPayload,
} from '@platform/modules/iap/iap.events';
import type { AdContext, AdPlacement } from '@platform/core/advertising';
import type { AnalyticsEvent, AnalyticsParams } from '../analytics/types';
import type { DeepLinkPayload } from '@platform/modules/deep-link/deep-link.model';
import type { LeaderboardView } from '@platform/modules/leaderboard/leaderboard.model';
import type { RewardProgress } from '@platform/modules/daily-reward/daily-reward.model';

export type PlatformEvent = keyof PlatformEventMap;

export type EventHandler<T extends PlatformEvent> = (
  payload: PlatformEventMap[T]
) => void | Promise<void>;

export interface PlatformEventMap {
  // Gameplay (game layer emits, platform consumes)
  merge: { count?: number };
  'score:update': { score: number };

  // Lifecycle
  'app:back': void;
  'app:ready': void;
  'app:pause': void;
  'app:resume': void;
  'game:destroy': void;
  'game:start': { gameId: string };
  'game:over': { score: number; merges?: number; duration: number };

  // Platform
  'shop:restore': void;
  'daily:claim:result': {
    day?: number;
    coins?: number;
    success: boolean;
    message?: string;
  };
  'mission:claim:result': {
    message?: string;
    success: boolean;
    missionId: string;
  };
  'shop:purchase:result': {
    itemId: string;
    price?: number;
    success: boolean;
    message?: string;
  };
  'daily:claim:request': void;
  'boot:preload-complete': void;
  'daily:progress:request': void;
  'daily:progress': RewardProgress;
  'deeplink:open': DeepLinkPayload;
  'leaderboard:update': LeaderboardView;
  'player:name:updated': { name: string };
  'mission:complete': { missionId: string };
  'shop:purchase:request': { itemId: string };
  'ad:reward:result': {
    message?: string;
    success: boolean;
    placement: string;
    reward?: { type: string; amount: number };
  };
  'mission:claim:request': { missionId: string };
  'daily:claim': { day: number; streak: number };
  'iap:purchase:failed': IapPurchaseFailedPayload;
  'iap:restore:success': IapRestoreSuccessPayload;
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
  'leaderboard:refresh': { page?: number } | undefined;
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
