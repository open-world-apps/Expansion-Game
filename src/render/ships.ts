import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HULL_SIZE } from '../game/constants';
import type { Fleet, GameState } from '../game/types';

const dummy = new THREE.Object3D();
const lookTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

interface FleetVisual {
  fleetId: string;
  pick: THREE.Mesh;
  selectionRing: THREE.Mesh;
  priorityRing: THREE.Mesh;
  label: CSS2DObject;
  labelEl: HTMLDivElement;
  shipStart: number;
  shipCount: number;
}

export interface ShipLayer {
  group: THREE.Group;
  pickTargets: THREE.Object3D[];
  fleetIdForObject(object: THREE.Object3D): string | undefined;
  capturePrevious(state: GameState): void;
  update(state: GameState, alpha: number, elapsed: number): void;
  dispose(): void;
}

export function createShipLayer(state: GameState): ShipLayer {
  const group = new THREE.Group();
  const fleets = Object.values(state.fleets);

  let totalShips = 0;
  for (const fleet of fleets) totalShips += fleet.ships.length;

  const hullGeometry = new THREE.ConeGeometry(0.62, 2.4, 4);
  hullGeometry.rotateX(Math.PI / 2);
  const hullMaterial = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.55 });
  const hulls = new THREE.InstancedMesh(hullGeometry, hullMaterial, totalShips);
  hulls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hulls.frustumCulled = false;
  hulls.raycast = () => {};
  group.add(hulls);

  const glowGeometry = new THREE.SphereGeometry(0.42, 8, 6);
  const glowMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
  });
  const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, totalShips);
  glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glows.frustumCulled = false;
  glows.raycast = () => {};
  group.add(glows);

  const pickGeometry = new THREE.SphereGeometry(1, 12, 8);
  const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const ringGeometry = new THREE.RingGeometry(0.92, 1, 64);
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0x9dffd0,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const priorityMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const lineCapacity = fleets.length * 2;
  const linePositions = new Float32Array(lineCapacity * 2 * 3);
  const lineColors = new Float32Array(lineCapacity * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  lines.frustumCulled = false;
  group.add(lines);

  const visuals: FleetVisual[] = [];
  const byObject = new Map<THREE.Object3D, string>();
  const prevPositions = new Float32Array(totalShips * 3);
  const colorScratch = new THREE.Color();

  let cursor = 0;
  for (const fleet of fleets) {
    const factionColor = state.factions[fleet.factionId].color;
    colorScratch.set(factionColor);

    for (let i = 0; i < fleet.ships.length; i++) {
      hulls.setColorAt(cursor + i, colorScratch);
      glows.setColorAt(cursor + i, colorScratch);
      const p = fleet.ships[i].position;
      prevPositions[(cursor + i) * 3] = p[0];
      prevPositions[(cursor + i) * 3 + 1] = p[1];
      prevPositions[(cursor + i) * 3 + 2] = p[2];
    }

    const pickRadius = 26 + fleet.ships.length * 3.2;
    const pick = new THREE.Mesh(pickGeometry, pickMaterial);
    pick.scale.setScalar(pickRadius);
    pick.renderOrder = -2;
    group.add(pick);
    byObject.set(pick, fleet.id);

    const selectionRing = new THREE.Mesh(ringGeometry, selectionMaterial);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.visible = false;
    group.add(selectionRing);

    const priorityRing = new THREE.Mesh(ringGeometry, priorityMaterial);
    priorityRing.rotation.x = -Math.PI / 2;
    priorityRing.visible = false;
    group.add(priorityRing);

    const labelEl = document.createElement('div');
    labelEl.className = 'fleet-label';
    labelEl.style.setProperty('--faction', factionColor);
    const label = new CSS2DObject(labelEl);
    group.add(label);

    visuals.push({
      fleetId: fleet.id,
      pick,
      selectionRing,
      priorityRing,
      label,
      labelEl,
      shipStart: cursor,
      shipCount: fleet.ships.length,
    });
    cursor += fleet.ships.length;
  }

  if (hulls.instanceColor) hulls.instanceColor.needsUpdate = true;
  if (glows.instanceColor) glows.instanceColor.needsUpdate = true;

  let labelTimer = 0;

  function writeLine(index: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: THREE.Color): void {
    const o = index * 6;
    linePositions[o] = ax;
    linePositions[o + 1] = ay;
    linePositions[o + 2] = az;
    linePositions[o + 3] = bx;
    linePositions[o + 4] = by;
    linePositions[o + 5] = bz;
    lineColors[o] = color.r;
    lineColors[o + 1] = color.g;
    lineColors[o + 2] = color.b;
    lineColors[o + 3] = color.r;
    lineColors[o + 4] = color.g;
    lineColors[o + 5] = color.b;
  }

  return {
    group,
    pickTargets: visuals.map((v) => v.pick),

    fleetIdForObject(object: THREE.Object3D) {
      return byObject.get(object);
    },

    capturePrevious(gameState: GameState) {
      for (const visual of visuals) {
        const fleet = gameState.fleets[visual.fleetId];
        for (let i = 0; i < visual.shipCount; i++) {
          const p = fleet.ships[i].position;
          const o = (visual.shipStart + i) * 3;
          prevPositions[o] = p[0];
          prevPositions[o + 1] = p[1];
          prevPositions[o + 2] = p[2];
        }
      }
    },

    update(gameState: GameState, alpha: number, elapsed: number) {
      let lineIndex = 0;
      labelTimer += 1;
      const refreshLabels = labelTimer % 8 === 0;

      for (const visual of visuals) {
        const fleet: Fleet = gameState.fleets[visual.fleetId];
        const factionColor = gameState.factions[fleet.factionId].color;
        const selected = gameState.selectedFleetIds.includes(fleet.id);

        let cx = 0;
        let cy = 0;
        let cz = 0;
        let alive = 0;

        for (let i = 0; i < visual.shipCount; i++) {
          const index = visual.shipStart + i;
          const ship = fleet.ships[i];
          const o = index * 3;

          if (fleet.destroyed || ship.health <= 0) {
            dummy.position.set(0, -99999, 0);
            dummy.scale.setScalar(0.0001);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            hulls.setMatrixAt(index, dummy.matrix);
            glows.setMatrixAt(index, dummy.matrix);
            continue;
          }

          const px = prevPositions[o] + (ship.position[0] - prevPositions[o]) * alpha;
          const py = prevPositions[o + 1] + (ship.position[1] - prevPositions[o + 1]) * alpha;
          const pz = prevPositions[o + 2] + (ship.position[2] - prevPositions[o + 2]) * alpha;

          const size = HULL_SIZE[gameState.shipClasses[ship.classId].hull];
          dummy.position.set(px, py, pz);
          lookTarget.set(px + fleet.heading[0], py + fleet.heading[1], pz + fleet.heading[2]);
          dummy.lookAt(lookTarget);
          dummy.scale.set(size, size, size * 1.35);
          dummy.updateMatrix();
          hulls.setMatrixAt(index, dummy.matrix);

          const thrust = 0.55 + 0.45 * Math.sin(elapsed * 11 + index);
          dummy.position.set(
            px - fleet.heading[0] * size * 1.7,
            py - fleet.heading[1] * size * 1.7,
            pz - fleet.heading[2] * size * 1.7,
          );
          dummy.scale.setScalar(size * (0.55 + thrust * 0.35));
          dummy.updateMatrix();
          glows.setMatrixAt(index, dummy.matrix);

          cx += px;
          cy += py;
          cz += pz;
          alive++;
        }

        const visible = !fleet.destroyed && alive > 0;
        if (visible) {
          cx /= alive;
          cy /= alive;
          cz /= alive;
        }

        visual.pick.visible = visible;
        visual.label.visible = visible;
        visual.selectionRing.visible = visible && selected;
        visual.priorityRing.visible = false;

        if (!visible) continue;

        visual.pick.position.set(cx, cy, cz);
        visual.label.position.set(cx, cy + 22, cz);

        const ringRadius = 28 + alive * 3.4;
        visual.selectionRing.position.set(cx, 0.2, cz);
        visual.selectionRing.scale.setScalar(ringRadius * (1 + Math.sin(elapsed * 3) * 0.02));

        writeLine(lineIndex++, cx, cy, cz, cx, 0, cz, colorScratch.set(factionColor).multiplyScalar(0.55));

        if (selected) {
          const order = fleet.order;
          let tx = cx;
          let ty = cy;
          let tz = cz;
          if (order.type === 'move' && order.targetPosition) {
            [tx, ty, tz] = order.targetPosition;
          } else if (order.type === 'attack' && order.targetFleetId) {
            const target = gameState.fleets[order.targetFleetId];
            if (target && !target.destroyed) [tx, ty, tz] = target.position;
          }
          if (tx !== cx || tz !== cz) {
            writeLine(lineIndex++, cx, cy, cz, tx, ty, tz, colorScratch.set(0x8fffc8).multiplyScalar(0.5));
          }
        }

        if (refreshLabels) {
          const roeMark = fleet.roe === 'fire-at-will' ? '◆' : '◇';
          visual.labelEl.textContent = `${fleet.name} ${roeMark} ${alive}`;
          visual.labelEl.classList.toggle('is-selected', selected);
        }
      }

      // Priority-target rings sit on the fleets being targeted by the player's selection.
      for (const id of gameState.selectedFleetIds) {
        const fleet = gameState.fleets[id];
        if (!fleet || !fleet.priorityTargetFleetId) continue;
        const marked = visuals.find((v) => v.fleetId === fleet.priorityTargetFleetId);
        const targetFleet = gameState.fleets[fleet.priorityTargetFleetId];
        if (!marked || !targetFleet || targetFleet.destroyed) continue;
        marked.pick.getWorldPosition(tmpPos);
        marked.priorityRing.visible = true;
        marked.priorityRing.position.set(tmpPos.x, 0.4, tmpPos.z);
        marked.priorityRing.scale.setScalar(38 + Math.sin(elapsed * 5) * 3);
      }

      for (let i = lineIndex; i < lineCapacity; i++) writeLine(i, 0, 0, 0, 0, 0, 0, colorScratch.setScalar(0));

      hulls.instanceMatrix.needsUpdate = true;
      glows.instanceMatrix.needsUpdate = true;
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;
    },

    dispose() {
      for (const visual of visuals) {
        visual.label.removeFromParent();
        visual.labelEl.remove();
      }
      hullGeometry.dispose();
      hullMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
      ringGeometry.dispose();
      selectionMaterial.dispose();
      priorityMaterial.dispose();
      lineGeometry.dispose();
      (lines.material as THREE.Material).dispose();
      hulls.dispose();
      glows.dispose();
    },
  };
}
