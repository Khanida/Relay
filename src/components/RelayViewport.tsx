import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  RotateCcw,
  Zap,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gridToWorld } from '../shared/disasterMap';
import { computeRobotChargeStatus } from '../shared/gameCatalog';
import type { ControlMode, GraphicsQuality, OwnedRobotState } from '../shared/types';
import { buildMeridianWorld3D } from '../simulation/meridianWorld3D';
import type { MissionSimulationEngine } from '../simulation/missionEngine';
import { createRobotModel, type RobotVisualHandle } from '../simulation/robotModels';

export type CameraMode = 'orbit' | 'chase' | 'third_person' | 'fpv' | 'cinematic';

type OptTier = 0 | 1 | 2 | 3;

const OPT_TIERS: Record<
  OptTier,
  { label: string; resScale: number; particleDensity: number }
> = {
  0: { label: 'Native', resScale: 1.0, particleDensity: 1.0 },
  1: { label: 'Balanced', resScale: 0.8, particleDensity: 0.6 },
  2: { label: 'Performance', resScale: 0.65, particleDensity: 0.35 },
  3: { label: 'Max Perf', resScale: 0.5, particleDensity: 0.15 },
};

interface PerfMetrics {
  fps: number;
  frameTimeMs: number;
  resScale: number;
  particleDensity: number;
  effectiveDpr: number;
  renderWidth: number;
  renderHeight: number;
  drawCalls: number;
  tier: OptTier;
  lowFpsStreak: number;
}

interface RelayViewportProps {
  engine: MissionSimulationEngine;
  cameraMode: CameraMode;
  controlMode: ControlMode;
  simSpeed: number;
  showLidar: boolean;
  showFpvPip: boolean;
  weatherEnabled: boolean;
  graphicsQuality: GraphicsQuality;
  worldVersion: number;
  showPerfOverlay?: boolean;
  autoOptimize?: boolean;
  onToggleAutoOptimize?: () => void;
  rightOverlay?: ReactNode;
  activeOwnedRobot?: OwnedRobotState;
  onOpenStore?: () => void;
  onTickSync: () => void;
}

const _chaseOffset = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();

