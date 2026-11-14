import * as THREE from 'three';
import { createContactShadowTexture, createRobotOledTexture } from './textures';
import type { LidarRayReading, LocomotionState } from '../shared/types';

interface LegAssembly {
  hipGroup: THREE.Group;
  kneeGroup: THREE.Group;
  phaseOffset: number;
  sideSign: number;
}

export class QuadrupedRobotModel {
  public readonly root: THREE.Group;
  public readonly bodyGroup: THREE.Group;
  public readonly sensorHead: THREE.Group;
  public readonly lidarPuck: THREE.Mesh;
  public readonly fpvCamera: THREE.PerspectiveCamera;
  public readonly headlight: THREE.SpotLight;
  public readonly statusBarMat: THREE.MeshStandardMaterial;
  public readonly batteryFillMesh: THREE.Mesh;
  public readonly batteryFillMat: THREE.MeshStandardMaterial;
  public readonly lidarLines: THREE.LineSegments;

  private readonly legs: LegAssembly[] = [];
  private readonly oled: ReturnType<typeof createRobotOledTexture>;
  private gaitPhase = 0;
  private scanYaw = 0;
  private lastOledUpdate = 0;
  private readonly lidarPositions: Float32Array;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'RELAY_Quadruped';

    // Contact shadow plane directly on floor
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.35), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.015;
    this.root.add(shadowPlane);

    // Main articulated body suspended at hip height (0.42m)
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.42;
    this.root.add(this.bodyGroup);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x2b323d,
      roughness: 0.36,
      metalness: 0.82,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brushed rescue gold
      roughness: 0.28,
      metalness: 0.72,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x111419,
      roughness: 0.65,
      metalness: 0.85,
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d10,
      roughness: 0.92,
      metalness: 0.05,
    });

    // 1. Primary Chassis Hull (beveled industrial box)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.72), chassisMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.bodyGroup.add(hull);

    // 2. Top Orange Protective Carapace
    const carapace = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.58), armorMat);
    carapace.position.set(0, 0.095, -0.02);
    carapace.castShadow = true;
    this.bodyGroup.add(carapace);

    // 3. Side Roll-Cage Grab Rails
    for (const sx of [-0.23, 0.23]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 10), jointMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx, 0.04, 0);
      rail.castShadow = true;
      this.bodyGroup.add(rail);
    }

    // 4. Dorsal OLED Status Display
    this.oled = createRobotOledTexture();
    const oledMat = new THREE.MeshStandardMaterial({
      map: this.oled.texture,
      emissiveMap: this.oled.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.1,
    });
    const oledScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), oledMat);
    oledScreen.rotation.x = -Math.PI / 2;
    oledScreen.position.set(0, 0.122, -0.08);
    this.bodyGroup.add(oledScreen);

    // 5. Rear Battery Pack & Live Charge Gauge
    const batteryHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.18), jointMat);
    batteryHousing.position.set(0, 0.09, -0.24);
    this.bodyGroup.add(batteryHousing);

    this.batteryFillMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    });
    this.batteryFillMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.025, 0.03),
      this.batteryFillMat
    );
    this.batteryFillMesh.position.set(0, 0.125, -0.32);
    this.bodyGroup.add(this.batteryFillMesh);

    // 6. Status Light Strip
    this.statusBarMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });
    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.022, 0.03), this.statusBarMat);
    statusBar.position.set(0, 0.105, 0.32);
    this.bodyGroup.add(statusBar);

    // 7. Rear Telemetry Antenna
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.24, 8), jointMat);
    antenna.position.set(-0.12, 0.21, -0.28);
    this.bodyGroup.add(antenna);

    // 8. Front Sensor Turret (Stereo Optical Camera + Depth LiDAR Puck + Spotlight)
    this.sensorHead = new THREE.Group();
    this.sensorHead.position.set(0, 0.06, 0.38);
    this.bodyGroup.add(this.sensorHead);

    const headHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.14), chassisMat);
    headHousing.castShadow = true;
    this.sensorHead.add(headHousing);

    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.9,
    });
    for (const lx of [-0.06, 0.06]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 14), lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(lx, 0, 0.075);
      this.sensorHead.add(lens);
    }

    // Spinning LiDAR puck on top of head
    this.lidarPuck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.065, 16),
      jointMat
    );
    this.lidarPuck.position.set(0, 0.09, 0);
    const lidarRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.057, 0.057, 0.018, 16),
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        emissive: 0xd4af37,
        emissiveIntensity: 1.4,
      })
    );
    this.lidarPuck.add(lidarRing);
    this.sensorHead.add(this.lidarPuck);

    // Robot Headlight (SpotLight pointing forward along +Z)
    this.headlight = new THREE.SpotLight(0xfff4e0, 4.5, 13, Math.PI / 4, 0.55, 1.5);
    this.headlight.position.set(0, 0.02, 0.09);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(0, -0.35, 5.5);
    this.sensorHead.add(lightTarget);
    this.headlight.target = lightTarget;
    this.sensorHead.add(this.headlight);

    // First-Person Robot Camera mounted between stereo optical lenses
    this.fpvCamera = new THREE.PerspectiveCamera(68, 16 / 10, 0.1, 45);
    this.fpvCamera.position.set(0, 0.04, 0.11);
    this.fpvCamera.lookAt(0, -0.15, 4.0);
    this.sensorHead.add(this.fpvCamera);

    // 9. Four Articulated 2-Segment Legs
    const legSpecs = [
      { x: -0.23, z: 0.25, phase: 0, side: -1 }, // Front-Left
      { x: 0.23, z: 0.25, phase: Math.PI, side: 1 }, // Front-Right
      { x: -0.23, z: -0.25, phase: Math.PI, side: -1 }, // Rear-Left
      { x: 0.23, z: -0.25, phase: 0, side: 1 }, // Rear-Right
    ];

    for (const spec of legSpecs) {
      const hipGroup = new THREE.Group();
      hipGroup.position.set(spec.x, -0.02, spec.z);

      const hipServo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), armorMat);
      hipServo.rotation.z = Math.PI / 2;
      hipGroup.add(hipServo);

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.065), chassisMat);
      thigh.position.set(spec.side * 0.02, -0.11, 0);
      thigh.castShadow = true;
      hipGroup.add(thigh);

      const kneeGroup = new THREE.Group();
      kneeGroup.position.set(spec.side * 0.02, -0.21, 0);
      hipGroup.add(kneeGroup);

      const kneeJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 10), jointMat);
      kneeJoint.rotation.z = Math.PI / 2;
      kneeGroup.add(kneeJoint);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.2, 10), armorMat);
      shin.position.set(0, -0.1, 0);
      shin.castShadow = true;
      kneeGroup.add(shin);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), rubberMat);
      foot.position.set(0, -0.2, 0);
      kneeGroup.add(foot);

      this.bodyGroup.add(hipGroup);
      this.legs.push({
        hipGroup,
        kneeGroup,
        phaseOffset: spec.phase,
        sideSign: spec.side,
      });
    }

    // 10. Visual LiDAR Ray Fan (9 rays = 18 vertices)
    this.lidarPositions = new Float32Array(9 * 2 * 3);
    const lidarGeom = new THREE.BufferGeometry();
    lidarGeom.setAttribute('position', new THREE.BufferAttribute(this.lidarPositions, 3));
    const lidarMat = new THREE.LineBasicMaterial({
      color: 0xe5c158,
      transparent: true,
      opacity: 0.48,
    });
    this.lidarLines = new THREE.LineSegments(lidarGeom, lidarMat);
    this.lidarLines.frustumCulled = false;
    this.root.add(this.lidarLines);
  }

  public updateAnimation(
    dt: number,
    speedMps: number,
    turnRateRad: number,
    locomotionState: LocomotionState,
    batteryPct: number,
    lidarRays: LidarRayReading[],
    showLidar: boolean,
    nowMs: number
  ) {
    // LiDAR puck spins continuously
    this.lidarPuck.rotation.y += dt * 7.5;

    // Head sweep when scanning
    if (locomotionState === 'scanning') {
      this.scanYaw += dt * 2.8;
      this.sensorHead.rotation.y = Math.sin(this.scanYaw) * 0.65;
    } else {
      this.sensorHead.rotation.y = THREE.MathUtils.damp(this.sensorHead.rotation.y, 0, 8, dt);
    }

    // Leg gait kinematics
    const activeMotion = Math.min(1, (Math.abs(speedMps) + Math.abs(turnRateRad) * 0.45) / 1.4);
    if (activeMotion > 0.05 && locomotionState !== 'stopped' && locomotionState !== 'emergency_stop') {
      this.gaitPhase += dt * (6.5 + activeMotion * 5.5);
    }

    for (const leg of this.legs) {
      const p = this.gaitPhase + leg.phaseOffset;
      const targetHip = Math.sin(p) * 0.38 * activeMotion;
      const lift = Math.max(0, Math.cos(p)) * 0.48 * activeMotion;
      const targetKnee = -0.18 + lift;

      leg.hipGroup.rotation.x = THREE.MathUtils.damp(leg.hipGroup.rotation.x, targetHip, 14, dt);
      leg.kneeGroup.rotation.x = THREE.MathUtils.damp(leg.kneeGroup.rotation.x, targetKnee, 14, dt);
    }

    // Subtle body heave & pitch while trotting
    const targetHeave = 0.42 + Math.abs(Math.sin(this.gaitPhase * 2)) * 0.018 * activeMotion;
    this.bodyGroup.position.y = THREE.MathUtils.damp(this.bodyGroup.position.y, targetHeave, 12, dt);

    // Status light & battery bar colors
    if (locomotionState === 'emergency_stop') {
      this.statusBarMat.color.setHex(0xef4444);
      this.statusBarMat.emissive.setHex(0xef4444);
    } else if (locomotionState === 'scanning') {
      this.statusBarMat.color.setHex(0x38bdf8);
      this.statusBarMat.emissive.setHex(0x38bdf8);
    } else if (locomotionState === 'walking' || locomotionState === 'turning') {
      this.statusBarMat.color.setHex(0xd4af37);
      this.statusBarMat.emissive.setHex(0xd4af37);
    } else {
      this.statusBarMat.color.setHex(0x10b981);
      this.statusBarMat.emissive.setHex(0x10b981);
    }

    const frac = Math.max(0.04, Math.min(1, batteryPct / 100));
    this.batteryFillMesh.scale.x = frac;
    const batHex = batteryPct > 45 ? 0x10b981 : batteryPct > 22 ? 0xf59e0b : 0xef4444;
    this.batteryFillMat.color.setHex(batHex);
    this.batteryFillMat.emissive.setHex(batHex);

    // Refresh dorsal OLED screen every 400ms
    if (nowMs - this.lastOledUpdate > 400) {
      this.lastOledUpdate = nowMs;
      this.oled.update(batteryPct, locomotionState);
    }

    // Update local LiDAR ray lines in robot-local space
    this.lidarLines.visible = showLidar && lidarRays.length > 0;
    if (this.lidarLines.visible) {
      const originY = 0.55;
      const originZ = 0.38;
      for (let i = 0; i < Math.min(9, lidarRays.length); i++) {
        const ray = lidarRays[i];
        const idx = i * 6;
        this.lidarPositions[idx] = 0;
        this.lidarPositions[idx + 1] = originY;
        this.lidarPositions[idx + 2] = originZ;

        this.lidarPositions[idx + 3] = Math.sin(ray.angleRad) * ray.distance;
        this.lidarPositions[idx + 4] = originY - 0.12;
        this.lidarPositions[idx + 5] = originZ + Math.cos(ray.angleRad) * ray.distance;
      }
      this.lidarLines.geometry.attributes.position.needsUpdate = true;
    }
  }
}
