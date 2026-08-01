import { ShopPanel } from '@platform/ui';
import { BasePanelScene } from '@platform/ui/BasePanelScene';

export class ShopScene extends BasePanelScene {
  private panel?: ShopPanel;

  constructor() {
    super({
      sceneKey: 'Shop',
      adContext: 'SHOP',
      defaultReturnTo: 'Home',
    });
  }

  protected createPanel(): void {
    this.panel = new ShopPanel(this, {
      onBack: () => this.goBack(),
      onNavigate: (sceneKey) => this.openScreen(sceneKey),
    });
    this.getCoinsOverlay = this.panel;
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
    this.getCoinsOverlay = undefined;
  }
}
