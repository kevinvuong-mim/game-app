import type Phaser from 'phaser';

import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import type { NotificationRoute } from '@platform/modules/notifications/notification.model';

interface PendingNavigation {
  sceneKey: string;
  data?: Record<string, unknown>;
}

class NavigationService {
  private bootComplete = false;
  private game: Phaser.Game | null = null;
  private pending: PendingNavigation | null = null;

  setGame(game: Phaser.Game): void {
    this.game = game;
    this.bootComplete = false;
  }

  isBootComplete(): boolean {
    return this.bootComplete;
  }

  markBootComplete(): void {
    this.bootComplete = true;
  }

  peekPendingNavigation(): PendingNavigation | null {
    return this.pending;
  }

  consumePendingNavigation(): PendingNavigation | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  navigateToScene(sceneKey: NotificationRoute | string, data?: Record<string, unknown>): void {
    if (!this.game || !this.bootComplete) {
      this.pending = { sceneKey, data };
      logger.info('[Navigation] Deferring navigation until boot completes', { sceneKey });
      return;
    }

    this.pending = null;
    this.doNavigate(sceneKey, data);
  }

  private doNavigate(sceneKey: NotificationRoute | string, data?: Record<string, unknown>): void {
    if (!this.game) {
      return;
    }

    const activeScenes = this.game.scene.getScenes(true);
    const activeScene = activeScenes[activeScenes.length - 1] ?? activeScenes[0];

    if (activeScene) {
      activeScene.scene.start(sceneKey, data);
      return;
    }

    // game.scene.start() does not shut down other running scenes (e.g. Preload).
    if (this.game.scene.isActive('Preload')) {
      this.game.scene.stop('Preload');
    }
    if (this.game.scene.isActive('Boot')) {
      this.game.scene.stop('Boot');
    }

    this.game.scene.start(sceneKey, data);
  }
}

export const navigationService = new NavigationService();

export function bindNavigationEvents(): () => void {
  return eventBus.on('boot:preload-complete', () => {
    navigationService.markBootComplete();
    navigationService.consumePendingNavigation();
  });
}
