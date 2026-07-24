import * as THREE from 'three';
import { MAX_PROJECTILES, WEAPON_VISUALS } from '../game/constants';
import type { GameState, WeaponType } from '../game/types';

const dummy = new THREE.Object3D();
const lookTarget = new THREE.Vector3();
const color = new THREE.Color();

/** Missile exhaust history. Sampled on a fixed interval so trail spacing is speed-accurate. */
const TRAIL_SLOTS = 220;
const TRAIL_SAMPLES = 16;
const TRAIL_INTERVAL = 0.035;

type Category = 'kinetic' | 'energy' | 'missile';

function categoryOf(type: WeaponType): Category {
  if (type === 'missile') return 'missile';
  if (type === 'plasma' || type === 'laser') return 'energy';
  return 'kinetic';
}

function makeInstanced(geometry: THREE.BufferGeometry, opacity: number, capacity: number): THREE.InstancedMesh {
  const material = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.count = 0;
  return mesh;
}

export interface ProjectileLayer {
  group: THREE.Group;
  update(state: GameState, alpha: number, dt: number): void;
  dispose(): void;
}

export function createProjectileLayer(): ProjectileLayer {
  const group = new THREE.Group();

  // Kinetic tracers: hard-edged boxes stretched along flight — reads as a visible bullet.
  const kineticGeometry = new THREE.BoxGeometry(1, 1, 1);
  const kinetic = makeInstanced(kineticGeometry, 1, 700);

  // Energy bolts: a tapered octahedron gives a pointed, glowing silhouette instead of a streak.
  const energyGeometry = new THREE.OctahedronGeometry(1, 0);
  const energy = makeInstanced(energyGeometry, 0.95, 500);

  // Missiles: a small cone body, nose forward.
  const missileGeometry = new THREE.ConeGeometry(0.5, 2, 6);
  missileGeometry.rotateX(Math.PI / 2);
  const missile = makeInstanced(missileGeometry, 1, 400);

  group.add(kinetic, energy, missile);

  const trailPositions = new Float32Array(TRAIL_SLOTS * (TRAIL_SAMPLES - 1) * 2 * 3);
  const trailColors = new Float32Array(TRAIL_SLOTS * (TRAIL_SAMPLES - 1) * 2 * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trails = new THREE.LineSegments(
    trailGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  trails.frustumCulled = false;
  trails.raycast = () => {};
  group.add(trails);

  /** Ring buffer of sampled positions per trail slot. */
  const history = new Float32Array(TRAIL_SLOTS * TRAIL_SAMPLES * 3);
  const historyCount = new Uint8Array(TRAIL_SLOTS);
  const historyHead = new Uint8Array(TRAIL_SLOTS);
  const slotOfPool = new Int16Array(MAX_PROJECTILES).fill(-1);
  const slotOwner = new Int16Array(TRAIL_SLOTS).fill(-1);
  const wasActive = new Uint8Array(MAX_PROJECTILES);

  let sampleTimer = 0;
  let trailCapWarned = false;

  function releaseSlot(poolIndex: number): void {
    const slot = slotOfPool[poolIndex];
    if (slot < 0) return;
    slotOfPool[poolIndex] = -1;
    slotOwner[slot] = -1;
    historyCount[slot] = 0;
    historyHead[slot] = 0;
  }

  function claimSlot(poolIndex: number): number {
    for (let s = 0; s < TRAIL_SLOTS; s++) {
      if (slotOwner[s] === -1) {
        slotOwner[s] = poolIndex;
        slotOfPool[poolIndex] = s;
        historyCount[s] = 0;
        historyHead[s] = 0;
        return s;
      }
    }
    if (!trailCapWarned) {
      trailCapWarned = true;
      console.warn(`[render] missile trail slots exhausted (${TRAIL_SLOTS}); extra missiles fly untrailed`);
    }
    return -1;
  }

  return {
    group,

    update(state: GameState, alpha: number, dt: number) {
      let kineticCount = 0;
      let energyCount = 0;
      let missileCount = 0;

      sampleTimer += dt;
      const sample = sampleTimer >= TRAIL_INTERVAL;
      if (sample) sampleTimer = 0;

      const pool = state.projectiles;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];

        if (!p.active) {
          if (wasActive[i]) {
            wasActive[i] = 0;
            releaseSlot(i);
          }
          continue;
        }
        // A pool slot flipping inactive -> active is a brand new shot; never inherit a trail.
        if (!wasActive[i]) {
          wasActive[i] = 1;
          releaseSlot(i);
        }

        const x = p.prevPosition[0] + (p.position[0] - p.prevPosition[0]) * alpha;
        const y = p.prevPosition[1] + (p.position[1] - p.prevPosition[1]) * alpha;
        const z = p.prevPosition[2] + (p.position[2] - p.prevPosition[2]) * alpha;

        const visual = WEAPON_VISUALS[p.weaponType];
        dummy.position.set(x, y, z);
        lookTarget.set(x + p.velocity[0], y + p.velocity[1], z + p.velocity[2]);
        dummy.lookAt(lookTarget);
        color.setHex(visual.color).multiplyScalar(visual.glow);

        switch (categoryOf(p.weaponType)) {
          case 'kinetic': {
            if (kineticCount >= kinetic.instanceMatrix.count) break;
            dummy.scale.set(visual.caliber, visual.caliber, visual.length);
            dummy.updateMatrix();
            kinetic.setMatrixAt(kineticCount, dummy.matrix);
            kinetic.setColorAt(kineticCount, color);
            kineticCount++;
            break;
          }
          case 'energy': {
            if (energyCount >= energy.instanceMatrix.count) break;
            dummy.scale.set(visual.caliber, visual.caliber, visual.length);
            dummy.updateMatrix();
            energy.setMatrixAt(energyCount, dummy.matrix);
            energy.setColorAt(energyCount, color);
            energyCount++;
            break;
          }
          case 'missile': {
            if (missileCount < missile.instanceMatrix.count) {
              dummy.scale.set(visual.caliber, visual.caliber, visual.length);
              dummy.updateMatrix();
              missile.setMatrixAt(missileCount, dummy.matrix);
              missile.setColorAt(missileCount, color);
              missileCount++;
            }
            if (sample) {
              let slot = slotOfPool[i];
              if (slot < 0) slot = claimSlot(i);
              if (slot >= 0) {
                const head = historyHead[slot];
                const o = (slot * TRAIL_SAMPLES + head) * 3;
                history[o] = x;
                history[o + 1] = y;
                history[o + 2] = z;
                historyHead[slot] = (head + 1) % TRAIL_SAMPLES;
                if (historyCount[slot] < TRAIL_SAMPLES) historyCount[slot]++;
              }
            }
            break;
          }
        }
      }

      kinetic.count = kineticCount;
      energy.count = energyCount;
      missile.count = missileCount;
      kinetic.instanceMatrix.needsUpdate = true;
      energy.instanceMatrix.needsUpdate = true;
      missile.instanceMatrix.needsUpdate = true;
      if (kinetic.instanceColor) kinetic.instanceColor.needsUpdate = true;
      if (energy.instanceColor) energy.instanceColor.needsUpdate = true;
      if (missile.instanceColor) missile.instanceColor.needsUpdate = true;

      let segment = 0;
      const maxSegments = TRAIL_SLOTS * (TRAIL_SAMPLES - 1);
      for (let slot = 0; slot < TRAIL_SLOTS; slot++) {
        const count = historyCount[slot];
        if (count < 2) continue;
        const head = historyHead[slot];
        const oldest = (head - count + TRAIL_SAMPLES) % TRAIL_SAMPLES;

        for (let k = 0; k < count - 1 && segment < maxSegments; k++) {
          const a = (slot * TRAIL_SAMPLES + ((oldest + k) % TRAIL_SAMPLES)) * 3;
          const b = (slot * TRAIL_SAMPLES + ((oldest + k + 1) % TRAIL_SAMPLES)) * 3;
          const o = segment * 6;
          trailPositions[o] = history[a];
          trailPositions[o + 1] = history[a + 1];
          trailPositions[o + 2] = history[a + 2];
          trailPositions[o + 3] = history[b];
          trailPositions[o + 4] = history[b + 1];
          trailPositions[o + 5] = history[b + 2];

          // Exhaust cools from the nozzle backwards. Kept dim and smoky so a trail never
          // gets mistaken for a kinetic tracer — only the missile head is meant to be hot.
          const nearFade = Math.pow((k + 1) / count, 2.1);
          const farFade = Math.pow(k / count, 2.1);
          trailColors[o] = 0.30 * farFade;
          trailColors[o + 1] = 0.17 * farFade;
          trailColors[o + 2] = 0.13 * farFade;
          trailColors[o + 3] = 0.34 * nearFade;
          trailColors[o + 4] = 0.20 * nearFade;
          trailColors[o + 5] = 0.15 * nearFade;
          segment++;
        }
      }
      for (let s = segment; s < maxSegments; s++) {
        const o = s * 6;
        for (let k = 0; k < 6; k++) {
          trailPositions[o + k] = 0;
          trailColors[o + k] = 0;
        }
      }
      trailGeometry.setDrawRange(0, maxSegments * 2);
      trailGeometry.attributes.position.needsUpdate = true;
      trailGeometry.attributes.color.needsUpdate = true;
    },

    dispose() {
      kineticGeometry.dispose();
      energyGeometry.dispose();
      missileGeometry.dispose();
      (kinetic.material as THREE.Material).dispose();
      (energy.material as THREE.Material).dispose();
      (missile.material as THREE.Material).dispose();
      kinetic.dispose();
      energy.dispose();
      missile.dispose();
      trailGeometry.dispose();
      (trails.material as THREE.Material).dispose();
    },
  };
}
