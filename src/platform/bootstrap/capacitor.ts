import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { services } from '@platform/core/services';
import { trackSessionEnd } from '@platform/core/analytics/events';
import { saveService } from '@platform/modules/save';
import { gameRunService } from '@platform/modules/game-run';
import { initAppBridge } from '@platform/modules/deep-link/app-bridge';

let capacitorInitialized = false;
let appBridgeTeardown: (() => void) | null = null;

/**
 * Initialize native Capacitor plugins after platform bootstrap.
 * Web still initializes AppBridge for HTTPS deeplink testing.
 */
export async function initCapacitorPlugins(): Promise<void> {
  try {
    appBridgeTeardown?.();
    appBridgeTeardown = await initAppBridge();
    logger.info('[Capacitor] AppBridge initialized');
  } catch (error) {
    logger.warn('[Capacitor] AppBridge init failed', error);
  }

  if (!Capacitor.isNativePlatform() || capacitorInitialized) return;

  try {
    const [{ App }, { StatusBar }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
    ]);

    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
    await StatusBar.hide();

    await App.addListener('backButton', () => {
      eventBus.emit('app:back', undefined);
    });

    await App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        eventBus.emit('app:resume', undefined);
        return;
      }

      trackSessionEnd();
      eventBus.emit('app:pause', undefined);
      await gameRunService.flush();
      await saveService.saveLocal();
      await services.analytics.flush();
    });

    capacitorInitialized = true;
    logger.info('[Capacitor] Native plugins initialized');
  } catch (error) {
    logger.warn('[Capacitor] Plugin init failed', error);
  }
}

/** Hide native splash once the Phaser shell is ready (`app:ready`). */
export async function hideNativeSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (error) {
    logger.warn('[Capacitor] Splash hide failed', error);
  }
}
