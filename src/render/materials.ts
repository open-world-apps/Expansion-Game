import * as THREE from 'three';

const SOFT_POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SOFT_POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float falloff = pow(1.0 - d * 2.0, 2.2);
    gl_FragColor = vec4(vColor * falloff, 1.0);
  }
`;

/**
 * Additive soft-edged points. Used for explosions, debris, muzzle flashes and nebula gas —
 * no texture needed, the falloff is computed per fragment.
 */
export function makeSoftPointsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: SOFT_POINT_VERTEX,
    fragmentShader: SOFT_POINT_FRAGMENT,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}

/** Point size uniform must track viewport height and FOV or particles change size on resize. */
export function updatePointScale(material: THREE.ShaderMaterial, camera: THREE.PerspectiveCamera, height: number): void {
  material.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const m of material) disposeMaterial(m);
    } else {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  material.dispose();
}
