import { calculateMissionScore, parseInstructionDeterministic } from '../agents/commanderParser';
import { calculateAStarPath } from '../agents/navigationAgent';
import { evaluateLiveSensorSafety, evaluateProposedRoute } from '../agents/safetyAgent';
import {
  BASE_COORD,
  SURVIVOR_COORD,
  createDisasterMap,
  gridToWorld,
  worldToGrid,
  type DisasterMapData,
} from '../shared/disasterMap';
import type {
  AgentActor,
  AgentEvent,
  AgentEventCategory,
  GridCoord,
  MissionPhase,
  MissionPlan,
  MissionScoreBreakdown,
  MissionTask,
  RobotStateSnapshot,
  SensorReading,
} from '../shared/types';
import { sampleRobotSensors } from './sensors';

export interface EngineCallbacks {
  onEvent?: (event: AgentEvent) => void;
  onSoundCue?: (cue: 'scan' | 'safety_alert' | 'survivor_found' | 'footstep') => void;
}

export class MissionSimulationEngine {
  public mapData: DisasterMapData;
  public beliefGrid: DisasterMapData['initialBeliefGrid'];
  public phase: MissionPhase = 'standby';
  public plan: MissionPlan | null = null;
  public activeTaskIndex = -1;
  public activeWaypoints: GridCoord[] = [];
  public waypointCursor = 0;

  public robotPos = { x: 0, y: 0, z: 0 };
  public headingRad = Math.PI / 2; // Facing east (+X)
  public speedMps = 0;
  public turnRateRad = 0;
  public batteryPct = 100;
  public locomotionState: RobotStateSnapshot['locomotionState'] = 'docked';

  public elapsedSec = 0;
  public collisionCount = 0;
  public replanCount = 0;
  public safetyRejections = 0;
  public distanceTraveledM = 0;
  public enteredHazard = false;
  public survivorFound = false;
  public returnedSafely = false;
  public lastScore: MissionScoreBreakdown | null = null;

  public events: AgentEvent[] = [];
  public latestSensors: SensorReading;

  private scanTimerSec = 0;
  private lowBatteryTriggered = false;
  private eventSeq = 1;
  private callbacks: EngineCallbacks;

  constructor(callbacks: EngineCallbacks = {}) {
    this.callbacks = callbacks;
    this.mapData = createDisasterMap();
    this.beliefGrid = this.mapData.initialBeliefGrid.map((r) => [...r]);
    const startW = gridToWorld(BASE_COORD);
    this.robotPos = { x: startW.x, y: 0, z: startW.z };

    this.latestSensors = sampleRobotSensors(
      this.robotPos.x,
      this.robotPos.z,
      this.headingRad,
      this.mapData.groundTruthGrid,
      this.beliefGrid,
      this.mapData.electricalHazardCells,
      this.mapData.unstableZoneCells
    ).reading;
  }

  public reset() {
    this.mapData = createDisasterMap();
    this.beliefGrid = this.mapData.initialBeliefGrid.map((r) => [...r]);
    const startW = gridToWorld(BASE_COORD);
    this.robotPos = { x: startW.x, y: 0, z: startW.z };
    this.headingRad = Math.PI / 2;
    this.speedMps = 0;
    this.turnRateRad = 0;
    this.batteryPct = 100;
    this.locomotionState = 'docked';
    this.phase = 'standby';
    this.plan = null;
    this.activeTaskIndex = -1;
    this.activeWaypoints = [];
    this.waypointCursor = 0;
    this.elapsedSec = 0;
    this.collisionCount = 0;
    this.replanCount = 0;
    this.safetyRejections = 0;
    this.distanceTraveledM = 0;
    this.enteredHazard = false;
    this.survivorFound = false;
    this.returnedSafely = false;
    this.lastScore = null;
    this.scanTimerSec = 0;
    this.lowBatteryTriggered = false;
    this.events = [];

    this.latestSensors = sampleRobotSensors(
      this.robotPos.x,
      this.robotPos.z,
      this.headingRad,
      this.mapData.groundTruthGrid,
      this.beliefGrid,
      this.mapData.electricalHazardCells,
      this.mapData.unstableZoneCells
    ).reading;
  }

