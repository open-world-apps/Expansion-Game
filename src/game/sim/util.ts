import { MAX_COMBAT_LOG } from '../constants';
import type { GameState, SimEventType, Vec3 } from '../types';
import { mulberry32 } from '../vec';

const SIM_SEED = 0x5eed1234;

/**
 * Single simulation RNG, reseeded on every new game so each run replays identically.
 * Indirected through a closure because the generator itself is swapped on reset.
 */
let generator = mulberry32(SIM_SEED);
export const rand = (): number => generator();

let logSeq = 0;

export function resetSimRandom(): void {
  generator = mulberry32(SIM_SEED);
  logSeq = 0;
}

export function pushLog(state: GameState, message: string, factionId?: string): void {
  state.combatLog.push({ id: `l${++logSeq}`, tick: state.tick, message, factionId });
  if (state.combatLog.length > MAX_COMBAT_LOG) {
    state.combatLog.splice(0, state.combatLog.length - MAX_COMBAT_LOG);
  }
}

export function pushEvent(
  state: GameState,
  type: SimEventType,
  position: Vec3,
  color: number,
  scale: number,
): void {
  state.events.push({ type, position: [position[0], position[1], position[2]], color, scale });
}
