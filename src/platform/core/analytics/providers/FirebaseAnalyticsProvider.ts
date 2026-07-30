import {
  logEvent,
  setUserId,
  isSupported,
  getAnalytics,
  type Analytics,
  setUserProperties,
  initializeAnalytics,
} from 'firebase/analytics';
import { logger } from '../../error';
import { getConfig } from '../../config';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import type { AnalyticsEvent, AnalyticsParams, IAnalyticsProvider } from '../types';

export class FirebaseAnalyticsProvider implements IAnalyticsProvider {
  readonly name = 'firebase';

  private initialized = false;
  private app: FirebaseApp | null = null;
  private analytics: Analytics | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  track(event: AnalyticsEvent, params?: AnalyticsParams): void {
    void this.ensureInitialized().then(() => {
      if (!this.analytics) return;
      try {
        logEvent(this.analytics, event as string, this.sanitizeParams(params));
      } catch (error) {
        logger.error('[Analytics][firebase] track failed', error);
      }
    });
  }

  setUserId(userId: string): void {
    void this.ensureInitialized().then(() => {
      if (!this.analytics) return;
      try {
        setUserId(this.analytics, userId);
        logger.debug(`[Analytics][firebase] setUserId: ${userId}`);
      } catch (error) {
        logger.error('[Analytics][firebase] setUserId failed', error);
      }
    });
  }

  setUserProperty(key: string, value: string): void {
    void this.ensureInitialized().then(() => {
      if (!this.analytics) return;
      try {
        setUserProperties(this.analytics, { [key]: value });
        logger.debug(`[Analytics][firebase] setUserProperty: ${key}=${value}`);
      } catch (error) {
        logger.error('[Analytics][firebase] setUserProperty failed', error);
      }
    });
  }

  async flush(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.analytics = null;
    this.app = null;
    this.initPromise = null;
    this.initialized = false;
    logger.info('[Analytics][firebase] shutdown complete');
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    if (this.initialized) return;

    const { firebase } = getConfig();
    if (!firebase.apiKey || !firebase.projectId || !firebase.appId) {
      logger.warn('[Analytics][firebase] Missing Firebase config — provider disabled');
      this.initialized = true;
      return;
    }

    try {
      const supported = await isSupported();
      if (!supported) {
        logger.warn('[Analytics][firebase] Analytics not supported in this environment');
        this.initialized = true;
        return;
      }

      this.app =
        getApps().length > 0
          ? getApp()
          : initializeApp({
              apiKey: firebase.apiKey,
              authDomain: firebase.authDomain,
              projectId: firebase.projectId,
              appId: firebase.appId,
              measurementId: firebase.measurementId || undefined,
            });

      try {
        this.analytics = initializeAnalytics(this.app);
      } catch {
        this.analytics = getAnalytics(this.app);
      }
      logger.info('[Analytics][firebase] initialized');
    } catch (error) {
      logger.error('[Analytics][firebase] init failed', error);
    } finally {
      this.initialized = true;
    }
  }

  private sanitizeParams(params?: AnalyticsParams): Record<string, string | number> {
    if (!params) return {};
    const result: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (typeof value === 'boolean') {
        result[key] = value ? 'true' : 'false';
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
