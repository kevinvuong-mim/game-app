import { BasePanelScene } from './BasePanelScene';
import { DailyRewardPanel } from '@platform/ui';

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
