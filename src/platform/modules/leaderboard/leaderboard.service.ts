import {
  isCacheFresh,
  createInitialView,
  type LeaderboardData,
  type LeaderboardView,
} from './leaderboard.model';
import { ApiError } from '@platform/core/api';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { usePlatformStore } from '@platform/core/state';
import { guest, type GuestService } from '@platform/modules/guest';
import { leaderboardRepository, type LeaderboardRepository } from './leaderboard.repository';

export interface FetchOptions {
  page?: number;
  force?: boolean;
}

export class LeaderboardService {
  private fetchSeq = 0;
  private currentPage = 1;
  private inflightPage: number | null = null;
  private view: LeaderboardView = createInitialView();
  private inflight: Promise<LeaderboardView> | null = null;

  constructor(
    private readonly repository: LeaderboardRepository = leaderboardRepository,
    private readonly guestService: GuestService = guest
  ) {}

  async init(): Promise<void> {
    const gameId = getConfig().gameId;
    const cache = await this.repository.loadCache(
      gameId,
      this.currentPage,
      this.guestService.getGuestId()
    );
    if (cache) {
      this.view = this.enrichWithLocalBest(
        this.buildView(cache.data, {
          fromCache: true,
          isStale: !isCacheFresh(cache),
          lastUpdated: cache.updatedAt,
        })
      );
      this.emit(this.view);
    }
    logger.info('[Leaderboard] Initialized');
  }

  async fetchLeaderboard(options: FetchOptions = {}): Promise<LeaderboardView> {
    if (options.page) {
      this.currentPage = options.page;
    }

    const current = this.view;
    if (!options.force && current.lastUpdated && !current.fromCache && !current.isStale) {
      const fresh =
        isCacheFresh({
          page: this.currentPage,
          data: this.toData(current),
          updatedAt: current.lastUpdated,
        }) && current.pagination.page === this.currentPage;
      if (fresh && current.status === 'ready') {
        this.emit(current);
        return current;
      }
    }

    // Always SWR: surface durable cache before waiting on the network.
    await this.serveCachedPage(this.currentPage);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (this.view.entries.length === 0) {
        return this.applyFailure(new Error('offline'));
      }
      return this.view;
    }

    // Reuse in-flight only for the same page and non-forced refresh.
    if (!options.force && this.inflight && this.inflightPage === this.currentPage) {
      return this.inflight;
    }

