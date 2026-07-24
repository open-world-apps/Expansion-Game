import * as THREE from 'three';
import { SYSTEM_RADIUS } from '../game/constants';
import { mulberry32 } from '../game/vec';

export function createStarfield(): THREE.Points {
  const rand = mulberry32(0x51a5);
  const count = 3600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radius = 5200;

  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;

    const warm = rand();
    const brightness = 0.25 + Math.pow(rand(), 3) * 0.9;
    colors[i * 3] = brightness * (0.75 + warm * 0.25);
    colors[i * 3 + 1] = brightness * 0.85;
    colors[i * 3 + 2] = brightness * (1.0 - warm * 0.15);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
    transparent: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

/** Faint polar grid on the ecliptic — gives the eye a reference plane for depth. */
export function createReferenceGrid(): THREE.Object3D {
  const grid = new THREE.PolarGridHelper(SYSTEM_RADIUS + 60, 12, 6, 96, 0x1d3550, 0x152438);
  const material = grid.material as THREE.Material;
  material.transparent = true;
  material.opacity = 0.5;
  material.depthWrite = false;
  grid.renderOrder = -1;
  return grid;
}

export function createLighting(): THREE.Object3D[] {
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.position.set(600, 380, 240);

  const fill = new THREE.DirectionalLight(0x4d6fa8, 0.7);
  fill.position.set(-500, -180, -420);

  const ambient = new THREE.AmbientLight(0x1b2740, 1.1);

  return [key, fill, ambient];
}
