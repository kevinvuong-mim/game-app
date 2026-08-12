import { saveService } from '@platform/modules/save';
import { usePlatformStore } from '@platform/core/state';

const MAX_MAP_ID = 10;

function clampStars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.floor(value)));
}

class CampaignService {
  getStars(mapId: number): number[] {
    const saved = usePlatformStore.getState().progress.campaignStars[String(mapId)];
    return Array.isArray(saved) ? saved.map(clampStars) : [];
  }

  setStars(mapId: number, stars: number[]): void {
    const campaignStars = {
      ...usePlatformStore.getState().progress.campaignStars,
      [String(mapId)]: stars.map(clampStars),
    };
    usePlatformStore.getState().setCampaignStars(campaignStars);
    void saveService.saveLocal();
  }

  getLastMapId(): number {
    const raw = usePlatformStore.getState().progress.lastMapId;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(MAX_MAP_ID, Math.floor(raw)));
  }

  setLastMapId(mapId: number): void {
    const next = Math.max(1, Math.min(MAX_MAP_ID, Math.floor(mapId)));
    if (next === this.getLastMapId()) return;
    usePlatformStore.getState().setLastMapId(next);
    void saveService.saveLocal();
  }
}

export const campaign = new CampaignService();
