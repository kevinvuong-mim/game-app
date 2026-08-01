import { BasePanelScene } from '@platform/ui/BasePanelScene';
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
    this.getCoinsOverlay = this.panel;
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
    this.getCoinsOverlay = undefined;
  }
}
