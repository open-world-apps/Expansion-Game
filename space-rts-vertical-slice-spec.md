# Space RTS — Vertical Slice Design Spec

**Working concept:** A sci-fi space RTS in the spirit of EVE Online's scale and politics, but played as fleet-level strategic command rather than single-ship piloting. This document scopes a single vertical slice: the smallest playable piece that proves the core loop and visual direction before expanding to the full galaxy-scale vision.

**Target stack:** React + TypeScript + Three.js, running entirely in-browser. No game engine, no build pipeline beyond a standard web bundler (Vite).

**Intended use:** This spec is written to be implementable by Claude (Fable 5) as a build task — it defines scope, data shapes, and system behavior precisely enough to hand off directly.

---

## 1. Scope of this slice

**In scope:**
- One star system, fully modeled and playable
- 3–4 factions present in the system, each with a distinct identity
- Fleet-level combat: select fleets, issue move/attack orders, watch battles resolve in 3D
- Faction relationships exist as data (for future diplomacy) but are not yet interactive

**Explicitly out of scope (future slices):**
- Multiple star systems / galaxy map / travel between systems
- Interactive diplomacy (treaties, alliances, betrayals)
- Economy: resource gathering, production, ship building
- Persistent campaign/save state
- Multiplayer

The goal of this slice is to prove: *does commanding fleets in a 3D strategic view, inside a politically-flavored setting, feel good?* Everything else builds on top of that once it's answered.

---

## 2. The star system

One hand-authored system, not procedurally generated. Should include:

- **A handful of celestial bodies** (roughly 4–7): a home planet or station per faction, one or two neutral/contested locations, and at least one terrain-like feature for tactical variety (asteroid field, nebula) that could later affect movement or visibility.
- **Readable layout** — bodies spaced so fleets moving between them create visible, meaningful transit time, not everything clustered at one point.
- **Rendered in 3D** with an orbit-style camera (pan, zoom, rotate around the system) — not a fixed top-down view, but not full free-fly either. Strategic clarity over cinematic spectacle.

## 3. Factions

3–4 factions, each defined by:

- Name, identifying color (used for ships, UI, territory)
- A **weapon-tech identity** — one of three archetypes (see below) — which shapes its ship loadouts and, critically, how its combat looks and plays
- 1–2 ship archetypes with distinct stats (see Ship Classes below), armed consistent with the faction's weapon focus
- A starting relationship value toward every other faction (numeric scale, e.g. -100 war to +100 allied)

**The player chooses their faction's weapon-tech identity at the start** (or selects a pre-built faction with one of these identities for this slice — full custom faction creation can wait for a later pass). The three archetypes:

- **Projectile-focused** — a balanced kinetic loadout mixing cannons, gauss weapons, railguns, and missiles. No single dominant weapon type; flexible but not specialized.
- **Missile-focused** — leans heavily on missile tech, lighter on direct-fire weapons. Higher alpha-strike potential, more vulnerable to point-defense-heavy opponents, and a very different visual signature (missile trails everywhere) than a projectile-heavy fleet.
- **Energy-focused (plasma/laser)** — minimal kinetic weapons, fights at different engagement ranges and with a different visual language (bolts/beams instead of tracers) than the other two.

This isn't just a stat skin — it should make each faction *feel* different to command and to fight, both in tactics (missile factions want to alpha-strike and disengage; energy factions may prefer sustained closer-range engagement) and on screen.

At least one AI faction should use a different weapon focus than the player's, so the first session shows off the contrast (e.g. player picks projectile-focused, faces a missile-swarm rival). Non-player factions are AI-controlled for this slice (AI behavior can be simple — e.g. defend home territory, engage player fleets that enter contested space).

Suggested starting shape: one rivalry seeded between two AI factions to make the system feel alive even before the player acts.

## 4. Core loop: fleet combat

This is the loop the whole slice is built to prove out.

