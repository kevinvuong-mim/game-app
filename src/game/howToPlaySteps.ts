import type { HowToPlayStepConfig } from '@platform/ui';

/**
 * Fruit-merge how-to-play content. Lives in game/ so platform UI stays game-agnostic.
 */
export const HOW_TO_PLAY_STEPS: HowToPlayStepConfig[] = [
  {
    iconKey: 'fruit-5',
    bodyKey: 'howToPlay.step1Body',
    titleKey: 'howToPlay.step1Title',
  },
  {
    iconKey: 'fruit-6',
    resultIconKey: 'fruit-7',
    secondaryIconKey: 'fruit-6',
    bodyKey: 'howToPlay.step2Body',
    titleKey: 'howToPlay.step2Title',
  },
  {
    iconKey: 'fruit-7',
    bodyKey: 'howToPlay.step3Body',
    titleKey: 'howToPlay.step3Title',
  },
  {
    iconKey: 'shop-item-1',
    bodyKey: 'howToPlay.step4Body',
    titleKey: 'howToPlay.step4Title',
  },
];
