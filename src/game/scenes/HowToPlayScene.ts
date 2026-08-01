import { HowToPlayPanel } from '@platform/ui';
import { HOW_TO_PLAY_STEPS } from '@game/howToPlaySteps';
import { BasePanelScene } from '@platform/ui/BasePanelScene';

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
      steps: HOW_TO_PLAY_STEPS,
    });
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}
