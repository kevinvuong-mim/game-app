import { BasePanelScene } from './BasePanelScene';
import { MissionsPanel } from '@platform/ui';

export class MissionsScene extends BasePanelScene {
  private panel?: MissionsPanel;

  constructor() {
    super({
      sceneKey: 'Missions',
      defaultReturnTo: 'Home',
    });
  }

  protected createPanel(): void {
    this.panel = new MissionsPanel(this, {
      onBack: () => this.goBack(),
      onNavigate: (sceneKey) => this.openScreen(sceneKey),
    });
  }

  protected handleAppBack(): void {
    if (this.panel?.isGetCoinsModalOpen()) {
      this.panel.hideGetCoinsModal();
      return;
    }
    this.goBack();
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}
