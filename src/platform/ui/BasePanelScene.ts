import Phaser from 'phaser';

import { iap } from '@platform/modules/iap';
import { shop } from '@platform/modules/shop';
import { eventBus } from '@platform/core/events';
import type { AdContext } from '@platform/core/advertising';

export interface PanelSceneData {
  returnTo?: string;
  returnData?: Record<string, unknown>;
}

export interface PanelSceneOptions {
  sceneKey: string;
  /** When set, emits `ad:context:change` before the panel builds. */
  adContext?: AdContext;
  backgroundKey?: string;
  defaultReturnTo: string;
}

/** Panels that host a GetCoins modal via PanelHeader / CoinBar. */
export interface GetCoinsOverlayHost {
  hideGetCoinsModal(): void;
  isGetCoinsModalOpen(): boolean;
  /** True while an IAP coin-pack purchase is in flight from this overlay. */
  isPurchaseInFlight?(): boolean;
}

/**
 * Return target captured when leaving a panel via `openScreen`.
 * Phaser reuses `settings.data` when `scene.start` gets a falsy data arg, so going
 * back must pass an explicit payload — otherwise CoinBar hops (Missions ↔ DailyReward)
 * overwrite each other's `returnTo` and back loops forever.
 */
const panelReturnByKey = new Map<string, PanelSceneData>();

export abstract class BasePanelScene extends Phaser.Scene {
  private readonly options: PanelSceneOptions;

  protected returnTo: string;
  private unsubscribers: Array<() => void> = [];
  protected returnData?: Record<string, unknown>;
  /** Set by subclasses whose panel exposes GetCoins overlay dismiss-on-back. */
  protected getCoinsOverlay?: GetCoinsOverlayHost;

  protected constructor(options: PanelSceneOptions) {
    super({ key: options.sceneKey });
    this.options = options;
    this.returnTo = options.defaultReturnTo;
  }

  protected get sceneKey(): string {
    return this.options.sceneKey;
  }

  init(data: PanelSceneData = {}): void {
    this.returnTo = data.returnTo ?? this.options.defaultReturnTo;
    this.returnData = this.resolveReturnData(data);
    this.onSceneInit(data);
  }

  create(): void {
    this.cleanupEventListeners();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    const { width, height } = this.cameras.main;

    if (this.options.adContext) {
      eventBus.emit('ad:context:change', { context: this.options.adContext });
    }

    this.onBeforePanel();

    this.addBackgroundImage(
      width,
      height,
      this.options.backgroundKey ?? 'general-background-image'
    );

    this.createPanel();

    this.unsubscribers.push(eventBus.on('app:back', () => this.handleAppBack()));
    this.onAfterPanel();
  }

  shutdown(): void {
    this.cleanupEventListeners();
    this.onPanelShutdown();
  }

  protected cleanupEventListeners(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  protected resolveReturnData(data: PanelSceneData): Record<string, unknown> | undefined {
    return data.returnData;
  }

  protected abstract createPanel(): void;

  protected onSceneInit(_data: PanelSceneData): void {}

  protected onBeforePanel(): void {}

  protected onAfterPanel(): void {}

  protected onPanelShutdown(): void {}

  /** Block scene changes while shop/IAP purchase is running. */
  protected isNavigationBlockedByPurchase(): boolean {
    if (shop.isPurchaseInFlight() || iap.isPurchasing()) return true;
    if (this.getCoinsOverlay?.isPurchaseInFlight?.()) return true;
    return false;
  }

  /** Override to intercept hardware/system back (e.g. dismiss a modal first). */
  protected handleAppBack(): void {
    if (this.getCoinsOverlay?.isGetCoinsModalOpen()) {
      if (this.getCoinsOverlay.isPurchaseInFlight?.()) return;
      this.getCoinsOverlay.hideGetCoinsModal();
      return;
    }
    this.goBack();
  }

  protected goBack(): void {
    if (this.isNavigationBlockedByPurchase()) return;
    const dest = this.returnTo;
    const saved = panelReturnByKey.get(dest);
    if (saved) panelReturnByKey.delete(dest);
    this.scene.start(dest, this.buildReturnPayload(saved));
  }

  protected openScreen(sceneKey: string, data?: Record<string, unknown>): void {
    if (this.isNavigationBlockedByPurchase()) return;
    // CoinBar can target the panel we came from; pushing would create a returnTo cycle.
    if (sceneKey === this.returnTo) {
      this.goBack();
      return;
    }
    panelReturnByKey.set(this.sceneKey, {
      returnTo: this.returnTo,
      returnData: this.returnData,
    });
    this.scene.start(sceneKey, { returnTo: this.sceneKey, ...data });
  }

  /** Always pass a truthy object — Phaser keeps stale scene data when `data` is omitted. */
  private buildReturnPayload(saved?: PanelSceneData): Record<string, unknown> {
    if (saved) {
      return saved.returnData
        ? { returnTo: saved.returnTo, returnData: saved.returnData }
        : { returnTo: saved.returnTo };
    }
    return this.returnData ?? {};
  }

  private addBackgroundImage(width: number, height: number, key: string): void {
    const bg = this.add.image(width / 2, height / 2, key);
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }
}
