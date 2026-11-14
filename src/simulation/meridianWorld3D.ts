import * as THREE from 'three';
import {
  CELL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  gridToWorld,
} from '../shared/disasterMap';
import type { RegionWorldMap } from '../shared/meridianWorldMaps';
import type { GridCoord, TimeOfDay, WeatherType } from '../shared/types';
import {
  createConcreteFloorTexture,
  createHazardStripeTexture,
  createIndustrialWallTexture,
} from './textures';

export interface MeridianWorldHandles {
  group: THREE.Group;
  update: (
    elapsedSec: number,
    survivorFound: boolean,
    relayRestored: boolean,
    medicalDelivered: boolean,
    weather: WeatherType,
    weatherEnabled: boolean,
    timeOfDay: TimeOfDay
  ) => void;
  setPlannedPath: (slotIndex: number, waypoints: GridCoord[]) => void;
  setParticleDensity: (density: number) => void;
  dispose: () => void;
}

const REGION_PALETTES = {
  industrial_district: { ground: 0x111419, wall: 0x5d6573, floor: 0x2a303a, sky: 0x0b0d10 },
  meridian_city: { ground: 0x0d121a, wall: 0x475569, floor: 0x1e2530, sky: 0x0a111d },
  old_quarter: { ground: 0x15181c, wall: 0x78695a, floor: 0x3a342e, sky: 0x12151c },
  port_meridian: { ground: 0x0d151b, wall: 0x334155, floor: 0x242c37, sky: 0x0e1820 },
  highland_province: { ground: 0x172018, wall: 0x525d56, floor: 0x2c332d, sky: 0x141d1c },
  desert_corridor: { ground: 0x261d14, wall: 0x856649, floor: 0x4b3a28, sky: 0x211810 },
  research_valley: { ground: 0x0c1018, wall: 0x3b485b, floor: 0x1b222d, sky: 0x070b12 },
} as const;

