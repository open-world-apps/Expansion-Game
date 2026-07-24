export type FactionId = string;
export type ShipClassId = string;
export type FleetId = string;
export type BodyId = string;
export type WeaponId = string;
export type ShipId = string;

export type Vec3 = [number, number, number];

/**
 * Faction-level weapon identity. Not a hard restriction on ship design — more a
 * gameplay/flavor lean that shapes which weapon types a faction's ShipClasses use.
 */
export type WeaponTechFocus = 'projectile' | 'missile' | 'energy';

export type WeaponType = 'cannon' | 'gauss' | 'railgun' | 'missile' | 'plasma' | 'laser';

export type WeaponPhysicsClass = 'kinetic' | 'energy';

export interface Faction {
  id: FactionId;
  name: string;
  color: string;
  blurb: string;
  relations: Record<FactionId, number>;
  weaponFocus: WeaponTechFocus;
  homeBodyId: BodyId;
}

export interface WeaponMount {
  id: WeaponId;
  type: WeaponType;
  physicsClass: WeaponPhysicsClass;
  damage: number;
  range: number;
  fireRate: number;
  projectileSpeed: number;
  /** Missiles only: chance a target's point-defense intercepts before impact. */
  interceptChance?: number;
  /** Missiles only: max turn rate in radians/sec while homing. */
  turnRate?: number;
}

export interface ShipClass {
  id: ShipClassId;
  name: string;
  factionId: FactionId;
  maxHealth: number;
  weapons: WeaponMount[];
  speed: number;
  hull: 'frigate' | 'cruiser' | 'battleship';
}

export interface ShipInstance {
  id: ShipId;
  classId: ShipClassId;
  health: number;
  /** Extension: ships hold individual world positions so combat reads as a distributed firefight. */
  position: Vec3;
  /** Extension: stable formation offset from fleet center, in fleet-local space. */
  formationOffset: Vec3;
  /** Extension: seconds remaining before each weapon mount can fire again, indexed to ShipClass.weapons. */
  cooldowns: number[];
}

export type OrderType = 'move' | 'attack' | 'hold';

export interface Order {
  type: OrderType;
  targetPosition?: Vec3;
  targetFleetId?: FleetId;
}

export type RulesOfEngagement = 'hold-fire' | 'fire-at-will';

export interface Fleet {
  id: FleetId;
  factionId: FactionId;
  name: string;
  ships: ShipInstance[];
  position: Vec3;
  order: Order;
  roe: RulesOfEngagement;
  priorityTargetFleetId?: FleetId;
  destroyed: boolean;
  /** Extension: render/sim state — current heading and speed, used for ship orientation and shot leading. */
  velocity: Vec3;
  heading: Vec3;
  /** Extension: cached from ship classes — slowest ship speed and longest weapon range. */
  speed: number;
  engagementRange: number;
  /** Extension: AI re-evaluation timer, seconds. */
  aiCooldown: number;
  /** Extension: last tick this fleet opened fire, used to rate-limit "contact" log entries. */
  lastContactTick: number;
}

/** A single in-flight shot or missile, tracked so it can be rendered with travel time. */
export interface Projectile {
  id: string;
  weaponType: WeaponType;
  physicsClass: WeaponPhysicsClass;
  sourceShipId: ShipId;
  sourceFactionId: FactionId;
  targetFleetId: FleetId;
  /** Extension: projectiles resolve against a specific ship so hits read honestly in 3D. */
  targetShipId: ShipId;
  position: Vec3;
  /** Extension: previous tick position, so rendering can interpolate between fixed sim steps. */
  prevPosition: Vec3;
  velocity: Vec3;
  damage: number;
  /** Extension: terminal speed. Missiles launch slow and burn up to this; others spawn at it. */
  maxSpeed: number;
  interceptChance: number;
  turnRate: number;
  intercepted: boolean;
  /** Extension: seconds remaining before the shot expires unspent. */
  life: number;
  active: boolean;
}

export type BodyType = 'planet' | 'station' | 'asteroid-field' | 'nebula';

export interface CelestialBody {
  id: BodyId;
  name: string;
  type: BodyType;
  position: Vec3;
  ownerFactionId?: FactionId;
  radius: number;
}

export interface CombatLogEntry {
  id: string;
  tick: number;
  message: string;
  factionId?: FactionId;
}

/** Sim -> render one-shot notifications. Drained by the renderer each frame. */
export type SimEventType = 'impact' | 'explosion' | 'intercept' | 'muzzle';

export interface SimEvent {
  type: SimEventType;
  position: Vec3;
  color: number;
  scale: number;
}

export interface GameState {
  tick: number;
  factions: Record<FactionId, Faction>;
  shipClasses: Record<ShipClassId, ShipClass>;
  fleets: Record<FleetId, Fleet>;
  bodies: Record<BodyId, CelestialBody>;
  projectiles: Projectile[];
  combatLog: CombatLogEntry[];
  selectedFleetIds: FleetId[];
  playerFactionId: FactionId;
  events: SimEvent[];
  /** Simulation rate multiplier: 0 = paused. */
  speed: number;
  gameOver: null | { winnerFactionId: FactionId };
}
