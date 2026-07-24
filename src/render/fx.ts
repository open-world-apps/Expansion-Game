import * as THREE from 'three';
import type { GameState, SimEvent } from '../game/types';
import { mulberry32 } from '../game/vec';
import { makeSoftPointsMaterial } from './materials';

const MAX_PARTICLES = 2400;
const rand = mulberry32(0xfacade);

interface Burst {
  count: number;
  speed: number;
  size: number;
  life: number;
  drag: number;
}

/** Per-event particle recipes. Explosions get a bright core plus slower debris. */
const BURSTS: Record<string, { core: Burst; debris?: Burst }> = {
  muzzle: { core: { count: 1, speed: 0, size: 5, life: 0.09, drag: 0 } },
  impact: {
    core: { count: 1, speed: 0, size: 9, life: 0.16, drag: 0 },
    debris: { count: 5, speed: 26, size: 2.4, life: 0.42, drag: 2.4 },
  },
  intercept: {
    core: { count: 1, speed: 0, size: 16, life: 0.22, drag: 0 },
    debris: { count: 10, speed: 40, size: 2.8, life: 0.5, drag: 3.0 },
  },
  explosion: {
    core: { count: 1, speed: 0, size: 34, life: 0.34, drag: 0 },
    debris: { count: 22, speed: 46, size: 3.4, life: 1.5, drag: 1.1 },
  },
};

export interface FxLayer {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  consume(state: GameState): void;
  update(dt: number): void;
  dispose(): void;
}

export function createFxLayer(): FxLayer {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);

  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const baseColors = new Float32Array(MAX_PARTICLES * 3);
  const baseSizes = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, MAX_PARTICLES);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = makeSoftPointsMaterial();
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.raycast = () => {};

  let cursor = 0;

  function emit(event: SimEvent, burst: Burst, spread: boolean): void {
    const r = ((event.color >> 16) & 255) / 255;
    const g = ((event.color >> 8) & 255) / 255;
    const b = (event.color & 255) / 255;

    for (let n = 0; n < burst.count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % MAX_PARTICLES;
      const o = i * 3;

      positions[o] = event.position[0];
      positions[o + 1] = event.position[1];
      positions[o + 2] = event.position[2];

      if (spread) {
        const u = rand() * 2 - 1;
        const theta = rand() * Math.PI * 2;
        const p = Math.sqrt(1 - u * u);
        const speed = burst.speed * (0.35 + rand() * 0.65);
        velocities[o] = Math.cos(theta) * p * speed;
        velocities[o + 1] = u * speed;
        velocities[o + 2] = Math.sin(theta) * p * speed;
      } else {
        velocities[o] = 0;
        velocities[o + 1] = 0;
        velocities[o + 2] = 0;
      }

      // Cores burn near-white; debris keeps the source colour.
      const hot = spread ? 1 : 1.9;
      baseColors[o] = Math.min(3, (spread ? r : r * 0.5 + 0.5) * hot * event.scale);
      baseColors[o + 1] = Math.min(3, (spread ? g : g * 0.5 + 0.5) * hot * event.scale);
      baseColors[o + 2] = Math.min(3, (spread ? b : b * 0.5 + 0.5) * hot * event.scale);

      baseSizes[i] = burst.size * event.scale;
      maxLife[i] = burst.life * (spread ? 0.6 + rand() * 0.8 : 1);
      life[i] = maxLife[i];
      drag[i] = burst.drag;
    }
  }

  return {
    points,
    material,

    consume(state: GameState) {
      for (const event of state.events) {
        const recipe = BURSTS[event.type];
        if (!recipe) continue;
        emit(event, recipe.core, false);
        if (recipe.debris) emit(event, recipe.debris, true);
      }
      state.events.length = 0;
    },

    update(dt: number) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const o = i * 3;
        if (life[i] <= 0) {
          sizes[i] = 0;
          colors[o] = 0;
          colors[o + 1] = 0;
          colors[o + 2] = 0;
          continue;
        }

        life[i] -= dt;
        if (life[i] <= 0) {
          sizes[i] = 0;
          colors[o] = 0;
          colors[o + 1] = 0;
          colors[o + 2] = 0;
          continue;
        }

        const decay = 1 - Math.min(1, drag[i] * dt);
        velocities[o] *= decay;
        velocities[o + 1] *= decay;
        velocities[o + 2] *= decay;
        positions[o] += velocities[o] * dt;
        positions[o + 1] += velocities[o + 1] * dt;
        positions[o + 2] += velocities[o + 2] * dt;

        const t = life[i] / maxLife[i];
        const fade = t * t;
        colors[o] = baseColors[o] * fade;
        colors[o + 1] = baseColors[o + 1] * fade;
        colors[o + 2] = baseColors[o + 2] * fade;
        // Flashes bloom outward as they die; debris shrinks.
        sizes[i] = drag[i] > 0 ? baseSizes[i] * t : baseSizes[i] * (1.9 - t * 0.9);
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
