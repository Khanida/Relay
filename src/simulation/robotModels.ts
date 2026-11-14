import * as THREE from 'three';
import { ROBOT_CATALOG } from '../shared/gameCatalog';
import type { LidarRayReading, LocomotionState, RobotModelId } from '../shared/types';
import { QuadrupedRobotModel } from './quadrupedRobot';
import { createContactShadowTexture } from './textures';

export interface RobotVisualHandle {
  root: THREE.Group;
  fpvCamera: THREE.PerspectiveCamera;
  updateAnimation: (
    dt: number,
    speedMps: number,
    turnRateRad: number,
    locomotionState: LocomotionState,
    batteryPct: number,
    lidarRays: LidarRayReading[],
    showLidar: boolean,
    nowMs: number
  ) => void;
}

function createLidarFan(colorHex: number): {
  lines: THREE.LineSegments;
  positions: Float32Array;
  update: (rays: LidarRayReading[], show: boolean, originY: number, originZ: number) => void;
} {
  const positions = new Float32Array(9 * 2 * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.5,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.frustumCulled = false;

  const update = (rays: LidarRayReading[], show: boolean, originY: number, originZ: number) => {
    lines.visible = show && rays.length > 0;
    if (!lines.visible) return;
    for (let i = 0; i < Math.min(9, rays.length); i++) {
      const ray = rays[i];
      const idx = i * 6;
      positions[idx] = 0;
      positions[idx + 1] = originY;
      positions[idx + 2] = originZ;
      positions[idx + 3] = Math.sin(ray.angleRad) * ray.distance;
      positions[idx + 4] = originY - 0.1;
      positions[idx + 5] = originZ + Math.cos(ray.angleRad) * ray.distance;
    }
    geom.attributes.position.needsUpdate = true;
  };

  return { lines, positions, update };
}

function createShadowPlane(scaleX = 1.15, scaleZ = 1.35): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scaleX, scaleZ), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

function updateStatusColor(mat: THREE.MeshStandardMaterial, state: LocomotionState) {
  if (state === 'emergency_stop') {
    mat.color.setHex(0xef4444);
    mat.emissive.setHex(0xef4444);
  } else if (state === 'scanning') {
    mat.color.setHex(0x38bdf8);
    mat.emissive.setHex(0x38bdf8);
  } else if (state === 'walking' || state === 'turning' || state === 'hovering' || state === 'swimming') {
    mat.color.setHex(0xf97316);
    mat.emissive.setHex(0xf97316);
  } else {
    mat.color.setHex(0x10b981);
    mat.emissive.setHex(0x10b981);
  }
}

/**
 * Factory building genuinely distinct multi-part 3D models for all 10 RELAY 2.0 robots.
 */
