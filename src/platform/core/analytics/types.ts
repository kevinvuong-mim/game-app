export const AnalyticsEvents = {
  PURCHASE: 'purchase',
  AD_REWARD: 'ad_reward',
  GAME_OVER: 'game_over',
  GAME_START: 'game_start',
  DAILY_CLAIM: 'daily_claim',
  SESSION_END: 'session_end',
  SESSION_START: 'session_start',
  MISSION_COMPLETE: 'mission_complete',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export interface AnalyticsParams {
  [key: string]: string | number | boolean | undefined;
}

export interface IAnalyticsProvider {
  readonly name: string;
  init(): Promise<void>;
  flush(): Promise<void>;
  shutdown?(): Promise<void>;
  setUserId(userId: string): void;
  setUserProperty(key: string, value: string): void;
  track(event: AnalyticsEvent, params?: AnalyticsParams): void;
}
