import Phaser from 'phaser';

import { t, toast } from '@platform/ui';
import { gameConfig } from '@game/config';
import { eventBus } from '@platform/core/events';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { PANEL_BG, PANEL_BORDER, PANEL_CORNER_RADIUS } from '@platform/ui/panel/panelTheme';
import { SkillBarView } from '@game/gameplay/SkillBarView';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { GameplayHUD, type GameplayMode } from '@game/gameplay/GameplayHUD';
import { consumeSkill, type SkillId } from '@game/skills/skillInventory';
import { CardView } from '@game/gameplay/CardView';
import {
  buildPairDeck,
  createCards,
  findMatchingPair,
  layoutMatchingBoard,
  pickRandomRemainingPair,
  shuffled,
  type MatchingBoardLayout,
} from '@game/gameplay/MatchingBoard';
import {
  EXTRA_TIME_SECONDS,
  FLIP_BACK_DELAY_MS,
  INFINITY_BOARD_SIZE,
  INFINITY_GRID,
  INFINITY_COINS_PER_MATCH,
  INFINITY_FAST_MATCH_BONUS,
  INFINITY_FAST_MATCH_MS,
  INFINITY_INITIAL_TIME,
  INFINITY_MISMATCH_PENALTY_FROM_WAVE,
  INFINITY_MISMATCH_PENALTY_SECONDS,
  INFINITY_RESPAWN_DELAY_MS,
  MATCH_CLEAR_DELAY_MS,
  getLevelCellCount,
  getLevelPairCount,
  getLevelTimeSeconds,
  infinityMatchBonusSeconds,
  infinityPairScore,
  infinityWave,
  mapBackgroundKey,
  pickCampaignCardKeys,
  starsFromTimeRatio,
} from '@game/campaign/mapConfig';
import { getUnlockedCardKeys, isInfinityUnlocked, recordLevelStars } from '@game/campaign/progress';
import {
  clearGameRun,
  GAME_RUN_VERSION,
  loadGameRun,
  saveGameRun,
  type GameRunSnapshot,
} from '@game/gameplay/GameRunSave';

export interface GameplaySceneData {
  mode?: GameplayMode;
  mapId?: number;
  levelIndex?: number;
  returnTo?: string;
}

export class GameplayScene extends Phaser.Scene {
  private mode: GameplayMode = 'campaign';
  private mapId = 1;
  private levelIndex = 0;
  private returnTo = 'Home';

  private hud!: GameplayHUD;
  private skillBar!: SkillBarView;
  private layout!: MatchingBoardLayout;
  private cards: CardView[] = [];
  private selected: CardView[] = [];

  private remainingMs = 0;
  private totalMs = 1;
  private score = 0;
  private coinsEarned = 0;
  private matches = 0;
  private combo = 0;
  private startTime = 0;
  private lastMatchAt = 0;

  /** Bumped on reset / abort so in-flight async turns ignore stale work. */
  private runId = 0;
  private gameActive = false;
  private sessionStarted = false;
  private sessionEnded = false;
  private resolving = false;
  private revealArmed = false;
  private cloverArmed = false;
  /** Set as soon as the last campaign pair is confirmed (before clear anim). */
  private pendingCampaignWin = false;

