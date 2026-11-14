import { calculateMissionScore, parseInstructionDeterministic } from '../agents/commanderParser';
import { coordinateFleetAssignments } from '../agents/fleetCoordinator';
import { calculateAStarPath } from '../agents/navigationAgent';
import { evaluateLiveSensorSafety, evaluateProposedRoute } from '../agents/safetyAgent';
import {
  BASE_COORD,
  isCellHazard,
  isCellHighBarrier,
  isCellSolidObstacle,
  isCellWater,
  gridToWorld,
  worldToGrid,
} from '../shared/disasterMap';
import { ROBOT_CATALOG, computeEffectiveRobotStats } from '../shared/gameCatalog';
import { createRegionWorldMap, type RegionWorldMap } from '../shared/meridianWorldMaps';
import type {
  AgentActor,
  AgentEvent,
  AgentEventCategory,
  ControlMode,
  EffectiveRobotStats,
  GridCoord,
  MissionDifficultyModifiers,
  MissionPhase,
  MissionPlan,
  MissionScoreBreakdown,
  MissionTask,
  OwnedRobotState,
  RegionId,
  RobotModelId,
  RobotStateSnapshot,
  SensorReading,
  TimeOfDay,
  WeatherType,
} from '../shared/types';
import { sampleRobotSensors } from './sensors';

export interface EngineCallbacks {
  onEvent?: (event: AgentEvent) => void;
  onSoundCue?: (cue: 'scan' | 'safety_alert' | 'survivor_found' | 'footstep') => void;
}

export interface EnvironmentConfig {
  regionId?: RegionId;
  weather?: WeatherType;
  timeOfDay?: TimeOfDay;
  deployedRobots?: OwnedRobotState[];
  missionModifiers?: MissionDifficultyModifiers;
}

export interface RobotUnitRuntime {
  robot_id: string;
  model_id: RobotModelId;
  name: string;
  hullColor: string;
  stats: EffectiveRobotStats;
  pos: { x: number; y: number; z: number };
  headingRad: number;
  speedMps: number;
  turnRateRad: number;
  batteryPct: number;
  integrityPct: number;
  locomotionState: RobotStateSnapshot['locomotionState'];
  taskQueue: MissionTask[];
  activeTaskIdx: number;
  activeWaypoints: GridCoord[];
  waypointCursor: number;
  scanTimerSec: number;
  lowBatteryTriggered: boolean;
  latestSensors: SensorReading;
  collisionCount: number;
  replanCount: number;
  safetyRejections: number;
  distanceTraveledM: number;
}

export class MissionSimulationEngine {
  public regionId: RegionId = 'industrial_district';
  public weather: WeatherType = 'cloudy';
  public timeOfDay: TimeOfDay = 'day';
  public mapData: RegionWorldMap;
  public beliefGrid: RegionWorldMap['initialBeliefGrid'];
  public phase: MissionPhase = 'standby';
  public plan: MissionPlan | null = null;

  public units: RobotUnitRuntime[] = [];
  public selectedUnitIndex = 0;

  // Legacy-mirrored Slot 1 properties for 100% compatibility with RELAY 1.0 API & tests
  public activeTaskIndex = -1;
  public activeWaypoints: GridCoord[] = [];
  public waypointCursor = 0;
  public robotPos = { x: 0, y: 0, z: 0 };
  public headingRad = Math.PI / 2;
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
  public relayRestored = false;
  public medicalDelivered = false;
  public hazmatScanned = false;
  public lastScore: MissionScoreBreakdown | null = null;

  public events: AgentEvent[] = [];
  public latestSensors!: SensorReading;

  public manualInput = { forward: 0, turn: 0 };
  public controlMode: ControlMode = 'auto';
  public missionModifiers: MissionDifficultyModifiers | null = null;

  private deployedSpecs: OwnedRobotState[] = [];
  private eventSeq = 1;
  private callbacks: EngineCallbacks;

  constructor(callbacks: EngineCallbacks = {}, initialEnv: EnvironmentConfig = {}) {
    this.callbacks = callbacks;
    this.regionId = initialEnv.regionId ?? 'industrial_district';
    this.weather = initialEnv.weather ?? 'clear';
    this.timeOfDay = initialEnv.timeOfDay ?? 'day';
    this.deployedSpecs = initialEnv.deployedRobots ?? [];
    this.missionModifiers = initialEnv.missionModifiers ?? null;
    this.mapData = createRegionWorldMap(this.regionId, this.missionModifiers ?? undefined);
    this.beliefGrid = this.mapData.initialBeliefGrid.map((r) => [...r]);
    this.initUnits();
  }

  public configureEnvironment(config: EnvironmentConfig) {
    if (config.regionId) this.regionId = config.regionId;
    if (config.weather) this.weather = config.weather;
    if (config.timeOfDay) this.timeOfDay = config.timeOfDay;
    if (config.deployedRobots) this.deployedSpecs = config.deployedRobots;
    this.missionModifiers = config.missionModifiers ?? null;
    this.reset();
  }

