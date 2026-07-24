/**
 * World scale is fixed here so transit time reads as meaningful.
 * The system spans roughly 900 units corner to corner; a cruiser crosses it in ~22s.
 */
export const SYSTEM_RADIUS = 480;
export const SYSTEM_PLANE_Y = 0;

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_TICKS_PER_FRAME = 5;

/** Relation value at or below which two factions shoot on sight. */
export const WAR_THRESHOLD = -25;

export const MAX_PROJECTILES = 1400;
export const MAX_COMBAT_LOG = 120;

/** Radius used for projectile/ship collision, world units. Tracks the rendered hull size. */
export const SHIP_HIT_RADIUS = 9;
/** A kinetic shot is unsafe if a friendly hull sits within this distance of the firing line. */
export const FRIENDLY_CLEARANCE = 15;
/** Distance at which a missile rolls against point-defense. */
export const INTERCEPT_RADIUS = 26;

/** Fleets stop this fraction short of their longest weapon range when closing to attack. */
export const ENGAGE_RANGE_FACTOR = 0.85;
/** How close a fleet must get to a move waypoint before it counts as arrived. */
export const ARRIVE_EPSILON = 8;

/** AI aggro radius and re-plan interval. */
export const AI_DETECT_RADIUS = 340;
export const AI_REPLAN_SECONDS = 1.2;

/** Ships are drawn well above true scale — they have to read as distinct hulls at strategic zoom. */
export const HULL_SIZE = {
  frigate: 3.6,
  cruiser: 5.6,
  battleship: 8.0,
} as const;

/** Per-weapon visual identity. Colors are additive-blended, so they run hot on purpose. */
export const WEAPON_VISUALS: Record<
  string,
  { color: number; length: number; caliber: number; glow: number }
> = {
  cannon: { color: 0xffd08a, length: 12, caliber: 0.4, glow: 1.2 },
  gauss: { color: 0xbfe6ff, length: 17, caliber: 0.4, glow: 1.3 },
  railgun: { color: 0xffffff, length: 28, caliber: 0.62, glow: 1.8 },
  missile: { color: 0xffc070, length: 4.0, caliber: 0.9, glow: 1.5 },
  plasma: { color: 0x8affd8, length: 5.5, caliber: 1.5, glow: 2.0 },
  laser: { color: 0xff4d6d, length: 18, caliber: 0.7, glow: 1.8 },
};
