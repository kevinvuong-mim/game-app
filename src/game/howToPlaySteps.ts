/**
 * Fruit-merge how-to-play content. Lives in game/ so platform UI stays game-agnostic.
 */
export interface HowToPlayStep {
  titleKey: string;
  bodyKey: string;
  iconKey: string;
  /** Optional second fruit shown beside the primary (merge step). */
  secondaryIconKey?: string;
  /** Texture for the merge result icon (defaults to iconKey when omitted). */
  resultIconKey?: string;
}

export const HOW_TO_PLAY_STEPS: HowToPlayStep[] = [
  {
    titleKey: 'howToPlay.step1Title',
    bodyKey: 'howToPlay.step1Body',
    iconKey: 'fruit-5',
  },
  {
    titleKey: 'howToPlay.step2Title',
    bodyKey: 'howToPlay.step2Body',
    iconKey: 'fruit-6',
    secondaryIconKey: 'fruit-6',
    resultIconKey: 'fruit-4',
  },
  {
    titleKey: 'howToPlay.step3Title',
    bodyKey: 'howToPlay.step3Body',
    iconKey: 'fruit-7',
  },
  {
    titleKey: 'howToPlay.step4Title',
    bodyKey: 'howToPlay.step4Body',
    iconKey: 'shop-item-1',
  },
];