  public setWeather(weather: WeatherType) {
    this.weather = weather;
    for (let i = 0; i < this.units.length; i++) {
      const spec = this.deployedSpecs[i];
      this.units[i].stats = computeEffectiveRobotStats(this.units[i].model_id, spec, weather);
    }
  }

  public setTimeOfDay(timeOfDay: TimeOfDay) {
    this.timeOfDay = timeOfDay;
  }

  public setSelectedUnit(index: number) {
    if (index >= 0 && index < this.units.length) {
      this.selectedUnitIndex = index;
    }
  }

  public setControlMode(mode: ControlMode) {
    if (this.controlMode === mode) return;
    this.controlMode = mode;
    this.manualInput = { forward: 0, turn: 0 };
    if (mode === 'manual') {
      const activeUnit = this.units[this.selectedUnitIndex] ?? this.units[0];
      if (activeUnit) {
        activeUnit.speedMps = 0;
        activeUnit.turnRateRad = 0;
        activeUnit.locomotionState = activeUnit.stats.capabilities.aerial ? 'hovering' : 'idle';
      }
      this.emit('ROBOT', 'decision', 'Remote Control engaged: use W/A/S/D or Arrow keys to steer active unit.');
    } else {
      this.emit('COMMANDER', 'decision', 'Automatic AI control restored.');
      const activeUnit = this.units[this.selectedUnitIndex] ?? this.units[0];
      if (activeUnit && this.plan && (this.phase === 'executing' || this.phase === 'returning')) {
        this.planUnitTaskRoute(activeUnit, true);
      }
    }
    this.syncPrimaryMirrors();
  }

  public setManualInput(forward: number, turn: number) {
    this.manualInput = {
      forward: Math.max(-1, Math.min(1, forward)),
      turn: Math.max(-1, Math.min(1, turn)),
    };
  }

  private initUnits() {
    this.units = [];
    const activeSpecs: OwnedRobotState[] =
      this.deployedSpecs.length > 0
        ? this.deployedSpecs.slice(0, 2)
        : [
            {
              robot_id: 'relay_01',
              custom_name: 'RELAY-01',
              hull_color: ROBOT_CATALOG.relay_01.primaryColor,
              integrity_pct: 100,
              upgrades: { battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 },
              equipped_modules: [],
              deployment_slot: 1,
              purchased_at: new Date().toISOString(),
            },
          ];

    activeSpecs.forEach((spec, idx) => {
      const spawnGrid: GridCoord =
        idx === 0
          ? { ...this.mapData.baseCoord }
          : { x: this.mapData.baseCoord.x, z: Math.min(18, this.mapData.baseCoord.z + 1) };
      const spawnWorld = gridToWorld(spawnGrid);
      const stats = computeEffectiveRobotStats(spec.robot_id, spec, this.weather);

      const initialSensors = sampleRobotSensors(
        spawnWorld.x,
        spawnWorld.z,
        Math.PI / 2,
        this.mapData.groundTruthGrid,
        this.beliefGrid,
        this.mapData.electricalHazardCells,
        this.mapData.unstableZoneCells,
        {
          chemicalHazardCells: this.mapData.chemicalHazardCells,
          floodCells: this.mapData.floodCells,
          survivorCoord: this.mapData.survivorCoord,
          lidarRangeM: stats.lidarRangeM,
          cameraRangeM: stats.cameraRangeM,
          aerial: stats.capabilities.aerial,
        }
      ).reading;

      this.units.push({
        robot_id: idx === 0 ? 'robot_001' : 'robot_002',
        model_id: spec.robot_id,
        name: spec.custom_name,
        hullColor: spec.hull_color,
        stats,
        pos: {
          x: spawnWorld.x,
          y: stats.capabilities.aerial ? 1.15 : 0,
          z: spawnWorld.z,
        },
        headingRad: Math.PI / 2,
        speedMps: 0,
        turnRateRad: 0,
        batteryPct: 100,
        integrityPct: spec.integrity_pct ?? 100,
        locomotionState: 'docked',
        taskQueue: [],
        activeTaskIdx: -1,
        activeWaypoints: [],
        waypointCursor: 0,
        scanTimerSec: 0,
        lowBatteryTriggered: false,
        latestSensors: initialSensors,
        collisionCount: 0,
        replanCount: 0,
        safetyRejections: 0,
        distanceTraveledM: 0,
      });
    });

    if (this.selectedUnitIndex >= this.units.length) {
      this.selectedUnitIndex = 0;
    }
    this.syncPrimaryMirrors();
  }

  private syncPrimaryMirrors() {
    const primary = this.units[0];
    if (!primary) return;
    this.robotPos = { ...primary.pos };
    this.headingRad = primary.headingRad;
    this.speedMps = primary.speedMps;
    this.turnRateRad = primary.turnRateRad;
    this.batteryPct = primary.batteryPct;
    this.locomotionState = primary.locomotionState;
    this.activeWaypoints = primary.activeWaypoints;
    this.waypointCursor = primary.waypointCursor;
    this.latestSensors = primary.latestSensors;
    this.activeTaskIndex = primary.activeTaskIdx;

    this.collisionCount = this.units.reduce((sum, u) => sum + u.collisionCount, 0);
    this.replanCount = this.units.reduce((sum, u) => sum + u.replanCount, 0);
    this.safetyRejections = this.units.reduce((sum, u) => sum + u.safetyRejections, 0);
    this.distanceTraveledM = this.units.reduce((sum, u) => sum + u.distanceTraveledM, 0);
  }