  public startMission(plan: MissionPlan) {
    // Allow launching fresh mission from standby/completed/aborted/failed or overriding active mission
    if (this.phase === 'completed' || this.phase === 'aborted' || this.phase === 'failed') {
      this.reset();
    }

    this.plan = {
      ...plan,
      objectives: plan.objectives.map((o) => ({ ...o, status: 'pending' })),
    };
    this.phase = 'executing';
    this.activeTaskIndex = -1;
    this.activeWaypoints = [];
    this.waypointCursor = 0;

    this.emit(
      'COMMANDER',
      'mission_status',
      `Mission received (${plan.provider === 'gemini' ? 'Gemini AI' : 'Deterministic Core'}): "${plan.original_instruction}"`,
      { mission_id: plan.mission_id, objectiveCount: plan.objectives.length }
    );

    this.advanceToNextTask();
  }

  public startFromInstruction(instruction: string, missionId = `mission_${Date.now()}`) {
    const plan = parseInstructionDeterministic(instruction, missionId);
    this.startMission(plan);
    return plan;
  }

  public pause() {
    if (this.phase === 'executing' || this.phase === 'returning') {
      this.phase = 'paused';
      this.speedMps = 0;
      this.locomotionState = 'stopped';
      this.emit('COMMANDER', 'mission_status', 'Mission paused by human operator.');
    }
  }

  public resume() {
    if (this.phase === 'paused') {
      this.phase = 'executing';
      this.emit('COMMANDER', 'mission_status', 'Mission resumed.');
    }
  }

  public emergencyStop() {
    this.speedMps = 0;
    this.turnRateRad = 0;
    this.locomotionState = 'emergency_stop';
    this.phase = 'paused';
    this.callbacks.onSoundCue?.('safety_alert');
    this.emit('SAFETY', 'safety_rejection', 'Manual Emergency Stop triggered. All actuators halted.');
  }

  public triggerReturnToBaseOverride() {
    if (!this.plan) {
      this.startFromInstruction('Return to base');
      return;
    }
    this.emit('COMMANDER', 'decision', 'Operator override: Redirecting robot immediately to Base.');
    const returnTask: MissionTask = {
      id: `${this.plan.mission_id}_override_rtb_${Date.now()}`,
      mission_id: this.plan.mission_id,
      robot_id: 'robot_001',
      task: 'return_to_base',
      label: 'Operator Override: Return to Base',
      sector: 'base_bay',
      target: { ...BASE_COORD },
      priority: 'critical',
      status: 'pending',
      rationale: 'Human operator commanded immediate return to charging base.',
    };
    this.plan.objectives = [
      ...this.plan.objectives.slice(0, Math.max(0, this.activeTaskIndex + 1)),
      returnTask,
    ];
    this.activeTaskIndex = this.plan.objectives.length - 2;
    this.phase = 'returning';
    this.advanceToNextTask();
  }

  public abortMission() {
    this.speedMps = 0;
    this.turnRateRad = 0;
    this.locomotionState = 'stopped';
    this.phase = 'aborted';
    this.finalizeScore(false);
    this.emit('COMMANDER', 'mission_status', 'Mission aborted by operator.');
  }

