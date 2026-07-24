import { AI_DETECT_RADIUS, AI_REPLAN_SECONDS } from '../constants';
import type { GameState, Vec3 } from '../types';
import { distance } from '../vec';
import { nearestHostileFleet, type SimContext } from './targeting';

/**
 * Slice-scope AI: hold the home approaches, engage anything hostile that comes close.
 * Fleets that drift far from home return to it. Deliberately simple — the slice is
 * proving the player's command loop, not the opposition's cleverness.
 */
export function updateAI(state: GameState, ctx: SimContext, dt: number): void {
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.destroyed || fleet.factionId === state.playerFactionId) continue;

    fleet.aiCooldown -= dt;
    if (fleet.aiCooldown > 0) continue;
    fleet.aiCooldown = AI_REPLAN_SECONDS;

    fleet.roe = 'fire-at-will';

    const quarry = nearestHostileFleet(ctx, fleet, AI_DETECT_RADIUS);
    if (quarry) {
      fleet.order = { type: 'attack', targetFleetId: quarry.id };
      fleet.priorityTargetFleetId = quarry.id;
      continue;
    }

    fleet.priorityTargetFleetId = undefined;
    const home = state.bodies[state.factions[fleet.factionId].homeBodyId];
    if (home && distance(fleet.position, home.position) > home.radius + 70) {
      const target: Vec3 = [
        home.position[0],
        home.position[1],
        home.position[2] + home.radius + 45,
      ];
      fleet.order = { type: 'move', targetPosition: target };
    } else {
      fleet.order = { type: 'hold' };
    }
  }
}