  public reset() {
    this.mapData = createRegionWorldMap(this.regionId, this.missionModifiers ?? undefined);
    this.beliefGrid = this.mapData.initialBeliefGrid.map((r) => [...r]);
    this.phase = 'standby';
    this.plan = null;
    this.elapsedSec = 0;
    this.collisionCount = 0;
    this.replanCount = 0;
    this.safetyRejections = 0;
    this.distanceTraveledM = 0;
    this.enteredHazard = false;
    this.survivorFound = false;
    this.returnedSafely = false;
    this.relayRestored = false;
    this.medicalDelivered = false;
    this.hazmatScanned = false;
    this.lastScore = null;
    this.events = [];
    this.manualInput = { forward: 0, turn: 0 };
    this.initUnits();
  }

  public startMission(plan: MissionPlan) {
    if (this.phase === 'completed' || this.phase === 'aborted' || this.phase === 'failed') {
      this.reset();
    }

    const baseObjectives: MissionTask[] = plan.objectives.map((o) => ({ ...o, status: 'pending' }));
    let coordinatedObjectives: MissionTask[] = baseObjectives;

    if (!plan.force_unsafe_override && this.units.length > 1) {
      const fleetRes = coordinateFleetAssignments(
        baseObjectives,
        this.units.map((u) => ({
          robot_id: u.robot_id,
          model_id: u.model_id,
          name: u.name,
          capabilities: u.stats.capabilities,
          batteryPct: u.batteryPct,
        }))
      );
      coordinatedObjectives = fleetRes.objectives;
      for (const fev of fleetRes.events) {
        this.emit('FLEET', 'fleet', fev.message, fev.details);
      }
    }

    this.plan = {
      ...plan,
      objectives: coordinatedObjectives,
    };
    this.phase = 'executing';

    this.emit(
      'COMMANDER',
      'mission_status',
      `Mission received (${plan.provider === 'gemini' ? 'Gemini AI' : 'Deterministic Core'}): "${plan.original_instruction}"`,
      { mission_id: plan.mission_id, objectiveCount: coordinatedObjectives.length }
    );

    for (const unit of this.units) {
      unit.taskQueue = coordinatedObjectives.filter((o) => o.robot_id === unit.robot_id);
      unit.activeTaskIdx = -1;
      unit.activeWaypoints = [];
      unit.waypointCursor = 0;
      if (unit.taskQueue.length > 0) {
        this.advanceUnitToNextTask(unit);
      } else {
        unit.locomotionState = 'idle';
      }
    }
    this.syncPrimaryMirrors();
  }

  public startFromInstruction(instruction: string, missionId = `mission_${Date.now()}`) {
    const plan = parseInstructionDeterministic(instruction, missionId, 'robot_001', {
      regionId: this.regionId,
      baseCoord: this.mapData.baseCoord,
      survivorCoord: this.mapData.survivorCoord,
      relayCoord: this.mapData.relayCoord,
      medicalCoord: this.mapData.medicalCoord,
      chemicalCoord: this.mapData.chemicalHazardCells[0],
    });
    this.startMission(plan);
    return plan;
  }

