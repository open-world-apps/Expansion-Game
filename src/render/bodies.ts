import * as THREE from 'three';
import type { CelestialBody, GameState } from '../game/types';
import { mulberry32 } from '../game/vec';
import { makeSoftPointsMaterial } from './materials';

const NEUTRAL_COLOR = 0x7d8ea6;

function ownerColor(state: GameState, body: CelestialBody): number {
  if (!body.ownerFactionId) return NEUTRAL_COLOR;
  return parseInt(state.factions[body.ownerFactionId].color.slice(1), 16);
}

function makePlanet(body: CelestialBody, tint: number): THREE.Object3D {
  const group = new THREE.Group();

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(body.radius, 40, 28),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint).multiplyScalar(0.32),
      roughness: 0.92,
      metalness: 0.05,
      flatShading: false,
    }),
  );
  group.add(surface);

  // Backside shell tinted to the owner's colour reads as an atmosphere rim at strategic zoom.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(body.radius * 1.12, 32, 22),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(halo);

  return group;
}

function makeStation(body: CelestialBody, tint: number): THREE.Object3D {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a6675, roughness: 0.45, metalness: 0.75 });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(body.radius, body.radius * 0.16, 12, 40), metal);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(body.radius * 0.14, body.radius * 0.14, body.radius * 2.1, 10),
    metal,
  );
  group.add(spine);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(body.radius * 0.38, 0),
    new THREE.MeshBasicMaterial({ color: tint, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(core);

  return group;
}

function makeAsteroidField(body: CelestialBody): THREE.Object3D {
  const rand = mulberry32(0xa57e401d);
  const count = 260;
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x4a4136, roughness: 1, metalness: 0.1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = body.radius * (0.25 + Math.sqrt(rand()) * 0.75);
    dummy.position.set(Math.cos(angle) * radius, (rand() - 0.5) * body.radius * 0.22, Math.sin(angle) * radius);
    dummy.rotation.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    const s = 1.4 + rand() * 4.6;
    dummy.scale.set(s, s * (0.6 + rand() * 0.6), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function makeNebula(body: CelestialBody): THREE.Object3D {
  const rand = mulberry32(0x9eb0);
  const count = 650;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const dist = body.radius * Math.pow(rand(), 0.5);
    positions[i * 3] = Math.cos(theta) * r * dist;
    positions[i * 3 + 1] = u * dist * 0.35;
    positions[i * 3 + 2] = Math.sin(theta) * r * dist;

    // Hundreds of additive sprites stack fast — each one has to stay near-black on its own.
    const t = rand();
    colors[i * 3] = 0.011 + t * 0.010;
    colors[i * 3 + 1] = 0.004 + t * 0.005;
    colors[i * 3 + 2] = 0.017 + t * 0.015;
    sizes[i] = 34 + rand() * 74;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const points = new THREE.Points(geometry, makeSoftPointsMaterial());
  points.renderOrder = 1;
  return points;
}

function makeOwnershipRing(body: CelestialBody, tint: number): THREE.Object3D {
  const inner = body.radius * 1.55;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, inner * 1.045, 96),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export interface BodyLayer {
  group: THREE.Group;
  /** Soft-point materials that need their size uniform refreshed on resize. */
  pointMaterials: THREE.ShaderMaterial[];
  update(elapsed: number): void;
}

export function createBodyLayer(state: GameState): BodyLayer {
  const group = new THREE.Group();
  const pointMaterials: THREE.ShaderMaterial[] = [];
  const spinners: THREE.Object3D[] = [];

  for (const body of Object.values(state.bodies)) {
    const tint = ownerColor(state, body);
    const holder = new THREE.Group();
    holder.position.set(body.position[0], body.position[1], body.position[2]);

    let visual: THREE.Object3D;
    switch (body.type) {
      case 'planet':
        visual = makePlanet(body, tint);
        spinners.push(visual);
        break;
      case 'station':
        visual = makeStation(body, tint);
        spinners.push(visual);
        break;
      case 'asteroid-field':
        visual = makeAsteroidField(body);
        break;
      case 'nebula': {
        visual = makeNebula(body);
        pointMaterials.push((visual as THREE.Points).material as THREE.ShaderMaterial);
        break;
      }
    }
    holder.add(visual);

    if (body.type === 'planet' || body.type === 'station') {
      holder.add(makeOwnershipRing(body, tint));
    }

    group.add(holder);
  }

  return {
    group,
    pointMaterials,
    update(elapsed: number) {
      for (let i = 0; i < spinners.length; i++) {
        spinners[i].rotation.y = elapsed * (0.02 + i * 0.006);
      }
    },
  };
}