  private infinityPool: string[] = [];
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super({ key: 'Gameplay' });
  }

  init(data: GameplaySceneData = {}): void {
    this.mode = data.mode ?? 'campaign';
    this.mapId = data.mapId ?? 1;
    this.levelIndex = data.levelIndex ?? 0;
    this.returnTo = data.returnTo ?? (this.mode === 'campaign' ? 'LevelSelect' : 'Home');
  }

  create(): void {
    this.cleanupEventListeners();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    if (this.mode === 'infinity' && !isInfinityUnlocked()) {
      toast.show({ message: t('home.infinityLocked'), type: 'warning' });
      this.scene.start('Home');
      return;
    }

    this.resetRunState();
    const restored = loadGameRun(this.mode, this.mapId, this.levelIndex);

    const { width, height } = this.cameras.main;
    this.addBackground(width, height);

    this.skillBar = new SkillBarView(this, {
      onSkillPressed: (id) => this.onSkillPressed(id),
      getSelectedSkillId: () => this.getSelectedSkillId(),
    });
    this.skillBar.create(width, height);

    this.hud = new GameplayHUD(this, {
      mode: this.mode,
      levelNumber: this.levelIndex + 1,
      onBack: () => this.leaveWithoutFinishing(this.returnTo),
    });

    this.buildBoard(width, height, restored);
    this.applyRestoredSkills();
    this.refreshHud();

    eventBus.emit('ad:context:change', { context: 'GAMEPLAY' });

    this.unsubscribers.push(
      eventBus.on('app:back', () => {
        if (!this.canAcceptInput()) return;
        this.leaveWithoutFinishing(this.returnTo);
      }),
      eventBus.on('app:pause', () => this.persistRun())
    );
  }

  update(_time: number, delta: number): void {
    if (!this.canAcceptInput()) return;

    this.remainingMs -= delta;
    this.hud.setTimer(this.remainingMs / 1000);

    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      if (this.resolving) return;
      void this.finishRun(false);
    }
  }

  shutdown(): void {
    if (this.gameActive && !this.sessionEnded) {
      this.persistRun();
    }
    this.runId += 1;
    this.gameActive = false;
    this.cleanupEventListeners();
    this.cards = [];
    this.selected = [];
  }

  private resetRunState(): void {
    this.runId += 1;
    this.cards = [];
    this.selected = [];
    this.score = 0;
    this.coinsEarned = 0;
    this.matches = 0;
    this.combo = 0;
    this.gameActive = true;
    this.sessionStarted = false;
    this.sessionEnded = false;
    this.resolving = false;
    this.revealArmed = false;
    this.cloverArmed = false;
    this.pendingCampaignWin = false;
    this.lastMatchAt = 0;
    this.startTime = Date.now();

    if (this.mode === 'infinity') {
      this.totalMs = INFINITY_INITIAL_TIME * 1000;
      this.infinityPool = shuffled(getUnlockedCardKeys());
    } else {
      this.totalMs = getLevelTimeSeconds(this.mapId, this.levelIndex) * 1000;
      this.infinityPool = [];
    }
    this.remainingMs = this.totalMs;
  }

  private buildBoard(width: number, height: number, restored?: GameRunSnapshot | null): void {
    const top = this.mode === 'infinity' ? 220 : 250;
    const bottom = Math.min(this.skillBar.barBottom - 24, height - 220);
    const cellCount =
      this.mode === 'infinity' ? INFINITY_BOARD_SIZE : getLevelCellCount(this.levelIndex);
    const padX = this.mode === 'infinity' ? 64 : 24;
    this.layout = layoutMatchingBoard(
      cellCount,
      {
        x: padX,
        y: top,
        width: width - padX * 2,
        height: Math.max(280, bottom - top),
      },
      this.mode === 'infinity' ? INFINITY_GRID : undefined
    );

    this.drawBoardPanel(this.layout.bounds);

    if (restored && this.spawnSavedCards(restored)) {
      this.applyGameRun(restored);
      if (this.mode === 'infinity' && this.liveCards().length === 0) {
        this.refillInfinityBoard();
      }
      return;
    }

    const pairKeys =
      this.mode === 'infinity'
        ? this.pickInfinityPairs(cellCount / 2)
        : pickCampaignCardKeys(this.mapId, this.levelIndex, getLevelPairCount(this.levelIndex));

    this.cards = createCards(this, this.layout, buildPairDeck(pairKeys));
    for (const card of this.cards) {
      this.bindCard(card);
    }
  }

  private bindCard(card: CardView): void {
    card.on('pointerup', () => {
      void this.handleCardTap(card);
    });
  }

  private async handleCardTap(card: CardView): Promise<void> {
    if (!this.canAcceptInput() || this.resolving || card.isBusy || card.faceUp) {
      return;
    }
    if (this.selected.includes(card)) return;

    const limit = this.revealArmed ? 3 : 2;
    if (this.selected.length >= limit) return;

    const runId = this.runId;
    this.ensureSessionStarted();
    this.selected.push(card);

    const faceDownLeft = this.liveCards().filter(
      (item) => !item.faceUp && !this.selected.includes(item)
    ).length;
    // Reveal wants 3, but resolve early when nothing face-down remains (e.g. 2-card levels).
    const shouldResolve = this.selected.length >= limit || faceDownLeft === 0;
    if (shouldResolve) this.resolving = true;

    soundManager.playPop();
    await card.flipTo('front');
    if (!this.isRunLive(runId)) return;

    if (shouldResolve) {
      await this.resolveTurn(runId);
    }
  }

  private async resolveTurn(runId: number): Promise<void> {
    this.resolving = true;
    const picked = [...this.selected];
    this.selected = [];

    const pair = findMatchingPair(picked);
    if (!pair) {
      await this.wait(FLIP_BACK_DELAY_MS, runId);
      if (!this.isRunLive(runId)) return;
      await Promise.all(picked.filter((card) => card.active).map((card) => card.flipTo('back')));
      if (!this.isRunLive(runId)) return;
      this.onMismatch();
      this.resolving = false;
      this.clearTurnBoosts();
      this.persistRun();
      await this.finishIfTimedOut(runId);
      return;
    }

    if (
      this.mode === 'campaign' &&
      this.liveCards().every((card) => card === pair[0] || card === pair[1])
    ) {
      this.pendingCampaignWin = true;
    }

    await this.wait(MATCH_CLEAR_DELAY_MS, runId);
    if (!this.isRunLive(runId)) return;

    const leftover = picked.filter((card) => card !== pair[0] && card !== pair[1] && card.active);
    await this.clearMatchedPair(pair[0], pair[1], false, runId);
    if (!this.isRunLive(runId)) return;

    await Promise.all(leftover.map((card) => card.flipTo('back')));
    if (!this.isRunLive(runId)) return;

    if (this.cloverArmed) {
      await this.applyLuckyClover(pair, runId);
      if (!this.isRunLive(runId)) return;
    }

    this.clearTurnBoosts();

    if (this.mode === 'infinity' && this.liveCards().length === 0) {
      await this.wait(INFINITY_RESPAWN_DELAY_MS, runId);
      if (!this.isRunLive(runId)) return;
      this.refillInfinityBoard();
    }

    this.resolving = false;
    this.persistRun();

    if (await this.finishIfTimedOut(runId)) return;

    if (this.mode === 'campaign' && (this.pendingCampaignWin || this.liveCards().length === 0)) {
      await this.finishRun(true);
    }
  }

  private async clearMatchedPair(
    a: CardView,
    b: CardView,
    fromClover: boolean,
    runId: number
  ): Promise<void> {
    this.removeCard(a);
    this.removeCard(b);
    if (this.mode === 'campaign' && this.liveCards().length === 0) {
      this.pendingCampaignWin = true;
    }

    await Promise.all([a.playMatchClear(), b.playMatchClear()]);
    if (!this.isRunLive(runId)) return;

    soundManager.playCombine();
    this.onMatchSuccess(fromClover);
  }

  private async applyLuckyClover(
    justMatched: [CardView, CardView],
    runId: number
  ): Promise<void> {
    const extra = pickRandomRemainingPair(
      this.liveCards().filter((card) => card !== justMatched[0] && card !== justMatched[1])
    );
    if (!extra) return;
    await Promise.all([extra[0].flipTo('front'), extra[1].flipTo('front')]);
    if (!this.isRunLive(runId)) return;
    await this.wait(180, runId);
    if (!this.isRunLive(runId)) return;
    await this.clearMatchedPair(extra[0], extra[1], true, runId);
  }

  private onMatchSuccess(fromClover: boolean): void {
    if (this.sessionEnded && !this.pendingCampaignWin) return;

    this.matches += 1;
    eventBus.emit('merge', { count: 1 });

    if (this.mode === 'infinity') {
      if (!fromClover) {
        this.combo += 1;
        const now = Date.now();
        const fast = this.lastMatchAt > 0 && now - this.lastMatchAt < INFINITY_FAST_MATCH_MS;
        this.lastMatchAt = now;
        this.score += infinityPairScore(this.combo - 1);
        if (fast) this.score += INFINITY_FAST_MATCH_BONUS;
      } else {
        this.score += infinityPairScore(Math.max(0, this.combo - 1));
        this.lastMatchAt = Date.now();
      }
      this.remainingMs += infinityMatchBonusSeconds(infinityWave(this.matches)) * 1000;
      this.coinsEarned += INFINITY_COINS_PER_MATCH;
      this.hud.setScore(this.score);
      this.hud.setCombo(this.combo);
      eventBus.emit('score:update', { score: this.score });
    }
  }

  private onMismatch(): void {
    this.combo = 0;
    this.hud.setCombo(0);
    if (this.mode !== 'infinity') return;

    const wave = infinityWave(this.matches);
    if (wave >= INFINITY_MISMATCH_PENALTY_FROM_WAVE) {
      this.remainingMs -= INFINITY_MISMATCH_PENALTY_SECONDS * 1000;
    }
  }

  private refillInfinityBoard(): void {
    const pairKeys = this.pickInfinityPairs(this.layout.slots.length / 2);
    const deck = buildPairDeck(pairKeys);
    this.cards = [];
    for (const slot of this.layout.slots) {
      const card = new CardView(
        this,
        slot.x,
        slot.y,
        this.layout.cardSize,
        deck[slot.index],
        slot.index
      );
      card.setDepth(10);
      card.setScale(0);
      this.bindCard(card);
      this.cards.push(card);
      this.tweens.add({
        targets: card,
        scale: 1,
        duration: 200,
        ease: 'Back.Out',
      });
    }
  }

  private pickInfinityPairs(pairCount: number): string[] {
    const pool = this.activeInfinityPool();
    const keys: string[] = [];
    for (let i = 0; i < pairCount; i += 1) {
      keys.push(pool[i % pool.length]);
    }
    return keys;
  }

  private activeInfinityPool(): string[] {
    if (this.infinityPool.length === 0) {
      this.infinityPool = ['map-1-o-1'];
    }
    const wave = infinityWave(this.matches);
    const startSize = Math.max(4, Math.ceil(this.infinityPool.length / 2));
    const size = Math.min(this.infinityPool.length, startSize + wave);
    return this.infinityPool.slice(0, Math.max(1, size));
  }

  private onSkillPressed(id: SkillId): void {
    if (!this.canAcceptInput() || this.resolving) return;

    if (id === 'boost_extra_time') {
      if (!consumeSkill(id)) return;
      this.remainingMs += EXTRA_TIME_SECONDS * 1000;
      this.skillBar.refreshInventory(id);
      this.skillBar.setHint('');
      soundManager.playCoinDrop();
      this.persistRun();
      return;
    }

    if (id === 'boost_reveal') {
      if (this.revealArmed || this.selected.length > 0) return;
      if (!consumeSkill(id)) return;
      this.revealArmed = true;
      this.skillBar.refreshInventory(id);
      this.skillBar.setHint(t('game.skillHintReveal'));
      this.skillBar.updateSelectionVisual();
      this.persistRun();
      return;
    }

    if (id === 'boost_lucky_clover') {
      if (this.cloverArmed) return;
      if (!consumeSkill(id)) return;
      this.cloverArmed = true;
      this.skillBar.refreshInventory(id);
      this.skillBar.setHint(t('game.skillHintClover'));
      this.skillBar.updateSelectionVisual();
      this.persistRun();
    }
  }

  private getSelectedSkillId(): SkillId | null {
    if (this.revealArmed) return 'boost_reveal';
    if (this.cloverArmed) return 'boost_lucky_clover';
    return null;
  }

  private clearTurnBoosts(): void {
    this.revealArmed = false;
    this.cloverArmed = false;
    this.skillBar.setHint('');
    this.skillBar.updateSelectionVisual();
  }

  private ensureSessionStarted(): void {
    if (this.sessionStarted) return;
    this.sessionStarted = true;
    this.startTime = Date.now();
    eventBus.emit('game:start', { gameId: gameConfig.id });
  }

  private async finishIfTimedOut(runId: number): Promise<boolean> {
    if (!this.isRunLive(runId)) return true;
    if (this.remainingMs > 0) return false;
    this.remainingMs = 0;
    this.pendingCampaignWin = false;
    await this.finishRun(false);
    return true;
  }

  private async finishRun(won: boolean): Promise<void> {
    if (this.sessionEnded) return;
    this.sessionEnded = true;
    this.gameActive = false;
    this.resolving = false;
    this.pendingCampaignWin = false;
    clearGameRun(this.mode);

    const duration = Date.now() - this.startTime;
    const stars =
      won && this.mode === 'campaign'
        ? starsFromTimeRatio(Math.max(this.remainingMs, 0) / this.totalMs)
        : 0;

    if (this.mode === 'campaign' && won) {
      recordLevelStars(this.mapId, this.levelIndex, stars);
      eventBus.emit('stars:earned', { stars });
    }

    if (this.sessionStarted) {
      eventBus.emit('game:over', {
        score: this.mode === 'infinity' ? this.score : 0,
        duration,
        merges: this.matches,
        coins: this.mode === 'infinity' ? this.coinsEarned : 0,
        submitScore: this.mode === 'infinity',
      });
    }

    if (!this.sys.isActive()) return;
    this.scene.start('GameOver', {
      mode: this.mode,
      won,
      stars,
      score: this.score,
      coins: this.coinsEarned,
      mapId: this.mapId,
      levelIndex: this.levelIndex,
      returnTo: this.returnTo,
    });
  }

  private leaveWithoutFinishing(sceneKey: string): void {
    if (this.sessionEnded) return;

    // Last campaign pair already confirmed — don't discard the win on Back.
    // Still lose if the timer already hit zero during that clear.
    if (this.mode === 'campaign' && this.pendingCampaignWin) {
      void this.finishRun(this.remainingMs > 0);
      return;
    }

    if (this.remainingMs <= 0) {
      void this.finishRun(false);
      return;
    }

    this.persistRun();

    this.runId += 1;
    this.sessionEnded = true;
    this.gameActive = false;
    this.resolving = false;
    this.selected = [];
    this.pendingCampaignWin = false;

    if (sceneKey === 'LevelSelect') {
      this.scene.start('LevelSelect', { mapId: this.mapId, returnTo: 'Map' });
      return;
    }

    this.scene.start(sceneKey, { returnTo: 'Home' });
  }

  private isRunLive(runId: number): boolean {
    return runId === this.runId && !this.sessionEnded;
  }

  private canAcceptInput(): boolean {
    return this.gameActive && !this.sessionEnded;
  }

  private refreshHud(): void {
    this.hud.setTimer(this.remainingMs / 1000);
    if (this.mode === 'infinity') {
      this.hud.setScore(this.score);
      this.hud.setCombo(this.combo);
    }
  }

  private drawBoardPanel(bounds: { x: number; y: number; width: number; height: number }): void {
    const pad = 24;
    const panel = this.add.graphics().setDepth(0);
    drawRoundedRect(
      panel,
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
  }

  private addBackground(width: number, height: number): void {
    const key =
      this.mode === 'campaign' ? mapBackgroundKey(this.mapId) : 'general-background-image';
    const bg = this.add.image(width / 2, height / 2, key);
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }

  private applyGameRun(snapshot: GameRunSnapshot): void {
    this.remainingMs = snapshot.remainingMs;
    this.totalMs = snapshot.totalMs;
    this.score = snapshot.score;
    this.coinsEarned = snapshot.coinsEarned;
    this.matches = snapshot.matches;
    this.combo = snapshot.combo;
    this.sessionStarted = snapshot.sessionStarted;
    this.infinityPool = [...snapshot.infinityPool];
    this.revealArmed = snapshot.revealArmed;
    this.cloverArmed = snapshot.cloverArmed;
    this.startTime = Date.now() - snapshot.elapsedMs;
    this.lastMatchAt = 0;
  }

  private applyRestoredSkills(): void {
    if (this.revealArmed) this.skillBar.setHint(t('game.skillHintReveal'));
    else if (this.cloverArmed) this.skillBar.setHint(t('game.skillHintClover'));
    this.skillBar.updateSelectionVisual(false);
  }

  private spawnSavedCards(snapshot: GameRunSnapshot): boolean {
    const spawned: CardView[] = [];
    for (const saved of snapshot.cards) {
      const slot = this.layout.slots[saved.slotIndex];
      if (!slot || !this.textures.exists(saved.pairKey)) {
        for (const card of spawned) card.destroy();
        return false;
      }
      const card = new CardView(
        this,
        slot.x,
        slot.y,
        this.layout.cardSize,
        saved.pairKey,
        saved.slotIndex
      );
      card.setDepth(10);
      this.bindCard(card);
      spawned.push(card);
    }
    this.cards = spawned;
    return true;
  }

  private persistRun(): void {
    if (!this.gameActive || this.sessionEnded || this.remainingMs <= 0) return;
    saveGameRun({
      version: GAME_RUN_VERSION,
      mode: this.mode,
      mapId: this.mapId,
      levelIndex: this.levelIndex,
      remainingMs: this.remainingMs,
      totalMs: this.totalMs,
      score: this.score,
      coinsEarned: this.coinsEarned,
      matches: this.matches,
      combo: this.combo,
      elapsedMs: Math.max(0, Date.now() - this.startTime),
      sessionStarted: this.sessionStarted,
      infinityPool: [...this.infinityPool],
      cards: this.liveCards().map((card) => ({
        slotIndex: card.slotIndex,
        pairKey: card.pairKey,
      })),
      revealArmed: this.revealArmed,
      cloverArmed: this.cloverArmed,
    });
  }

  private liveCards(): CardView[] {
    return this.cards.filter((card) => card.active && !card.matched);
  }

  private removeCard(card: CardView): void {
    this.cards = this.cards.filter((item) => item !== card);
  }

  private wait(ms: number, runId: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunLive(runId) || !this.sys.isActive()) {
        resolve();
        return;
      }
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private cleanupEventListeners(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}