  public pause() {
    if (this.phase === 'executing' || this.phase === 'returning') {
      this.phase = 'paused';
      for (const u of this.units) {
        u.speedMps = 0;
        u.locomotionState = 'stopped';
      }
      this.syncPrimaryMirrors();
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
    for (const u of this.units) {
      u.speedMps = 0;
      u.turnRateRad = 0;
      u.locomotionState = 'emergency_stop';
    }
    this.phase = 'paused';
    this.syncPrimaryMirrors();
    this.callbacks.onSoundCue?.('safety_alert');
    this.emit('SAFETY', 'safety_rejection', 'Manual Emergency Stop triggered. All actuators halted.');
  }

  public triggerReturnToBaseOverride(unitIndex?: number) {
    if (!this.plan) {
      this.startFromInstruction('Return to base');
      return;
    }
    const targets = unitIndex !== undefined ? [this.units[unitIndex]].filter(Boolean) : this.units;
    this.emit('COMMANDER', 'decision', 'Operator override: Redirecting unit(s) immediately to Base.');
    for (const unit of targets) {
      const returnTask: MissionTask = {
        id: `${this.plan.mission_id}_override_rtb_${unit.robot_id}_${Date.now()}`,
        mission_id: this.plan.mission_id,
        robot_id: unit.robot_id,
        task: 'return_to_base',
        label: `${unit.name}: Operator Override Return to Base`,
        sector: 'base_bay',
        target: { ...this.mapData.baseCoord },
        priority: 'critical',
        status: 'pending',
        rationale: 'Human operator commanded immediate return to charging base.',
      };
      unit.taskQueue = [...unit.taskQueue.slice(0, Math.max(0, unit.activeTaskIdx + 1)), returnTask];
      unit.activeTaskIdx = unit.taskQueue.length - 2;
      this.phase = 'returning';
      this.advanceUnitToNextTask(unit);
    }
    this.syncPrimaryMirrors();
  }

  public abortMission() {
    for (const u of this.units) {
      u.speedMps = 0;
      u.turnRateRad = 0;
      u.locomotionState = 'stopped';
    }
    this.phase = 'aborted';
    this.syncPrimaryMirrors();
    this.finalizeScore(false);
    this.emit('COMMANDER', 'mission_status', 'Mission aborted by operator.');
  }

  public step(rawDt: number) {
    const dt = Math.min(0.08, Math.max(0.001, rawDt));

    if (this.controlMode === 'manual') {
      const activeUnit = this.units[this.selectedUnitIndex] ?? this.units[0];
      if (this.phase === 'executing' || this.phase === 'returning') {
        this.elapsedSec += dt;
      }
      if (activeUnit && this.phase !== 'completed' && this.phase !== 'aborted' && this.phase !== 'failed') {
        this.stepManualExploration(activeUnit, dt);
        this.syncPrimaryMirrors();
      }
      return;
    }

    if (this.phase !== 'executing' && this.phase !== 'returning') {
      return;
    }

    this.elapsedSec += dt;

    for (const unit of this.units) {
      this.stepUnitAutonomous(unit, dt);
      if ((this.phase as MissionPhase) !== 'executing' && (this.phase as MissionPhase) !== 'returning') {
        break;
      }
    }

    // Check if all units finished their task queues
    if (this.phase === 'executing' || this.phase === 'returning') {
      const allDone = this.units.every(
        (u) => u.taskQueue.length === 0 || u.activeTaskIdx >= u.taskQueue.length
      );
      if (allDone) {
        this.completeMission();
      }
    }

    this.syncPrimaryMirrors();
  }

  private stepManualExploration(unit: RobotUnitRuntime, dt: number) {
    const drainScale = this.missionModifiers?.batteryDrainMult ?? 1.0;
    const hasInput =
      Math.abs(this.manualInput.forward) > 0.05 || Math.abs(this.manualInput.turn) > 0.05;

    if (hasInput) {
      unit.headingRad = normalizeAngle(unit.headingRad - this.manualInput.turn * 2.7 * dt);
      unit.turnRateRad = -this.manualInput.turn * 2.7;
    } else {
      unit.turnRateRad = 0;
    }

    const speed = unit.stats.speedMps * this.manualInput.forward;
    const stepDist = speed * dt;
    const nextX = unit.pos.x + Math.sin(unit.headingRad) * stepDist;
    const nextZ = unit.pos.z + Math.cos(unit.headingRad) * stepDist;
    const nextGrid = worldToGrid(nextX, nextZ);
    const cell = this.mapData.groundTruthGrid[nextGrid.z][nextGrid.x];

    const sensorStep = sampleRobotSensors(
      unit.pos.x,
      unit.pos.z,
      unit.headingRad,
      this.mapData.groundTruthGrid,
      this.beliefGrid,
      this.mapData.electricalHazardCells,
      this.mapData.unstableZoneCells,
      {
        chemicalHazardCells: this.mapData.chemicalHazardCells,
        floodCells: this.mapData.floodCells,
        survivorCoord: this.mapData.survivorCoord,
        lidarRangeM: unit.stats.lidarRangeM,
        cameraRangeM: unit.stats.cameraRangeM,
        aerial: unit.stats.capabilities.aerial,
      }
    );
    unit.latestSensors = sensorStep.reading;

    if (sensorStep.reading.survivorSignal.detected && !this.survivorFound) {
      this.survivorFound = true;
      this.callbacks.onSoundCue?.('survivor_found');
      this.emit(
        'PERCEPTION',
        'sensor',
        `Survivor detected at (${this.mapData.survivorCoord.x}, ${this.mapData.survivorCoord.z}) under Remote Control!`
      );
    }

    const curGrid = worldToGrid(unit.pos.x, unit.pos.z);
    if (
      this.mapData.relayCoord &&
      !this.relayRestored &&
      Math.hypot(curGrid.x - this.mapData.relayCoord.x, curGrid.z - this.mapData.relayCoord.z) <= 1.2
    ) {
      this.relayRestored = true;
      this.callbacks.onSoundCue?.('scan');
      this.emit('ROBOT', 'decision', `${unit.name} restored relay node under Remote Control.`);
    }
    if (
      this.mapData.medicalCoord &&
      !this.medicalDelivered &&
      Math.hypot(curGrid.x - this.mapData.medicalCoord.x, curGrid.z - this.mapData.medicalCoord.z) <= 1.2
    ) {
      this.medicalDelivered = true;
      this.callbacks.onSoundCue?.('survivor_found');
      this.emit('ROBOT', 'decision', `${unit.name} delivered medical cargo under Remote Control.`);
    }

    if (!hasInput) {
      unit.speedMps = 0;
      unit.locomotionState = unit.stats.capabilities.aerial ? 'hovering' : 'idle';
      return;
    }

    const blockedBySolid =
      isCellHighBarrier(cell) ||
      (isCellSolidObstacle(cell) &&
        !unit.stats.capabilities.aerial &&
        !(unit.stats.capabilities.heavyLift && cell === 'rubble'));
    const blockedByWater =
      isCellWater(cell) && !unit.stats.capabilities.waterproof && !unit.stats.capabilities.aerial;
    const blockedByHazard =
      (isCellHazard(cell) &&
        !unit.stats.capabilities.aerial &&
        !(cell === 'chemical_hazard' && unit.stats.capabilities.hazmatShield));

    if (blockedBySolid || blockedByWater || blockedByHazard) {
      unit.speedMps = 0;
      unit.locomotionState = 'stopped';
      return;
    }

    unit.pos.x = nextX;
    unit.pos.z = nextZ;
    unit.speedMps = Math.abs(speed);
    unit.locomotionState = unit.stats.capabilities.aerial
      ? 'hovering'
      : cell === 'flood_water'
        ? 'swimming'
        : 'walking';
    unit.distanceTraveledM += Math.abs(stepDist);
    unit.batteryPct = Math.max(
      0,
      unit.batteryPct - Math.abs(stepDist) * 0.35 * unit.stats.batteryDrainMultiplier * drainScale
    );
    if (!unit.stats.capabilities.aerial && unit.speedMps > 0.2) {
      this.callbacks.onSoundCue?.('footstep');
    }
  }

  private stepUnitAutonomous(unit: RobotUnitRuntime, dt: number) {
    // 1. Sample sensors from ground truth
    const sensorStep = sampleRobotSensors(
      unit.pos.x,
      unit.pos.z,
      unit.headingRad,
      this.mapData.groundTruthGrid,
      this.beliefGrid,
      this.mapData.electricalHazardCells,
      this.mapData.unstableZoneCells,
      {
        chemicalHazardCells: this.mapData.chemicalHazardCells,
        floodCells: this.mapData.floodCells,
        survivorCoord: this.mapData.survivorCoord,
        lidarRangeM: unit.stats.lidarRangeM,
        cameraRangeM: unit.stats.cameraRangeM,
        aerial: unit.stats.capabilities.aerial,
      }
    );
    unit.latestSensors = sensorStep.reading;

    // 2. Survivor discovery check
    if (sensorStep.reading.survivorSignal.detected && !this.survivorFound) {
      this.survivorFound = true;
      this.callbacks.onSoundCue?.('survivor_found');
      this.emit(
        'PERCEPTION',
        'sensor',
        `Survivor detected at (${this.mapData.survivorCoord.x}, ${this.mapData.survivorCoord.z}) — confidence ${sensorStep.reading.survivorSignal.confidence}%.`,
        {
          robot_id: unit.robot_id,
          confidence: sensorStep.reading.survivorSignal.confidence,
          coords: this.mapData.survivorCoord,
        }
      );

      const currTask = this.getUnitActiveTask(unit);
      if (currTask && (currTask.task === 'explore_sector' || currTask.task === 'search_area')) {
        currTask.status = 'completed';
        this.emit(
          'COMMANDER',
          'decision',
          'Survivor coordinates logged. Advancing to verification & safe extraction.'
        );
        this.advanceUnitToNextTask(unit);
        return;
      }
    }

    // 3. Check if LiDAR newly discovered collapsed debris blocking current route!
    if (sensorStep.newlyDiscoveredBlockages.length > 0 && !unit.stats.capabilities.aerial) {
      const blockedOnRoute = this.isAnyCellNearUnitRoute(unit, sensorStep.newlyDiscoveredBlockages);
      if (blockedOnRoute) {
        unit.replanCount += 1;
        unit.speedMps = 0;
        const first = sensorStep.newlyDiscoveredBlockages[0];
        this.emit(
          'PERCEPTION',
          'sensor',
          `${unit.name} depth LiDAR detected previously unmapped collapsed debris at (${first.x}, ${first.z}).`
        );
        this.emit(
          'NAVIGATION',
          'navigation',
          `Primary corridor blocked at (${first.x}, ${first.z}). Recalculating alternate A* route for ${unit.name}.`
        );
        this.callbacks.onSoundCue?.('scan');
        this.planUnitTaskRoute(unit, true);
        return;
      }
    }

    // 4. Deterministic Live Safety Monitoring
    const currentGrid = worldToGrid(unit.pos.x, unit.pos.z);
    const activeTask = this.getUnitActiveTask(unit);
    const isReturning = activeTask?.task === 'return_to_base' || this.phase === 'returning';

    const liveSafety = evaluateLiveSensorSafety(
      sensorStep.reading,
      unit.batteryPct,
      isReturning,
      currentGrid,
      unit.stats.capabilities,
      this.mapData.baseCoord
    );

    if (!liveSafety.approved) {
      if (liveSafety.recommendedAction === 'return_to_base' && !unit.lowBatteryTriggered) {
        unit.lowBatteryTriggered = true;
        unit.safetyRejections += 1;
        this.callbacks.onSoundCue?.('safety_alert');
        this.emit('SAFETY', 'safety_rejection', `[${unit.name}] ${liveSafety.reasons.join(' ')}`);
        this.triggerReturnToBaseOverride(this.units.indexOf(unit));
        return;
      }

      if (liveSafety.recommendedAction === 'emergency_stop') {
        unit.speedMps = 0;
        unit.turnRateRad = 0;
        unit.locomotionState = 'emergency_stop';
        this.callbacks.onSoundCue?.('safety_alert');
        this.emit('SAFETY', 'safety_rejection', `[${unit.name}] ${liveSafety.reasons.join(' ')}`);

        if (activeTask && activeTask.task !== 'scan_surroundings') {
          unit.replanCount += 1;
          this.planUnitTaskRoute(unit, true);
        } else {
          this.phase = 'paused';
        }
        return;
      }
    }

    // Track if robot entered unshielded hazard cell
    const gtCell = this.mapData.groundTruthGrid[currentGrid.z][currentGrid.x];
    const hazardScale = this.missionModifiers?.hazardDamageMult ?? 1.0;
    if (
      (gtCell === 'electrical_hazard' ||
        gtCell === 'unstable_zone' ||
        (gtCell === 'chemical_hazard' && !unit.stats.capabilities.hazmatShield)) &&
      !unit.stats.capabilities.aerial
    ) {
      this.enteredHazard = true;
      unit.integrityPct = Math.max(15, unit.integrityPct - dt * 4.5 * hazardScale);
    }

    // 5. Execute active task
    if (!activeTask) {
      unit.speedMps = 0;
      unit.locomotionState = unit.stats.capabilities.aerial ? 'hovering' : 'idle';
      return;
    }

    if (activeTask.task === 'scan_surroundings') {
      unit.locomotionState = 'scanning';
      unit.speedMps = 0;
      unit.turnRateRad = 0.8;
      unit.batteryPct = Math.max(0, unit.batteryPct - dt * 0.45 * unit.stats.batteryDrainMultiplier);
      unit.scanTimerSec -= dt;
      if (unit.scanTimerSec <= 0) {
        activeTask.status = 'completed';
        this.emit('ROBOT', 'decision', `${unit.name} completed sensor sweep: ${activeTask.label}.`);
        this.advanceUnitToNextTask(unit);
      }
      return;
    }

    if (unit.waypointCursor >= unit.activeWaypoints.length) {
      this.onUnitTaskReached(unit, activeTask);
      return;
    }

    const wpGrid = unit.activeWaypoints[unit.waypointCursor];
    const wpWorld = gridToWorld(wpGrid);
    const dx = wpWorld.x - unit.pos.x;
    const dz = wpWorld.z - unit.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.24) {
      unit.waypointCursor += 1;
      if (unit.waypointCursor >= unit.activeWaypoints.length) {
        unit.speedMps = 0;
        this.onUnitTaskReached(unit, activeTask, wpGrid);
      }
      return;
    }

    // Smooth steering + locomotion
    const targetHeading = Math.atan2(dx, dz);
    const headingError = normalizeAngle(targetHeading - unit.headingRad);
    const maxTurnSpeed = 3.4;
    const turnStep = Math.max(-maxTurnSpeed * dt, Math.min(maxTurnSpeed * dt, headingError * 4.5 * dt));
    unit.headingRad = normalizeAngle(unit.headingRad + turnStep);
    unit.turnRateRad = turnStep / dt;

    const alignFactor = Math.max(0.2, Math.cos(Math.min(Math.PI / 2, Math.abs(headingError))));
    unit.speedMps = unit.stats.speedMps * alignFactor;

    const cellHere = this.mapData.groundTruthGrid[currentGrid.z][currentGrid.x];
    if (unit.stats.capabilities.aerial) {
      unit.locomotionState = 'hovering';
    } else if (cellHere === 'flood_water') {
      unit.locomotionState = 'swimming';
    } else {
      unit.locomotionState = Math.abs(headingError) > 0.45 ? 'turning' : 'walking';
    }

    const stepDist = Math.min(dist, unit.speedMps * dt);
    const nextX = unit.pos.x + Math.sin(unit.headingRad) * stepDist;
    const nextZ = unit.pos.z + Math.cos(unit.headingRad) * stepDist;

    // Ground-truth collision check
    const nextGrid = worldToGrid(nextX, nextZ);
    const nextGtCell = this.mapData.groundTruthGrid[nextGrid.z][nextGrid.x];
    const blocked =
      isCellHighBarrier(nextGtCell) ||
      (isCellSolidObstacle(nextGtCell) &&
        !unit.stats.capabilities.aerial &&
        !(unit.stats.capabilities.heavyLift && nextGtCell === 'rubble'));

    if (blocked) {
      unit.collisionCount += 1;
      this.beliefGrid[nextGrid.z][nextGrid.x] = nextGtCell;
      unit.replanCount += 1;
      unit.speedMps = 0;
      this.emit(
        'SAFETY',
        'navigation',
        `Physical contact prevented for ${unit.name} at (${nextGrid.x}, ${nextGrid.z}). Triggering A* replan.`
      );
      this.planUnitTaskRoute(unit, true);
      return;
    }

    const drainScale = this.missionModifiers?.batteryDrainMult ?? 1.0;
    unit.pos.x = nextX;
    unit.pos.z = nextZ;
    unit.distanceTraveledM += stepDist;
    unit.batteryPct = Math.max(
      0,
      unit.batteryPct - (stepDist * 0.48 + dt * 0.12) * unit.stats.batteryDrainMultiplier * drainScale
    );
    if (!unit.stats.capabilities.aerial && unit.speedMps > 0.2) {
      this.callbacks.onSoundCue?.('footstep');
    }
  }

