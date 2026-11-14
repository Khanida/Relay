import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BASE_COORD, gridToWorld } from '../shared/disasterMap';
import { buildDisasterWorld } from '../simulation/disasterWorld';
import type { MissionSimulationEngine } from '../simulation/missionEngine';
import { QuadrupedRobotModel } from '../simulation/quadrupedRobot';

export type CameraMode = 'orbit' | 'chase' | 'fpv';

interface RelayViewportProps {
  engine: MissionSimulationEngine;
  cameraMode: CameraMode;
  simSpeed: number;
  showLidar: boolean;
  showFpvPip: boolean;
  worldVersion: number;
  onTickSync: () => void;
}

const _chaseOffset = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();

export function RelayViewport({
  engine,
  cameraMode,
  simSpeed,
  showLidar,
  showFpvPip,
  worldVersion,
  onTickSync,
}: RelayViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const cameraModeRef = useRef(cameraMode);
  const simSpeedRef = useRef(simSpeed);
  const showLidarRef = useRef(showLidar);
  const showFpvPipRef = useRef(showFpvPip);
  const onTickSyncRef = useRef(onTickSync);

  cameraModeRef.current = cameraMode;
  simSpeedRef.current = simSpeed;
  showLidarRef.current = showLidar;
  showFpvPipRef.current = showFpvPip;
  onTickSyncRef.current = onTickSync;

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    // Probe software WebGL (SwiftShader/llvmpipe) to pace render loops safely
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

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
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
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
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

    // Mandatory Studio PBR Environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Warm/cool 3-point industrial lighting rig
    const hemiLight = new THREE.HemisphereLight(0x7c93b0, 0x1b1f26, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffeed8, 1.55);
    keyLight.position.set(12, 18, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.48);
    rimLight.position.set(-14, 10, -12);
    scene.add(rimLight);

    // Tactical Camera & OrbitControls
    const mainCamera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    const baseW = gridToWorld(BASE_COORD);
    mainCamera.position.set(baseW.x - 3.5, 11.5, baseW.z + 11.5);

    const controls = new OrbitControls(mainCamera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.set(0, 0.4, 0);
    controls.update();

    // Build facility and articulated robot
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const world = buildDisasterWorld(engine.mapData.groundTruthGrid, maxAnisotropy, isSoftwareGl);
    scene.add(world.group);

    const robot = new QuadrupedRobotModel();
    scene.add(robot.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, mainCamera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastUiSync = 0;

    const handleResize = () => {
      if (!mount || disposed) return;
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      mainCamera.aspect = w / h;
      mainCamera.updateProjectionMatrix();
      robot.fpvCamera.aspect = w / h;
      robot.fpvCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
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

      const rawDelta = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;

      // Advance physics/agents with simulation speed multiplier
      const speedMult = simSpeedRef.current;
      const steps = speedMult >= 2 ? 2 : 1;
      const subDt = (rawDelta * speedMult) / steps;
      for (let i = 0; i < steps; i++) {
        engine.step(subDt);
      }

      // Sync robot 3D transform and articulated legs
      robot.root.position.set(engine.robotPos.x, 0, engine.robotPos.z);
      robot.root.rotation.y = engine.headingRad;
      robot.updateAnimation(
        rawDelta,
        engine.speedMps,
        engine.turnRateRad,
        engine.locomotionState,
        engine.batteryPct,
        engine.latestSensors.lidarRays,
        showLidarRef.current,
        performance.now()
      );

      // Update planned path ribbon & hazard/survivor effects
      const remainingWaypoints =
        engine.activeWaypoints.length > 0
          ? [
              engine.getSnapshot().gridPos,
              ...engine.activeWaypoints.slice(engine.waypointCursor),
            ]
          : [];
      world.setPlannedPath(remainingWaypoints);
      world.update(elapsed, engine.survivorFound);

      // Camera choreography
      const mode = cameraModeRef.current;
      if (mode === 'chase') {
        _chaseOffset
          .set(-Math.sin(engine.headingRad) * 4.4, 2.8, -Math.cos(engine.headingRad) * 4.4);
        _desiredCamPos.set(
          engine.robotPos.x + _chaseOffset.x,
          _chaseOffset.y,
          engine.robotPos.z + _chaseOffset.z
        );
        _desiredLookAt.set(
          engine.robotPos.x + Math.sin(engine.headingRad) * 1.4,
          0.55,
          engine.robotPos.z + Math.cos(engine.headingRad) * 1.4
        );
        mainCamera.position.x = THREE.MathUtils.damp(mainCamera.position.x, _desiredCamPos.x, 5, rawDelta);
        mainCamera.position.y = THREE.MathUtils.damp(mainCamera.position.y, _desiredCamPos.y, 5, rawDelta);
        mainCamera.position.z = THREE.MathUtils.damp(mainCamera.position.z, _desiredCamPos.z, 5, rawDelta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _desiredLookAt.x, 6, rawDelta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _desiredLookAt.y, 6, rawDelta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _desiredLookAt.z, 6, rawDelta);
        controls.update();
      } else if (mode === 'orbit') {
        controls.update();
      }

      if (!mount || disposed) return;
      const canvasW = Math.max(1, mount.clientWidth);
      const canvasH = Math.max(1, mount.clientHeight);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvasW, canvasH);

      if (mode === 'fpv') {
        robot.fpvCamera.aspect = canvasW / canvasH;
        robot.fpvCamera.updateProjectionMatrix();
        renderer.render(scene, robot.fpvCamera);
      } else {
        renderer.render(scene, mainCamera);

        // Optional live First-Person Robot Camera Picture-in-Picture corner feed
        if (showFpvPipRef.current && canvasW >= 480 && canvasH >= 320) {
          const pipW = Math.min(240, Math.round(canvasW * 0.25));
          const pipH = Math.round(pipW * 0.625);
          const pad = 16;
          const pipY = canvasH - pipH - pad; // Top-left corner of viewport!
          renderer.clearDepth();
          renderer.setScissorTest(true);
          renderer.setViewport(pad, pipY, pipW, pipH);
          renderer.setScissor(pad, pipY, pipW, pipH);
          robot.fpvCamera.aspect = pipW / pipH;
          robot.fpvCamera.updateProjectionMatrix();
          renderer.render(scene, robot.fpvCamera);
          renderer.setScissorTest(false);
        }
      }

      // Throttle React HUD state synchronization to ~10 Hz to keep UI responsive
      const now = performance.now();
      if (now - lastUiSync > 100) {
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
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      world.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [engine, worldVersion]);

  return (
    <div className="relative w-full h-full bg-[#0B0D10] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {showFpvPip && cameraMode !== 'fpv' && (
        <div
          className="pointer-events-none absolute top-4 left-4 border border-[#2d3644] rounded-md overflow-hidden"
          style={{ width: 'min(240px, 25%)', aspectRatio: '16 / 10' }}
        >
          <div className="absolute inset-x-0 bottom-0 bg-[#0b0d10]/85 px-2 py-1 flex items-center justify-between text-[11px] font-mono-tabular text-[#d1d5db]">
            <span>FPV Optical Cam</span>
            <span>{engine.survivorFound ? 'Target Locked' : 'Scanning'}</span>
          </div>
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
