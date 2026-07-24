import { ARRIVE_EPSILON, TICK_HZ } from '../constants';
import type { Fleet, GameState, Vec3 } from '../types';
import { addScaled, normalize, scale, set, sub } from '../vec';
import { updateAI } from './ai';
import { advanceProjectiles, spawnProjectile } from './projectiles';
import { buildContext, selectTarget, type SimContext } from './targeting';
import { pushLog } from './util';

const toTarget: Vec3 = [0, 0, 0];
const desiredVelocity: Vec3 = [0, 0, 0];
const scratch: Vec3 = [0, 0, 0];

/** Fleets ease into and out of motion instead of snapping to full speed. */
const ACCEL = 55;

function resolveDestination(state: GameState, fleet: Fleet): Vec3 | null {
  const order = fleet.order;
  if (order.type === 'move' && order.targetPosition) return order.targetPosition;

  if (order.type === 'attack' && order.targetFleetId) {
    const target = state.fleets[order.targetFleetId];
    if (!target || target.destroyed) {
      fleet.order = { type: 'hold' };
      return null;
    }
    sub(toTarget, target.position, fleet.position);
    const dist = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
    if (dist <= fleet.engagementRange) return null;
    normalize(toTarget, toTarget);
    return addScaled(scratch, target.position, toTarget, -fleet.engagementRange * 0.9);
  }

  return null;
}

function updateMovement(state: GameState, dt: number): void {
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.destroyed) continue;

    const destination = resolveDestination(state, fleet);

    if (destination) {
      sub(desiredVelocity, destination, fleet.position);
      const dist = Math.hypot(desiredVelocity[0], desiredVelocity[1], desiredVelocity[2]);
      if (dist <= ARRIVE_EPSILON) {
        set(desiredVelocity, 0, 0, 0);
        if (fleet.order.type === 'move') fleet.order = { type: 'hold' };
      } else {
        // Slow down on the final approach so fleets settle rather than overshoot.
        const approach = Math.min(1, dist / (fleet.speed * 0.8));
        normalize(desiredVelocity, desiredVelocity);
        scale(desiredVelocity, desiredVelocity, fleet.speed * approach);
      }
    } else {
      set(desiredVelocity, 0, 0, 0);
    }

    const step = ACCEL * dt;
    for (let i = 0; i < 3; i++) {
      const delta = desiredVelocity[i] - fleet.velocity[i];
      fleet.velocity[i] += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
    }
    addScaled(fleet.position, fleet.position, fleet.velocity, dt);

    const speed = Math.hypot(fleet.velocity[0], fleet.velocity[1], fleet.velocity[2]);
    if (speed > 1) scale(fleet.heading, fleet.velocity, 1 / speed);
    else if (fleet.order.type === 'attack' && fleet.order.targetFleetId) {
      const target = state.fleets[fleet.order.targetFleetId];
      if (target && !target.destroyed) {
        sub(scratch, target.position, fleet.position);
        normalize(fleet.heading, scratch);
      }
    }

    // Ships hold formation relative to the fleet's heading.
    const yaw = Math.atan2(fleet.heading[0], fleet.heading[2]);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const ship of fleet.ships) {
      if (ship.health <= 0) continue;
      const [ox, oy, oz] = ship.formationOffset;
      ship.position[0] = fleet.position[0] + ox * cos + oz * sin;
      ship.position[1] = fleet.position[1] + oy;
      ship.position[2] = fleet.position[2] - ox * sin + oz * cos;
    }
  }
}

