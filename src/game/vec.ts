import type { Vec3 } from './types';

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const copy = (out: Vec3, a: Vec3): Vec3 => {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
};
export const set = (out: Vec3, x: number, y: number, z: number): Vec3 => {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
};
export const clone = (a: Vec3): Vec3 => [a[0], a[1], a[2]];

export const addScaled = (out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 =>
  set(out, a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s);

export const sub = (out: Vec3, a: Vec3, b: Vec3): Vec3 =>
  set(out, a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const scale = (out: Vec3, a: Vec3, s: number): Vec3 => set(out, a[0] * s, a[1] * s, a[2] * s);

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const lengthOf = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const distanceSq = (a: Vec3, b: Vec3): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

export const normalize = (out: Vec3, a: Vec3): Vec3 => {
  const len = lengthOf(a);
  return len > 1e-6 ? scale(out, a, 1 / len) : set(out, 0, 0, 0);
};

/** Squared distance from point p to segment ab. Used for projectile-vs-hull sweep tests. */
export function distanceSqToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-9) return apx * apx + apy * apy + apz * apz;
  let t = (apx * abx + apy * aby + apz * abz) / abLenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

/** Deterministic PRNG so a given seed always produces the same opening position. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
