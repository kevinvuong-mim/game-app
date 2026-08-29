import type { AdState, BannerState } from './types';

const SHOWABLE_STATES: AdState[] = ['READY'];
const LOADABLE_STATES: AdState[] = ['IDLE', 'ERROR', 'COMPLETED'];

export class AdStateMachine {
  private state: AdState = 'IDLE';

  getState(): AdState {
    return this.state;
  }

  canLoad(): boolean {
    return LOADABLE_STATES.includes(this.state);
  }

  canShow(): boolean {
    return SHOWABLE_STATES.includes(this.state);
  }

  startLoading(): boolean {
    if (!this.canLoad()) return false;
    this.state = 'LOADING';
    return true;
  }

  markReady(): void {
    this.state = 'READY';
  }

  startShowing(): boolean {
    if (!this.canShow()) return false;
    this.state = 'SHOWING';
    return true;
  }

  markCompleted(): void {
    this.state = 'COMPLETED';
  }

  markError(): void {
    this.state = 'ERROR';
  }

  reset(): void {
    if (this.state !== 'DESTROYED') {
      this.state = 'IDLE';
    }
  }
}

export class BannerStateMachine {
  private state: BannerState = 'IDLE';

  getState(): BannerState {
    return this.state;
  }

  canLoad(): boolean {
    return this.state === 'IDLE' || this.state === 'HIDDEN';
  }

  canShow(): boolean {
    return this.state === 'IDLE' || this.state === 'HIDDEN';
  }

  startLoading(): boolean {
    if (!this.canLoad()) return false;
    this.state = 'LOADING';
    return true;
  }

  markVisible(): void {
    this.state = 'VISIBLE';
  }

  markHidden(): void {
    if (this.state !== 'DESTROYED') {
      this.state = 'HIDDEN';
    }
  }

  markDestroyed(): void {
    this.state = 'DESTROYED';
  }

  /** Leave DESTROYED so banners can load again after ads are re-enabled. */
  forceReset(): void {
    this.state = 'IDLE';
  }

  reset(): void {
    if (this.state !== 'DESTROYED') {
      this.state = 'IDLE';
    }
  }
}
