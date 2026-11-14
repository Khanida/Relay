import * as THREE from 'three';
import {
  BASE_COORD,
  CELL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  SURVIVOR_COORD,
  gridToWorld,
} from '../shared/disasterMap';
import type { CellType, GridCoord } from '../shared/types';
import {
  createConcreteFloorTexture,
  createHazardStripeTexture,
  createIndustrialWallTexture,
} from './textures';

export interface DisasterWorldHandles {
  group: THREE.Group;
  update: (elapsedSec: number, survivorFound: boolean) => void;
  setPlannedPath: (waypoints: GridCoord[]) => void;
  dispose: () => void;
}

export function buildDisasterWorld(
  groundTruthGrid: CellType[][],
  maxAnisotropy: number,
  isSoftwareGl: boolean
): DisasterWorldHandles {
  const group = new THREE.Group();
  group.name = 'OperationFirstLight_Facility';

  const disposables: Array<{ dispose: () => void }> = [];

  const floorTex = createConcreteFloorTexture(maxAnisotropy);
  const wallTex = createIndustrialWallTexture(maxAnisotropy);
  const hazardTex = createHazardStripeTexture('#f59e0b', '#14171c', maxAnisotropy);
  const redHazardTex = createHazardStripeTexture('#ef4444', '#16161a', maxAnisotropy);
  disposables.push(floorTex, wallTex, hazardTex, redHazardTex);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.88,
    metalness: 0.08,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    color: 0x5d6573,
    roughness: 0.84,
    metalness: 0.16,
  });
  const concreteRubbleMat = new THREE.MeshStandardMaterial({
    color: 0x4b515c,
    roughness: 0.92,
    metalness: 0.05,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x713f12,
    roughness: 0.5,
    metalness: 0.82,
  });
  const electricalMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.45,
    metalness: 0.35,
  });
  const unstableMat = new THREE.MeshStandardMaterial({
    map: redHazardTex,
    roughness: 0.72,
    metalness: 0.2,
  });
  disposables.push(floorMat, wallMat, concreteRubbleMat, steelMat, electricalMat, unstableMat);

  // Extended concrete terrain slab so scene never floats in empty void
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH * 2.8, MAP_HEIGHT * 2.8),
    new THREE.MeshStandardMaterial({ color: 0x111419, roughness: 0.95, metalness: 0.05 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.02;
  outerGround.receiveShadow = true;
  group.add(outerGround);

  // Facility floor
  const facilityFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH * CELL_SIZE, MAP_HEIGHT * CELL_SIZE),
    floorMat
  );
  facilityFloor.rotation.x = -Math.PI / 2;
  facilityFloor.receiveShadow = true;
  group.add(facilityFloor);

  // Subtle tactical grid overlay (polygonOffset prevents Z-fighting)
  const gridHelper = new THREE.GridHelper(
    Math.max(MAP_WIDTH, MAP_HEIGHT),
    Math.max(MAP_WIDTH, MAP_HEIGHT),
    0x2c3442,
    0x1d232c
  );
  gridHelper.position.y = 0.008;
  gridHelper.scale.set(MAP_WIDTH / Math.max(MAP_WIDTH, MAP_HEIGHT), 1, MAP_HEIGHT / Math.max(MAP_WIDTH, MAP_HEIGHT));
  (gridHelper.material as THREE.Material).transparent = true;
  (gridHelper.material as THREE.Material).opacity = 0.4;
  group.add(gridHelper);

  // Construct walls, rubble, collapsed beam, hazards, and broken staircase
  const wallGeom = new THREE.BoxGeometry(CELL_SIZE, 2.3, CELL_SIZE);
  const rebarGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6);
  const sparkLights: THREE.PointLight[] = [];
  const warningBeacons: THREE.Mesh[] = [];

  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const cell = groundTruthGrid[z][x];
      const w = gridToWorld({ x, z });

      if (cell === 'wall') {
        const isPerimeter = x === 0 || x === MAP_WIDTH - 1 || z === 0 || z === MAP_HEIGHT - 1;
        const h = isPerimeter ? 2.4 : 1.75 + ((x * 7 + z * 13) % 4) * 0.22;
        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.scale.y = h / 2.3;
        wallMesh.position.set(w.x, h / 2, w.z);
        wallMesh.castShadow = !isSoftwareGl;
        wallMesh.receiveShadow = true;
        group.add(wallMesh);

        // Exposed rebar on damaged interior walls
        if (!isPerimeter && (x + z) % 2 === 0) {
          const rebar = new THREE.Mesh(rebarGeom, steelMat);
          rebar.position.set(w.x + 0.12, h + 0.14, w.z - 0.1);
          rebar.rotation.z = 0.28;
          group.add(rebar);
        }
      } else if (cell === 'rubble') {
        const rubbleGroup = new THREE.Group();
        rubbleGroup.position.set(w.x, 0, w.z);
        for (let i = 0; i < 4; i++) {
          const sx = 0.35 + ((x + i * 3) % 3) * 0.14;
          const sy = 0.25 + ((z + i * 5) % 4) * 0.12;
          const sz = 0.35 + ((x + z + i) % 3) * 0.15;
          const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), concreteRubbleMat);
          chunk.scale.set(sx * 1.8, sy * 1.6, sz * 1.8);
          chunk.position.set(
            ((i % 2) - 0.5) * 0.35,
            sy * 0.42,
            (Math.floor(i / 2) - 0.5) * 0.35
          );
          chunk.rotation.set(i * 0.6, (x + i) * 0.8, z * 0.4);
          chunk.castShadow = !isSoftwareGl;
          chunk.receiveShadow = true;
          rubbleGroup.add(chunk);
        }
        group.add(rubbleGroup);
      } else if (cell === 'collapsed_passage') {
        // Dynamic collapsed concrete slab & fallen I-beam blocking the Eastern Corridor
        const barrier = new THREE.Group();
        barrier.position.set(w.x, 0, w.z);

        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 0.92), concreteRubbleMat);
        slab.position.set(0, 0.36, 0);
        slab.rotation.set(0.18, 0.12, -0.15);
        slab.castShadow = !isSoftwareGl;
        slab.receiveShadow = true;
        barrier.add(slab);

        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 1.15), steelMat);
        beam.position.set(0.1, 0.76, 0);
        beam.rotation.set(0.25, 0.3, 0.4);
        barrier.add(beam);
        group.add(barrier);
      } else if (cell === 'staircase') {
        // Broken industrial staircase steps
        const stairGroup = new THREE.Group();
        stairGroup.position.set(w.x, 0, w.z);
        for (let s = 0; s < 4; s++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.24), concreteRubbleMat);
          step.position.set(0, 0.11 + s * 0.2, -0.32 + s * 0.22);
          step.rotation.z = s === 3 ? 0.16 : 0;
          step.receiveShadow = true;
          stairGroup.add(step);
        }
        group.add(stairGroup);
      } else if (cell === 'electrical_hazard') {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.96), electricalMat);
        pad.position.set(w.x, 0.02, w.z);
        pad.receiveShadow = true;
        group.add(pad);

        if (x === 11 && z === 9) {
          // Damaged switchgear cabinet + arcing light
          const cabinet = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 1.35, 0.55),
            new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.7 })
          );
          cabinet.position.set(w.x, 0.675, w.z);
          cabinet.rotation.z = 0.14;
          group.add(cabinet);

          const sparkLight = new THREE.PointLight(0x38bdf8, 3.2, 6.5, 1.8);
          sparkLight.position.set(w.x, 1.1, w.z);
          group.add(sparkLight);
          sparkLights.push(sparkLight);
        }
      } else if (cell === 'unstable_zone') {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.96), unstableMat);
        pad.position.set(w.x, 0.02, w.z);
        pad.receiveShadow = true;
        group.add(pad);

        if (x === 16 && z === 15) {
          const tiltedSlab = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.22, 1.5),
            concreteRubbleMat
          );
          tiltedSlab.position.set(w.x, 1.55, w.z);
          tiltedSlab.rotation.set(0.32, 0.1, -0.25);
          group.add(tiltedSlab);

          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 10, 10),
            new THREE.MeshStandardMaterial({
              color: 0xef4444,
              emissive: 0xef4444,
              emissiveIntensity: 1.5,
            })
          );
          beacon.position.set(w.x - 0.6, 0.25, w.z - 0.6);
          group.add(beacon);
          warningBeacons.push(beacon);
        }
      }
    }
  }

  // Charging & Launch Station at BASE_COORD (2, 3)
  const baseWorld = gridToWorld(BASE_COORD);
  const baseStation = new THREE.Group();
  baseStation.position.set(baseWorld.x, 0, baseWorld.z);

  const dockPad = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.06, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.6 })
  );
  dockPad.position.y = 0.03;
  dockPad.receiveShadow = true;
  baseStation.add(dockPad);

  const chargeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 28),
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.3,
      side: THREE.DoubleSide,
    })
  );
  chargeRing.rotation.x = -Math.PI / 2;
  chargeRing.position.y = 0.065;
  baseStation.add(chargeRing);

  const gantryMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.5 });
  for (const gx of [-1.0, 1.0]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), gantryMat);
    post.position.set(gx, 0.9, -0.95);
    baseStation.add(post);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.14, 0.14), gantryMat);
  crossbar.position.set(0, 1.78, -0.95);
  baseStation.add(crossbar);

  const baseLight = new THREE.PointLight(0x10b981, 2.2, 6, 1.8);
  baseLight.position.set(0, 1.65, -0.6);
  baseStation.add(baseLight);
  group.add(baseStation);

  // Trapped Survivor at SURVIVOR_COORD (22, 5)
  const survWorld = gridToWorld(SURVIVOR_COORD);
  const survivorGroup = new THREE.Group();
  survivorGroup.position.set(survWorld.x, 0, survWorld.z);

  // Sheltered kneeling human silhouette in high-vis rescue jacket
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.65,
    metalness: 0.1,
  });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a684, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.32, 6, 10), vestMat);
  torso.position.set(0, 0.44, 0);
  torso.rotation.x = 0.25;
  torso.castShadow = !isSoftwareGl;
  survivorGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skinMat);
  head.position.set(0, 0.72, 0.08);
  survivorGroup.add(head);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 })
  );
  helmet.position.set(0, 0.73, 0.08);
  survivorGroup.add(helmet);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.35), suitMat);
  legs.position.set(0, 0.11, 0.05);
  survivorGroup.add(legs);

  // Leaning concrete shelter panel partially shielding survivor
  const shelterPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.3, 1.25),
    concreteRubbleMat
  );
  shelterPanel.position.set(0.42, 0.58, 0);
  shelterPanel.rotation.z = 0.38;
  survivorGroup.add(shelterPanel);

  // Rescue detection beacon ring (lights up green once discovered)
  const survivorRingMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const survivorRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.56, 24), survivorRingMat);
  survivorRing.rotation.x = -Math.PI / 2;
  survivorRing.position.y = 0.03;
  survivorGroup.add(survivorRing);

  const survivorLight = new THREE.PointLight(0xf59e0b, 1.6, 4.5, 1.8);
  survivorLight.position.set(0, 1.2, 0);
  survivorGroup.add(survivorLight);
  group.add(survivorGroup);

  // Emergency wall beacons along Eastern Corridor
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 1.8,
  });
  for (const bx of [6, 12, 19]) {
    const bw = gridToWorld({ x: bx, z: 1 });
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), beaconMat);
    fixture.position.set(bw.x, 1.9, bw.z + 0.55);
    group.add(fixture);
    warningBeacons.push(fixture);
  }

  // Atmospheric floating dust & smoke particles
  const particleCount = isSoftwareGl ? 140 : 320;
  const dustPositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * MAP_WIDTH;
    dustPositions[i * 3 + 1] = 0.2 + Math.random() * 2.8;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * MAP_HEIGHT;
  }
  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0x9ca3af,
    size: 0.075,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeom, dustMat);
  group.add(dustPoints);
  disposables.push(dustGeom, dustMat);

  // Planned A* route ribbon on floor (pre-allocated buffer to avoid per-frame GC)
  const MAX_PATH_POINTS = 256;
  const pathBuffer = new Float32Array(MAX_PATH_POINTS * 3);
  const pathAttr = new THREE.BufferAttribute(pathBuffer, 3);
  const pathGeom = new THREE.BufferGeometry();
  pathGeom.setAttribute('position', pathAttr);
  pathGeom.setDrawRange(0, 0);
  const pathMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const pathLine = new THREE.Line(pathGeom, pathMat);
  pathLine.visible = false;
  pathLine.frustumCulled = false;
  group.add(pathLine);
  disposables.push(pathGeom, pathMat);

  let lastPathSignature = '';

  const setPlannedPath = (waypoints: GridCoord[]) => {
    const count = Math.min(MAX_PATH_POINTS, waypoints.length);
    const sig = waypoints.map((wp) => `${wp.x},${wp.z}`).join(';');
    if (sig === lastPathSignature) return;
    lastPathSignature = sig;

    if (count < 2) {
      pathLine.visible = false;
      pathGeom.setDrawRange(0, 0);
      return;
    }

    for (let i = 0; i < count; i++) {
      const w = gridToWorld(waypoints[i]);
      pathBuffer[i * 3] = w.x;
      pathBuffer[i * 3 + 1] = 0.08;
      pathBuffer[i * 3 + 2] = w.z;
    }
    pathAttr.needsUpdate = true;
    pathGeom.setDrawRange(0, count);
    pathLine.visible = true;
  };

  const update = (elapsedSec: number, survivorFound: boolean) => {
    // Flickering electrical hazard sparks
    for (const l of sparkLights) {
      const flicker = Math.sin(elapsedSec * 23) * Math.cos(elapsedSec * 17);
      l.intensity = flicker > 0.2 ? 4.8 : 0.7;
    }

    // Subtle warning beacon pulse
    const pulse = 0.6 + Math.abs(Math.sin(elapsedSec * 2.4)) * 1.4;
    beaconMat.emissiveIntensity = pulse;

    // Survivor rescue status highlight
    if (survivorFound) {
      survivorRingMat.color.setHex(0x10b981);
      survivorRingMat.emissive.setHex(0x10b981);
      survivorRingMat.emissiveIntensity = 1.6;
      survivorLight.color.setHex(0x10b981);
      survivorLight.intensity = 2.6;
    } else {
      survivorRingMat.color.setHex(0xf59e0b);
      survivorRingMat.emissive.setHex(0xf59e0b);
      survivorRingMat.emissiveIntensity = 0.5 + Math.sin(elapsedSec * 3) * 0.25;
    }

    // Drift dust motes gently
    const posArr = dustGeom.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 1] += Math.sin(elapsedSec * 0.6 + i) * 0.0012;
      posArr[i * 3] += 0.0018;
      if (posArr[i * 3] > MAP_WIDTH / 2) posArr[i * 3] = -MAP_WIDTH / 2;
    }
    dustGeom.attributes.position.needsUpdate = true;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    wallGeom.dispose();
    rebarGeom.dispose();
  };

  return { group, update, setPlannedPath, dispose };
}