export function RelayViewport({
  engine,
  cameraMode,
  controlMode,
  simSpeed,
  showLidar,
  showFpvPip,
  weatherEnabled,
  graphicsQuality,
  worldVersion,
  showPerfOverlay = true,
  autoOptimize = true,
  onToggleAutoOptimize,
  rightOverlay,
  activeOwnedRobot,
  onOpenStore,
  onTickSync,
}: RelayViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [swGlDetected, setSwGlDetected] = useState(false);
  const [perf, setPerf] = useState<PerfMetrics>({
    fps: 60,
    frameTimeMs: 16.7,
    resScale: 1,
    particleDensity: 1,
    effectiveDpr: 1,
    renderWidth: 0,
    renderHeight: 0,
    drawCalls: 0,
    tier: 0,
    lowFpsStreak: 0,
  });

  const cameraModeRef = useRef(cameraMode);
  const simSpeedRef = useRef(simSpeed);
  const showLidarRef = useRef(showLidar);
  const showFpvPipRef = useRef(showFpvPip);
  const weatherEnabledRef = useRef(weatherEnabled);
  const autoOptimizeRef = useRef(autoOptimize);
  const onTickSyncRef = useRef(onTickSync);
  const applyTierFnRef = useRef<((tier: OptTier) => void) | null>(null);

  cameraModeRef.current = cameraMode;
  simSpeedRef.current = simSpeed;
  showLidarRef.current = showLidar;
  showFpvPipRef.current = showFpvPip;
  weatherEnabledRef.current = weatherEnabled;
  autoOptimizeRef.current = autoOptimize;
  onTickSyncRef.current = onTickSync;

  // Restore native quality if user turns Auto-Optimize off
  useEffect(() => {
    if (!autoOptimize) {
      applyTierFnRef.current?.(0);
    }
  }, [autoOptimize]);

  // Keyboard Remote Control (active ONLY when user engages Remote Control mode; Automatic AI by default)
  useEffect(() => {
    if (controlMode !== 'manual') {
      engine.setManualInput(0, 0);
      return;
    }

    const pressed = new Set<string>();
    const syncKeys = () => {
      let forward = 0;
      let turn = 0;
      if (pressed.has('w') || pressed.has('arrowup')) forward += 1;
      if (pressed.has('s') || pressed.has('arrowdown')) forward -= 0.7;
      if (pressed.has('a') || pressed.has('arrowleft')) turn -= 1;
      if (pressed.has('d') || pressed.has('arrowright')) turn += 1;
      engine.setManualInput(forward, turn);
    };
    const onDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        if (k.startsWith('arrow')) e.preventDefault();
        pressed.add(k);
        syncKeys();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (pressed.delete(k)) syncKeys();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      engine.setManualInput(0, 0);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [engine, controlMode]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();
    setSwGlDetected(isSoftwareGl);

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl && graphicsQuality !== 'low',
        powerPreference: 'high-performance',
      });
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize WebGL context.');
      return;
    }

    setWebglError(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const maxDpr = graphicsQuality === 'ultra' ? 1.5 : graphicsQuality === 'high' ? 1.25 : 1;
    const baseDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(baseDpr);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = !isSoftwareGl && graphicsQuality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d10);
    scene.fog = new THREE.FogExp2(0x0b0d10, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x7c93b0, 0x1b1f26, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffeed8, 1.55);
    keyLight.position.set(12, 18, 10);
    keyLight.castShadow = !isSoftwareGl && graphicsQuality !== 'low';
    keyLight.shadow.mapSize.width = graphicsQuality === 'ultra' ? 1536 : 1024;
    keyLight.shadow.mapSize.height = graphicsQuality === 'ultra' ? 1536 : 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 52;
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.48);
    rimLight.position.set(-14, 10, -12);
    scene.add(rimLight);

    const mainCamera = new THREE.PerspectiveCamera(48, width / height, 0.1, 110);
    const baseW = gridToWorld(engine.mapData.baseCoord);
    mainCamera.position.set(baseW.x - 3.5, 11.5, baseW.z + 11.5);

    const controls = new OrbitControls(mainCamera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.set(0, 0.4, 0);
    controls.update();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const world = buildMeridianWorld3D(
      engine.mapData,
      scene,
      { hemi: hemiLight, key: keyLight, rim: rimLight },
      maxAnisotropy,
      isSoftwareGl
    );
    scene.add(world.group);

    // Instantiate distinct 3D models for each deployed unit (1 or 2)
    const unitVisuals: RobotVisualHandle[] = engine.units.map((u) => {
      const model = createRobotModel(u.model_id, u.hullColor);
      scene.add(model.root);
      return model;
    });

    // Optional Post-Processing (Bloom + ACES Output) strictly on hardware GPU + Ultra quality
    const useComposer = !isSoftwareGl && graphicsQuality === 'ultra';
    let composer: EffectComposer | null = null;
    if (useComposer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, mainCamera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.38, 0.55, 0.88);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, mainCamera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastUiSync = 0;

    // Performance Monitor & Auto-Optimize State
    let optTier: OptTier = 0;
    let lowFpsStreak = 0;
    let highFpsStreak = 0;
    let perfWindowStart = performance.now();
    let perfFrameCount = 0;
    let lastOptChangeMs = 0;
    const mountTimeMs = performance.now();

    const applyOptimizationTier = (nextTier: OptTier) => {
      if (disposed) return;
      optTier = nextTier;
      const cfg = OPT_TIERS[nextTier];
      const targetDpr = Math.max(0.5, Number((baseDpr * cfg.resScale).toFixed(2)));
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);

      renderer.setPixelRatio(targetDpr);
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(targetDpr);
        composer.setSize(w, h);
      }
      world.setParticleDensity(cfg.particleDensity);

      lowFpsStreak = 0;
      highFpsStreak = 0;
      lastOptChangeMs = performance.now();

      setPerf((prev) => ({
        ...prev,
        resScale: cfg.resScale,
        particleDensity: cfg.particleDensity,
        effectiveDpr: targetDpr,
        renderWidth: renderer.domElement.width,
        renderHeight: renderer.domElement.height,
        tier: nextTier,
        lowFpsStreak: 0,
      }));
    };

    applyTierFnRef.current = applyOptimizationTier;

    const handleResize = () => {
      if (!mount || disposed) return;
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      const cfg = OPT_TIERS[optTier];
      const targetDpr = Math.max(0.5, Number((baseDpr * cfg.resScale).toFixed(2)));
      mainCamera.aspect = w / h;
      mainCamera.updateProjectionMatrix();
      for (const uv of unitVisuals) {
        uv.fpvCamera.aspect = w / h;
        uv.fpvCamera.updateProjectionMatrix();
      }
      renderer.setPixelRatio(targetDpr);
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(targetDpr);
        composer.setSize(w, h);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const rawDelta = Math.min(0.04, clock.getDelta());
      const elapsed = clock.elapsedTime;

      const speedMult = simSpeedRef.current;
      const steps = speedMult >= 2 ? 2 : 1;
      const subDt = (rawDelta * speedMult) / steps;
      for (let i = 0; i < steps; i++) {
        engine.step(subDt);
      }

      // Sync all deployed robots
      engine.units.forEach((u, idx) => {
        const visual = unitVisuals[idx];
        if (!visual) return;
        visual.root.position.set(u.pos.x, 0, u.pos.z);
        visual.root.rotation.y = u.headingRad;
        visual.updateAnimation(
          rawDelta,
          u.speedMps,
          u.turnRateRad,
          u.locomotionState,
          u.batteryPct,
          u.latestSensors.lidarRays,
          showLidarRef.current,
          performance.now()
        );

        const remainingWaypoints =
          u.activeWaypoints.length > 0
            ? [
                {
                  x: Math.round(u.pos.x + 13 - 0.5),
                  z: Math.round(u.pos.z + 10 - 0.5),
                },
                ...u.activeWaypoints.slice(u.waypointCursor),
              ]
            : [];
        world.setPlannedPath(idx, remainingWaypoints);
      });

      world.update(
        elapsed,
        engine.survivorFound,
        engine.relayRestored,
        engine.medicalDelivered,
        engine.weather,
        weatherEnabledRef.current,
        engine.timeOfDay
      );

      // Camera choreography tracking currently selected robot
      const activeIdx = Math.min(engine.selectedUnitIndex, Math.max(0, engine.units.length - 1));
      const activeUnit = engine.units[activeIdx] ?? engine.units[0];
      const activeVisual = unitVisuals[activeIdx] ?? unitVisuals[0];
      const mode = cameraModeRef.current;

      if (activeUnit && (mode === 'chase' || mode === 'third_person')) {
        const distBack = mode === 'third_person' ? 2.8 : 4.6;
        const heightUp = mode === 'third_person' ? 1.85 : 2.9;
        _chaseOffset.set(
          -Math.sin(activeUnit.headingRad) * distBack,
          heightUp,
          -Math.cos(activeUnit.headingRad) * distBack
        );
        _desiredCamPos.set(
          activeUnit.pos.x + _chaseOffset.x,
          _chaseOffset.y,
          activeUnit.pos.z + _chaseOffset.z
        );
        _desiredLookAt.set(
          activeUnit.pos.x + Math.sin(activeUnit.headingRad) * 1.4,
          0.55,
          activeUnit.pos.z + Math.cos(activeUnit.headingRad) * 1.4
        );
        mainCamera.position.x = THREE.MathUtils.damp(mainCamera.position.x, _desiredCamPos.x, 5, rawDelta);
        mainCamera.position.y = THREE.MathUtils.damp(mainCamera.position.y, _desiredCamPos.y, 5, rawDelta);
        mainCamera.position.z = THREE.MathUtils.damp(mainCamera.position.z, _desiredCamPos.z, 5, rawDelta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _desiredLookAt.x, 6, rawDelta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _desiredLookAt.y, 6, rawDelta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _desiredLookAt.z, 6, rawDelta);
        controls.update();
      } else if (mode === 'cinematic' && activeUnit) {
        const sweepAngle = elapsed * 0.28;
        _desiredCamPos.set(
          activeUnit.pos.x + Math.cos(sweepAngle) * 7.5,
          4.4 + Math.sin(elapsed * 0.4) * 1.0,
          activeUnit.pos.z + Math.sin(sweepAngle) * 7.5
        );
        mainCamera.position.x = THREE.MathUtils.damp(mainCamera.position.x, _desiredCamPos.x, 3, rawDelta);
        mainCamera.position.y = THREE.MathUtils.damp(mainCamera.position.y, _desiredCamPos.y, 3, rawDelta);
        mainCamera.position.z = THREE.MathUtils.damp(mainCamera.position.z, _desiredCamPos.z, 3, rawDelta);
        controls.target.set(activeUnit.pos.x, 0.5, activeUnit.pos.z);
        controls.update();
      } else if (mode === 'orbit') {
        controls.update();
      }

      if (!mount || disposed) return;
      const canvasW = Math.max(1, mount.clientWidth);
      const canvasH = Math.max(1, mount.clientHeight);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvasW, canvasH);

      if (mode === 'fpv' && activeVisual) {
        renderer.shadowMap.autoUpdate = !isSoftwareGl && graphicsQuality !== 'low';
        activeVisual.fpvCamera.aspect = canvasW / canvasH;
        activeVisual.fpvCamera.updateProjectionMatrix();
        renderer.render(scene, activeVisual.fpvCamera);
      } else {
        renderer.shadowMap.autoUpdate = !isSoftwareGl && graphicsQuality !== 'low';
        // Drop bloom composer automatically if Auto-Optimize reached Max Perf
        if (composer && optTier < 3) {
          composer.render();
        } else {
          renderer.render(scene, mainCamera);
        }

        if (!isSoftwareGl && showFpvPipRef.current && activeVisual && canvasW >= 480 && canvasH >= 320) {
          const pipW = Math.min(230, Math.round(canvasW * 0.24));
          const pipH = Math.round(pipW * 0.625);
          const pad = 16;
          const pipY = canvasH - pipH - pad;
          // Reuse shadow map from main render so PiP doesn't re-render shadow pass
          renderer.shadowMap.autoUpdate = false;
          renderer.clearDepth();
          renderer.setScissorTest(true);
          renderer.setViewport(pad, pipY, pipW, pipH);
          renderer.setScissor(pad, pipY, pipW, pipH);
          activeVisual.fpvCamera.aspect = pipW / pipH;
          activeVisual.fpvCamera.updateProjectionMatrix();
          renderer.render(scene, activeVisual.fpvCamera);
          renderer.setScissorTest(false);
        }
      }

      const now = performance.now();

      // Sample FPS & evaluate Auto-Optimize every 500ms
      perfFrameCount += 1;
      const windowElapsed = now - perfWindowStart;
      if (windowElapsed >= 500) {
        const instantFps = Math.round((perfFrameCount * 1000) / windowElapsed);
        const avgFrameMs = Number((windowElapsed / perfFrameCount).toFixed(1));
        const drawCalls = renderer.info.render.calls;

        const warmedUp = now - mountTimeMs > 1500 && !document.hidden;
        if (warmedUp && now - lastOptChangeMs > 2000) {
          if (instantFps < 30) {
            lowFpsStreak += 1;
            highFpsStreak = 0;
            if (autoOptimizeRef.current && lowFpsStreak >= 4 && optTier < 3) {
              applyOptimizationTier((optTier + 1) as OptTier);
            }
          } else {
            lowFpsStreak = 0;
            if (autoOptimizeRef.current && instantFps >= 52 && optTier > 0 && now - lastOptChangeMs > 8000) {
              highFpsStreak += 1;
              if (highFpsStreak >= 12) {
                applyOptimizationTier((optTier - 1) as OptTier);
              }
            } else {
              highFpsStreak = 0;
            }
          }
        }

        const cfg = OPT_TIERS[optTier];
        setPerf({
          fps: instantFps,
          frameTimeMs: avgFrameMs,
          resScale: cfg.resScale,
          particleDensity: cfg.particleDensity,
          effectiveDpr: Number(renderer.getPixelRatio().toFixed(2)),
          renderWidth: renderer.domElement.width,
          renderHeight: renderer.domElement.height,
          drawCalls,
          tier: optTier,
          lowFpsStreak,
        });

        perfWindowStart = now;
        perfFrameCount = 0;
      }

      if (now - lastUiSync > 180) {
        lastUiSync = now;
        onTickSyncRef.current();
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      applyTierFnRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      composer?.dispose();
      controls.dispose();
      world.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [engine, worldVersion, graphicsQuality]);

  const activeUnitSnap = engine.getSnapshot();
  const isMissionMoving = engine.phase === 'executing' || engine.phase === 'returning';
  const chargeInfo =
    activeOwnedRobot && !isMissionMoving ? computeRobotChargeStatus(activeOwnedRobot) : null;
  const displayBatteryPct = chargeInfo ? chargeInfo.batteryPct : activeUnitSnap.batteryPct;
  const isChargingInStandby = Boolean(chargeInfo && chargeInfo.isCharging);
  const batteryFillColor =
    displayBatteryPct > 45
      ? 'bg-emerald-400'
      : displayBatteryPct > 20
        ? 'bg-[#E5C158]'
        : 'bg-rose-500';
  const batteryTextTone =
    displayBatteryPct > 45
      ? 'text-emerald-300'
      : displayBatteryPct > 20
        ? 'text-[#E5C158]'
        : 'text-rose-400';

  const BatteryCornerBadge = (
    <div className="pointer-events-auto flex items-center gap-1.5 px-1.5 py-1 rounded bg-[#0B0D10]/90 border border-[#94A3B8]/40 text-[10px] font-mono-tabular">
      {isChargingInStandby ? (
        <BatteryCharging size={12} className="text-[#E5C158] shrink-0" />
      ) : displayBatteryPct <= 20 ? (
        <BatteryLow size={12} className="text-rose-400 shrink-0" />
      ) : (
        <BatteryFull size={12} className="text-emerald-400 shrink-0" />
      )}
      <div className="w-10 h-1.5 rounded-full bg-[#1E2531] overflow-hidden">
        <div
          className={`h-full transition-all ${batteryFillColor}`}
          style={{ width: `${Math.max(0, Math.min(100, displayBatteryPct))}%` }}
        />
      </div>
      <span className={`font-semibold ${batteryTextTone}`}>
        {displayBatteryPct.toFixed(0)}%
      </span>
      {isChargingInStandby && chargeInfo && (
        <span className="text-[#CBD5E1]">· {chargeInfo.formattedRemaining}</span>
      )}
      {displayBatteryPct < 99.9 && onOpenStore && (
        <button
          type="button"
          onClick={onOpenStore}
          title="Instant 100% Recharge in Store"
          className="ml-0.5 px-1 py-0.5 rounded bg-[#D4AF37]/20 hover:bg-[#D4AF37] text-[#E5C158] hover:text-[#0B0D10] font-semibold transition-colors"
        >
          ⚡
        </button>
      )}
    </div>
  );

  const fpsTone =
    perf.fps >= 45
      ? 'text-emerald-400'
      : perf.fps >= 30
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="relative w-full h-full bg-[#0B0D10] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {!swGlDetected && showFpvPip && cameraMode !== 'fpv' ? (
        <div
          className="pointer-events-none absolute top-4 left-4 border border-[#94A3B8]/40 rounded-md overflow-hidden"
          style={{ width: 'min(230px, 24%)', aspectRatio: '16 / 10' }}
        >
          <div className="absolute top-1.5 left-1.5 z-10">{BatteryCornerBadge}</div>
          <div className="absolute inset-x-0 bottom-0 bg-[#0b0d10]/85 px-2 py-1 flex items-center justify-between text-[11px] font-mono-tabular text-[#d1d5db]">
            <span>{activeUnitSnap.name ?? activeUnitSnap.robot_id} FPV</span>
            <span>{engine.survivorFound ? 'Target Locked' : 'Scanning'}</span>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2">
          {BatteryCornerBadge}
        </div>
      )}

      {(showPerfOverlay || rightOverlay) && (
        <div className="pointer-events-none absolute top-16 right-4 z-20 flex flex-col items-end gap-2 max-h-[calc(100%-8.5rem)]">
          {showPerfOverlay && (
            <div className="pointer-events-auto w-72 rounded-lg bg-[#12161C]/95 border border-[#94A3B8]/35 p-2.5 text-[11px] text-[#D1D5DB]">
              <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-[#222934]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#E5C158] tracking-wide uppercase text-[10px]">
                  <Activity size={12} className="text-[#CBD5E1]" />
                  Perf Monitor
                </span>
                {onToggleAutoOptimize && (
                  <button
                    type="button"
                    onClick={onToggleAutoOptimize}
                    title="Automatically scale resolution & particle density if FPS drops below 30"
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                      autoOptimize
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#E5C158]'
                        : 'bg-[#1A2029] border-[#2C3544] text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    <Zap size={10} />
                    Auto-Opt: {autoOptimize ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono-tabular">
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">FPS</span>
                  <span className={`font-semibold ${fpsTone}`}>{perf.fps}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">Frame</span>
                  <span>{perf.frameTimeMs.toFixed(1)}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">Res</span>
                  <span>{Math.round(perf.resScale * 100)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">Particles</span>
                  <span>{Math.round(perf.particleDensity * 100)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">Buffer</span>
                  <span>
                    {perf.renderWidth}×{perf.renderHeight}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9BA3B0]">Draws</span>
                  <span>{perf.drawCalls}</span>
                </div>
              </div>

              {(perf.tier > 0 || (autoOptimize && perf.lowFpsStreak > 0)) && (
                <div className="mt-2 pt-1.5 border-t border-[#222934] flex items-center justify-between gap-2 text-[10px]">
                  {perf.tier > 0 ? (
                    <>
                      <span className="text-[#E5C158] font-medium">
                        Auto-Optimized · {OPT_TIERS[perf.tier].label}
                      </span>
                      <button
                        type="button"
                        onClick={() => applyTierFnRef.current?.(0)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1A2029] hover:bg-[#232B38] border border-[#94A3B8]/40 text-[#E5E7EB]"
                      >
                        <RotateCcw size={10} />
                        100%
                      </button>
                    </>
                  ) : (
                    <span className="text-[#E5C158] font-mono-tabular">
                      FPS &lt; 30 ({perf.lowFpsStreak}/4) — scaling soon
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {rightOverlay}
        </div>
      )}

      {controlMode === 'manual' && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 px-2.5 py-1.5 rounded bg-[#0F141B]/95 border border-sky-500/60 text-[11px] font-mono-tabular text-sky-300">
          REMOTE CONTROL · W/S Drive · A/D or Arrows Steer
        </div>
      )}

      {(contextLost || webglError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0B0D10]/95 text-center p-6">
          <div>
            <p className="font-display text-lg font-semibold text-white">
              {webglError ? '3D Viewport Unavailable' : '3D Graphics Context Interrupted'}
            </p>
            <p className="mt-1 text-sm text-[#9BA3B0]">
              {webglError || 'Restoring WebGL rendering pipeline automatically.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

