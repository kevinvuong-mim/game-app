import { BasePanelScene, type PanelSceneData } from './BasePanelScene';
import { LegalPanel, type LegalTab } from '@platform/ui';

interface LegalSceneData extends PanelSceneData {
  tab?: LegalTab;
}

export class LegalScene extends BasePanelScene {
  private panel?: LegalPanel;
  private initialTab: LegalTab = 'terms';

  constructor() {
    super({
      sceneKey: 'Legal',
      defaultReturnTo: 'Settings',
    });
  }

  protected onSceneInit(data: LegalSceneData): void {
    this.initialTab = data.tab === 'privacy' ? 'privacy' : 'terms';
  }

  protected createPanel(): void {
    this.panel = new LegalPanel(this, {
      initialTab: this.initialTab,
      onBack: () => this.goBack(),
    });
  }

  protected onPanelShutdown(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}