  private onUnitTaskReached(unit: RobotUnitRuntime, task: MissionTask, wp?: GridCoord) {
    task.status = 'completed';
    if (task.task === 'restore_relay') {
      this.relayRestored = true;
      this.callbacks.onSoundCue?.('scan');
      this.emit('ROBOT', 'decision', `${unit.name} restored municipal telemetry relay node.`);
    } else if (task.task === 'deliver_medical') {
      this.medicalDelivered = true;
      this.callbacks.onSoundCue?.('survivor_found');
      this.emit('ROBOT', 'decision', `${unit.name} delivered trauma medical pack.`);
    } else if (task.task === 'hazmat_scan') {
      this.hazmatScanned = true;
      this.callbacks.onSoundCue?.('scan');
      this.emit('PERCEPTION', 'sensor', `${unit.name} isolated chemical hazard leak boundary.`);
    } else if (wp) {
      this.emit('ROBOT', 'decision', `${unit.name} arrived at (${wp.x}, ${wp.z}) — ${task.label}.`);
    } else {
      this.emit('ROBOT', 'decision', `${unit.name} reached target for objective: ${task.label}.`);
    }
    this.advanceUnitToNextTask(unit);
  }

  public getUnitActiveTask(unit: RobotUnitRuntime): MissionTask | null {
    if (unit.activeTaskIdx < 0 || unit.activeTaskIdx >= unit.taskQueue.length) {
      return null;
    }
    return unit.taskQueue[unit.activeTaskIdx];
  }

