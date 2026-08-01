export type AdFormat = 'banner' | 'rewarded' | 'interstitial';

export type AdPlacement = 'HOME' | 'SHOP' | 'LEADERBOARD' | 'MISSION_WATCH' | 'GAME_OVER';

export type AdContext = 'HOME' | 'SHOP' | 'LEADERBOARD' | 'GAMEPLAY' | 'GAME_OVER';

export type AdState =
  'IDLE' | 'ERROR' | 'READY' | 'LOADING' | 'SHOWING' | 'COMPLETED' | 'DESTROYED';

export type BannerState = 'IDLE' | 'HIDDEN' | 'LOADING' | 'VISIBLE' | 'DESTROYED';

interface AdReward {
  type: string;
  amount: number;
}

export interface AdShowResult {
  error?: string;
  shown: boolean;
  rewarded?: boolean;
  transactionId?: string;
  providerPayload?: Record<string, unknown>;
}

interface AdUnitIds {
  banner?: string;
  rewarded?: string;
  interstitial?: string;
}

export interface AdsProviderConfig {
  appId?: string;
  testing?: boolean;
  adUnits: AdUnitIds;
}

export interface IAdsProvider {
  destroy(): void;
  hideBanner(): void;
  destroyBanner(): void;
  readonly name: string;
  loadBanner(): Promise<void>;
  loadRewarded(): Promise<void>;
  loadInterstitial(): Promise<void>;
  isReady(format: AdFormat): boolean;
  isCached(format: AdFormat): boolean;
  showBanner(placement?: string): Promise<void>;
  init(config: AdsProviderConfig): Promise<void>;
  showRewarded(placement?: string): Promise<AdShowResult>;
  showInterstitial(placement?: string): Promise<AdShowResult>;
}

export interface AdsRemoteConfig {
  bannerEnabled: boolean;
  rewardEnabled: boolean;
  cooldowns: {
    rewarded: number;
    interstitial: number;
  };
  interstitialEnabled: boolean;
  rewards: Partial<Record<AdPlacement, AdReward>>;
  placements: Record<AdPlacement, AdFormat>;
}

export const DEFAULT_REMOTE_CONFIG: AdsRemoteConfig = {
  cooldowns: {
    rewarded: 10,
    interstitial: 90,
  },
  bannerEnabled: true,
  rewardEnabled: true,
  interstitialEnabled: true,
  placements: {
    HOME: 'banner',
    SHOP: 'banner',
    LEADERBOARD: 'banner',
    /** Completes WATCH_AD mission progress only — no immediate coin grant. */
    MISSION_WATCH: 'rewarded',
    GAME_OVER: 'interstitial',
  },
  rewards: {
    MISSION_WATCH: { type: 'mission_progress', amount: 1 },
  },
};

export const BANNER_ALLOWED_PLACEMENTS = new Set<AdPlacement>(
  (Object.entries(DEFAULT_REMOTE_CONFIG.placements) as Array<[AdPlacement, AdFormat]>)
    .filter(([, format]) => format === 'banner')
    .map(([placement]) => placement)
);

/** Contexts that hide banners (gameplay surfaces). */
export const BANNER_HIDDEN_CONTEXTS = new Set<AdContext>(['GAMEPLAY']);

/** Context → banner placement (identity map for banner contexts). */
export const CONTEXT_TO_BANNER_PLACEMENT: Partial<Record<AdContext, AdPlacement>> = {
  HOME: 'HOME',
  SHOP: 'SHOP',
  LEADERBOARD: 'LEADERBOARD',
};
