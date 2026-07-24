import { WAR_THRESHOLD } from '../game/constants';
import { issueAttackOrder, issueHoldOrder, setPriorityTarget, setRoe } from '../game/sim';
import { aliveShipCount, areHostile, fleetHealth, store } from '../game/state';
import type { Fleet, GameState, RulesOfEngagement } from '../game/types';
import { useGameVersion } from './useGameStore';

function relationLabel(value: number): string {
  if (value <= -70) return 'Total war';
  if (value <= WAR_THRESHOLD) return 'At war';
  if (value < 0) return 'Uneasy';
  if (value < 40) return 'Neutral';
  return 'Allied';
}

function orderLabel(state: GameState, fleet: Fleet): string {
  switch (fleet.order.type) {
    case 'move':
      return 'Moving';
    case 'attack': {
      const target = fleet.order.targetFleetId ? state.fleets[fleet.order.targetFleetId] : undefined;
      return target ? `Attacking ${target.name}` : 'Attacking';
    }
    default:
      return 'Holding';
  }
}

function HealthBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div className="health-bar">
      <span style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

function select(ids: string[]): void {
  store.state.selectedFleetIds = ids;
  store.publish();
}

function FleetRoster({ state }: { state: GameState }) {
  const fleets = Object.values(state.fleets).filter(
    (f) => f.factionId === state.playerFactionId && !f.destroyed,
  );
  const color = state.factions[state.playerFactionId].color;

  return (
    <section className="panel panel-fleets">
      <h3>Fleets</h3>
      <ul className="fleet-list">
        {fleets.map((fleet) => {
          const health = fleetHealth(state, fleet);
          const selected = state.selectedFleetIds.includes(fleet.id);
          return (
            <li key={fleet.id}>
              <button
                className={selected ? 'fleet-row is-selected' : 'fleet-row'}
                onClick={(event) => {
                  if (event.shiftKey) {
                    select(
                      selected
                        ? state.selectedFleetIds.filter((id) => id !== fleet.id)
                        : [...state.selectedFleetIds, fleet.id],
                    );
                  } else {
                    select([fleet.id]);
                  }
                }}
              >
                <div className="fleet-row-top">
                  <span className="fleet-name">{fleet.name}</span>
                  <span className="fleet-count">{aliveShipCount(fleet)} ships</span>
                </div>
                <HealthBar current={health.current} max={health.max} color={color} />
                <div className="fleet-row-bottom">
                  <span className={fleet.roe === 'fire-at-will' ? 'roe hot' : 'roe cold'}>
                    {fleet.roe === 'fire-at-will' ? 'FIRE AT WILL' : 'HOLD FIRE'}
                  </span>
                  <span className="order">{orderLabel(state, fleet)}</span>
                </div>
              </button>
            </li>
          );
        })}
        {!fleets.length && <li className="empty">No fleets remaining.</li>}
      </ul>
    </section>
  );
}

