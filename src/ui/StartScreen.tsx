import { FACTIONS } from '../game/content';
import type { WeaponTechFocus } from '../game/types';

const FOCUS_LABEL: Record<WeaponTechFocus, string> = {
  projectile: 'Projectile doctrine',
  missile: 'Missile doctrine',
  energy: 'Energy doctrine',
};

const FOCUS_DETAIL: Record<WeaponTechFocus, string[]> = {
  projectile: [
    'Cannons, gauss, railguns, missile reserve',
    'Effective at every band, master of none',
    'Tracer-heavy signature — visible bullets',
  ],
  missile: [
    'Massed tubes, minimal direct fire',
    'Highest alpha strike; gutted by point-defense',
    'Signature: sky full of exhaust trails',
  ],
  energy: [
    'Plasma and laser batteries, zero kinetics',
    'Sustained pressure, nothing to intercept',
    'Signature: glowing bolts and short beams',
  ],
};

interface Props {
  onStart(factionId: string): void;
}

export function StartScreen({ onStart }: Props) {
  return (
    <div className="start-screen">
      <div className="start-inner">
        <header>
          <p className="eyebrow">Vertical slice — one system, three powers</p>
          <h1>EXPANSION</h1>
          <p className="sub">
            The Meridian system is contested. Vaskar and Kithara are already shooting at each other.
            Choose the doctrine you will command — it decides how your fleets fight and how the
            battle reads on screen.
          </p>
        </header>

        <div className="faction-grid">
          {FACTIONS.map((faction) => (
            <button
              key={faction.id}
              className="faction-card"
              style={{ '--faction': faction.color } as React.CSSProperties}
              onClick={() => onStart(faction.id)}
            >
              <span className="tag">{FOCUS_LABEL[faction.weaponFocus]}</span>
              <h2>{faction.name}</h2>
              <p>{faction.blurb}</p>
              <ul>
                {FOCUS_DETAIL[faction.weaponFocus].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span className="cta">Take command →</span>
            </button>
          ))}
        </div>

        <footer>
          <span><b>LMB</b> select · drag to box-select</span>
          <span><b>RMB</b> move / attack · <b>Ctrl+RMB</b> priority target</span>
          <span><b>MMB</b> orbit · <b>RMB drag</b> pan · <b>Wheel</b> zoom</span>
          <span><b>WASD</b> pan · <b>F</b> focus · <b>Space</b> pause</span>
        </footer>
      </div>
    </div>
  );
}