  public step(rawDt: number) {
    const dt = Math.min(0.08, Math.max(0.001, rawDt));

    if (this.phase !== 'executing' && this.phase !== 'returning') {
      return;
    }

    this.elapsedSec += dt;

    // 1. Sample sensors from ground truth (strictly decoupled from AI map until observed)
    const sensorStep = sampleRobotSensors(
      this.robotPos.x,
      this.robotPos.z,
      this.headingRad,
      this.mapData.groundTruthGrid,
      this.beliefGrid,
      this.mapData.electricalHazardCells,
      this.mapData.unstableZoneCells
    );
    this.latestSensors = sensorStep.reading;

    // 2. Check for survivor discovery via optical/thermal perception
    if (sensorStep.reading.survivorSignal.detected && !this.survivorFound) {
      this.survivorFound = true;
      this.callbacks.onSoundCue?.('survivor_found');
      this.emit(
        'PERCEPTION',
        'sensor',
        `Survivor detected at (${SURVIVOR_COORD.x}, ${SURVIVOR_COORD.z}) — confidence ${sensorStep.reading.survivorSignal.confidence}%.`,
        {
          confidence: sensorStep.reading.survivorSignal.confidence,
          coords: SURVIVOR_COORD,
        }
      );

      // Update Commander objective if currently searching
      const currTask = this.getActiveTask();
      if (currTask && (currTask.task === 'explore_sector' || currTask.task === 'search_area')) {
        currTask.status = 'completed';
        this.emit(
          'COMMANDER',
          'decision',
          'Survivor coordinates logged. Advancing to verification & safe extraction.'
        );
        this.advanceToNextTask();
        return;
      }
    }

    // 3. Check if LiDAR newly discovered collapsed debris blocking current route!
    if (sensorStep.newlyDiscoveredBlockages.length > 0) {
      const blockedOnRoute = this.isAnyCellNearActiveRoute(sensorStep.newlyDiscoveredBlockages);
      if (blockedOnRoute) {
        this.replanCount += 1;
        this.speedMps = 0;
        const first = sensorStep.newlyDiscoveredBlockages[0];
        this.emit(
          'PERCEPTION',
          'sensor',
          `Depth LiDAR detected previously unmapped collapsed debris at (${first.x}, ${first.z}).`
        );
        this.emit(
          'NAVIGATION',
          'navigation',
          `Primary corridor blocked at (${first.x}, ${first.z}). Recalculating alternate A* route.`
        );
        this.callbacks.onSoundCue?.('scan');
        this.planCurrentTaskRoute(true);
        return;
      }
    }

    // 4. Deterministic Live Safety Monitoring
    const currentGrid = worldToGrid(this.robotPos.x, this.robotPos.z);
    const activeTask = this.getActiveTask();
    const isReturning = activeTask?.task === 'return_to_base' || this.phase === 'returning';

    const liveSafety = evaluateLiveSensorSafety(
      sensorStep.reading,
      this.batteryPct,
      isReturning,
      currentGrid
    );

    if (!liveSafety.approved) {
      if (liveSafety.recommendedAction === 'return_to_base' && !this.lowBatteryTriggered) {
        this.lowBatteryTriggered = true;
        this.safetyRejections += 1;
        this.callbacks.onSoundCue?.('safety_alert');
        this.emit('SAFETY', 'safety_rejection', liveSafety.reasons.join(' '));
        this.triggerReturnToBaseOverride();
        return;
      }

      if (liveSafety.recommendedAction === 'emergency_stop') {
        this.speedMps = 0;
        this.turnRateRad = 0;
        this.locomotionState = 'emergency_stop';
        this.callbacks.onSoundCue?.('safety_alert');
        this.emit('SAFETY', 'safety_rejection', liveSafety.reasons.join(' '));

        // Attempt automatic safe replan if not at dead end
        if (activeTask && activeTask.task !== 'scan_surroundings') {
          this.replanCount += 1;
          this.planCurrentTaskRoute(true);
        } else {
          this.phase = 'paused';
        }
        return;
      }
    }

    // Track if robot somehow entered hazard cell
    const gtCell = this.mapData.groundTruthGrid[currentGrid.z][currentGrid.x];
    if (gtCell === 'electrical_hazard' || gtCell === 'unstable_zone') {
      this.enteredHazard = true;
    }

    // 5. Execute active task (Scan vs Navigate)
    if (!activeTask) {
      this.completeMission();
      return;
    }

    if (activeTask.task === 'scan_surroundings') {
      this.locomotionState = 'scanning';
      this.speedMps = 0;
      this.turnRateRad = 0.8;
      this.batteryPct = Math.max(0, this.batteryPct - dt * 0.45);
      this.scanTimerSec -= dt;
      if (this.scanTimerSec <= 0) {
        activeTask.status = 'completed';
        this.emit('ROBOT', 'decision', `Completed sensor sweep: ${activeTask.label}.`);
        this.advanceToNextTask();
      }
      return;
    }

    // Follow waypoints
    if (this.waypointCursor >= this.activeWaypoints.length) {
      activeTask.status = 'completed';
      this.emit('ROBOT', 'decision', `Reached target for objective: ${activeTask.label}.`);
      this.advanceToNextTask();
      return;
    }

    const wpGrid = this.activeWaypoints[this.waypointCursor];
    const wpWorld = gridToWorld(wpGrid);
    const dx = wpWorld.x - this.robotPos.x;
    const dz = wpWorld.z - this.robotPos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.24) {
      this.waypointCursor += 1;
      if (this.waypointCursor >= this.activeWaypoints.length) {
        activeTask.status = 'completed';
        this.speedMps = 0;
        this.emit('ROBOT', 'decision', `Arrived at (${wpGrid.x}, ${wpGrid.z}) — ${activeTask.label}.`);
        this.advanceToNextTask();
      }
      return;
    }