  public getActiveTask(): MissionTask | null {
    return this.units[0] ? this.getUnitActiveTask(this.units[0]) : null;
  }

  public getUnitSnapshots(): RobotStateSnapshot[] {
    return this.units.map((u) => {
      const t = this.getUnitActiveTask(u);
      return {
        robot_id: u.robot_id,
        model_id: u.model_id,
        name: u.name,
        position: { ...u.pos },
        gridPos: worldToGrid(u.pos.x, u.pos.z),
        headingRad: u.headingRad,
        speedMps: Number(u.speedMps.toFixed(2)),
        batteryPct: Number(u.batteryPct.toFixed(1)),
        integrityPct: Number(u.integrityPct.toFixed(1)),
        locomotionState: u.locomotionState,
        currentTaskLabel: t ? t.label : 'Standby at Launch Bay',
        collisionCount: u.collisionCount,
        replanCount: u.replanCount,
        safetyRejections: u.safetyRejections,
        distanceTraveledM: Number(u.distanceTraveledM.toFixed(2)),
      };
    });
  }

  public getSnapshot(): RobotStateSnapshot {
    const idx = Math.min(this.selectedUnitIndex, Math.max(0, this.units.length - 1));
    return this.getUnitSnapshots()[idx] ?? {
      robot_id: 'robot_001',
      position: { ...this.robotPos },
      gridPos: worldToGrid(this.robotPos.x, this.robotPos.z),
      headingRad: this.headingRad,
      speedMps: 0,
      batteryPct: 100,
      locomotionState: 'docked',
      currentTaskLabel: 'Standby at Launch Bay',
      collisionCount: 0,
      replanCount: 0,
      safetyRejections: 0,
      distanceTraveledM: 0,
    };
  }

