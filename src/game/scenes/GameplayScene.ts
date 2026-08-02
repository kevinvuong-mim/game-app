import Phaser from 'phaser';

import {
  GameplayHUD,
  MergeSystem,
  saveGameRun,
  SkillBarView,
  FruitFactory,
  DropController,
  type FruitBody,
  SkillController,
  isMeaningfulRun,
  loadGameRunSave,
  CONTAINER_INSET,
  clearGameRunSave,
  DangerLineSystem,
  type GameRunSnapshot,
} from '@game/gameplay';
import { gameConfig } from '@game/config';
import { usePlatformStore } from '@platform/ui';
import { randomSpawnLevel } from '@game/fruits';
import { eventBus } from '@platform/core/events';
import { soundManager } from '@platform/ui/audio/SoundManager';

/**
 * Suika-style merge gameplay — composition root for gameplay systems.
 */
export class GameplayScene extends Phaser.Scene {
  private readonly fruits = new Set<FruitBody>();
  private readonly onCollision = (
    _event: Phaser.Physics.Matter.Events.CollisionStartEvent,
    bodyA: MatterJS.BodyType,
    bodyB: MatterJS.BodyType
  ) => this.mergeSystem.handleCollision(bodyA, bodyB);
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer) =>
    this.handlePointerMove(pointer);
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.hud?.isQuitConfirmOpen()) {
      this.dropGestureArmed = false;
      return;
    }
    this.dropGestureArmed = true;
    this.skillBar.onPointerDown(pointer);
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer);

  private score = 0;
  private merges = 0;
  private dangerY = 0;
  private nextLevel = 0;
  private startTime = 0;
  private canDrop = true;
  private currentLevel = 0;
  private gameActive = true;
  private hud!: GameplayHUD;
  private returnTo = 'Home';
  private sessionEnded = false;
  private startingHighScore = 0;
  private sessionStarted = false;
  private factory!: FruitFactory;
  private skillBar!: SkillBarView;
  /** Only drop if this press started while gameplay (not while quit modal was open). */
  private dropGestureArmed = false;
  private skills!: SkillController;
  private mergeSystem!: MergeSystem;
  private dangerLine!: DangerLineSystem;
  private dropController!: DropController;
  private unsubscribers: Array<() => void> = [];
  private undoSnapshot: GameRunSnapshot | null = null;

  constructor() {
    super({ key: 'Gameplay' });
  }

  init(data: { returnTo?: string } = {}): void {
    this.returnTo = data.returnTo ?? 'Home';
  }

  create(): void {
    this.cleanupEventListeners();
    this.fruits.clear();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    const { width, height } = this.cameras.main;
    const saved = loadGameRunSave();

    this.startTime = Date.now();
    this.score = 0;
    this.merges = 0;
    this.gameActive = true;
    this.sessionEnded = false;
    this.sessionStarted = false;
    this.canDrop = true;
    this.startingHighScore = usePlatformStore.getState().progress.highScore;
    this.undoSnapshot = null;

    this.factory = new FruitFactory(this, this.fruits);
    this.factory.reset();

    this.mergeSystem = new MergeSystem(this.fruits, this.factory, {
      isActive: () => this.isGameplayInteractive(),
      onScore: (points) => this.addScore(points),
      onMerge: () => {
        this.merges += 1;
        soundManager.playCombine();
      },
    });
    this.mergeSystem.reset();

    this.dropController = new DropController(this, {
      isActive: () => this.isGameplayInteractive(),
      canDrop: () => this.canDrop,
      setCanDrop: (value) => {
        this.canDrop = value;
      },
      hasActiveSkill: () => this.skills.active !== null,
      onBeforeDrop: () => this.pushUndoCheckpoint(),
      onFirstDrop: () => {
        if (this.sessionStarted) return;
        this.sessionStarted = true;
        this.startTime = Date.now();
        eventBus.emit('game:start', { gameId: gameConfig.id });
      },
      onDropped: (level) => {
        this.factory.spawn(this.dropController.x, this.dropController.y, level);
        this.dangerLine.armGrace(600);
      },
      getCurrentLevel: () => this.currentLevel,
      advanceLevels: () => {
        this.currentLevel = this.nextLevel;
        this.nextLevel = randomSpawnLevel();
      },
    });

    this.dangerLine = new DangerLineSystem(this.fruits, {
      isActive: () => this.isGameplayInteractive(),
      onGameOver: (violators) => this.triggerGameOver(violators),
    });

    this.skillBar = new SkillBarView(this, {
      onSkillPressed: (id) => this.skills.onSkillPressed(id),
      getSelectedSkillId: () => this.skills.selectedSkillId,
    });

    this.skills = new SkillController(this.factory, this.skillBar, {
      isActive: () => this.isGameplayInteractive(),
      canDrop: () => this.canDrop,
      getCurrentLevel: () => this.currentLevel,
      getNextLevel: () => this.nextLevel,
      setLevels: (current, next) => {
        this.currentLevel = current;
        this.nextLevel = next;
      },
      refreshDropper: () => this.dropController.refreshVisual(),
      hideDropper: () => this.dropController.hide(),
      pushUndoCheckpoint: () => this.pushUndoCheckpoint(),
      canUndo: () => this.undoSnapshot != null,
      undoLastMove: () => this.applyUndo(),
    });
    this.skills.reset();

    this.matter.world.setBounds(0, 0, width, height, 64, false, false, false, false);

    this.addBackgroundImage(width, height);
    this.factory.ensureTextures();
    this.createContainer(width, height);
    this.skillBar.create(width, height);

    this.hud = new GameplayHUD(this, {
      onBack: () => {
        if (this.hud.isQuitConfirmOpen()) {
          this.hud.hideQuitConfirm();
          return;
        }
        if (this.gameActive) {
          this.abortSession();
          this.scene.start(this.returnTo);
        }
      },
      onQuit: () => {
        if (!this.gameActive) return;
        const isNewRecord = this.score > this.startingHighScore;
        this.completeSession();
        this.scene.start('GameOver', {
          score: this.score,
          returnTo: this.returnTo,
          isNewRecord,
        });
      },
      onQuitConfirmOpen: () => {
        this.dropGestureArmed = false;
        this.matter.world.pause();
      },
      onQuitConfirmClose: () => {
        this.dropGestureArmed = false;
        if (this.gameActive && !this.sessionEnded) {
          this.matter.world.resume();
          this.dropController.refreshVisual();
        }
      },
    });

    if (saved && isMeaningfulRun(saved)) {
      this.restoreRun(saved);
    } else {
      this.hud.setScore(0);
      this.currentLevel = randomSpawnLevel();
      this.nextLevel = randomSpawnLevel();
      this.dropController.refreshVisual();
    }

    this.input.on('pointerdown', this.onPointerDown);
    this.input.on('pointermove', this.onPointerMove);
    this.input.on('pointerup', this.onPointerUp);
    this.matter.world.on('collisionstart', this.onCollision);
    this.matter.world.on('collisionactive', this.onCollision);

    eventBus.emit('ad:context:change', { context: 'GAMEPLAY' });

    this.unsubscribers.push(
      eventBus.on('app:back', () => {
        if (!this.gameActive) return;
        if (this.hud.isQuitConfirmOpen()) {
          this.hud.hideQuitConfirm();
          return;
        }
        if (this.skills.active) {
          this.skills.clear();
          return;
        }
        this.abortSession();
        this.scene.start(this.returnTo);
      }),
      eventBus.on('app:pause', () => {
        if (!this.gameActive || this.sessionEnded) return;
        this.persistRun();
      })
    );
  }

  shutdown(): void {
    // Leaving via back already aborted; leaving via GameOver already completed.
    // Any other teardown should not fire interstitial / sync as a finished match.
    this.abortSession();
    this.cleanupEventListeners();
    this.fruits.clear();
  }

  update(): void {
    if (!this.isGameplayInteractive()) return;
    this.mergeSystem.flushMergeQueue();
    this.mergeSystem.queueProximityMerges();
    this.mergeSystem.flushMergeQueue();
    this.dropController.updateGuide();
    this.dangerLine.check();
  }

  private isGameplayInteractive(): boolean {
    return this.gameActive && !this.hud?.isQuitConfirmOpen();
  }

  private cleanupEventListeners(): void {
    this.input.off('pointermove', this.onPointerMove);
    this.input.off('pointerup', this.onPointerUp);
    this.input.off('pointerdown', this.onPointerDown);
    this.matter.world?.off('collisionstart', this.onCollision);
    this.matter.world?.off('collisionactive', this.onCollision);
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /** Leave mid-run and persist progress — keep high-score checkpoint, not a finished match. */
  private abortSession(): void {
    if (this.sessionEnded) return;
    this.sessionEnded = true;
    this.gameActive = false;

    this.persistRun();

    if (!this.sessionStarted) return;
    eventBus.emit('score:update', { score: this.score });
  }

  /** Real game-over — analytics, interstitial, offline score sync. */
  private completeSession(): void {
    if (this.sessionEnded) return;
    this.sessionEnded = true;
    this.gameActive = false;
    clearGameRunSave();

    if (!this.sessionStarted) return;

    const duration = Date.now() - this.startTime;
    eventBus.emit('score:update', { score: this.score });
    eventBus.emit('game:over', {
      score: this.score,
      duration,
      merges: this.merges,
    });
  }

  private captureRun(): GameRunSnapshot {
    // Matter collision can mark isMerging before flushMergeQueue runs — finish
    // pending merges first so pause/save never drops both parents without the child.
    this.mergeSystem.flushMergeQueue();

    const fruits = [...this.fruits]
      .filter((fruit) => fruit.active && !fruit.isMerging)
      .map((fruit) => {
        const body = fruit.body as MatterJS.BodyType;
        return {
          x: fruit.x,
          y: fruit.y,
          level: fruit.fruitLevel,
          scoreMultiplier: fruit.scoreMultiplier,
          vx: body.velocity?.x ?? 0,
          vy: body.velocity?.y ?? 0,
          angularVelocity: body.angularVelocity ?? 0,
        };
      });

    return {
      version: 1,
      score: this.score,
      merges: this.merges,
      elapsedMs: this.sessionStarted ? Date.now() - this.startTime : 0,
      sessionStarted: this.sessionStarted,
      currentLevel: this.currentLevel,
      nextLevel: this.nextLevel,
      dropperX: this.dropController.x,
      fruits,
    };
  }

  private pushUndoCheckpoint(): void {
    this.undoSnapshot = this.captureRun();
  }

  private applyUndo(): void {
    const saved = this.undoSnapshot;
    if (!saved) return;

    this.undoSnapshot = null;
    for (const fruit of [...this.fruits]) {
      this.factory.destroy(fruit);
    }
    this.restoreRun(saved);
  }

  private persistRun(): void {
    const snapshot = this.captureRun();
    if (!isMeaningfulRun(snapshot)) {
      clearGameRunSave();
      return;
    }
    saveGameRun(snapshot);
  }

  private restoreRun(saved: GameRunSnapshot): void {
    this.score = saved.score;
    this.merges = saved.merges;
    this.sessionStarted = saved.sessionStarted;
    this.startTime = Date.now() - saved.elapsedMs;
    this.currentLevel = saved.currentLevel;
    this.nextLevel = saved.nextLevel;
    this.canDrop = true;

    this.hud.setScore(this.score);
    this.dropController.setDropperX(saved.dropperX);
    this.dropController.refreshVisual();

    for (const fruit of saved.fruits) {
      const spawned = this.factory.spawn(fruit.x, fruit.y, fruit.level, fruit.scoreMultiplier);
      spawned.setVelocity(fruit.vx, fruit.vy);
      spawned.setAngularVelocity(fruit.angularVelocity);
    }

    // Pile may still be settling after restore/undo — avoid instant false game-over.
    this.dangerLine.armGrace(1000);
  }

  private addBackgroundImage(width: number, height: number): void {
    const bg = this.add.image(width / 2, height / 2, 'general-background-image');
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }

  private createContainer(width: number, height: number): void {
    const displayW = Math.min(width * 0.88, 520);
    // Fallback matches PreloadScene glass-container placeholder (479×592).
    let aspect = 592 / 479;
    if (this.textures.exists('glass-container')) {
      const source = this.textures.get('glass-container').getSourceImage() as HTMLImageElement;
      if (source?.width > 0 && source?.height > 0) {
        aspect = source.height / source.width;
      }
    }
    const displayH = displayW * aspect * 1.2;
    const centerX = width / 2;
    const centerY = Math.min(height * 0.5, height - 200 - displayH / 2);

    const container = this.add.image(centerX, centerY, 'glass-container');
    container.setDisplaySize(displayW, displayH);
    container.setDepth(2);

    const left = centerX - displayW / 2 + displayW * CONTAINER_INSET.left;
    const right = centerX + displayW / 2 - displayW * CONTAINER_INSET.right;
    const top = centerY - displayH / 2 + displayH * CONTAINER_INSET.top;
    const bottom = centerY + displayH / 2 - displayH * CONTAINER_INSET.bottom;

    this.dangerY = top;
    this.dangerLine.setDangerY(this.dangerY);

    const wallThickness = 40;
    const wallH = bottom - top + wallThickness;
    const floorW = right - left + wallThickness;

    this.matter.add.rectangle(left - wallThickness / 2, top + wallH / 2, wallThickness, wallH, {
      isStatic: true,
      label: 'wall',
      friction: 0.4,
    });
    this.matter.add.rectangle(right + wallThickness / 2, top + wallH / 2, wallThickness, wallH, {
      isStatic: true,
      label: 'wall',
      friction: 0.4,
    });
    this.matter.add.rectangle(centerX, bottom + wallThickness / 2, floorW, wallThickness, {
      isStatic: true,
      label: 'floor',
      friction: 0.5,
    });

    this.dropController.setupVisuals({ left, right, top, bottom, centerX }, top - 60);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.hud?.isQuitConfirmOpen() || !this.dropGestureArmed) return;
    if (this.skillBar.onPointerMove(pointer)) return;
    this.dropController.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const canDropFromGesture = this.dropGestureArmed && !this.hud?.isQuitConfirmOpen();
    this.dropGestureArmed = false;

    if (!canDropFromGesture) return;
    if (this.skillBar.onPointerUp(pointer)) return;

    if (!this.gameActive) return;

    if (this.skills.active) {
      this.skills.handlePointer(pointer);
      return;
    }

    // HUD / modal buttons are interactive — don't treat their release as a drop.
    if (this.input.hitTestPointer(pointer).length > 0) return;

    this.dropController.tryDrop(pointer);
  }

  private addScore(points: number): void {
    this.score += points;
    this.hud.setScore(this.score);
    eventBus.emit('score:update', { score: this.score });
  }

  private triggerGameOver(violators: FruitBody[]): void {
    if (!this.gameActive || this.sessionEnded) return;

    const isNewRecord = this.score > this.startingHighScore;
    // Complete immediately so deeplink/pause during the flash still syncs the match
    // and abortSession cannot re-persist a cleared lose-state run.
    this.completeSession();
    this.canDrop = false;
    this.skills.clear();
    this.dropController.hide();

    this.matter.world.pause();
    this.dangerLine.flashViolators(this, violators);

    this.time.delayedCall(3000, () => {
      if (!this.sys.isActive()) return;
      this.scene.start('GameOver', {
        score: this.score,
        returnTo: this.returnTo,
        isNewRecord,
      });
    });
  }
}