export function buildMeridianWorld3D(
  map: RegionWorldMap,
  scene: THREE.Scene,
  lights: {
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
  },
  maxAnisotropy: number,
  isSoftwareGl: boolean
): MeridianWorldHandles {
  const group = new THREE.Group();
  group.name = `Meridian_${map.regionId}`;
  const disposables: Array<{ dispose: () => void }> = [];

  const palette = REGION_PALETTES[map.regionId] ?? REGION_PALETTES.industrial_district;
  const floorTex = createConcreteFloorTexture(maxAnisotropy);
  const wallTex = createIndustrialWallTexture(maxAnisotropy);
  const hazardTex = createHazardStripeTexture('#f59e0b', '#14171c', maxAnisotropy);
  const redHazardTex = createHazardStripeTexture('#ef4444', '#16161a', maxAnisotropy);
  const chemTex = createHazardStripeTexture('#84cc16', '#141c12', maxAnisotropy);
  disposables.push(floorTex, wallTex, hazardTex, redHazardTex, chemTex);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: palette.floor,
    roughness: 0.86,
    metalness: 0.1,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.78,
    metalness: 0.08,
  });
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x57534e,
    roughness: 0.7,
    metalness: 0.25,
  });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0369a1,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.32,
    roughness: 0.14,
    metalness: 0.55,
    transparent: true,
    opacity: 0.84,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    color: palette.wall,
    roughness: 0.82,
    metalness: 0.18,
  });
  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0x4b4640,
    roughness: 0.94,
    metalness: 0.04,
  });
  const rubbleMat = new THREE.MeshStandardMaterial({
    color: 0x4b515c,
    roughness: 0.92,
    metalness: 0.05,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x713f12,
    roughness: 0.5,
    metalness: 0.82,
  });
  const electricalMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.45 });
  const unstableMat = new THREE.MeshStandardMaterial({ map: redHazardTex, roughness: 0.7 });
  const chemMat = new THREE.MeshStandardMaterial({ map: chemTex, roughness: 0.4, metalness: 0.2 });

  disposables.push(
    floorMat,
    roadMat,
    bridgeMat,
    waterMat,
    wallMat,
    cliffMat,
    rubbleMat,
    steelMat,
    electricalMat,
    unstableMat,
    chemMat
  );

  // Extended world horizon slab
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH * 3.8, MAP_HEIGHT * 3.8),
    new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 0.95, metalness: 0.04 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.025;
  outerGround.receiveShadow = true;
  group.add(outerGround);

  // Sector base floor
  const sectorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH * CELL_SIZE, MAP_HEIGHT * CELL_SIZE),
    floorMat
  );
  sectorFloor.rotation.x = -Math.PI / 2;
  sectorFloor.receiveShadow = true;
  group.add(sectorFloor);

  // Tactical Grid Overlay
  const gridHelper = new THREE.GridHelper(
    Math.max(MAP_WIDTH, MAP_HEIGHT),
    Math.max(MAP_WIDTH, MAP_HEIGHT),
    0x2c3442,
    0x1d232c
  );
  gridHelper.position.y = 0.008;
  gridHelper.scale.set(
    MAP_WIDTH / Math.max(MAP_WIDTH, MAP_HEIGHT),
    1,
    MAP_HEIGHT / Math.max(MAP_WIDTH, MAP_HEIGHT)
  );
  (gridHelper.material as THREE.Material).transparent = true;
  (gridHelper.material as THREE.Material).opacity = 0.34;
  group.add(gridHelper);

  const wallGeom = new THREE.BoxGeometry(CELL_SIZE, 2.3, CELL_SIZE);
  const sparkLights: THREE.PointLight[] = [];
  const beaconMeshes: THREE.Mesh[] = [];
  const emergencyStrobes: THREE.PointLight[] = [];

  type MatrixEntry = { matrix: THREE.Matrix4; color?: number };
  const wallInstances: MatrixEntry[] = [];
  const windowInstances: THREE.Matrix4[] = [];
  const cliffInstances: THREE.Matrix4[] = [];
  const roadInstances: THREE.Matrix4[] = [];
  const stripeInstances: THREE.Matrix4[] = [];
  const bridgeInstances: THREE.Matrix4[] = [];
  const waterInstances: THREE.Matrix4[] = [];
  const interiorInstances: THREE.Matrix4[] = [];
  const rubbleInstances: THREE.Matrix4[] = [];
  const collapseSlabInstances: THREE.Matrix4[] = [];
  const collapseBeamInstances: THREE.Matrix4[] = [];
  const elecInstances: THREE.Matrix4[] = [];
  const unstableInstances: THREE.Matrix4[] = [];
  const chemInstances: THREE.Matrix4[] = [];

  const dummy = new THREE.Object3D();
  const containerColors = [0xb91c1c, 0x0369a1, 0xd97706, 0x0f766e];

  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const cell = map.groundTruthGrid[z][x];
      const w = gridToWorld({ x, z });

      if (cell === 'wall') {
        const isPerimeter = x === 0 || x === MAP_WIDTH - 1 || z === 0 || z === MAP_HEIGHT - 1;
        let h = isPerimeter ? 2.4 : 1.8 + ((x * 7 + z * 13) % 4) * 0.35;
        if (!isPerimeter && map.regionId === 'meridian_city') h = 3.2 + ((x + z) % 3) * 0.9;
        if (!isPerimeter && map.regionId === 'port_meridian') h = 2.1;

        dummy.position.set(w.x, h / 2, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, h / 2.3, 1);
        dummy.updateMatrix();
        wallInstances.push({
          matrix: dummy.matrix.clone(),
          color:
            !isPerimeter && map.regionId === 'port_meridian'
              ? containerColors[(x + z) % containerColors.length]
              : undefined,
        });

        if (
          !isPerimeter &&
          (map.regionId === 'meridian_city' || map.regionId === 'research_valley') &&
          (x + z) % 2 === 0
        ) {
          dummy.position.set(w.x, h * 0.65, w.z + 0.51);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          windowInstances.push(dummy.matrix.clone());
        }
      } else if (cell === 'mountain_cliff') {
        const coneScaleY = (2.8 + ((x * 5 + z) % 3) * 0.7) / 2.8;
        dummy.position.set(w.x, 1.35 * coneScaleY, w.z);
        dummy.rotation.set(0, (x + z) * 0.7, 0);
        dummy.scale.set(1, coneScaleY, 1);
        dummy.updateMatrix();
        cliffInstances.push(dummy.matrix.clone());
      } else if (cell === 'road') {
        dummy.position.set(w.x, 0.015, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        roadInstances.push(dummy.matrix.clone());
        if (x % 2 === 0) {
          dummy.position.set(w.x, 0.032, w.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          stripeInstances.push(dummy.matrix.clone());
        }
      } else if (cell === 'bridge') {
        dummy.position.set(w.x, 0.08, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bridgeInstances.push(dummy.matrix.clone());
      } else if (cell === 'flood_water') {
        dummy.position.set(w.x, 0.06, w.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        waterInstances.push(dummy.matrix.clone());
      } else if (cell === 'building_interior') {
        dummy.position.set(w.x, 0.02, w.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        interiorInstances.push(dummy.matrix.clone());
      } else if (cell === 'rubble') {
        for (let i = 0; i < 3; i++) {
          dummy.position.set(w.x + ((i % 2) - 0.5) * 0.35, 0.18, w.z + (i - 1) * 0.22);
          dummy.rotation.set(i * 0.7, x + i, z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          rubbleInstances.push(dummy.matrix.clone());
        }
      } else if (cell === 'collapsed_passage') {
        dummy.position.set(w.x, 0.37, w.z);
        dummy.rotation.set(0.16, 0.12, -0.14);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        collapseSlabInstances.push(dummy.matrix.clone());

        dummy.position.set(w.x + 0.1, 0.76, w.z);
        dummy.rotation.set(0.25, 0.3, 0.4);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        collapseBeamInstances.push(dummy.matrix.clone());
      } else if (cell === 'staircase') {
        for (let s = 0; s < 4; s++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.24), rubbleMat);
          step.position.set(w.x, 0.11 + s * 0.2, w.z - 0.32 + s * 0.22);
          group.add(step);
        }
      } else if (cell === 'electrical_hazard') {
        dummy.position.set(w.x, 0.02, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        elecInstances.push(dummy.matrix.clone());
        if (sparkLights.length < 2 && (x + z) % 3 === 0) {
          const spark = new THREE.PointLight(0x38bdf8, 3.0, 6.5, 1.8);
          spark.position.set(w.x, 0.9, w.z);
          group.add(spark);
          sparkLights.push(spark);
        }
      } else if (cell === 'unstable_zone') {
        dummy.position.set(w.x, 0.02, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        unstableInstances.push(dummy.matrix.clone());
      } else if (cell === 'chemical_hazard') {
        dummy.position.set(w.x, 0.025, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        chemInstances.push(dummy.matrix.clone());
        if (x === map.chemicalHazardCells[0]?.x && z === map.chemicalHazardCells[0]?.z) {
          const drum = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.26, 0.65, 10),
            new THREE.MeshStandardMaterial({ color: 0x84cc16, emissive: 0x3f6212, emissiveIntensity: 0.6 })
          );
          drum.position.set(w.x, 0.35, w.z);
          drum.rotation.z = 1.1;
          group.add(drum);
        }
      }
    }
  }

  const addBatch = (
    geom: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[],
    castShadow = false,
    receiveShadow = false
  ) => {
    if (matrices.length === 0) {
      geom.dispose();
      return;
    }
    const inst = new THREE.InstancedMesh(geom, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      inst.setMatrixAt(i, matrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = castShadow && !isSoftwareGl;
    inst.receiveShadow = receiveShadow;
    group.add(inst);
    disposables.push(geom);
  };

  if (wallInstances.length > 0) {
    const wallInstMat =
      map.regionId === 'port_meridian'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.35 })
        : wallMat;
    if (wallInstMat !== wallMat) disposables.push(wallInstMat);
    const wallInst = new THREE.InstancedMesh(wallGeom, wallInstMat, wallInstances.length);
    const cTmp = new THREE.Color();
    for (let i = 0; i < wallInstances.length; i++) {
      wallInst.setMatrixAt(i, wallInstances[i].matrix);
      if (map.regionId === 'port_meridian') {
        wallInst.setColorAt(i, cTmp.setHex(wallInstances[i].color ?? palette.wall));
      }
    }
    wallInst.instanceMatrix.needsUpdate = true;
    if (wallInst.instanceColor) wallInst.instanceColor.needsUpdate = true;
    wallInst.castShadow = !isSoftwareGl;
    wallInst.receiveShadow = true;
    group.add(wallInst);
  }

  if (windowInstances.length > 0) {
    const winMat = new THREE.MeshBasicMaterial({
      color: map.regionId === 'research_valley' ? 0x38bdf8 : 0xfde68a,
    });
    disposables.push(winMat);
    addBatch(new THREE.PlaneGeometry(0.55, 0.32), winMat, windowInstances);
  }

  addBatch(new THREE.ConeGeometry(0.75, 2.8, 6), cliffMat, cliffInstances, true, true);
  addBatch(new THREE.BoxGeometry(1.0, 0.03, 1.0), roadMat, roadInstances, false, true);
  if (stripeInstances.length > 0) {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    disposables.push(stripeMat);
    addBatch(new THREE.PlaneGeometry(0.45, 0.08), stripeMat, stripeInstances);
  }
  addBatch(new THREE.BoxGeometry(1.0, 0.14, 1.0), bridgeMat, bridgeInstances, false, true);
  addBatch(new THREE.PlaneGeometry(1.02, 1.02), waterMat, waterInstances);
  if (interiorInstances.length > 0) {
    const intMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.25 });
    disposables.push(intMat);
    addBatch(new THREE.PlaneGeometry(0.98, 0.98), intMat, interiorInstances);
  }
  addBatch(new THREE.DodecahedronGeometry(0.24, 0), rubbleMat, rubbleInstances, true, false);
  addBatch(new THREE.BoxGeometry(0.92, 0.74, 0.92), rubbleMat, collapseSlabInstances, true, false);
  addBatch(new THREE.BoxGeometry(0.24, 0.24, 1.15), steelMat, collapseBeamInstances);
  addBatch(new THREE.BoxGeometry(0.96, 0.04, 0.96), electricalMat, elecInstances);
  addBatch(new THREE.BoxGeometry(0.96, 0.04, 0.96), unstableMat, unstableInstances);
  addBatch(new THREE.BoxGeometry(0.96, 0.045, 0.96), chemMat, chemInstances);
  const hasWater = waterInstances.length > 0;

  // Charging & Launch Bay + RELAY Response Emergency Truck & Crew
  const baseWorld = gridToWorld(map.baseCoord);
  const baseStation = new THREE.Group();
  baseStation.position.set(baseWorld.x, 0, baseWorld.z);

  const dockPad = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.06, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.6 })
  );
  dockPad.position.y = 0.03;
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

  // Ambient Emergency Response Truck parked just outside staging bay perimeter
  const truckGroup = new THREE.Group();
  truckGroup.position.set(baseWorld.x - 1.6, 0, baseWorld.z - 5.2);
  const truckBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.3 })
  );
  truckBody.position.y = 0.55;
  const truckStripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.18, 2.62),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 })
  );
  truckStripe.position.y = 0.45;
  const strobe = new THREE.PointLight(0xf97316, 2.4, 8.0, 1.8);
  strobe.position.set(0, 1.25, 0.5);
  emergencyStrobes.push(strobe);
  truckGroup.add(truckBody, truckStripe, strobe);
  group.add(truckGroup);

  // Ambient Technician NPC standing beside Launch Bay
  const npc = new THREE.Group();
  npc.position.set(baseWorld.x - 0.95, 0, baseWorld.z - 1.15);
  const npcTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.36, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 })
  );
  npcTorso.position.y = 0.62;
  const npcHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd6a684 })
  );
  npcHead.position.y = 0.98;
  npc.add(npcTorso, npcHead);
  group.add(npc);
  group.add(baseStation);

  // Trapped Survivor Actor
  const survWorld = gridToWorld(map.survivorCoord);
  const survivorGroup = new THREE.Group();
  survivorGroup.position.set(survWorld.x, 0, survWorld.z);
  const survTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.32, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.65 })
  );
  survTorso.position.set(0, 0.44, 0);
  const survHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd6a684 })
  );
  survHead.position.set(0, 0.72, 0.08);
  const survRingMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const survRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.56, 24), survRingMat);
  survRing.rotation.x = -Math.PI / 2;
  survRing.position.y = 0.03;
  const survLight = new THREE.PointLight(0xf59e0b, 1.8, 5, 1.8);
  survLight.position.set(0, 1.2, 0);
  survivorGroup.add(survTorso, survHead, survRing, survLight);
  group.add(survivorGroup);

  // Relay Pylon Objective (if present in region)
  let relayBeaconMat: THREE.MeshStandardMaterial | null = null;
  if (map.relayCoord) {
    const rw = gridToWorld(map.relayCoord);
    const relayTower = new THREE.Group();
    relayTower.position.set(rw.x, 0, rw.z);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.12, 1.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 })
    );
    mast.position.y = 0.8;
    relayBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
    });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), relayBeaconMat);
    tip.position.y = 1.65;
    relayTower.add(mast, tip);
    group.add(relayTower);
  }

  // Medical Drop Zone Marker (if present)
  let medBeaconMat: THREE.MeshStandardMaterial | null = null;
  if (map.medicalCoord) {
    const mw = gridToWorld(map.medicalCoord);
    medBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.1,
      side: THREE.DoubleSide,
    });
    const medRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 20), medBeaconMat);
    medRing.rotation.x = -Math.PI / 2;
    medRing.position.set(mw.x, 0.04, mw.z);
    group.add(medRing);
  }

  // Dynamic Atmospheric Weather Particles (Rain / Dust / Ash)
  const particleCount = isSoftwareGl ? 90 : 220;
  let activeParticleCount = particleCount;
  const weatherPositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    weatherPositions[i * 3] = (Math.random() - 0.5) * (MAP_WIDTH + 6);
    weatherPositions[i * 3 + 1] = 0.2 + Math.random() * 8.0;
    weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * (MAP_HEIGHT + 6);
  }
  const weatherGeom = new THREE.BufferGeometry();
  weatherGeom.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
  weatherGeom.setDrawRange(0, activeParticleCount);
  const weatherMat = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 0.085,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const weatherPoints = new THREE.Points(weatherGeom, weatherMat);
  group.add(weatherPoints);
  disposables.push(weatherGeom, weatherMat);

  const setParticleDensity = (density: number) => {
    const clamped = Math.max(0, Math.min(1, density));
    activeParticleCount = Math.round(particleCount * clamped);
    weatherGeom.setDrawRange(0, activeParticleCount);
  };

  // Dual-Robot Planned A* Route Ribbons (Slot 1 Sky Blue, Slot 2 Emerald)
  const MAX_PATH_POINTS = 256;
  const pathChannels = [0x38bdf8, 0x10b981].map((hex) => {
    const buf = new Float32Array(MAX_PATH_POINTS * 3);
    const attr = new THREE.BufferAttribute(buf, 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', attr);
    geom.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.88 });
    const line = new THREE.Line(geom, mat);
    line.visible = false;
    line.frustumCulled = false;
    group.add(line);
    disposables.push(geom, mat);
    return { buf, attr, geom, line, lastSig: '' };
  });

  const setPlannedPath = (slotIndex: number, waypoints: GridCoord[]) => {
    const ch = pathChannels[slotIndex];
    if (!ch) return;
    const count = Math.min(MAX_PATH_POINTS, waypoints.length);
    const sig = waypoints.map((wp) => `${wp.x},${wp.z}`).join(';');
    if (sig === ch.lastSig) return;
    ch.lastSig = sig;
    if (count < 2) {
      ch.line.visible = false;
      ch.geom.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < count; i++) {
      const w = gridToWorld(waypoints[i]);
      ch.buf[i * 3] = w.x;
      ch.buf[i * 3 + 1] = 0.08 + slotIndex * 0.04;
      ch.buf[i * 3 + 2] = w.z;
    }
    ch.attr.needsUpdate = true;
    ch.geom.setDrawRange(0, count);
    ch.line.visible = true;
  };

  const update = (
    elapsedSec: number,
    survivorFound: boolean,
    relayRestored: boolean,
    medicalDelivered: boolean,
    weather: WeatherType,
    weatherEnabled: boolean,
    timeOfDay: TimeOfDay
  ) => {
    // Dynamic Time-of-Day lighting & sky mood
    let skyHex: number = palette.sky;
    let keyColor = 0xffeed8;
    let keyIntensity = 1.55;
    let hemiIntensity = 0.72;

    if (timeOfDay === 'dawn') {
      skyHex = 0x1b2030;
      keyColor = 0xfdba74;
      keyIntensity = 1.35;
      hemiIntensity = 0.68;
    } else if (timeOfDay === 'day') {
      skyHex = 0x17212e;
      keyColor = 0xfff7ed;
      keyIntensity = 1.75;
      hemiIntensity = 0.88;
    } else if (timeOfDay === 'sunset') {
      skyHex = 0x261516;
      keyColor = 0xfb923c;
      keyIntensity = 1.45;
      hemiIntensity = 0.62;
    } else {
      // night
      skyHex = 0x060910;
      keyColor = 0x93c5fd;
      keyIntensity = 0.92;
      hemiIntensity = 0.45;
    }

    // Lightning flash during thunderstorm
    if (weatherEnabled && weather === 'thunderstorm') {
      const flash = Math.sin(elapsedSec * 7.3) * Math.sin(elapsedSec * 19.7);
      if (flash > 0.93) {
        keyIntensity = 3.8;
        skyHex = 0x334155;
      }
    }

    (scene.background as THREE.Color).setHex(skyHex);
    lights.key.color.setHex(keyColor);
    lights.key.intensity = keyIntensity;
    lights.hemi.intensity = hemiIntensity;

    // Fog density reacts to weather
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.setHex(weather === 'dust_storm' && weatherEnabled ? 0x452d19 : skyHex);
      fog.density = !weatherEnabled
        ? 0.015
        : weather === 'fog'
          ? 0.055
          : weather === 'dust_storm'
            ? 0.048
            : weather === 'heavy_rain' || weather === 'thunderstorm'
              ? 0.036
              : 0.02;
    }

    for (const l of sparkLights) {
      const flicker = Math.sin(elapsedSec * 23) * Math.cos(elapsedSec * 17);
      l.intensity = flicker > 0.2 ? 4.8 : 0.7;
    }

    for (const strobe of emergencyStrobes) {
      strobe.intensity = Math.sin(elapsedSec * 7.5) > 0 ? 3.2 : 0.3;
    }

    // Floodwater wave shimmer
    if (hasWater) {
      waterMat.emissiveIntensity = 0.28 + Math.sin(elapsedSec * 2.2) * 0.1;
    }

    if (survivorFound) {
      survRingMat.color.setHex(0x10b981);
      survRingMat.emissive.setHex(0x10b981);
      survLight.color.setHex(0x10b981);
    }

    if (relayBeaconMat) {
      relayBeaconMat.color.setHex(relayRestored ? 0x10b981 : 0xef4444);
      relayBeaconMat.emissive.setHex(relayRestored ? 0x10b981 : 0xef4444);
    }

    if (medBeaconMat && medicalDelivered) {
      medBeaconMat.color.setHex(0x10b981);
      medBeaconMat.emissive.setHex(0x10b981);
    }

    // Weather particle update
    weatherPoints.visible = weatherEnabled && weather !== 'clear' && activeParticleCount > 0;
    if (weatherPoints.visible) {
      const isRaining =
        weather === 'rain' || weather === 'heavy_rain' || weather === 'thunderstorm';
      const isDust = weather === 'dust_storm';
      weatherMat.color.setHex(isDust ? 0xd97706 : isRaining ? 0x93c5fd : 0x9ca3af);
      weatherMat.opacity = isRaining ? 0.62 : isDust ? 0.55 : 0.28;

      const posArr = weatherGeom.attributes.position.array as Float32Array;
      for (let i = 0; i < activeParticleCount; i++) {
        const idx = i * 3;
        if (isRaining) {
          posArr[idx + 1] -= 0.18;
          posArr[idx] += 0.03;
          if (posArr[idx + 1] < 0.05) posArr[idx + 1] = 8.0;
        } else if (isDust) {
          posArr[idx] += 0.14;
          posArr[idx + 1] += Math.sin(elapsedSec * 2 + i) * 0.008;
        } else {
          posArr[idx] += 0.004;
          posArr[idx + 1] += Math.sin(elapsedSec * 0.6 + i) * 0.0015;
        }
        if (posArr[idx] > MAP_WIDTH / 2 + 3) posArr[idx] = -MAP_WIDTH / 2 - 3;
      }
      weatherGeom.attributes.position.needsUpdate = true;
    }

    void beaconMeshes;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    wallGeom.dispose();
  };

  return { group, update, setPlannedPath, setParticleDensity, dispose };
}
