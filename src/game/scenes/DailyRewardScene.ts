import { DailyRewardPanel } from '@platform/ui';
import { BasePanelScene } from '@platform/ui/BasePanelScene';

export class DailyRewardScene extends BasePanelScene {
  private panel?: DailyRewardPanel;

  constructor() {
    super({
      sceneKey: 'DailyReward',
      defaultReturnTo: 'Home',
    });
  }

  protected createPanel(): void {
    this.panel = new DailyRewardPanel(this, {
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