  private advanceUnitToNextTask(unit: RobotUnitRuntime) {
    unit.activeTaskIdx += 1;
    if (unit.activeTaskIdx >= unit.taskQueue.length) {
      unit.activeWaypoints = [];
      unit.waypointCursor = 0;
      return;
    }

    const task = unit.taskQueue[unit.activeTaskIdx];
    task.status = 'active';
    if (task.task === 'return_to_base') {
      this.phase = 'returning';
    }

    this.emit('COMMANDER', 'decision', `[${unit.name}] Activating objective: ${task.label}`, {
      task_id: task.id,
      robot_id: unit.robot_id,
      target: task.target,
    });

    if (task.task === 'scan_surroundings') {
      unit.scanTimerSec = 2.0;
      unit.activeWaypoints = [];
      unit.waypointCursor = 0;
      this.callbacks.onSoundCue?.('scan');
      this.emit('ROBOT', 'sensor', `${unit.name} initiating 360° optical and LiDAR scan.`);
      return;
    }

    this.planUnitTaskRoute(unit, false);
  }

  private planUnitTaskRoute(unit: RobotUnitRuntime, isReplan: boolean) {
    const task = this.getUnitActiveTask(unit);
    if (!task || !this.plan) return;

    const currentGrid = worldToGrid(unit.pos.x, unit.pos.z);

    const avoidCells = new Set<string>();
    if (this.plan.avoid_zones.includes('unstable_zone')) {
      for (const c of this.mapData.unstableZoneCells) {
        avoidCells.add(`${c.x},${c.z}`);
      }
    }

    let route = calculateAStarPath(this.beliefGrid, currentGrid, task.target, {
      allowHazardTraversal: this.plan.force_unsafe_override,
      avoidCells,
      capabilities: unit.stats.capabilities,
      weather: this.weather,
    });

    if (!route.valid && !this.plan.force_unsafe_override) {
      const candidates = [
        { x: 16, z: 5 },
        { x: 19, z: 5 },
        { x: 20, z: 5 },
        { x: task.target.x + 2, z: task.target.z },
        { x: task.target.x - 2, z: task.target.z },
        { x: task.target.x, z: task.target.z + 1 },
        { x: task.target.x, z: task.target.z - 1 },
      ];
      for (const alt of candidates) {
        const altRoute = calculateAStarPath(this.beliefGrid, currentGrid, alt, {
          avoidCells,
          capabilities: unit.stats.capabilities,
          weather: this.weather,
        });
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
        ? `[${unit.name}] ${isReplan ? 'Replanned' : 'Calculated'} A* route to (${task.target.x}, ${task.target.z}): ${route.waypoints.length} waypoints (${route.distanceMeters.toFixed(1)}m).`
        : `[${unit.name}] Pathfinding failed: ${route.reason}`,
      { waypoints: route.waypoints, distanceMeters: route.distanceMeters, robot_id: unit.robot_id }
    );

    const safety = evaluateProposedRoute(task, route, {
      beliefGrid: this.beliefGrid,
      currentPos: currentGrid,
      batteryPct: unit.batteryPct,
      avoidZones: this.plan.avoid_zones,
      forceUnsafeOverride: this.plan.force_unsafe_override,
      capabilities: unit.stats.capabilities,
      baseCoord: this.mapData.baseCoord,
    });

    if (!safety.approved) {
      unit.safetyRejections += 1;
      task.status = 'rejected';
      unit.speedMps = 0;
      unit.locomotionState = 'stopped';
      unit.activeWaypoints = [];
      this.callbacks.onSoundCue?.('safety_alert');

      this.emit(
        'SAFETY',
        'safety_rejection',
        `[${unit.name}] Route REJECTED [${safety.violatedRules.join(', ')}]: ${safety.reasons.join(' ')}`,
        { violatedRules: safety.violatedRules, robot_id: unit.robot_id }
      );

      if (safety.recommendedAction === 'return_to_base') {
        this.triggerReturnToBaseOverride(this.units.indexOf(unit));
      } else {
        this.phase = 'paused';
        this.emit(
          'COMMANDER',
          'decision',
          'Safety Agent vetoed proposed objective. Awaiting safe commander instruction.'
        );
      }
      return;
    }

    this.emit('SAFETY', 'decision', `[${unit.name}] Route approved (${safety.riskLevel}): ${safety.reasons[0]}`);
    unit.activeWaypoints = route.waypoints;
    unit.waypointCursor = route.waypoints.length > 1 ? 1 : 0;

    const sectorLabel = task.sector ? task.sector.replace('_', ' ') : 'target coordinates';
    this.emit(
      'ROBOT',
      'navigation',
      `${unit.name} moving toward ${sectorLabel} (${task.target.x}, ${task.target.z}).`
    );
  }

  private completeMission() {
    for (const unit of this.units) {
      unit.speedMps = 0;
      unit.turnRateRad = 0;
    }
    const primary = this.units[0];
    const finalGrid = worldToGrid(primary.pos.x, primary.pos.z);
    const atBase =
      Math.hypot(finalGrid.x - this.mapData.baseCoord.x, finalGrid.z - this.mapData.baseCoord.z) <= 1.8;
    this.returnedSafely = atBase;
    primary.locomotionState = atBase ? 'docked' : 'idle';
    this.phase = 'completed';

    this.syncPrimaryMirrors();
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
      batteryRemainingPct: this.units[0]?.batteryPct ?? 0,
      collisionCount: this.collisionCount,
      replanCount: this.replanCount,
      safetyRejections: this.safetyRejections,
      enteredHazard: this.enteredHazard,
    });
  }

  private isAnyCellNearUnitRoute(unit: RobotUnitRuntime, cells: GridCoord[]): boolean {
    if (unit.activeWaypoints.length === 0) return false;
    for (let i = Math.max(0, unit.waypointCursor - 1); i < unit.activeWaypoints.length - 1; i++) {
      const a = unit.activeWaypoints[i];
      const b = unit.activeWaypoints[i + 1];
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