    const page = this.currentPage;
    const seq = ++this.fetchSeq;
    const request = this.runFetch(seq, page).finally(() => {
      if (this.inflight === request) {
        this.inflight = null;
        this.inflightPage = null;
      }
    });
    this.inflight = request;
    this.inflightPage = page;
    return request;
  }

  async refreshLeaderboard(page?: number): Promise<LeaderboardView> {
    // Force bypasses TTL freshness but still serves cache first (see fetchLeaderboard).
    return this.fetchLeaderboard({ force: true, page });
  }

  updateSelfRank(rank: number, bestScore: number): void {
    const view = {
      ...this.view,
      myRank: rank,
      isStale: true,
      myBestScore: bestScore,
    };
    this.view = view;
    this.emit(view);
    void this.persistSelfRank(rank, bestScore);
  }

  /** Drop in-memory view after guest identity changes so cache.self cannot leak. */
  resetForGuestChange(): void {
    this.fetchSeq += 1;
    this.inflight = null;
    this.inflightPage = null;
    this.view = createInitialView();
    this.emit(this.view);
  }

  private async serveCachedPage(page: number): Promise<boolean> {
    const gameId = getConfig().gameId;
    const cache = await this.repository.loadCache(gameId, page, this.guestService.getGuestId());
    if (!cache) {
      return false;
    }

    const view = this.keepFresherSelf(
      this.enrichWithLocalBest(
        this.buildView(cache.data, {
          fromCache: true,
          isStale: !isCacheFresh(cache),
          lastUpdated: cache.updatedAt,
        })
      )
    );

    this.view = view;
    this.emit(view);
    return true;
  }

  /** Cache may lag `updateSelfRank` if persist has not finished yet. */
  private keepFresherSelf(view: LeaderboardView): LeaderboardView {
    const current = this.view;
    if (current.myRank === null || current.myBestScore === null) return view;
    if (view.myBestScore !== null && view.myBestScore > current.myBestScore) return view;
    return {
      ...view,
      myRank: current.myRank,
      myBestScore: current.myBestScore,
    };
  }

  private async persistSelfRank(rank: number, bestScore: number): Promise<void> {
    const gameId = getConfig().gameId;
    const guestId = this.guestService.getGuestId();
    const cache = await this.repository.loadCache(gameId, this.currentPage, guestId);
    if (!cache) return;

    await this.repository.saveCache(
      {
        ...cache,
        data: { ...cache.data, self: { rank, bestScore } },
      },
      gameId,
      guestId
    );
  }

  private async runFetch(seq: number, page: number): Promise<LeaderboardView> {
    const gameId = getConfig().gameId;
    const hasData = this.view.entries.length > 0;

    this.transition({ status: hasData ? 'refreshing' : 'loading', error: null });

    const guestId = this.guestService.getGuestId();

    try {
      const data = await this.repository.fetch({
        gameId,
        page,
        guestId,
      });

      // Discard stale responses from an older page/force request.
      if (seq !== this.fetchSeq) {
        return this.view;
      }

      return this.applySuccess(data, guestId);
    } catch (error) {
      if (seq !== this.fetchSeq) {
        return this.view;
      }

      if (error instanceof ApiError && error.status === 404) {
        logger.error('[Leaderboard] Game not found on backend — check gameId config', error);
      }

      return this.applyFailure(error);
    }
  }

  private async applySuccess(
    data: LeaderboardData,
    guestId: string | null
  ): Promise<LeaderboardView> {
    const updatedAt = Date.now();
    await this.repository.saveCache(
      { page: data.page, data, updatedAt },
      getConfig().gameId,
      guestId
    );

    const view = this.buildView(data, {
      fromCache: false,
      isStale: false,
      lastUpdated: updatedAt,
      myGuestId: guestId,
    });
    this.view = view;
    this.emit(view);
    return view;
  }

  private applyFailure(error: unknown): LeaderboardView {
    logger.warn('[Leaderboard] Fetch failed', error);
    const current = this.view;
    const hasData = current.entries.length > 0;
    const localBest = this.getLocalBestScore();

    if (!hasData && localBest !== null) {
      const view: LeaderboardView = {
        ...current,
        status: 'ready',
        isEmpty: true,
        fromCache: false,
        isStale: true,
        myBestScore: localBest,
        myRank: null,
        error: 'leaderboard.offlineLocalBest',
      };
      this.view = view;
      this.emit(view);
      return view;
    }

    const view = this.enrichWithLocalBest({
      ...current,
      status: hasData ? 'ready' : 'error',
      fromCache: hasData ? true : current.fromCache,
      isStale: hasData,
    });
    this.view = view;
    this.emit(view);
    return view;
  }

  private buildView(
    data: LeaderboardData,
    extra: {
      fromCache: boolean;
      isStale: boolean;
      lastUpdated: number;
      myGuestId?: string | null;
      error?: string | null;
    }
  ): LeaderboardView {
    const totalPages = data.total > 0 ? Math.ceil(data.total / data.limit) : 0;

    return {
      status: 'ready',
      entries: data.items,
      myRank: data.self?.rank ?? null,
      myBestScore: data.self?.bestScore ?? null,
      pagination: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages,
      },
      myGuestId: extra.myGuestId ?? this.guestService.getGuestId(),
      isEmpty: data.items.length === 0,
      fromCache: extra.fromCache,
      isStale: extra.isStale,
      lastUpdated: extra.lastUpdated,
      error: extra.error ?? null,
    };
  }

  private enrichWithLocalBest(view: LeaderboardView): LeaderboardView {
    const localBest = this.getLocalBestScore();
    if (localBest === null) {
      return view;
    }

    const myBestScore =
      view.myBestScore === null ? localBest : Math.max(view.myBestScore, localBest);

    return {
      ...view,
      myBestScore,
      isStale: view.isStale || (view.myBestScore === null && localBest !== null),
    };
  }

  private getLocalBestScore(): number | null {
    const score = usePlatformStore.getState().progress.highScore;
    return score > 0 ? score : null;
  }

  private transition(patch: Partial<LeaderboardView>): void {
    this.view = { ...this.view, ...patch };
    this.emit(this.view);
  }

  private toData(view: LeaderboardView): LeaderboardData {
    return {
      gameId: getConfig().gameId,
      total: view.pagination.total,
      page: view.pagination.page,
      limit: view.pagination.limit,
      items: view.entries,
      self:
        view.myRank !== null && view.myBestScore !== null
          ? { rank: view.myRank, bestScore: view.myBestScore }
          : null,
    };
  }

  private emit(view: LeaderboardView): void {
    eventBus.emit('leaderboard:update', view);
  }
}

export const leaderboard = new LeaderboardService();
