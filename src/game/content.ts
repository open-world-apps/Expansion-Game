import type { CelestialBody, Faction, ShipClass, WeaponMount, WeaponType } from './types';

type WeaponTemplate = Omit<WeaponMount, 'id'>;

/**
 * Weapon archetypes. Ranges and speeds are deliberately spread so the three tech focuses
 * fight at different distances: energy closes, kinetic trades mid, missiles open long.
 */
const WEAPONS: Record<WeaponType, WeaponTemplate> = {
  cannon: {
    type: 'cannon',
    physicsClass: 'kinetic',
    damage: 5,
    range: 95,
    fireRate: 2.0,
    projectileSpeed: 210,
  },
  gauss: {
    type: 'gauss',
    physicsClass: 'kinetic',
    damage: 8,
    range: 120,
    fireRate: 1.1,
    projectileSpeed: 300,
  },
  railgun: {
    type: 'railgun',
    physicsClass: 'kinetic',
    damage: 20,
    range: 165,
    fireRate: 0.45,
    projectileSpeed: 460,
  },
  missile: {
    type: 'missile',
    physicsClass: 'kinetic',
    damage: 30,
    range: 240,
    fireRate: 0.34,
    projectileSpeed: 95,
    interceptChance: 0.34,
    turnRate: 1.5,
  },
  plasma: {
    type: 'plasma',
    physicsClass: 'energy',
    damage: 14,
    range: 105,
    fireRate: 0.75,
    projectileSpeed: 250,
  },
  laser: {
    type: 'laser',
    physicsClass: 'energy',
    damage: 6,
    range: 140,
    fireRate: 1.7,
    projectileSpeed: 620,
  },
};

let weaponSeq = 0;
const mount = (type: WeaponType): WeaponMount => ({
  ...WEAPONS[type],
  id: `w${++weaponSeq}`,
});

export const FACTION_IDS = {
  concord: 'concord',
  vaskar: 'vaskar',
  kithara: 'kithara',
} as const;

export const BODIES: CelestialBody[] = [
  {
    id: 'concord-prime',
    name: 'Concord Prime',
    type: 'planet',
    position: [-330, 0, -190],
    ownerFactionId: FACTION_IDS.concord,
    radius: 34,
  },
  {
    id: 'vaskar-bastion',
    name: 'Bastion Vaskar',
    type: 'station',
    position: [350, 0, -210],
    ownerFactionId: FACTION_IDS.vaskar,
    radius: 16,
  },
  {
    id: 'kithara-spire',
    name: 'Kithara Spire',
    type: 'planet',
    position: [70, 12, 340],
    ownerFactionId: FACTION_IDS.kithara,
    radius: 28,
  },
  {
    id: 'meridian',
    name: 'Meridian Waypoint',
    type: 'station',
    position: [0, 0, 0],
    radius: 14,
  },
  {
    id: 'ashfall',
    name: 'Ashfall Belt',
    type: 'asteroid-field',
    position: [-170, -8, 130],
    radius: 95,
  },
  {
    id: 'veil',
    name: 'The Veil',
    type: 'nebula',
    position: [235, 18, 70],
    radius: 110,
  },
];

export const FACTIONS: Faction[] = [
  {
    id: FACTION_IDS.concord,
    name: 'Terran Concord',
    color: '#4aa8ff',
    weaponFocus: 'projectile',
    blurb:
      'Balanced kinetic doctrine — cannons, gauss, railguns and a missile reserve. Flexible at every range, dominant at none.',
    homeBodyId: 'concord-prime',
    relations: {},
  },
  {
    id: FACTION_IDS.vaskar,
    name: 'Vaskar Ascendancy',
    color: '#ff6a35',
    weaponFocus: 'missile',
    blurb:
      'Swarm doctrine — massed missile tubes, thin direct-fire backup. Devastating alpha strikes, gutted by point-defense.',
    homeBodyId: 'vaskar-bastion',
    relations: {},
  },
  {
    id: FACTION_IDS.kithara,
    name: 'Kithara Collective',
    color: '#b06cff',
    weaponFocus: 'energy',
    blurb:
      'Directed-energy doctrine — plasma and laser batteries, no kinetics. Sustained close-range pressure, nothing to intercept.',
    homeBodyId: 'kithara-spire',
    relations: {},
  },
];

/** Seeded diplomacy: Vaskar and Kithara are already at war before the player acts. */
const RELATIONS: Array<[string, string, number]> = [
  [FACTION_IDS.concord, FACTION_IDS.vaskar, -55],
  [FACTION_IDS.vaskar, FACTION_IDS.kithara, -80],
  [FACTION_IDS.concord, FACTION_IDS.kithara, -10],
];

