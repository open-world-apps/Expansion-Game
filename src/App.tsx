import { useEffect, useRef, useState } from 'react';
import { store } from './game/state';
import { GameView } from './render/GameView';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';

function GameScreen({ onRestart }: { onRestart(): void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const view = new GameView(container);
    return () => view.dispose();
  }, []);

  return (
    <div className="game-root">
      <div className="viewport" ref={containerRef} />
      <Hud onRestart={onRestart} />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<{ factionId: string; run: number } | null>(null);

  if (!session) {
    return (
      <StartScreen
        onStart={(factionId) => {
          store.reset(factionId);
          setSession({ factionId, run: 1 });
        }}
      />
    );
  }

  // Remounting on a new key tears the GameView down and rebuilds every GPU resource
  // against the fresh state, rather than trying to reconcile layers in place.
  return <GameScreen key={session.run} onRestart={() => setSession(null)} />;
}