export function createRobotModel(
  modelId: RobotModelId,
  customHullColor?: string
): RobotVisualHandle {
  const catalog = ROBOT_CATALOG[modelId] ?? ROBOT_CATALOG.relay_01;
  const hullHex = customHullColor || catalog.primaryColor;

  if (modelId === 'relay_01') {
    const quad = new QuadrupedRobotModel();
    if (customHullColor && customHullColor !== catalog.primaryColor) {
      quad.bodyGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat && mat.color && mat.color.getHexString() === 'ea580c') {
            mat.color.set(customHullColor);
          }
        }
      });
    }
    return quad;
  }

  const root = new THREE.Group();
  root.name = `Robot_${modelId}`;
  root.add(createShadowPlane());

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hullHex),
    roughness: 0.36,
    metalness: 0.35,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1f28,
    roughness: 0.55,
    metalness: 0.78,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d10,
    roughness: 0.92,
    metalness: 0.05,
  });
  const statusMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.0,
    metalness: 0.9,
    roughness: 0.15,
  });

  const fpvCamera = new THREE.PerspectiveCamera(68, 16 / 10, 0.1, 60);
  const lidar = createLidarFan(new THREE.Color(hullHex).getHex());
  root.add(lidar.lines);

  const animatedParts: {
    wheels: THREE.Mesh[];
    rotors: THREE.Group[];
    legs: Array<{ hip: THREE.Group; knee: THREE.Group; phase: number }>;
    segments: THREE.Group[];
    arms: THREE.Group[];
    turret?: THREE.Object3D;
    body: THREE.Group;
  } = {
    wheels: [],
    rotors: [],
    legs: [],
    segments: [],
    arms: [],
    body: new THREE.Group(),
  };

  const body = animatedParts.body;
  root.add(body);

  if (modelId === 'sentinel') {
    // Flagship Cybernetic Quadruped + Dish Array
    const quad = new QuadrupedRobotModel();
    quad.bodyGroup.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m && m.color && m.color.getHexString() === 'ea580c') {
          m.color.set(hullHex);
        }
      }
    });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.04, 0.08, 16), lensMat);
    dish.position.set(0, 0.22, -0.15);
    dish.rotation.x = 0.35;
    quad.bodyGroup.add(dish);
    return quad;
  }

  if (modelId === 'scout_x' || modelId === 'medic_4') {
    // 4x4 Wheeled Chassis (Scout-X has high optical mast; Medic-4 has pressurized Trauma Pod)
    body.position.y = 0.24;
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.78), darkMat);
    chassis.castShadow = true;
    body.add(chassis);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, modelId === 'medic_4' ? 0.26 : 0.12, 0.62),
      primaryMat
    );
    shell.position.set(0, modelId === 'medic_4' ? 0.18 : 0.11, -0.03);
    shell.castShadow = true;
    body.add(shell);

    if (modelId === 'medic_4') {
      const redMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0x991b1b,
        emissiveIntensity: 0.7,
      });
      const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.06), redMat);
      crossA.position.set(0, 0.32, -0.03);
      const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.18), redMat);
      crossB.position.set(0, 0.32, -0.03);
      body.add(crossA, crossB);
    } else {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 10), darkMat);
      mast.position.set(0, 0.34, 0.16);
      body.add(mast);
      const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.12), lensMat);
      camHead.position.set(0, 0.56, 0.18);
      body.add(camHead);
      animatedParts.turret = camHead;
    }

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.04), statusMat);
    statusBar.position.set(0, 0.16, 0.34);
    body.add(statusBar);

    const wheelGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16);
    wheelGeom.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-0.28, 0.26],
      [0.28, 0.26],
      [-0.28, -0.26],
      [0.28, -0.26],
    ]) {
      const wheel = new THREE.Mesh(wheelGeom, rubberMat);
      wheel.position.set(wx, -0.1, wz);
      wheel.castShadow = true;
      body.add(wheel);
      animatedParts.wheels.push(wheel);
    }

    fpvCamera.position.set(0, modelId === 'scout_x' ? 0.56 : 0.24, 0.36);
    fpvCamera.lookAt(0, 0.1, 4.5);
    body.add(fpvCamera);
  } else if (modelId === 'titan_r') {
    // Heavy Twin-Track Dozer Breacher
    body.position.y = 0.26;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.82), primaryMat);
    hull.castShadow = true;
    body.add(hull);

    for (const tx of [-0.34, 0.34]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.94), rubberMat);
      track.position.set(tx, -0.12, 0);
      track.castShadow = true;
      body.add(track);
    }

    // Angled hydraulic dozer blade on front (+Z)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.24, 0.1), darkMat);
    blade.position.set(0, -0.06, 0.52);
    blade.rotation.x = 0.25;
    blade.castShadow = true;
    body.add(blade);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 12), darkMat);
    turret.position.set(0, 0.2, 0.1);
    body.add(turret);
    animatedParts.turret = turret;

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.035, 0.04), statusMat);
    statusBar.position.set(0, 0.15, 0.42);
    body.add(statusBar);

    fpvCamera.position.set(0, 0.28, 0.45);
    fpvCamera.lookAt(0, 0.05, 4.5);
    body.add(fpvCamera);
  } else if (modelId === 'aqua_7') {
    // Twin-Pontoon Amphibious Hydro-Craft
    body.position.y = 0.22;
    for (const px of [-0.28, 0.28]) {
      const pontoon = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.95), primaryMat);
      pontoon.position.set(px, -0.06, 0);
      pontoon.castShadow = true;
      body.add(pontoon);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.72), darkMat);
    deck.position.set(0, 0.06, -0.02);
    body.add(deck);

    const jetRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), lensMat);
    jetRing.position.set(0, 0.08, -0.42);
    body.add(jetRing);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.24), lensMat);
    canopy.position.set(0, 0.19, 0.2);
    body.add(canopy);
    animatedParts.turret = canopy;

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.04), statusMat);
    statusBar.position.set(0, 0.16, 0.36);
    body.add(statusBar);

    fpvCamera.position.set(0, 0.24, 0.38);
    fpvCamera.lookAt(0, 0.05, 4.5);
    body.add(fpvCamera);
  } else if (modelId === 'swift_drone') {
    // Quad-Rotor VTOL Aerial Drone (elevated hover)
    body.position.y = 1.15;
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.38), primaryMat);
    core.castShadow = true;
    body.add(core);

    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), lensMat);
    gimbal.position.set(0, -0.08, 0.16);
    body.add(gimbal);

    const rotorDiscMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });

    for (const [rx, rz] of [
      [-0.32, 0.32],
      [0.32, 0.32],
      [-0.32, -0.32],
      [0.32, -0.32],
    ]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.44), darkMat);
      arm.position.set(rx * 0.5, 0.02, rz * 0.5);
      arm.lookAt(rx, 0.02, rz);
      body.add(arm);

      const rotorGrp = new THREE.Group();
      rotorGrp.position.set(rx, 0.07, rz);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.035), darkMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), rotorDiscMat);
      disc.rotation.x = -Math.PI / 2;
      rotorGrp.add(blade, disc);
      body.add(rotorGrp);
      animatedParts.rotors.push(rotorGrp);
    }

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.04), statusMat);
    statusBar.position.set(0, 0.07, 0.2);
    body.add(statusBar);

    fpvCamera.position.set(0, -0.1, 0.24);
    fpvCamera.lookAt(0, -0.5, 4.0);
    body.add(fpvCamera);
  } else if (modelId === 'spectra') {
    // 6-Leg Hexapod + Spectrometer Dish
    body.position.y = 0.34;
    const carapace = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.16, 6), primaryMat);
    carapace.castShadow = true;
    body.add(carapace);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.06, 0.12, 12), lensMat);
    turret.position.set(0, 0.16, 0.05);
    turret.rotation.x = 0.25;
    body.add(turret);
    animatedParts.turret = turret;

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.04), statusMat);
    statusBar.position.set(0, 0.08, 0.29);
    body.add(statusBar);

    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const zOff = ((i % 3) - 1) * 0.24;
      const hip = new THREE.Group();
      hip.position.set(side * 0.26, -0.02, zOff);
      const femur = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), darkMat);
      femur.position.set(side * 0.08, -0.04, 0);
      hip.add(femur);

      const knee = new THREE.Group();
      knee.position.set(side * 0.16, -0.06, 0);
      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.24, 8), primaryMat);
      tibia.position.set(0, -0.12, 0);
      knee.add(tibia);
      hip.add(knee);
      body.add(hip);
      animatedParts.legs.push({ hip, knee, phase: (i % 2) * Math.PI });
    }

    fpvCamera.position.set(0, 0.18, 0.3);
    fpvCamera.lookAt(0, -0.05, 4.0);
    body.add(fpvCamera);
  } else if (modelId === 'crawler_9') {
    // 4-Segment Articulated Micro-Crawler
    body.position.y = 0.12;
    for (let s = 0; s < 4; s++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0, 0.28 - s * 0.22);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.28 - s * 0.02, 0.12, 0.19),
        s === 0 ? primaryMat : darkMat
      );
      box.castShadow = true;
      seg.add(box);
      body.add(seg);
      animatedParts.segments.push(seg);
    }
    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.04), statusMat);
    statusBar.position.set(0, 0.07, 0.36);
    body.add(statusBar);

    fpvCamera.position.set(0, 0.12, 0.38);
    fpvCamera.lookAt(0, 0.02, 4.0);
    body.add(fpvCamera);
  } else {
    // ATLAS-M Dual-Arm Heavy Manipulator Mech
    body.position.y = 0.48;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.34), primaryMat);
    torso.castShadow = true;
    body.add(torso);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.16), lensMat);
    visor.position.set(0, 0.28, 0.06);
    body.add(visor);
    animatedParts.turret = visor;

    for (const sx of [-0.32, 0.32]) {
      const arm = new THREE.Group();
      arm.position.set(sx, 0.12, 0.04);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), darkMat);
      upper.position.set(0, -0.14, 0.08);
      upper.rotation.x = -0.35;
      arm.add(upper);
      body.add(arm);
      animatedParts.arms.push(arm);
    }

    for (const lx of [-0.14, 0.14]) {
      const hip = new THREE.Group();
      hip.position.set(lx, -0.2, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.16), darkMat);
      leg.position.set(0, -0.16, 0);
      hip.add(leg);
      const knee = new THREE.Group();
      hip.add(knee);
      body.add(hip);
      animatedParts.legs.push({ hip, knee, phase: lx < 0 ? 0 : Math.PI });
    }

    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.04), statusMat);
    statusBar.position.set(0, 0.14, 0.19);
    body.add(statusBar);

    fpvCamera.position.set(0, 0.32, 0.22);
    fpvCamera.lookAt(0, 0.1, 4.5);
    body.add(fpvCamera);
  }

  let phase = 0;

  const updateAnimation = (
    dt: number,
    speedMps: number,
    turnRateRad: number,
    locomotionState: LocomotionState,
    _batteryPct: number,
    lidarRays: LidarRayReading[],
    showLidar: boolean
  ) => {
    const active = Math.min(1.2, (Math.abs(speedMps) + Math.abs(turnRateRad) * 0.4) / 1.4);
    if (active > 0.05 && locomotionState !== 'stopped' && locomotionState !== 'emergency_stop') {
      phase += dt * (6.5 + active * 6.0);
    }

    for (const w of animatedParts.wheels) {
      w.rotation.x += speedMps * dt * 6.5;
    }

    for (const r of animatedParts.rotors) {
      r.rotation.y += dt * 28.0;
    }

    for (const leg of animatedParts.legs) {
      const p = phase + leg.phase;
      leg.hip.rotation.x = THREE.MathUtils.damp(leg.hip.rotation.x, Math.sin(p) * 0.36 * active, 12, dt);
      leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, Math.max(0, Math.cos(p)) * 0.35 * active, 12, dt);
    }

    for (let s = 0; s < animatedParts.segments.length; s++) {
      animatedParts.segments[s].position.x = Math.sin(phase - s * 0.7) * 0.06 * active;
    }

    for (let a = 0; a < animatedParts.arms.length; a++) {
      const sign = a === 0 ? 1 : -1;
      animatedParts.arms[a].rotation.x = Math.sin(phase) * 0.25 * active * sign;
    }

    if (animatedParts.turret) {
      if (locomotionState === 'scanning') {
        animatedParts.turret.rotation.y += dt * 3.2;
      } else {
        animatedParts.turret.rotation.y = THREE.MathUtils.damp(animatedParts.turret.rotation.y, 0, 8, dt);
      }
    }

    if (modelId === 'swift_drone') {
      body.position.y = 1.15 + Math.sin(performance.now() * 0.004) * 0.06;
    }

    updateStatusColor(statusMat, locomotionState);
    lidar.update(lidarRays, showLidar, body.position.y + 0.14, 0.35);
  };

  return { root, fpvCamera, updateAnimation };
}