function updateCombat(state: GameState, ctx: SimContext, dt: number): void {
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.destroyed) continue;

    const priority = fleet.priorityTargetFleetId ? state.fleets[fleet.priorityTargetFleetId] : undefined;
    if (fleet.priorityTargetFleetId && (!priority || priority.destroyed)) {
      fleet.priorityTargetFleetId = undefined;
    }

    const canFire = fleet.roe === 'fire-at-will';

    for (const ship of fleet.ships) {
      if (ship.health <= 0) continue;
      const shipClass = state.shipClasses[ship.classId];

      for (let i = 0; i < shipClass.weapons.length; i++) {
        if (ship.cooldowns[i] > 0) ship.cooldowns[i] -= dt;
        if (!canFire || ship.cooldowns[i] > 0) continue;

        const weapon = shipClass.weapons[i];
        const choice = selectTarget(state, ctx, fleet, ship, weapon);
        if (!choice) {
          // No safe shot exists — hold fire rather than force a bad one, and don't
          // let cooldown debt build up while idle.
          ship.cooldowns[i] = 0;
          continue;
        }

        spawnProjectile(state, ship, fleet, weapon, choice.ship, choice.fleet);
        ship.cooldowns[i] = 1 / weapon.fireRate;

        if (state.tick - fleet.lastContactTick > TICK_HZ * 12) {
          pushLog(state, `${fleet.name} engaging ${choice.fleet.name}`, fleet.factionId);
        }
        fleet.lastContactTick = state.tick;
      }
    }
  }
}

function checkVictory(state: GameState): void {
  if (state.gameOver) return;
  const survivors = new Set<string>();
  for (const fleet of Object.values(state.fleets)) {
    if (!fleet.destroyed) survivors.add(fleet.factionId);
  }
  if (survivors.size === 1) {
    const winner = [...survivors][0];
    state.gameOver = { winnerFactionId: winner };
    pushLog(state, `${state.factions[winner].name} holds the system`, winner);
  } else if (survivors.size === 0) {
    state.gameOver = { winnerFactionId: '' };
    pushLog(state, 'Every fleet in the system has been destroyed');
  }
}

export function stepSimulation(state: GameState, dt: number): void {
  state.tick++;
  updateMovement(state, dt);
  const ctx = buildContext(state);
  updateAI(state, ctx, dt);
  updateCombat(state, ctx, dt);
  advanceProjectiles(state, dt);
  checkVictory(state);
}

/** Player order helpers — mutate state directly, then the caller republishes for the UI. */
export function issueMoveOrder(state: GameState, fleetIds: string[], target: Vec3): void {
  for (const id of fleetIds) {
    const fleet = state.fleets[id];
    if (!fleet || fleet.destroyed) continue;
    fleet.order = { type: 'move', targetPosition: [target[0], target[1], target[2]] };
  }
  if (fleetIds.length) pushLog(state, `Move order issued to ${fleetIds.length} fleet(s)`, state.playerFactionId);
}

export function issueAttackOrder(state: GameState, fleetIds: string[], targetFleetId: string): void {
  const target = state.fleets[targetFleetId];
  if (!target) return;
  for (const id of fleetIds) {
    const fleet = state.fleets[id];
    if (!fleet || fleet.destroyed || fleet.id === targetFleetId) continue;
    fleet.order = { type: 'attack', targetFleetId };
  }
  if (fleetIds.length) pushLog(state, `Attack order: ${target.name}`, state.playerFactionId);
}

export function issueHoldOrder(state: GameState, fleetIds: string[]): void {
  for (const id of fleetIds) {
    const fleet = state.fleets[id];
    if (!fleet || fleet.destroyed) continue;
    fleet.order = { type: 'hold' };
  }
}

export function setRoe(state: GameState, fleetIds: string[], roe: Fleet['roe']): void {
  for (const id of fleetIds) {
    const fleet = state.fleets[id];
    if (fleet && !fleet.destroyed) fleet.roe = roe;
  }
}

export function setPriorityTarget(
  state: GameState,
  fleetIds: string[],
  targetFleetId: string | undefined,
): void {
  for (const id of fleetIds) {
    const fleet = state.fleets[id];
    if (fleet && !fleet.destroyed) fleet.priorityTargetFleetId = targetFleetId;
  }
  if (targetFleetId && state.fleets[targetFleetId]) {
    pushLog(state, `Priority target: ${state.fleets[targetFleetId].name}`, state.playerFactionId);
  }
}
