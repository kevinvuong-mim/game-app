import Phaser from 'phaser';

import { eventBus, AnalyticsEvents } from '@platform/core/events';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(0x4a90d9);
    gfx.fillCircle(16, 16, 16);
    gfx.generateTexture('particle', 32, 32);
    gfx.destroy();

    // Needed immediately for Preload UI — do not wait for the full asset pack.
    this.load.image('home-background-image', '/assets/images/home-background-image.webp');
  }

  create(): void {
    eventBus.emit('analytics', { event: AnalyticsEvents.SESSION_START });
    eventBus.emit('app:ready', undefined);
    this.scene.start('Preload');
  }
}