1. **Select** one or more fleets (click, or drag-select in the 3D view)
2. **Issue an order**: move to a location, attack a target fleet, or hold position
3. **Set rules of engagement (ROE)**: a simple per-fleet (or per-ship) toggle between `hold-fire` and `fire-at-will`. This is the master switch — nothing fires without it set to `fire-at-will`.
4. **Optionally designate a priority target**: the player can mark an enemy fleet as the priority target for a selected fleet. This doesn't force a bad shot — see target selection logic below.
5. **Fleets execute** their order over time — visible movement through 3D space, not instant teleport
6. **Combat resolves** when opposing fleets are within weapon range, gated entirely by ROE and target priority:
   - If ROE is `hold-fire`, ships do not fire regardless of range or targets present.
   - If ROE is `fire-at-will`:
     - Each ship individually checks whether it can *safely* engage the fleet's priority target (in range, valid firing solution — see Section 5a for what "safely" means). If yes, it fires on the priority target.
     - If it cannot safely hit the priority target, it engages a target of opportunity — any valid enemy target in range — instead.
     - If no priority target is set, all ships simply engage targets of opportunity.
     - If neither a safe shot at the priority target nor any target of opportunity exists, that ship holds fire — it does not force a bad shot.
   - Weapons fire as physical projectiles with travel time, not instant hit-scan — but different weapon types read and behave differently:
     - **Kinetic direct-fire** (cannon, gauss, railgun) — fast, straight-line tracers; always connect if still in range on arrival, no interception. Railguns should read as higher-velocity/higher-punch than cannons or gauss.
     - **Missiles** — slower, distinct projectiles that visibly travel toward their target and can be intercepted in flight (point-defense chance) before impact
     - **Energy weapons** (plasma, laser) — fast-traveling bolts or beams, visually distinct from kinetic tracers (glow/color rather than a bullet streak), no interception
   - Multiple ships firing simultaneously should read visually as a real firefight — crossing tracers, missile trails, impacts and explosions distributed across the scene, not a single abstracted exchange
7. **Outcome**: winning fleet(s) remain, damaged; losing fleet(s) are destroyed or retreat. A combat log records what happened.

Combat should feel like commanding a battle, not playing one ship — the player's decisions are ROE, priority targets, and fleet positioning, not aiming individual shots. The *visual* register should read as BSG-style semi-realistic warfare: physical weapons with travel time and visible trajectories, not lasers-as-lightshow or instant resolution.

### 4a. Target selection logic (per ship, per tick)

This is the actual decision each ship makes once ROE is `fire-at-will`:

```
if ROE is hold-fire:
    do not fire
else:
    if fleet has a priorityTargetFleetId
       and this ship has a safe firing solution on that target:
        fire on priority target
    else if any target of opportunity is in range with a safe firing solution:
        fire on nearest/best target of opportunity
    else:
        hold fire (no valid safe shot exists)
```

"Safe firing solution" (worth defining precisely during implementation, but should account for at minimum): target within weapon range, and no friendly ship in the direct line of fire for cannon tracers (avoid friendly-fire accidents — a nice detail that reinforces the semi-realistic tone).

## 5. Data model

```typescript
type FactionId = string;
type ShipClassId = string;
type FleetId = string;
type BodyId = string;
type WeaponId = string;

interface Faction {
  id: FactionId;
  name: string;
  color: string;
  relations: Record<FactionId, number>; // -100 to 100
  /** Defines this faction's weapon-tech identity — drives which ShipClasses/WeaponMounts are available to it. */
  weaponFocus: WeaponTechFocus;
}

/**
 * Faction-level weapon identity. Not a hard restriction on ship design — more a
 * gameplay/flavor lean that shapes which weapon types a faction's ShipClasses use.
 * - 'projectile': balanced mix across cannon, gauss, railgun, and missile
 * - 'missile': leans heavily on missile tech, lighter on direct-fire weapons
 * - 'energy': plasma/laser focused, minimal kinetic weapons
 */
type WeaponTechFocus = 'projectile' | 'missile' | 'energy';

type WeaponType = 'cannon' | 'gauss' | 'railgun' | 'missile' | 'plasma' | 'laser';

/** Which weapon types are "physical projectile" (travel time, can be dodged/intercepted)
 *  vs. "energy" (near-instant beam/bolt, different visual and interception rules). */
type WeaponPhysicsClass = 'kinetic' | 'energy';

interface WeaponMount {
  id: WeaponId;
  type: WeaponType;
  physicsClass: WeaponPhysicsClass;
  damage: number;        // dealt on hit
  range: number;         // max engagement distance, world units
  fireRate: number;      // shots per second
  projectileSpeed: number; // world units / second — finite; energy weapons still travel, just fast
  /** Missiles only: chance a target's point-defense intercepts before impact. Kinetic direct-fire and energy weapons ignore this. */
  interceptChance?: number;
}

interface ShipClass {
  id: ShipClassId;
  name: string;
  factionId: FactionId;
  maxHealth: number;
  weapons: WeaponMount[]; // a ship can carry multiple mounts (e.g. cannons + missile tubes)
  speed: number;     // world units / second
  hull: 'frigate' | 'cruiser' | 'battleship';
}

/** A single in-flight shot or missile, tracked so it can be rendered as a tracer/projectile with travel time. */
interface Projectile {
  id: string;
  weaponType: WeaponType;
  physicsClass: WeaponPhysicsClass;
  sourceShipId: string;
  targetFleetId: FleetId;
  position: [number, number, number];
  velocity: [number, number, number];
  damage: number;
  /** Only missiles can be shot down in flight; everything else always resolves on arrival. */
  intercepted: boolean;
}

interface ShipInstance {
  id: string;
  classId: ShipClassId;
  health: number;
}

type OrderType = 'move' | 'attack' | 'hold';

interface Order {
  type: OrderType;
  targetPosition?: [number, number, number];
  targetFleetId?: FleetId;
}

type RulesOfEngagement = 'hold-fire' | 'fire-at-will';

interface Fleet {
  id: FleetId;
  factionId: FactionId;
  name: string;
  ships: ShipInstance[];
  position: [number, number, number];
  order: Order;
  roe: RulesOfEngagement;
  /** Optional designated priority target. Ships that can safely engage it do; others fall back per ROE. */
  priorityTargetFleetId?: FleetId;
  destroyed: boolean;
}

type BodyType = 'planet' | 'station' | 'asteroid-field' | 'nebula';

interface CelestialBody {
  id: BodyId;
  name: string;
  type: BodyType;
  position: [number, number, number];
  ownerFactionId?: FactionId; // undefined = neutral
  radius: number;
}

interface CombatLogEntry {
  id: string;
  tick: number;
  message: string;
}

interface GameState {
  tick: number;
  factions: Record<FactionId, Faction>;
  shipClasses: Record<ShipClassId, ShipClass>;
  fleets: Record<FleetId, Fleet>;
  bodies: Record<BodyId, CelestialBody>;
  projectiles: Projectile[];
  combatLog: CombatLogEntry[];
  selectedFleetIds: FleetId[];
}
```

