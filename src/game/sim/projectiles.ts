import { INTERCEPT_RADIUS, SHIP_HIT_RADIUS, WEAPON_VISUALS } from '../constants';
import type { Fleet, GameState, Projectile, ShipInstance, Vec3, WeaponMount } from '../types';
import { addScaled, copy, distanceSqToSegment, normalize, scale, set, sub } from '../vec';
import { pushEvent, pushLog, rand } from './util';

const aim: Vec3 = [0, 0, 0];
const dir: Vec3 = [0, 0, 0];
const desired: Vec3 = [0, 0, 0];
const scratch: Vec3 = [0, 0, 0];

let poolCursor = 0;

function acquire(state: GameState): Projectile | null {
  const pool = state.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(poolCursor + i) % pool.length];
    if (!p.active) {
      poolCursor = (poolCursor + i + 1) % pool.length;
      return p;
    }
  }
  return null;
}

/**
 * Non-homing shots are fired at a predicted intercept point rather than the target's
 * current position — two refinement passes is plenty at these speeds.
 */
function leadTarget(origin: Vec3, target: ShipInstance, targetFleet: Fleet, speed: number): void {
  copy(aim, target.position);
  for (let i = 0; i < 2; i++) {
    sub(scratch, aim, origin);
    const t = Math.hypot(scratch[0], scratch[1], scratch[2]) / speed;
    addScaled(aim, target.position, targetFleet.velocity, t);
  }
}

export function spawnProjectile(
  state: GameState,
  shooter: ShipInstance,
  shooterFleet: Fleet,
  weapon: WeaponMount,
  target: ShipInstance,
  targetFleet: Fleet,
): void {
  const p = acquire(state);
  if (!p) return;

  const homing = weapon.type === 'missile';
  if (homing) copy(aim, target.position);
  else leadTarget(shooter.position, target, targetFleet, weapon.projectileSpeed);

  sub(dir, aim, shooter.position);
  normalize(dir, dir);

  p.weaponType = weapon.type;
  p.physicsClass = weapon.physicsClass;
  p.sourceShipId = shooter.id;
  p.sourceFactionId = shooterFleet.factionId;
  p.targetFleetId = targetFleet.id;
  p.targetShipId = target.id;
  copy(p.position, shooter.position);
  copy(p.prevPosition, shooter.position);
  scale(p.velocity, dir, homing ? weapon.projectileSpeed * 0.55 : weapon.projectileSpeed);
  p.damage = weapon.damage;
  p.maxSpeed = weapon.projectileSpeed;
  p.interceptChance = weapon.interceptChance ?? 0;
  p.turnRate = weapon.turnRate ?? 0;
  // Interception is decided at launch but only resolves once the missile enters the
  // point-defense envelope, so the player sees where it died.
  p.intercepted = homing && rand() < p.interceptChance;
  p.life = (weapon.range / weapon.projectileSpeed) * 2.2 + 0.4;
  p.active = true;

  pushEvent(state, 'muzzle', shooter.position, WEAPON_VISUALS[weapon.type].color, 1);
}

function findShip(fleet: Fleet, shipId: string): ShipInstance | null {
  for (const s of fleet.ships) if (s.id === shipId) return s;
  return null;
}

function applyDamage(
  state: GameState,
  fleet: Fleet,
  ship: ShipInstance,
  damage: number,
  weaponColor: number,
): void {
  if (ship.health <= 0) return;
  ship.health -= damage;
  if (ship.health > 0) {
    pushEvent(state, 'impact', ship.position, weaponColor, 1);
    return;
  }

  ship.health = 0;
  const shipClass = state.shipClasses[ship.classId];
  const factionColor = parseInt(state.factions[fleet.factionId].color.slice(1), 16);
  pushEvent(state, 'explosion', ship.position, factionColor, shipClass.hull === 'battleship' ? 2.2 : 1.4);
  pushLog(state, `${fleet.name}: ${shipClass.name} destroyed`, fleet.factionId);

  for (const s of fleet.ships) if (s.health > 0) return;
  fleet.destroyed = true;
  pushLog(state, `${fleet.name} has been wiped out`, fleet.factionId);
}

export function advanceProjectiles(state: GameState, dt: number): void {
  const interceptRadiusSq = INTERCEPT_RADIUS * INTERCEPT_RADIUS;
  const hitRadiusSq = SHIP_HIT_RADIUS * SHIP_HIT_RADIUS;

  for (const p of state.projectiles) {
    if (!p.active) continue;

    const targetFleet = state.fleets[p.targetFleetId];
    const target = targetFleet ? findShip(targetFleet, p.targetShipId) : null;
    const visual = WEAPON_VISUALS[p.weaponType];

    if (p.turnRate > 0 && target && target.health > 0) {
      sub(desired, target.position, p.position);
      normalize(desired, desired);
      normalize(dir, p.velocity);
      const maxTurn = p.turnRate * dt;
      const cosAngle = Math.min(1, Math.max(-1, dir[0] * desired[0] + dir[1] * desired[1] + dir[2] * desired[2]));
      const angle = Math.acos(cosAngle);
      const t = angle > 1e-4 ? Math.min(1, maxTurn / angle) : 1;
      set(
        dir,
        dir[0] + (desired[0] - dir[0]) * t,
        dir[1] + (desired[1] - dir[1]) * t,
        dir[2] + (desired[2] - dir[2]) * t,
      );
      normalize(dir, dir);
      // Missiles launch soft and burn up to their rated speed.
      const speed = Math.hypot(p.velocity[0], p.velocity[1], p.velocity[2]);
      scale(p.velocity, dir, Math.min(speed + p.maxSpeed * 1.4 * dt, p.maxSpeed));
    }

    copy(p.prevPosition, p.position);
    addScaled(p.position, p.position, p.velocity, dt);
    p.life -= dt;

    if (target && target.health > 0) {
      const distSq = distanceSqToSegment(target.position, p.prevPosition, p.position);

      if (p.intercepted && distSq < interceptRadiusSq) {
        pushEvent(state, 'intercept', p.position, 0xffe08a, 1);
        p.active = false;
        continue;
      }

      if (distSq < hitRadiusSq) {
        applyDamage(state, targetFleet!, target, p.damage, visual.color);
        p.active = false;
        continue;
      }
    }

    if (p.life <= 0) p.active = false;
  }
}

export function activeProjectileCount(state: GameState): number {
  let n = 0;
  for (const p of state.projectiles) if (p.active) n++;
  return n;
}