    // Smooth steering + quadruped forward locomotion
    const targetHeading = Math.atan2(dx, dz);
    const headingError = normalizeAngle(targetHeading - this.headingRad);
    const maxTurnSpeed = 3.2; // rad/s
    const turnStep = Math.max(-maxTurnSpeed * dt, Math.min(maxTurnSpeed * dt, headingError * 4.5 * dt));
    this.headingRad = normalizeAngle(this.headingRad + turnStep);
    this.turnRateRad = turnStep / dt;

    const alignFactor = Math.max(0.2, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
    const baseSpeed = 2.05; // m/s
    this.speedMps = baseSpeed * alignFactor;
    this.locomotionState = Math.abs(headingError) > 0.45 ? 'turning' : 'walking';

    const stepDist = Math.min(dist, this.speedMps * dt);
    const nextX = this.robotPos.x + Math.sin(this.headingRad) * stepDist;
    const nextZ = this.robotPos.z + Math.cos(this.headingRad) * stepDist;

    // Ground-truth collision check
    const nextGrid = worldToGrid(nextX, nextZ);
    const nextGtCell = this.mapData.groundTruthGrid[nextGrid.z][nextGrid.x];
    if (
      nextGtCell === 'wall' ||
      nextGtCell === 'rubble' ||
      nextGtCell === 'collapsed_passage' ||
      nextGtCell === 'staircase'
    ) {
      this.collisionCount += 1;
      this.beliefGrid[nextGrid.z][nextGrid.x] = nextGtCell;
      this.replanCount += 1;
      this.speedMps = 0;
      this.emit(
        'SAFETY',
        'navigation',
        `Physical contact prevented at (${nextGrid.x}, ${nextGrid.z}). Triggering A* replan.`
      );
      this.planCurrentTaskRoute(true);
      return;
    }

    this.robotPos.x = nextX;
    this.robotPos.z = nextZ;
    this.distanceTraveledM += stepDist;
    this.batteryPct = Math.max(0, this.batteryPct - stepDist * 0.48 - dt * 0.12);
    this.callbacks.onSoundCue?.('footstep');
  }

  public getActiveTask(): MissionTask | null {
    if (!this.plan || this.activeTaskIndex < 0 || this.activeTaskIndex >= this.plan.objectives.length) {
      return null;
    }
    return this.plan.objectives[this.activeTaskIndex];
  }

