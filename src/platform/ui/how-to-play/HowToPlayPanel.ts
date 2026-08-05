import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_LIST_PADDING,
  PANEL_CORNER_RADIUS,
} from '../panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '../panel/graphics';
import { createUIButton } from '../button/UIButton';
import { t } from '@platform/modules/i18n/i18n.service';

const NAV_BTN_HEIGHT = 56;
const DOT_ACTIVE = 0x1f6b32;
const DOT_INACTIVE = 0xb5974f;
const CONTENT_TEXT = '#3a372f';

export interface HowToPlayStepConfig {
  bodyKey: string;
  iconKey: string;
  titleKey: string;
  /** Texture for the merge result icon. */
  resultIconKey?: string;
  /** Optional second icon shown beside the primary (merge step). */
  secondaryIconKey?: string;
}

/**
 * Paginated how-to-play guide — Shop/Settings beige panel style.
 * Step content (icons/keys) is injected by the game layer.
 */
export class HowToPlayPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly steps: HowToPlayStepConfig[];

  private navY = 0;
  private iconY = 0;
  private dotsY = 0;
  private stepIndex = 0;
  private panelWidth = 0;
  private navBtnWidth = 0;
  private contentCenterX = 0;
  private stepBody?: Phaser.GameObjects.Text;
  private stepTitle?: Phaser.GameObjects.Text;
  private nextLabel?: Phaser.GameObjects.Text;
  private mergeArrow?: Phaser.GameObjects.Text;
  private resultIcon?: Phaser.GameObjects.Image;
  private iconPrimary?: Phaser.GameObjects.Image;
  private iconSecondary?: Phaser.GameObjects.Image;
  private dots: Phaser.GameObjects.Graphics[] = [];
  private prevButton?: Phaser.GameObjects.Container;
  private nextButton?: Phaser.GameObjects.Container;
  private nextBackground?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    options: {
      onBack: () => void;
      steps: HowToPlayStepConfig[];
    }
  ) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.steps = options.steps;
    scene.add.existing(this);
    this.build();
    this.renderStep();
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    this.panelWidth = Math.min(width * 0.94, 440);
    const panelTop = height * 0.23;
    const panelHeight = height * 0.48;
    const panelLeft = width / 2 - this.panelWidth / 2;
    this.contentCenterX = width / 2;
    this.iconY = panelTop + panelHeight * 0.2;
    this.dotsY = panelTop + panelHeight * 0.76;
    this.navY = panelTop + panelHeight * 0.9;
    this.navBtnWidth = Math.min(150, this.panelWidth * 0.36);

    this.add(
      createUIButton({
        scene: this.scene,
        size: { width: 80, height: 80 },
        background: { key: 'back-icon' },
        onClick: this.onBack,
        position: { x: width * 0.17, y: height * 0.08 },
      })
    );

    this.buildBanner(width, height);

    const panel = this.scene.add.graphics();
    drawRoundedRect(
      panel,
      panelLeft,
      panelTop,
      this.panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
    this.add(panel);

    const placeholderKey = this.steps[0]?.iconKey ?? 'shop-item-1';
    this.iconPrimary = this.scene.add.image(this.contentCenterX, this.iconY, placeholderKey);
    this.iconSecondary = this.scene.add
      .image(this.contentCenterX, this.iconY, placeholderKey)
      .setVisible(false);
    this.mergeArrow = this.scene.add
      .text(this.contentCenterX, this.iconY, '→', {
        fontSize: '36px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.resultIcon = this.scene.add
      .image(this.contentCenterX, this.iconY, placeholderKey)
      .setVisible(false);
    this.add([this.iconPrimary, this.iconSecondary, this.mergeArrow, this.resultIcon]);

    this.stepTitle = this.scene.add
      .text(this.contentCenterX, panelTop + panelHeight * 0.4, '', {
        fontSize: '24px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
        align: 'center',
        wordWrap: { width: this.panelWidth - PANEL_LIST_PADDING * 2 },
      })
      .setOrigin(0.5, 0);
    this.add(this.stepTitle);

    this.stepBody = this.scene.add
      .text(this.contentCenterX, panelTop + panelHeight * 0.5, '', {
        fontSize: '16px',
        color: CONTENT_TEXT,
        fontFamily: FREDOKA_FONT,
        align: 'center',
        wordWrap: { width: this.panelWidth - PANEL_LIST_PADDING * 2 - 8 },
        lineSpacing: 5,
      })
      .setOrigin(0.5, 0);
    this.add(this.stepBody);

    const stepCount = Math.max(this.steps.length, 1);
    const dotGap = 18;
    const dotsWidth = (stepCount - 1) * dotGap;
    for (let index = 0; index < stepCount; index++) {
      const dot = this.scene.add.graphics();
      const x = this.contentCenterX - dotsWidth / 2 + index * dotGap;
      this.drawDot(dot, x, this.dotsY, false);
      this.dots.push(dot);
      this.add(dot);
    }

    this.prevButton = createUIButton({
      scene: this.scene,
      position: {
        x: this.contentCenterX - this.navBtnWidth / 2 - 12,
        y: this.navY,
      },
      size: { width: this.navBtnWidth, height: NAV_BTN_HEIGHT },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('howToPlay.prev').toUpperCase(),
        style: {
          fontSize: 18,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.goToStep(this.stepIndex - 1),
    });
    this.add(this.prevButton);

    this.nextButton = createUIButton({
      scene: this.scene,
      position: {
        x: this.contentCenterX + this.navBtnWidth / 2 + 12,
        y: this.navY,
      },
      size: { width: this.navBtnWidth, height: NAV_BTN_HEIGHT },
      background: { key: 'play-button-background' },
      text: {
        content: t('howToPlay.next').toUpperCase(),
        style: {
          fontSize: 18,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.handleNext(),
    });
    this.nextLabel = this.nextButton.list.find(
      (child): child is Phaser.GameObjects.Text => child instanceof Phaser.GameObjects.Text
    );
    this.nextBackground = this.nextButton.list.find(
      (child): child is Phaser.GameObjects.Image => child instanceof Phaser.GameObjects.Image
    );
    this.add(this.nextButton);
  }

  private buildBanner(width: number, height: number): void {
    const bannerY = height * 0.16;
    const banner = this.scene.add.image(width / 2, bannerY, 'shop-banner');
    const targetWidth = Math.min(width * 0.78, 400);
    const targetHeight = banner.height * (targetWidth / banner.width) * 0.9;
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 10, t('howToPlay.title').toUpperCase(), {
          fontSize: '28px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: targetWidth * 0.85 },
        })
        .setOrigin(0.5)
    );
  }

  private handleNext(): void {
    if (this.stepIndex >= this.steps.length - 1) {
      this.onBack();
      return;
    }
    this.goToStep(this.stepIndex + 1);
  }

  private goToStep(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    this.stepIndex = index;
    this.renderStep();
  }

  private renderStep(): void {
    const step = this.steps[this.stepIndex];
    if (!step) return;

    this.stepTitle?.setText(t(step.titleKey));
    this.stepBody?.setText(t(step.bodyKey));

    const isMergeStep = !!step.secondaryIconKey;
    this.iconPrimary?.setTexture(step.iconKey).setVisible(true);
    this.fitIcon(this.iconPrimary, isMergeStep ? 72 : 110);

    if (
      isMergeStep &&
      this.iconPrimary &&
      this.iconSecondary &&
      this.mergeArrow &&
      this.resultIcon
    ) {
      this.iconSecondary.setTexture(step.secondaryIconKey!).setVisible(true);
      this.fitIcon(this.iconSecondary, 72);
      this.resultIcon.setTexture(step.resultIconKey ?? step.iconKey).setVisible(true);
      this.fitIcon(this.resultIcon, 88);
      this.mergeArrow.setVisible(true);

      this.iconPrimary.setPosition(this.contentCenterX - 110, this.iconY);
      this.iconSecondary.setPosition(this.contentCenterX - 40, this.iconY);
      this.mergeArrow.setPosition(this.contentCenterX + 20, this.iconY);
      this.resultIcon.setPosition(this.contentCenterX + 95, this.iconY);
    } else {
      this.iconSecondary?.setVisible(false);
      this.mergeArrow?.setVisible(false);
      this.resultIcon?.setVisible(false);
      this.iconPrimary?.setPosition(this.contentCenterX, this.iconY);
    }

    const stepCount = Math.max(this.steps.length, 1);
    const dotGap = 18;
    const dotsWidth = (stepCount - 1) * dotGap;
    this.dots.forEach((dot, index) => {
      const x = this.contentCenterX - dotsWidth / 2 + index * dotGap;
      this.drawDot(dot, x, this.dotsY, index === this.stepIndex);
    });

    const isFirst = this.stepIndex === 0;
    const isLast = this.stepIndex === this.steps.length - 1;

    this.prevButton?.setVisible(!isFirst);
    if (isFirst) {
      this.nextButton?.setX(this.contentCenterX);
    } else {
      this.prevButton?.setX(this.contentCenterX - this.navBtnWidth / 2 - 12);
      this.nextButton?.setX(this.contentCenterX + this.navBtnWidth / 2 + 12);
    }

    this.nextLabel?.setText((isLast ? t('howToPlay.done') : t('howToPlay.next')).toUpperCase());
    this.nextBackground?.setTexture(isLast ? 'home-button-background' : 'play-button-background');
  }

  private fitIcon(image: Phaser.GameObjects.Image | undefined, maxSize: number): void {
    if (!image) return;
    const scale = Math.min(maxSize / image.width, maxSize / image.height);
    image.setScale(scale);
  }

  private drawDot(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    active: boolean
  ): void {
    graphics.clear();
    const radius = active ? 7 : 5;
    graphics.fillStyle(active ? DOT_ACTIVE : DOT_INACTIVE, active ? 1 : 0.55);
    graphics.fillCircle(x, y, radius);
  }
}
