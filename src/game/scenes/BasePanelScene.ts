import Phaser from 'phaser';

import { t } from '@platform/ui';
import { eventBus } from '@platform/core/events';
import { createUIButton, UIButtonBackgroundKey } from '@platform/ui/button/UIButton';

export interface PanelSceneData {
  returnTo?: string;
  returnData?: Record<string, unknown>;
}

export interface PanelSceneOptions {
  sceneKey: string;
  backgroundKey?: string;
  defaultReturnTo: string;
  /** When set, emits `ad:context:change` before the panel builds. */
  adContext?: string;
}

export abstract class BasePanelScene extends Phaser.Scene {
  private readonly options: PanelSceneOptions;

  protected returnTo: string;
  private unsubscribers: Array<() => void> = [];
  protected returnData?: Record<string, unknown>;

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

  /** Override to intercept hardware/system back (e.g. dismiss a modal first). */
  protected handleAppBack(): void {
    this.goBack();
  }

  protected goBack(): void {
    this.scene.start(this.returnTo, this.returnData);
  }

  protected addCloseButton(yRatio = 0.9): void {
    const { width, height } = this.cameras.main;
    createUIButton({
      scene: this,
      onClick: () => this.goBack(),
      size: { width: 200, height: 48 },
      text: { content: t('common.close') },
      position: { x: width / 2, y: height * yRatio },
      background: { key: UIButtonBackgroundKey.Primary },
    });
  }

  protected openScreen(sceneKey: string, data?: Record<string, unknown>): void {
    this.scene.start(sceneKey, { returnTo: this.sceneKey, ...data });
  }

  private addBackgroundImage(width: number, height: number, key: string): void {
    const bg = this.add.image(width / 2, height / 2, key);
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }
}
