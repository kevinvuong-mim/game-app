import Phaser from 'phaser';

import { eventBus } from '@platform/core/events';
import type { UIButton } from '@platform/ui/types';
import { t, toast, missions, dailyRewards } from '@platform/ui';
import { createUIButton } from '@platform/ui/button/UIButton';
import { isInfinityUnlocked } from '@game/campaign/progress';

export class HomeScene extends Phaser.Scene {
  private dailyRewardButton?: UIButton;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super({ key: 'Home' });
  }

  /** Phaser reuses prior scene data when start() omits the data arg — always pass returnTo. */
  private openScreen(key: string): void {
    this.scene.start(key, { returnTo: 'Home' });
  }

  private openInfinity(): void {
    if (!isInfinityUnlocked()) {
      toast.show({ message: t('home.infinityLocked'), type: 'warning' });
      return;
    }
    this.scene.start('Gameplay', { mode: 'infinity', returnTo: 'Home' });
  }

  create(): void {
    this.cleanupEventListeners();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    eventBus.emit('ad:context:change', { context: 'HOME' });

    const { width, height } = this.cameras.main;

    this.addBackgroundImage(width, height);

    createUIButton({
      scene: this,
      position: { x: width / 2, y: height * 0.56 },
      size: { width: 300, height: 110 },
      background: { key: 'play-button-background' },
      text: {
        content: t('home.map'),
        style: { fontSize: 36, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => this.scene.start('Map', { returnTo: 'Home' }),
    });

    createUIButton({
      scene: this,
      position: { x: width / 2, y: height * 0.65 },
      size: { width: 300, height: 110 },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('home.infinity'),
        style: { fontSize: 32, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => this.openInfinity(),
    });

    createUIButton({
      scene: this,
      position: { x: width / 2, y: height * 0.74 },
      size: { width: 300, height: 110 },
      background: { key: 'settings-button-background' },
      text: {
        content: t('home.settings'),
        style: { fontSize: 36, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => this.openScreen('Settings'),
    });

    createUIButton({
      scene: this,
      position: { x: width / 4, y: height * 0.86 },
      size: { width: 120, height: 120 },
      background: { key: 'shop-icon' },
      text: {
        content: t('home.shop'),
        offset: { x: 60, y: 110 },
        style: { fontSize: 24, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      onClick: () => this.openScreen('Shop'),
    });

    const claimableMissions = missions
      .getMissions()
      .filter((mission) => mission.status === 'completed').length;

    createUIButton({
      scene: this,
      position: { x: width / 2, y: height * 0.86 },
      size: { width: 120, height: 120 },
      background: { key: 'missions-icon' },
      text: {
        offset: { x: 60, y: 110 },
        content: t('home.missions'),
        style: { fontSize: 24, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      badge: {
        content: String(claimableMissions),
        visible: claimableMissions > 0,
        position: { x: 82, y: 2 },
        minSize: { width: 36, height: 36 },
        padding: { horizontal: 5, vertical: 3 },
        background: { color: '#e53935', radius: 18 },
        textStyle: {
          fontSize: 20,
          fontStyle: 'bold',
          color: '#ffffff',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.openScreen('Missions'),
    });

    this.dailyRewardButton = createUIButton({
      scene: this,
      position: { x: (3 * width) / 4, y: height * 0.86 },
      size: { width: 120, height: 120 },
      background: { key: 'daily-reward-icon' },
      text: {
        offset: { x: 60, y: 110 },
        content: t('home.dailyReward'),
        style: { fontSize: 24, fontStyle: 'bold', border: { width: 4, color: '#000000' } },
      },
      badge: {
        content: '!',
        visible: dailyRewards.canClaim(),
        position: { x: 82, y: 2 },
        minSize: { width: 36, height: 36 },
        padding: { horizontal: 5, vertical: 3 },
        background: { color: '#e53935', radius: 18 },
        textStyle: {
          fontSize: 20,
          fontStyle: 'bold',
          color: '#ffffff',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.openScreen('DailyReward'),
    });

    this.unsubscribers.push(
      eventBus.on('app:resume', () => {
        this.dailyRewardButton?.setBadgeVisible(dailyRewards.canClaim());
      }),
      eventBus.on('daily:claim', () => {
        this.dailyRewardButton?.setBadgeVisible(false);
      })
    );
  }

  shutdown(): void {
    this.cleanupEventListeners();
    this.dailyRewardButton = undefined;
  }

  private cleanupEventListeners(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  private addBackgroundImage(width: number, height: number): void {
    const bg = this.add.image(width / 2, height / 2, 'home-background-image');
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }
}
