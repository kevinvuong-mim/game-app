import { BasePanelScene } from './BasePanelScene';
import { SettingsPanel } from '@platform/ui';

export class SettingsScene extends BasePanelScene {
  private panel?: SettingsPanel;

  constructor() {
    super({
      sceneKey: 'Settings',
      defaultReturnTo: 'Home',
    });
  }

  protected createPanel(): void {
    this.panel = new SettingsPanel(this, {
      onBack: () => this.goBack(),
      onNavigate: (sceneKey, data) => this.openScreen(sceneKey, data),
    });
  }

  protected handleAppBack(): void {
    if (this.panel?.isPurchaseModalOpen()) {
      this.panel.hidePurchaseModal();
      return;
    }
    // Defer so scene teardown is not mid-input (avoids canvas drawImage null crash).
    this.time.delayedCall(0, () => {
      if (this.sys.isActive()) this.goBack();
    });
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}
