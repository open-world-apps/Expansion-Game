import { useSyncExternalStore } from 'react';
import { store } from '../game/state';

/**
 * The sim mutates one GameState object in place at 20Hz. React subscribes to a
 * throttled version counter instead of the state itself, so UI re-renders are
 * bounded regardless of how much is happening on screen.
 */
export function useGameVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
