import { logger } from '../error';
import type { AnalyticsEvent, AnalyticsParams, IAnalyticsProvider } from './types';

class AnalyticsService {
  private enabled = true;
  private providers: IAnalyticsProvider[] = [];

  registerProvider(provider: IAnalyticsProvider): void {
    if (this.providers.some((p) => p.name === provider.name)) return;
    this.providers.push(provider);
  }

  clearProviders(): void {
    this.providers = [];
  }

  async init(): Promise<void> {
    await Promise.all(
      this.providers.map(async (provider) => {
        if (!this.enabled && provider.name !== 'console') return;
        try {
          await provider.init();
        } catch (error) {
          logger.error(`[Analytics] Provider "${provider.name}" init failed`, error);
        }
      })
    );
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  track(event: AnalyticsEvent, params?: AnalyticsParams): void {
    for (const provider of this.providers) {
      if (!this.enabled && provider.name !== 'console') continue;
      try {
        provider.track(event, params);
      } catch (error) {
        logger.error(`[Analytics] Provider "${provider.name}" track failed`, error);
      }
    }
  }

  setUserId(userId: string): void {
    for (const provider of this.providers) {
      try {
        provider.setUserId(userId);
      } catch (error) {
        logger.error(`[Analytics] Provider "${provider.name}" setUserId failed`, error);
      }
    }
  }

  setUserProperty(key: string, value: string): void {
    for (const provider of this.providers) {
      try {
        provider.setUserProperty(key, value);
      } catch (error) {
        logger.error(`[Analytics] Provider "${provider.name}" setUserProperty failed`, error);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.providers.map(async (provider) => {
        try {
          await provider.flush();
        } catch (error) {
          logger.error(`[Analytics] Provider "${provider.name}" flush failed`, error);
        }
      })
    );
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.providers.map(async (provider) => {
        if (!provider.shutdown) return;
        try {
          await provider.shutdown();
        } catch (error) {
          logger.error(`[Analytics] Provider "${provider.name}" shutdown failed`, error);
        }
      })
    );
  }
}

export const analytics = new AnalyticsService();