## 6. Systems to build

- **Scene setup** — Three.js scene: camera + orbit controls, lighting, starfield backdrop, celestial bodies placed and rendered (simple geometric/stylized meshes, not detailed models)
- **Fleet rendering & movement** — fleets as 3D objects (grouped ship meshes or simplified representative markers at strategic scale), interpolating position toward their order's target each tick
- **Selection & orders** — click/drag-select fleets in the 3D view; UI or right-click to issue move/attack/hold orders
- **ROE & priority targeting** — per-fleet toggle between hold-fire/fire-at-will; UI action to designate/clear a priority target fleet; this state feeds directly into combat resolution's per-ship target selection
- **Combat resolution** — proximity detection between opposing fleets, engagement state, per-ship target selection (priority target if safely reachable, else target of opportunity, else hold fire — see Section 4a)
- **Projectile simulation & rendering** — spawning kinetic tracers, missiles, and energy bolts as physical objects with position/velocity, advancing them each tick, resolving hits (and missile interception) on arrival, applying damage, destruction, combat log entries. This is the system that carries the BSG feel — worth the most iteration/polish time in implementation.
- **UI overlay** (React, layered over the canvas) — fleet list, selected fleet detail, ROE toggle, priority target designation, faction standings display, combat log feed

## 7. Visual direction

Ships and bodies should read clearly at strategic zoom rather than aim for detailed models. Faction color-coding should carry most of the "which side is this" information at a glance.

**Combat is the signature visual moment (BSG-style, semi-realistic):**
- **Kinetic weapons** (cannon, gauss, railgun) as fast, bright tracer lines/streaks between ships — not laser-sword beams, more "visible bullet." Railguns can read as a slightly heavier/brighter tracer to sell extra punch.
- **Missiles** as slower, trailed projectiles (smoke/exhaust trail) with a distinct visual identity from kinetic tracers, so the player can read at a glance what kind of exchange is happening
- **Energy weapons** (plasma, laser) as glowing bolts or short beams — visually distinct again from both kinetic tracers and missile trails, giving energy-focused factions a clearly different "feel" in a fight
- A projectile-focused faction, a missile-swarm faction, and an energy faction should each be visually identifiable in the middle of a battle purely from their weapons fire, without needing to check the UI
- Impacts and explosions should feel like they have physical weight — brief flash/debris, not a cartoonish burst
- No instant hit-scan resolution anywhere — every shot should visibly travel, even briefly, reinforcing that this is physical warfare rather than abstracted stat exchange
- Overall tone: military-sci-fi political drama, grounded rather than cartoonish. Exact palette/lighting style still TBD — worth a short design pass before implementation begins, but should support darker space backdrops that let tracers, bolts, and explosions read clearly against them.

## 8. Open questions for next pass

- Combat AI: how aggressive should non-player factions be by default?
- Should the player be able to lose fleets permanently in this slice, or is there a "practice" framing?
- Any UI reference points (existing RTS or 4X games) that capture the intended feel?
- Point-defense against missiles (Section 5, `interceptChance`): is this an automatic passive stat, or should it be a visible mechanic (e.g. flak bursts intercepting missiles) worth its own rendering treatment?
