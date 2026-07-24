# Expansion — Space RTS vertical slice

Implementation of `space-rts-vertical-slice-spec.md`: one hand-authored star system, three
factions across the three weapon-tech doctrines, and fleet-level combat resolved in 3D.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## Controls

| Input | Action |
| --- | --- |
| Left click | Select a fleet (Shift to add/remove) |
| Left drag | Box-select your fleets |
| Right click | Move to point, or attack the enemy fleet under the cursor |
| Ctrl + right click | Designate a priority target |
| Middle drag | Orbit · **Right drag** pan · **Wheel** zoom |
| WASD / arrows | Pan · **F** focus selection · **Space** pause |

## Architecture

Vanilla Three.js owns the scene and the frame loop; React owns only the DOM overlay. The two
meet at one mutable `GameState` object.

```
src/game/          simulation — pure TypeScript, zero Three.js imports
  types.ts         spec Section 5 data model (extensions marked in comments)
  constants.ts     world scale, tick rate, tuning knobs, per-weapon visual identity
  content.ts       factions, ship classes, weapon archetypes, bodies, starting fleets
  state.ts         state construction + the store React subscribes to
  sim/             movement, targeting (Section 4a), projectiles, AI, tick orchestration
src/render/        Three.js layers, each owning its own dispose path
  GameView.ts      renderer, camera, orbit controls, input, the fixed-timestep loop
src/ui/            React overlay
```

Three decisions worth knowing:

**Fixed timestep, interpolated render.** The sim always advances by exactly `TICK_DT` (20Hz).
Game speed scales the *accumulator*, never the delta, so 3× speed produces identical results to
1× — just faster. Ships and projectiles keep a previous position and the renderer lerps by the
leftover accumulator, so motion stays smooth at any frame rate.

**Projectiles never touch React.** They live in a fixed 1400-slot pool, are advanced in the
imperative loop, and render as three instanced meshes (kinetic tracers, energy bolts, missiles)
plus one `LineSegments` for missile exhaust — a handful of draw calls regardless of how many
shots are in the air. React re-renders at a throttled 10Hz off a version counter.

**Combat is per-ship, presentation is per-fleet.** Every ship holds its own health, formation
slot, world position and per-mount cooldowns, and runs the Section 4a decision independently.
The player commands fleets; the firefight reads as dozens of individual exchanges.

## Decisions the spec left open

Spec Section 8 asked four questions. Defaults taken, all cheap to change:

- **AI aggression** — engage any hostile fleet within 340 units, otherwise hold the home
  approaches. Re-plans every 1.2s. Deliberately simple (`src/game/sim/ai.ts`).
- **Permanent losses** — yes. Destroyed ships and fleets are gone; last faction standing wins.
- **Point-defense** — a passive roll, but a *visible* one. Interception is decided at launch and
  only resolves when the missile enters the target's PD envelope, so it dies in a flak burst
  where the player can see it rather than silently missing.
- **Safe firing solution** — target in range, plus no friendly hull within 15 units of the firing
  line for direct-fire kinetics (cannon/gauss/railgun). Missiles steer and energy bolts are
  exempt. A ship with no safe shot holds fire rather than forcing a bad one.

Extensions to the spec's data model are marked `/** Extension: ... */` in `types.ts`. The
substantive one: projectiles carry a `targetShipId` as well as `targetFleetId`, so a shot
resolves against a specific hull in 3D instead of an abstract fleet.

## Tuning

Combat feel lives in two files. `content.ts` holds weapon damage/range/fire rate and hull health
— all six weapons sit near 10 DPS per mount so doctrines differ in *shape* (missile alpha and
reach vs. energy sustain at close range) rather than raw power. `constants.ts` holds world scale,
hull render sizes, and `WEAPON_VISUALS`, which drives each weapon's colour, streak length and
caliber — that table is where the "which faction is shooting" read comes from.

## Not in this slice

Per the spec: no galaxy map, no interactive diplomacy, no economy or production, no save state,
no multiplayer. Relations exist as data and are displayed, but cannot yet be changed.
