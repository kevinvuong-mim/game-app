export type AdFormat = 'banner' | 'app_open' | 'rewarded' | 'interstitial';

export type AdState =
  | 'IDLE'
  | 'ERROR'
  | 'READY'
  | 'LOADING'
  | 'SHOWING'
  | 'COMPLETED'
  | 'DESTROYED';

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
  appOpen?: string;
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
  loadAppOpen(): Promise<void>;
  loadRewarded(): Promise<void>;
  loadInterstitial(): Promise<void>;
  isReady(format: AdFormat): boolean;
  isCached(format: AdFormat): boolean;
  showBanner(placement?: string): Promise<void>;
  init(config: AdsProviderConfig): Promise<void>;
  showAppOpen(placement?: string): Promise<AdShowResult>;
  showRewarded(placement?: string): Promise<AdShowResult>;
  showInterstitial(placement?: string): Promise<AdShowResult>;
}

export interface AdsRemoteConfig {
  bannerEnabled: boolean;
  rewardEnabled: boolean;
  cooldowns: {
    app_open: number;
    rewarded: number;
    interstitial: number;
  };
  appOpenEnabled: boolean;
  interstitialEnabled: boolean;
  rewards: Record<string, AdReward>;
  placements: Record<string, AdFormat>;
}

export const DEFAULT_REMOTE_CONFIG: AdsRemoteConfig = {
  cooldowns: {
    app_open: 0,
    rewarded: 10,
    interstitial: 90,
  },
  bannerEnabled: true,
  rewardEnabled: true,
  appOpenEnabled: false,
  interstitialEnabled: true,
  placements: {
    HOME: 'banner',
    SHOP: 'banner',
    APP_START: 'app_open',
    LEADERBOARD: 'banner',
    EXTRA_LIFE: 'rewarded',
    DOUBLE_COIN: 'rewarded',
    GAME_OVER: 'interstitial',
  },
  rewards: {
    DOUBLE_COIN: { type: 'coins', amount: 100 },
    EXTRA_LIFE: { type: 'extra_life', amount: 1 },
  },
};

export const BANNER_ALLOWED_PLACEMENTS = new Set(['HOME', 'LEADERBOARD', 'SHOP', 'GAME_OVER']);