  public getSnapshot(): RobotStateSnapshot {
    const activeTask = this.getActiveTask();
    return {
      robot_id: 'robot_001',
      position: { ...this.robotPos },
      gridPos: worldToGrid(this.robotPos.x, this.robotPos.z),
      headingRad: this.headingRad,
      speedMps: Number(this.speedMps.toFixed(2)),
      batteryPct: Number(this.batteryPct.toFixed(1)),
      locomotionState: this.locomotionState,
      currentTaskLabel: activeTask ? activeTask.label : 'Standby at Launch Bay',
      collisionCount: this.collisionCount,
      replanCount: this.replanCount,
      safetyRejections: this.safetyRejections,
      distanceTraveledM: Number(this.distanceTraveledM.toFixed(2)),
    };
  }

  private advanceToNextTask() {
    if (!this.plan) return;
    this.activeTaskIndex += 1;

    if (this.activeTaskIndex >= this.plan.objectives.length) {
      this.completeMission();
      return;
    }

    const task = this.plan.objectives[this.activeTaskIndex];
    task.status = 'active';

    if (task.task === 'return_to_base') {
      this.phase = 'returning';
    }

    this.emit('COMMANDER', 'decision', `Activating objective: ${task.label}`, {
      task_id: task.id,
      target: task.target,
    });

    if (task.task === 'scan_surroundings') {
      this.scanTimerSec = 2.0;
      this.activeWaypoints = [];
      this.waypointCursor = 0;
      this.callbacks.onSoundCue?.('scan');
      this.emit('ROBOT', 'sensor', 'Initiating 360° optical and LiDAR scan.');
      return;
    }

    this.planCurrentTaskRoute(false);
  }

  private planCurrentTaskRoute(isReplan: boolean) {
    const task = this.getActiveTask();
    if (!task || !this.plan) return;

    const currentGrid = worldToGrid(this.robotPos.x, this.robotPos.z);

    // Avoid zones requested by player
    const avoidCells = new Set<string>();
    if (this.plan.avoid_zones.includes('unstable_zone')) {
      for (const c of this.mapData.unstableZoneCells) {
        avoidCells.add(`${c.x},${c.z}`);
      }
    }

    // If Commander passed force_unsafe_override, Navigation calculates the direct route through hazard
    // so the independent Safety Agent can inspect and deterministically reject it!
    let route = calculateAStarPath(this.beliefGrid, currentGrid, task.target, {
      allowHazardTraversal: this.plan.force_unsafe_override,
      avoidCells,
    });

    // If a non-override target cell itself turned out to be collapsed debris, snap to nearest reachable neighbor
    if (!route.valid && !this.plan.force_unsafe_override) {
      const candidates = [
        { x: 16, z: 5 },
        { x: 19, z: 5 },
        { x: 20, z: 5 },
        { x: task.target.x + 2, z: task.target.z },
        { x: task.target.x - 2, z: task.target.z },
      ];
      for (const alt of candidates) {
        const altRoute = calculateAStarPath(this.beliefGrid, currentGrid, alt, { avoidCells });
        if (altRoute.valid) {
          task.target = alt;
          route = altRoute;
          break;
        }
      }
    }

    this.emit(
      'NAVIGATION',
      'navigation',
      route.valid
        ? `${isReplan ? 'Replanned' : 'Calculated'} A* route to (${task.target.x}, ${task.target.z}): ${route.waypoints.length} waypoints (${route.distanceMeters.toFixed(1)}m).`
        : `Pathfinding failed: ${route.reason}`,
      { waypoints: route.waypoints, distanceMeters: route.distanceMeters }
    );

    // Deterministic Safety Check
    const safety = evaluateProposedRoute(task, route, {
      beliefGrid: this.beliefGrid,
      currentPos: currentGrid,
      batteryPct: this.batteryPct,
      avoidZones: this.plan.avoid_zones,
      forceUnsafeOverride: this.plan.force_unsafe_override,
    });

    if (!safety.approved) {
      this.safetyRejections += 1;
      task.status = 'rejected';
      this.speedMps = 0;
      this.locomotionState = 'stopped';
      this.activeWaypoints = [];
      this.callbacks.onSoundCue?.('safety_alert');

      this.emit(
        'SAFETY',
        'safety_rejection',
        `Route REJECTED [${safety.violatedRules.join(', ')}]: ${safety.reasons.join(' ')}`,
        { violatedRules: safety.violatedRules }
      );

      if (safety.recommendedAction === 'return_to_base') {
        this.triggerReturnToBaseOverride();
      } else {
        // Reject unsafe mission objective and hold safely
        this.phase = 'paused';
        this.emit(
          'COMMANDER',
          'decision',
          'Safety Agent vetoed proposed objective. Awaiting safe commander instruction.'
        );
      }
      return;
    }

    this.emit('SAFETY', 'decision', `Route approved (${safety.riskLevel}): ${safety.reasons[0]}`);
    this.activeWaypoints = route.waypoints;
    this.waypointCursor = route.waypoints.length > 1 ? 1 : 0;

    const sectorLabel = task.sector ? task.sector.replace('_', ' ') : 'target coordinates';
    this.emit('ROBOT', 'navigation', `Moving toward ${sectorLabel} (${task.target.x}, ${task.target.z}).`);
  }

