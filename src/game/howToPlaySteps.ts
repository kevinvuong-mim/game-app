import type { HowToPlayStepConfig } from '@platform/ui';

export const HOW_TO_PLAY_STEPS: HowToPlayStepConfig[] = [
  {
    iconKey: 'card-back',
    bodyKey: 'howToPlay.step1Body',
    titleKey: 'howToPlay.step1Title',
  },
  {
    iconKey: 'card-front',
    secondaryIconKey: 'card-front',
    resultIconKey: 'star-active',
    bodyKey: 'howToPlay.step2Body',
    titleKey: 'howToPlay.step2Title',
  },
  {
    iconKey: 'star-active',
    bodyKey: 'howToPlay.step3Body',
    titleKey: 'howToPlay.step3Title',
  },
  {
    iconKey: 'shop-item-1',
    bodyKey: 'howToPlay.step4Body',
    titleKey: 'howToPlay.step4Title',
  },
];
