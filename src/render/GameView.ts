import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MAX_TICKS_PER_FRAME, TICK_DT } from '../game/constants';
import { issueAttackOrder, issueMoveOrder, setPriorityTarget, stepSimulation } from '../game/sim';
import { store, areHostile } from '../game/state';
import type { Vec3 } from '../game/types';
import { createBodyLayer, type BodyLayer } from './bodies';
import { createFxLayer, type FxLayer } from './fx';
import { disposeObject, updatePointScale } from './materials';
import { createProjectileLayer, type ProjectileLayer } from './projectiles';
import { createReferenceGrid, createLighting, createStarfield } from './scene';
import { createShipLayer, type ShipLayer } from './ships';

const DRAG_THRESHOLD = 6;
const PUBLISH_INTERVAL = 0.1;
const KEY_PAN_SPEED = 420;

const ndc = new THREE.Vector2();
const projected = new THREE.Vector3();
const panDelta = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

export class GameView {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();

  private bodyLayer: BodyLayer;
  private shipLayer: ShipLayer;
  private projectileLayer: ProjectileLayer;
  private fxLayer: FxLayer;

  private selectionBox: HTMLDivElement;
  private pressStart = { x: 0, y: 0, button: -1, active: false, dragging: false };
  private keys = new Set<string>();
  private accumulator = 0;
  private elapsed = 0;
  private publishTimer = 0;
  private frameHandle = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    const state = store.state;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x03060d, 1);
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'selection-box';
    container.appendChild(this.selectionBox);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 1, 14000);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 1700;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.42;
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };

    for (const light of createLighting()) this.scene.add(light);
    this.scene.add(createStarfield());
    this.scene.add(createReferenceGrid());

    this.bodyLayer = createBodyLayer(state);
    this.shipLayer = createShipLayer(state);
    this.projectileLayer = createProjectileLayer();
    this.fxLayer = createFxLayer();
    this.scene.add(this.bodyLayer.group, this.shipLayer.group, this.projectileLayer.group, this.fxLayer.points);

    const home = state.bodies[state.factions[state.playerFactionId].homeBodyId];
    const anchor = home ? home.position : [0, 0, 0];
    this.controls.target.set(anchor[0] * 0.55, 0, anchor[2] * 0.55);
    this.camera.position.set(anchor[0] * 0.7, 430, anchor[2] * 0.7 + 520);
    this.controls.update();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.bindEvents();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    this.pressStart = { x: event.clientX, y: event.clientY, button: event.button, active: true, dragging: false };
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pressStart.active) return;
    const dx = event.clientX - this.pressStart.x;
    const dy = event.clientY - this.pressStart.y;
    if (!this.pressStart.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) this.pressStart.dragging = true;
    if (!this.pressStart.dragging || this.pressStart.button !== 0) return;

    const rect = this.container.getBoundingClientRect();
    const left = Math.min(event.clientX, this.pressStart.x) - rect.left;
    const top = Math.min(event.clientY, this.pressStart.y) - rect.top;
    this.selectionBox.style.display = 'block';
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${Math.abs(dx)}px`;
    this.selectionBox.style.height = `${Math.abs(dy)}px`;
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pressStart.active || event.button !== this.pressStart.button) return;
    const { button, dragging } = this.pressStart;
    this.pressStart.active = false;
    this.selectionBox.style.display = 'none';

    if (button === 0) {
      if (dragging) this.boxSelect(this.pressStart.x, this.pressStart.y, event.clientX, event.clientY);
      else this.clickSelect(event);
    } else if (button === 2 && !dragging) {
      this.issueOrderAt(event);
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement) return;
    this.keys.add(event.code);
    if (event.code === 'Space') {
      event.preventDefault();
      store.state.speed = store.state.speed === 0 ? 1 : 0;
      store.publish();
    }
    if (event.code === 'KeyF') this.focusSelection();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return ndc;
  }

  private pickFleet(clientX: number, clientY: number): string | undefined {
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera);
    const hits = this.raycaster.intersectObjects(this.shipLayer.pickTargets, false);
    for (const hit of hits) {
      const id = this.shipLayer.fleetIdForObject(hit.object);
      if (id && !store.state.fleets[id].destroyed) return id;
    }
    return undefined;
  }

  private clickSelect(event: PointerEvent): void {
    const state = store.state;
    const fleetId = this.pickFleet(event.clientX, event.clientY);
    const additive = event.shiftKey;

    if (!fleetId) {
      if (!additive) state.selectedFleetIds = [];
    } else if (state.fleets[fleetId].factionId === state.playerFactionId) {
      if (additive) {
        state.selectedFleetIds = state.selectedFleetIds.includes(fleetId)
          ? state.selectedFleetIds.filter((id) => id !== fleetId)
          : [...state.selectedFleetIds, fleetId];
      } else {
        state.selectedFleetIds = [fleetId];
      }
    }
    store.publish();
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number): void {
    const state = store.state;
    const a = this.toNdc(x0, y0).clone();
    const b = this.toNdc(x1, y1).clone();
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    const picked: string[] = [];
    for (const fleet of Object.values(state.fleets)) {
      if (fleet.destroyed || fleet.factionId !== state.playerFactionId) continue;
      projected.set(fleet.position[0], fleet.position[1], fleet.position[2]).project(this.camera);
      if (projected.z > 1) continue;
      if (projected.x >= minX && projected.x <= maxX && projected.y >= minY && projected.y <= maxY) {
        picked.push(fleet.id);
      }
    }
    state.selectedFleetIds = picked;
    store.publish();
  }

  private issueOrderAt(event: PointerEvent): void {
    const state = store.state;
    if (!state.selectedFleetIds.length) return;

    const fleetId = this.pickFleet(event.clientX, event.clientY);
    if (fleetId && areHostile(state, state.playerFactionId, state.fleets[fleetId].factionId)) {
      if (event.ctrlKey || event.metaKey) setPriorityTarget(state, state.selectedFleetIds, fleetId);
      else issueAttackOrder(state, state.selectedFleetIds, fleetId);
      store.publish();
      return;
    }

    this.raycaster.setFromCamera(this.toNdc(event.clientX, event.clientY), this.camera);
    if (!this.raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
    const target: Vec3 = [hitPoint.x, 0, hitPoint.z];
    issueMoveOrder(state, state.selectedFleetIds, target);
    store.publish();
  }

  focusSelection(): void {
    const state = store.state;
    const ids = state.selectedFleetIds.filter((id) => !state.fleets[id].destroyed);
    if (!ids.length) return;
    let x = 0;
    let z = 0;
    for (const id of ids) {
      x += state.fleets[id].position[0];
      z += state.fleets[id].position[2];
    }
    x /= ids.length;
    z /= ids.length;
    panDelta.set(x - this.controls.target.x, 0, z - this.controls.target.z);
    this.controls.target.add(panDelta);
    this.camera.position.add(panDelta);
  }

  private applyKeyboardPan(dt: number): void {
    let px = 0;
    let pz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) px -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) px += 1;
    if (!px && !pz) return;

    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(forward.z, 0, -forward.x);

    const scale = KEY_PAN_SPEED * dt * (this.camera.position.distanceTo(this.controls.target) / 600);
    panDelta.set(0, 0, 0).addScaledVector(forward, -pz * scale).addScaledVector(right, -px * scale);
    this.controls.target.add(panDelta);
    this.camera.position.add(panDelta);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    updatePointScale(this.fxLayer.material, this.camera, height);
    for (const material of this.bodyLayer.pointMaterials) updatePointScale(material, this.camera, height);
  }

  private frame = (): void => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.frame);

    const state = store.state;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;

    // Game speed scales the accumulator; the simulation always advances by a fixed TICK_DT.
    this.accumulator += dt * state.speed;
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < MAX_TICKS_PER_FRAME) {
      this.shipLayer.capturePrevious(state);
      stepSimulation(state, TICK_DT);
      this.accumulator -= TICK_DT;
      steps++;
    }
    if (steps === MAX_TICKS_PER_FRAME) this.accumulator = 0;

    const alpha = Math.min(1, this.accumulator / TICK_DT);

    this.applyKeyboardPan(dt);
    this.controls.update();

    this.fxLayer.consume(state);
    this.fxLayer.update(dt);
    this.bodyLayer.update(this.elapsed);
    this.shipLayer.update(state, alpha, this.elapsed);
    this.projectileLayer.update(state, alpha, dt);

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);

    this.publishTimer += dt;
    if (this.publishTimer >= PUBLISH_INTERVAL) {
      this.publishTimer = 0;
      const before = state.selectedFleetIds.length;
      state.selectedFleetIds = state.selectedFleetIds.filter((id) => !state.fleets[id].destroyed);
      if (state.selectedFleetIds.length !== before) this.controls.update();
      store.publish();
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.unbindEvents();
    this.resizeObserver.disconnect();

    this.controls.dispose();
    this.shipLayer.dispose();
    this.projectileLayer.dispose();
    this.fxLayer.dispose();
    disposeObject(this.scene);
    this.scene.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
    this.selectionBox.remove();
  }
}
