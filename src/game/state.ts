import { ENGAGE_RANGE_FACTOR, MAX_PROJECTILES, WAR_THRESHOLD } from './constants';
import { BODIES, FACTIONS, FLEET_SEEDS, SHIP_CLASSES, applyRelations } from './content';
import type {
  CelestialBody,
  Faction,
  Fleet,
  FleetId,
  GameState,
  Projectile,
  ShipClass,
  ShipInstance,
  Vec3,
} from './types';
import { resetSimRandom } from './sim/util';
import { mulberry32, v3 } from './vec';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Formation slots spiral outward so larger fleets spread wider without ships overlapping. */
function formationSlot(index: number, rand: () => number): Vec3 {
  const radius = 16 * Math.sqrt(index + 0.6);
  const angle = index * GOLDEN_ANGLE;
  return [
    Math.cos(angle) * radius,
    (rand() - 0.5) * 14,
    Math.sin(angle) * radius,
  ];
}

function makeProjectilePool(): Projectile[] {
  const pool: Projectile[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    pool.push({
      id: `p${i}`,
      weaponType: 'cannon',
      physicsClass: 'kinetic',
      sourceShipId: '',
      sourceFactionId: '',
      targetFleetId: '',
      targetShipId: '',
      position: v3(),
      prevPosition: v3(),
      velocity: v3(),
      damage: 0,
      maxSpeed: 0,
      interceptChance: 0,
      turnRate: 0,
      intercepted: false,
      life: 0,
      active: false,
    });
  }
  return pool;
}

export function createInitialState(playerFactionId: string): GameState {
  const rand = mulberry32(0xc0ffee);

  const factions: Record<string, Faction> = {};
  for (const f of FACTIONS) factions[f.id] = { ...f, relations: {} };
  applyRelations(factions);

  const shipClasses: Record<string, ShipClass> = {};
  for (const sc of SHIP_CLASSES) shipClasses[sc.id] = sc;

  const bodies: Record<string, CelestialBody> = {};
  for (const b of BODIES) bodies[b.id] = b;

  const fleets: Record<FleetId, Fleet> = {};
  for (const seed of FLEET_SEEDS) {
    const ships: ShipInstance[] = [];
    let slowest = Infinity;
    let longestRange = 0;

    for (const [classId, count] of seed.composition) {
      const sc = shipClasses[classId];
      for (let i = 0; i < count; i++) {
        ships.push({
          id: `${seed.id}-s${ships.length}`,
          classId,
          health: sc.maxHealth,
          position: v3(seed.position[0], seed.position[1], seed.position[2]),
          formationOffset: formationSlot(ships.length, rand),
          cooldowns: sc.weapons.map((w) => rand() / w.fireRate),
        });
      }
      slowest = Math.min(slowest, sc.speed);
      for (const w of sc.weapons) longestRange = Math.max(longestRange, w.range);
    }

    fleets[seed.id] = {
      id: seed.id,
      factionId: seed.factionId,
      name: seed.name,
      ships,
      position: [...seed.position] as Vec3,
      order: { type: 'hold' },
      roe: 'fire-at-will',
      destroyed: false,
      velocity: v3(),
      heading: v3(0, 0, 1),
      speed: slowest,
      engagementRange: longestRange * ENGAGE_RANGE_FACTOR,
      aiCooldown: rand() * 1.2,
      lastContactTick: -9999,
    };
  }

  return {
    tick: 0,
    factions,
    shipClasses,
    fleets,
    bodies,
    projectiles: makeProjectilePool(),
    combatLog: [],
    selectedFleetIds: [],
    playerFactionId,
    events: [],
    speed: 1,
    gameOver: null,
  };
}

/**
 * The sim owns a single mutable GameState. React never renders from it directly per frame —
 * it subscribes to a throttled version counter, so hundreds of projectiles never touch
 * React reconciliation.
 */
class GameStore {
  state: GameState = createInitialState('concord');
  private version = 0;
  private listeners = new Set<() => void>();

  reset(playerFactionId: string): void {
    resetSimRandom();
    this.state = createInitialState(playerFactionId);
    this.publish();
  }

  publish(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;
}

export const store = new GameStore();

export function areHostile(state: GameState, a: string, b: string): boolean {
  if (a === b) return false;
  const rel = state.factions[a]?.relations[b];
  return rel !== undefined && rel <= WAR_THRESHOLD;
}

export function fleetIsAlive(fleet: Fleet): boolean {
  return !fleet.destroyed;
}

export function fleetHealth(state: GameState, fleet: Fleet): { current: number; max: number } {
  let current = 0;
  let max = 0;
  for (const ship of fleet.ships) {
    const sc = state.shipClasses[ship.classId];
    current += Math.max(0, ship.health);
    max += sc.maxHealth;
  }
  return { current, max };
}

export function aliveShipCount(fleet: Fleet): number {
  let n = 0;
  for (const s of fleet.ships) if (s.health > 0) n++;
  return n;
}
