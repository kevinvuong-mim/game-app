import {
  LEADERBOARD_LIMIT,
  type LeaderboardData,
  type LeaderboardCache,
  LEADERBOARD_CACHE_PREFIX,
} from './leaderboard.model';
import { storage } from '@platform/core/storage';
import type { ApiEnvelope } from '@platform/core/api';
import { apiClient, unwrapSuccessEnvelope } from '@platform/core/api';

export interface FetchLeaderboardParams {
  page?: number;
  gameId: string;
  limit?: number;
  guestId?: string | null;
}

export class LeaderboardRepository {
  private readonly timeoutMs = 10_000;

  async fetch(params: FetchLeaderboardParams): Promise<LeaderboardData> {
    const page = params.page ?? 1;
    const limit = params.limit ?? LEADERBOARD_LIMIT;

    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      gameId: params.gameId,
    });
    if (params.guestId) {
      query.set('guestId', params.guestId);
    }

    const envelope = await apiClient.get<ApiEnvelope<LeaderboardData>>(
      `/leaderboards?${query.toString()}`,
      { timeout: this.timeoutMs, auth: false }
    );

    return this.normalize(unwrapSuccessEnvelope(envelope), page, limit);
  }

  async loadCache(gameId: string, page: number): Promise<LeaderboardCache | null> {
    return storage.load<LeaderboardCache>(this.cacheKey(gameId, page));
  }

  async saveCache(cache: LeaderboardCache, gameId: string): Promise<void> {
    await storage.save(this.cacheKey(gameId, cache.page), cache);
  }

  async clearCache(gameId: string, page = 1): Promise<void> {
    await storage.remove(this.cacheKey(gameId, page));
  }

  private normalize(
    data: LeaderboardData | undefined,
    page: number,
    limit: number
  ): LeaderboardData {
    const items = Array.isArray(data?.items) ? data!.items : [];
    const total = Number(data?.total ?? 0);
    const resolvedLimit = Number(data?.limit ?? limit);
    const resolvedPage = Number(data?.page ?? page);

    return {
      gameId: String(data?.gameId ?? ''),
      total,
      page: resolvedPage,
      limit: resolvedLimit,
      items: items.map((entry) => ({
        rank: Number(entry?.rank ?? 0),
        bestScore: Number(entry?.bestScore ?? 0),
        guestId: String(entry?.guestId ?? ''),
        name: typeof entry?.name === 'string' ? entry.name : null,
      })),
      self:
        data?.self && typeof data.self.rank === 'number'
          ? {
              rank: data.self.rank,
              bestScore: Number(data.self.bestScore ?? 0),
            }
          : null,
    };
  }

  private cacheKey(gameId: string, page: number): string {
    return `${LEADERBOARD_CACHE_PREFIX}${gameId}:p${page}`;
  }
}

export const leaderboardRepository = new LeaderboardRepository();