function SelectionPanel({ state }: { state: GameState }) {
  const selected = state.selectedFleetIds
    .map((id) => state.fleets[id])
    .filter((f): f is Fleet => Boolean(f) && !f.destroyed);

  if (!selected.length) {
    return (
      <section className="panel panel-selection">
        <p className="hint">
          Select a fleet to command. <b>Right-click</b> empty space to move, an enemy fleet to attack,
          <b> Ctrl+right-click</b> to designate a priority target.
        </p>
      </section>
    );
  }

  const ids = selected.map((f) => f.id);
  const lead = selected[0];
  const priority = lead.priorityTargetFleetId ? state.fleets[lead.priorityTargetFleetId] : undefined;
  const hostiles = Object.values(state.fleets).filter(
    (f) => !f.destroyed && areHostile(state, state.playerFactionId, f.factionId),
  );

  const roster = new Map<string, { name: string; count: number; health: number; max: number }>();
  for (const fleet of selected) {
    for (const ship of fleet.ships) {
      if (ship.health <= 0) continue;
      const shipClass = state.shipClasses[ship.classId];
      const entry = roster.get(shipClass.id) ?? { name: shipClass.name, count: 0, health: 0, max: 0 };
      entry.count++;
      entry.health += ship.health;
      entry.max += shipClass.maxHealth;
      roster.set(shipClass.id, entry);
    }
  }

  const applyRoe = (roe: RulesOfEngagement) => {
    setRoe(store.state, ids, roe);
    store.publish();
  };

  return (
    <section className="panel panel-selection">
      <header className="selection-header">
        <h3>{selected.length === 1 ? lead.name : `${selected.length} fleets selected`}</h3>
        <span className="muted">{orderLabel(state, lead)}</span>
      </header>

      <div className="control-row">
        <span className="control-label">Rules of engagement</span>
        <div className="segmented">
          <button
            className={lead.roe === 'hold-fire' ? 'active' : ''}
            onClick={() => applyRoe('hold-fire')}
          >
            Hold fire
          </button>
          <button
            className={lead.roe === 'fire-at-will' ? 'active hot' : ''}
            onClick={() => applyRoe('fire-at-will')}
          >
            Fire at will
          </button>
        </div>
      </div>

      <div className="control-row">
        <span className="control-label">Priority target</span>
        <div className="priority-row">
          <select
            value={priority?.id ?? ''}
            onChange={(event) => {
              setPriorityTarget(store.state, ids, event.target.value || undefined);
              store.publish();
            }}
          >
            <option value="">None — targets of opportunity</option>
            {hostiles.map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name} ({state.factions[fleet.factionId].name})
              </option>
            ))}
          </select>
          <button
            className="ghost"
            disabled={!priority}
            onClick={() => {
              if (priority) issueAttackOrder(store.state, ids, priority.id);
              store.publish();
            }}
          >
            Attack
          </button>
          <button
            className="ghost"
            onClick={() => {
              issueHoldOrder(store.state, ids);
              store.publish();
            }}
          >
            Hold position
          </button>
        </div>
      </div>

      <ul className="roster">
        {[...roster.values()].map((entry) => (
          <li key={entry.name}>
            <span className="roster-name">
              {entry.count}× {entry.name}
            </span>
            <HealthBar
              current={entry.health}
              max={entry.max}
              color={state.factions[state.playerFactionId].color}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Standings({ state }: { state: GameState }) {
  const player = state.factions[state.playerFactionId];
  const others = Object.values(state.factions).filter((f) => f.id !== player.id);

  return (
    <section className="panel panel-standings">
      <h3>Standings</h3>
      <ul>
        {others.map((faction) => {
          const value = player.relations[faction.id] ?? 0;
          const alive = Object.values(state.fleets).filter(
            (f) => f.factionId === faction.id && !f.destroyed,
          ).length;
          return (
            <li key={faction.id}>
              <span className="dot" style={{ background: faction.color }} />
              <span className="standing-name">{faction.name}</span>
              <span className={value <= WAR_THRESHOLD ? 'standing-value war' : 'standing-value'}>
                {relationLabel(value)} ({value})
              </span>
              <span className="muted">{alive} fleets</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CombatLog({ state }: { state: GameState }) {
  const entries = state.combatLog.slice(-40).reverse();
  return (
    <section className="panel panel-log">
      <h3>Combat log</h3>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span
              className="dot"
              style={{ background: entry.factionId ? state.factions[entry.factionId].color : '#7d8ea6' }}
            />
            <span className="log-tick">{String(Math.floor(entry.tick / 20)).padStart(3, '0')}s</span>
            <span>{entry.message}</span>
          </li>
        ))}
        {!entries.length && <li className="empty">No contacts yet.</li>}
      </ul>
    </section>
  );
}

function TopBar({ state, onRestart }: { state: GameState; onRestart(): void }) {
  const player = state.factions[state.playerFactionId];
  const speeds = [0, 1, 2, 3];

  return (
    <header className="panel top-bar">
      <div className="identity">
        <span className="dot" style={{ background: player.color }} />
        <strong>{player.name}</strong>
        <span className="muted">{player.weaponFocus} doctrine</span>
      </div>
      <div className="speeds">
        {speeds.map((speed) => (
          <button
            key={speed}
            className={state.speed === speed ? 'active' : ''}
            onClick={() => {
              store.state.speed = speed;
              store.publish();
            }}
          >
            {speed === 0 ? '❚❚' : `${speed}×`}
          </button>
        ))}
        <span className="muted clock">T+{Math.floor(state.tick / 20)}s</span>
      </div>
      <button className="ghost" onClick={onRestart}>
        New game
      </button>
    </header>
  );
}

export function Hud({ onRestart }: { onRestart(): void }) {
  useGameVersion();
  const state = store.state;

  return (
    <div className="hud">
      <TopBar state={state} onRestart={onRestart} />
      <FleetRoster state={state} />
      <div className="hud-right">
        <Standings state={state} />
        <CombatLog state={state} />
      </div>
      <SelectionPanel state={state} />

      {state.gameOver && (
        <div className="game-over">
          <h2>
            {state.gameOver.winnerFactionId === state.playerFactionId
              ? 'System held'
              : state.gameOver.winnerFactionId
                ? `${state.factions[state.gameOver.winnerFactionId].name} holds the system`
                : 'Mutual annihilation'}
          </h2>
          <button onClick={onRestart}>Run it again</button>
        </div>
      )}
    </div>
  );
}
