import { FRIENDLY_CLEARANCE } from '../constants';
import { areHostile } from '../state';
import type { Fleet, GameState, ShipInstance, WeaponMount } from '../types';
import { distanceSq, distanceSqToSegment } from '../vec';

export interface SimContext {
  /** Alive, non-destroyed fleets each faction is at war with. Rebuilt once per tick. */
  hostileFleets: Map<string, Fleet[]>;
  /** Alive ships per faction, used for line-of-fire clearance. Rebuilt once per tick. */
  friendlyShips: Map<string, ShipInstance[]>;
}

export function buildContext(state: GameState): SimContext {
  const hostileFleets = new Map<string, Fleet[]>();
  const friendlyShips = new Map<string, ShipInstance[]>();
  const factionIds = Object.keys(state.factions);

  for (const id of factionIds) {
    hostileFleets.set(id, []);
    friendlyShips.set(id, []);
  }

  for (const fleet of Object.values(state.fleets)) {
    if (fleet.destroyed) continue;
    const friends = friendlyShips.get(fleet.factionId);
    if (friends) for (const ship of fleet.ships) if (ship.health > 0) friends.push(ship);
    for (const viewerId of factionIds) {
      if (areHostile(state, viewerId, fleet.factionId)) hostileFleets.get(viewerId)!.push(fleet);
    }
  }

  return { hostileFleets, friendlyShips };
}

/** Direct-fire kinetics travel a straight line and can clip a friendly hull; missiles steer around. */
function isDirectFireKinetic(weapon: WeaponMount): boolean {
  return weapon.type === 'cannon' || weapon.type === 'gauss' || weapon.type === 'railgun';
}

/**
 * A "safe firing solution" means the target is inside weapon range and — for direct-fire
 * kinetics — no friendly hull sits inside the firing corridor between shooter and target.
 */
export function hasSafeFiringSolution(
  ctx: SimContext,
  shooter: ShipInstance,
  shooterFactionId: string,
  weapon: WeaponMount,
  target: ShipInstance,
): boolean {
  const rangeSq = weapon.range * weapon.range;
  if (distanceSq(shooter.position, target.position) > rangeSq) return false;
  if (!isDirectFireKinetic(weapon)) return true;

  const friends = ctx.friendlyShips.get(shooterFactionId);
  if (!friends) return true;
  const clearanceSq = FRIENDLY_CLEARANCE * FRIENDLY_CLEARANCE;

  for (const friend of friends) {
    if (friend === shooter) continue;
    if (distanceSqToSegment(friend.position, shooter.position, target.position) < clearanceSq) {
      return false;
    }
  }
  return true;
}

export interface TargetChoice {
  fleet: Fleet;
  ship: ShipInstance;
}

/** Nearest ship in a fleet that this weapon can safely hit right now. */
function bestShipIn(
  ctx: SimContext,
  shooter: ShipInstance,
  shooterFactionId: string,
  weapon: WeaponMount,
  fleet: Fleet,
): ShipInstance | null {
  let best: ShipInstance | null = null;
  let bestDistSq = Infinity;
  for (const candidate of fleet.ships) {
    if (candidate.health <= 0) continue;
    const d = distanceSq(shooter.position, candidate.position);
    if (d >= bestDistSq) continue;
    if (!hasSafeFiringSolution(ctx, shooter, shooterFactionId, weapon, candidate)) continue;
    best = candidate;
    bestDistSq = d;
  }
  return best;
}

/**
 * Spec Section 4a, evaluated per ship per weapon mount:
 *   priority target if safely reachable -> nearest target of opportunity -> hold fire.
 * ROE is checked by the caller; nothing fires unless it is 'fire-at-will'.
 */
export function selectTarget(
  state: GameState,
  ctx: SimContext,
  fleet: Fleet,
  shooter: ShipInstance,
  weapon: WeaponMount,
): TargetChoice | null {
  if (fleet.priorityTargetFleetId) {
    const priority = state.fleets[fleet.priorityTargetFleetId];
    if (priority && !priority.destroyed) {
      const ship = bestShipIn(ctx, shooter, fleet.factionId, weapon, priority);
      if (ship) return { fleet: priority, ship };
    }
  }

  const hostiles = ctx.hostileFleets.get(fleet.factionId);
  if (!hostiles) return null;

  let best: TargetChoice | null = null;
  let bestDistSq = Infinity;
  for (const hostile of hostiles) {
    if (distanceSq(shooter.position, hostile.position) > (weapon.range + 90) ** 2) continue;
    const ship = bestShipIn(ctx, shooter, fleet.factionId, weapon, hostile);
    if (!ship) continue;
    const d = distanceSq(shooter.position, ship.position);
    if (d < bestDistSq) {
      bestDistSq = d;
      best = { fleet: hostile, ship };
    }
  }
  return best;
}

/** Nearest hostile fleet to a given fleet, used by AI target acquisition. */
export function nearestHostileFleet(ctx: SimContext, fleet: Fleet, maxRange: number): Fleet | null {
  const hostiles = ctx.hostileFleets.get(fleet.factionId);
  if (!hostiles) return null;
  let best: Fleet | null = null;
  let bestDistSq = maxRange * maxRange;
  for (const hostile of hostiles) {
    const d = distanceSq(fleet.position, hostile.position);
    if (d < bestDistSq) {
      bestDistSq = d;
      best = hostile;
    }
  }
  return best;
}
