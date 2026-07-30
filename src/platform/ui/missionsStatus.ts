import { missions } from '@platform/modules/missions/mission.service';

/** Number of completed missions awaiting claim — game layer reads via @platform/ui. */
export function getClaimableMissionCount(): number {
  return missions.getMissions().filter((mission) => mission.status === 'completed').length;
}