  private completeMission() {
    this.speedMps = 0;
    this.turnRateRad = 0;
    const finalGrid = worldToGrid(this.robotPos.x, this.robotPos.z);
    const atBase = Math.hypot(finalGrid.x - BASE_COORD.x, finalGrid.z - BASE_COORD.z) <= 1.6;
    this.returnedSafely = atBase;
    this.locomotionState = atBase ? 'docked' : 'idle';
    this.phase = 'completed';

    this.finalizeScore(true);
    this.emit(
      'COMMANDER',
      'mission_status',
      `Mission complete. Score: ${this.lastScore?.totalScore ?? 0}/1000 (Grade ${this.lastScore?.grade ?? 'B'}).`,
      { score: this.lastScore }
    );
  }

  private finalizeScore(completed: boolean) {
    this.lastScore = calculateMissionScore({
      missionCompleted: completed,
      survivorFound: this.survivorFound,
      returnedSafely: this.returnedSafely,
      elapsedSec: this.elapsedSec,
      batteryRemainingPct: this.batteryPct,
      collisionCount: this.collisionCount,
      replanCount: this.replanCount,
      safetyRejections: this.safetyRejections,
      enteredHazard: this.enteredHazard,
    });
  }

  private isAnyCellNearActiveRoute(cells: GridCoord[]): boolean {
    if (this.activeWaypoints.length === 0) return false;
    for (let i = Math.max(0, this.waypointCursor - 1); i < this.activeWaypoints.length - 1; i++) {
      const a = this.activeWaypoints[i];
      const b = this.activeWaypoints[i + 1];
      const minX = Math.min(a.x, b.x) - 1;
      const maxX = Math.max(a.x, b.x) + 1;
      const minZ = Math.min(a.z, b.z) - 1;
      const maxZ = Math.max(a.z, b.z) + 1;
      for (const c of cells) {
        if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ) {
          return true;
        }
      }
    }
    return false;
  }

  private emit(
    actor: AgentActor,
    category: AgentEventCategory,
    message: string,
    details?: Record<string, unknown>
  ) {
    const ev: AgentEvent = {
      id: `${this.plan?.mission_id ?? 'standby'}_ev_${this.eventSeq++}`,
      mission_id: this.plan?.mission_id ?? 'standby',
      timestamp: new Date().toISOString(),
      elapsedSec: Number(this.elapsedSec.toFixed(1)),
      actor,
      category,
      message,
      details,
    };
    this.events.push(ev);
    this.callbacks.onEvent?.(ev);
  }
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
