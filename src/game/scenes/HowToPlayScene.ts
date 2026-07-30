import { BasePanelScene } from './BasePanelScene';
import { HowToPlayPanel } from '@platform/ui';

export class HowToPlayScene extends BasePanelScene {
  private panel?: HowToPlayPanel;

  constructor() {
    super({
      sceneKey: 'HowToPlay',
      defaultReturnTo: 'Home',
    });
  }

  protected createPanel(): void {
    this.panel = new HowToPlayPanel(this, {
      onBack: () => this.goBack(),
    });
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}