export function applyRelations(factions: Record<string, Faction>): void {
  for (const [a, b, value] of RELATIONS) {
    factions[a].relations[b] = value;
    factions[b].relations[a] = value;
  }
  for (const f of Object.values(factions)) f.relations[f.id] = 100;
}

export const SHIP_CLASSES: ShipClass[] = [
  {
    id: 'concord-sabre',
    name: 'Sabre',
    factionId: FACTION_IDS.concord,
    hull: 'frigate',
    maxHealth: 520,
    speed: 54,
    weapons: [mount('cannon'), mount('cannon'), mount('missile')],
  },
  {
    id: 'concord-bulwark',
    name: 'Bulwark',
    factionId: FACTION_IDS.concord,
    hull: 'cruiser',
    maxHealth: 1200,
    speed: 38,
    weapons: [mount('railgun'), mount('gauss'), mount('gauss'), mount('missile')],
  },
  {
    id: 'vaskar-needle',
    name: 'Needle',
    factionId: FACTION_IDS.vaskar,
    hull: 'frigate',
    maxHealth: 460,
    speed: 58,
    weapons: [mount('missile'), mount('missile'), mount('cannon')],
  },
  {
    id: 'vaskar-hierarch',
    name: 'Hierarch',
    factionId: FACTION_IDS.vaskar,
    hull: 'battleship',
    maxHealth: 2400,
    speed: 27,
    weapons: [mount('missile'), mount('missile'), mount('missile'), mount('gauss')],
  },
  {
    id: 'kithara-filament',
    name: 'Filament',
    factionId: FACTION_IDS.kithara,
    hull: 'frigate',
    maxHealth: 500,
    speed: 60,
    weapons: [mount('laser'), mount('laser')],
  },
  {
    id: 'kithara-aureole',
    name: 'Aureole',
    factionId: FACTION_IDS.kithara,
    hull: 'cruiser',
    maxHealth: 1250,
    speed: 40,
    weapons: [mount('plasma'), mount('plasma'), mount('laser')],
  },
];

export interface FleetSeed {
  id: string;
  factionId: string;
  name: string;
  position: [number, number, number];
  composition: Array<[string, number]>;
}

export const FLEET_SEEDS: FleetSeed[] = [
  {
    id: 'con-1',
    factionId: FACTION_IDS.concord,
    name: 'TCN Ardent',
    position: [-300, 0, -140],
    composition: [
      ['concord-bulwark', 2],
      ['concord-sabre', 4],
    ],
  },
  {
    id: 'con-2',
    factionId: FACTION_IDS.concord,
    name: 'TCN Vigil',
    position: [-250, 10, -215],
    composition: [
      ['concord-bulwark', 1],
      ['concord-sabre', 5],
    ],
  },
  {
    id: 'con-3',
    factionId: FACTION_IDS.concord,
    name: 'TCN Threshold',
    position: [-120, -6, -70],
    composition: [
      ['concord-bulwark', 2],
      ['concord-sabre', 3],
    ],
  },
  {
    id: 'vas-1',
    factionId: FACTION_IDS.vaskar,
    name: 'Ascendant Choir',
    position: [318, 0, -170],
    composition: [
      ['vaskar-hierarch', 1],
      ['vaskar-needle', 5],
    ],
  },
  {
    id: 'vas-2',
    factionId: FACTION_IDS.vaskar,
    name: 'Sundered Oath',
    position: [372, -10, -248],
    composition: [['vaskar-needle', 7]],
  },
  {
    id: 'vas-3',
    factionId: FACTION_IDS.vaskar,
    name: 'Pale Litany',
    position: [280, 6, -60],
    composition: [
      ['vaskar-hierarch', 1],
      ['vaskar-needle', 4],
    ],
  },
  {
    id: 'kit-1',
    factionId: FACTION_IDS.kithara,
    name: 'Chorus Meridian',
    position: [95, 10, 285],
    composition: [
      ['kithara-aureole', 2],
      ['kithara-filament', 4],
    ],
  },
  {
    id: 'kit-2',
    factionId: FACTION_IDS.kithara,
    name: 'Second Refrain',
    position: [20, 4, 320],
    composition: [
      ['kithara-aureole', 1],
      ['kithara-filament', 5],
    ],
  },
  {
    id: 'kit-3',
    factionId: FACTION_IDS.kithara,
    name: 'Bright Cadence',
    position: [110, 8, 215],
    composition: [
      ['kithara-aureole', 2],
      ['kithara-filament', 3],
    ],
  },
];
