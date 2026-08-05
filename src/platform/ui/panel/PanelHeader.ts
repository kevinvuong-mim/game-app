import Phaser from 'phaser';

import { CoinBar } from './CoinBar';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '../button/UIButton';
import { t } from '@platform/modules/i18n/i18n.service';

export interface PanelHeaderOptions {
  titleKey: string;
  bannerKey?: string;
  onBack: () => void;
  /** Target banner display width in px. Defaults to min(screen*0.72, 360). */
  bannerWidth?: number;
  /** Hide the + button / get-coins modal (e.g. when already offering coin sources). */
  showGetCoins?: boolean;
  /** Scene keys to omit from the get-coins modal (e.g. hide Missions while already there). */
  excludeGetCoinScenes?: string[];
  onNavigate: (sceneKey: string) => void;
}

/**
 * Shared beige-panel header: back button, title banner, coin bar (+ optional get-coins modal).
 */
export class PanelHeader extends Phaser.GameObjects.Container {
  private coinBar?: CoinBar;

  constructor(scene: Phaser.Scene, options: PanelHeaderOptions) {
    super(scene, 0, 0);
    scene.add.existing(this);

    const { width, height } = scene.cameras.main;
    this.buildHeader(width, height, options);
    this.buildBanner(
      width,
      height,
      options.titleKey,
      options.bannerKey ?? 'shop-banner',
      options.bannerWidth
    );
  }

  destroy(fromScene?: boolean): void {
    this.coinBar = undefined;
    super.destroy(fromScene);
  }

  isGetCoinsModalOpen(): boolean {
    return !!this.coinBar?.isGetCoinsModalOpen();
  }

  getCoinIconWorldPosition(): { x: number; y: number } | null {
    return this.coinBar?.getCoinIconWorldPosition() ?? null;
  }

  pulseCoinReceive(): void {
    this.coinBar?.pulseReceive();
  }

  playCoinSpendDip(amount: number): void {
    this.coinBar?.playSpendDip(amount);
  }

  showGetCoinsModal(): void {
    this.coinBar?.showGetCoinsModal();
  }

  hideGetCoinsModal(): void {
    this.coinBar?.hideGetCoinsModal();
  }

  private buildHeader(width: number, height: number, options: PanelHeaderOptions): void {
    const headerY = height * 0.08;

    this.add(
      createUIButton({
        scene: this.scene,
        size: { width: 80, height: 80 },
        background: { key: 'back-icon' },
        onClick: options.onBack,
        position: { x: width * 0.17, y: headerY },
      })
    );

    this.coinBar = new CoinBar(this.scene, {
      y: headerY,
      align: 'right',
      x: width * 0.88,
      showGetCoins: options.showGetCoins,
      excludeGetCoinScenes: options.excludeGetCoinScenes,
      onNavigate: options.onNavigate,
    });
    this.add(this.coinBar);
  }

  private buildBanner(
    width: number,
    height: number,
    titleKey: string,
    bannerKey: string,
    bannerWidth?: number
  ): void {
    const bannerY = height * 0.18;
    const banner = this.scene.add.image(width / 2, bannerY, bannerKey);
    const defaultWidth = Math.min(width * 0.72, 360);
    const targetWidth = bannerWidth ?? defaultWidth;
    const targetHeight = banner.height * (defaultWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 16, t(titleKey), {
          fontSize: '48px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
  }
}
