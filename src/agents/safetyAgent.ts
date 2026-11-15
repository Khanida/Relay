import {
  BASE_COORD,
  isCellHazard,
  isCellHighBarrier,
  isCellSolidObstacle,
  isCellWater,
} from '../shared/disasterMap';
import type {
  CellType,
  GridCoord,
  MissionTask,
  RobotCapabilities,
  RoutePlan,
  SafetyEvaluation,
  SensorReading,
} from '../shared/types';
import { estimateReturnToBaseCost, isInsideGrid } from './navigationAgent';

export interface SafetyContext {
  beliefGrid: CellType[][];
  currentPos: GridCoord;
  batteryPct: number;
  avoidZones: string[];
  forceUnsafeOverride?: boolean;
  capabilities?: RobotCapabilities;
  baseCoord?: GridCoord;
}

const MIN_BATTERY_RESERVE_PCT = 10;
const CRITICAL_BATTERY_PCT = 18;
const CRITICAL_FRONT_DEPTH_M = 0.62;
const MAX_SAFE_EM_FIELD_KVM = 8.5;
const MAX_SAFE_VIBRATION_HZ = 28.0;
const MAX_SAFE_CHEMICAL_PPM = 35.0;
const MAX_SAFE_WATER_DEPTH_M = 0.45;

/**
 * Deterministic Safety Agent.
 * Completely independent of any LLM and capable of rejecting Commander or player requests.
 */
export function evaluateProposedRoute(
  task: MissionTask,
  route: RoutePlan,
  ctx: SafetyContext
): SafetyEvaluation {
  const violatedRules: string[] = [];
  const reasons: string[] = [];
  const caps = ctx.capabilities;

  if (ctx.forceUnsafeOverride) {
    violatedRules.push('RULE_PROHIBITED_HAZARD_OVERRIDE');
    reasons.push(
      'Direct traversal into hazardous switchgear/unstable zone is prohibited by deterministic safety policy.'
    );
  }

  if (!route.valid) {
    violatedRules.push('RULE_NO_VALID_ROUTE');
    reasons.push(route.reason || 'Proposed route is invalid or obstructed.');
    return {
      approved: false,
      riskLevel: 'critical',
      reasons,
      violatedRules,
      recommendedAction: 'replan',
    };
  }

  // Verify every cell along interpolated segments against hazards & solid obstacles
  const checkedCells = expandWaypointsToCells(route.waypoints);
  for (const cellCoord of checkedCells) {
    if (!isInsideGrid(cellCoord.x, cellCoord.z)) {
      violatedRules.push('RULE_PERIMETER_BREACH');
      reasons.push(`Waypoint (${cellCoord.x}, ${cellCoord.z}) exits facility boundary.`);
      break;
    }

    const cellType = ctx.beliefGrid[cellCoord.z][cellCoord.x];

    if (isCellHighBarrier(cellType)) {
      violatedRules.push('RULE_OBSTACLE_COLLISION');
      reasons.push(
        `Route intersects impassable ${cellType.replace('_', ' ')} at (${cellCoord.x}, ${cellCoord.z}).`
      );
      break;
    }

    if (isCellSolidObstacle(cellType)) {
      const allowedFly = Boolean(caps?.aerial);
      const allowedClear = Boolean(caps?.heavyLift && cellType === 'rubble');
      if (!allowedFly && !allowedClear) {
        violatedRules.push('RULE_OBSTACLE_COLLISION');
        reasons.push(
          `Route intersects impassable ${cellType.replace('_', ' ')} at (${cellCoord.x}, ${cellCoord.z}).`
        );
        break;
      }
    }

    if (isCellWater(cellType) && !caps?.waterproof && !caps?.aerial) {
      violatedRules.push('RULE_FLOOD_WATER_INCOMPATIBLE');
      reasons.push(
        `Unit lacks waterproof sealing or aerial flight to cross floodwater at (${cellCoord.x}, ${cellCoord.z}).`
      );
      break;
    }

    if (cellType === 'chemical_hazard') {
      if (!caps?.hazmatShield && !caps?.aerial) {
        violatedRules.push('RULE_CHEMICAL_HAZARD_EXPOSURE');
        reasons.push(
          `Unit lacks hazmat shielding to enter chemical spill zone at (${cellCoord.x}, ${cellCoord.z}).`
        );
        break;
      }
    } else if (isCellHazard(cellType) && !caps?.aerial) {
      violatedRules.push('RULE_HAZARD_ZONE_ENTRY');
      reasons.push(
        `Route enters ${cellType === 'electrical_hazard' ? 'high-voltage electrical hazard' : 'unstable structural zone'} at (${cellCoord.x}, ${cellCoord.z}).`
      );
      break;
    }
  }

  if (route.passesThroughHazard) {
    const blockedHazards = (route.hazardTypesEncountered ?? []).filter((h) => {
      if (caps?.aerial) return false;
      if (h === 'chemical_hazard' && caps?.hazmatShield) return false;
      return true;
    });
    if (blockedHazards.length > 0 && !violatedRules.includes('RULE_HAZARD_ZONE_ENTRY')) {
      violatedRules.push('RULE_HAZARD_ZONE_ENTRY');
      reasons.push(`Proposed path crosses hazardous cells (${blockedHazards.join(', ')}).`);
    }
  }

  // Check explicit player-mandated zone avoidance
  if (ctx.avoidZones.includes('unstable_zone')) {
    const nearUnstable = checkedCells.some((c) => c.z >= 14 && c.x >= 14);
    if (nearUnstable && task.task !== 'return_to_base') {
      violatedRules.push('RULE_AVOIDANCE_MANDATE');
      reasons.push('Path violates active mandate to stay clear of the Fractured South Stairwell.');
    }
  }

  // Battery sufficiency check (must be able to complete task AND return to Base with reserve)
  if (task.task !== 'return_to_base' && task.task !== 'emergency_stop' && task.task !== 'scan_surroundings') {
    const returnEstimate = estimateReturnToBaseCost(ctx.beliefGrid, task.target, {
      baseCoord: ctx.baseCoord,
      capabilities: ctx.capabilities,
    });
    const totalProjectedDrain = route.estimatedBatteryCost + returnEstimate.estimatedBatteryCost;
    const requiredBattery = totalProjectedDrain + MIN_BATTERY_RESERVE_PCT;

    if (ctx.batteryPct < requiredBattery) {
      violatedRules.push('RULE_INSUFFICIENT_BATTERY_RESERVE');
      reasons.push(
        `Battery at ${ctx.batteryPct.toFixed(1)}% is below required ${requiredBattery.toFixed(1)}% (outbound + return-to-base + ${MIN_BATTERY_RESERVE_PCT}% reserve).`
      );
      return {
        approved: false,
        riskLevel: 'critical',
        reasons,
        violatedRules,
        recommendedAction: 'return_to_base',
      };
    }
  }

  if (violatedRules.length > 0) {
    return {
      approved: false,
      riskLevel: 'critical',
      reasons,
      violatedRules,
      recommendedAction: 'replan',
    };
  }

  // Check proximity caution (within 1.5m of hazard)
  const closeToHazard = checkedCells.some((c) => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx;
        const nz = c.z + dz;
        if (isInsideGrid(nx, nz) && isCellHazard(ctx.beliefGrid[nz][nx])) {
          return true;
        }
      }
    }
    return false;
  });

  return {
    approved: true,
    riskLevel: closeToHazard ? 'caution' : 'nominal',
    reasons: [
      closeToHazard
        ? 'Route approved with caution: passes adjacent to known hazard buffer.'
        : 'Route verified clear of known hazards with adequate battery reserve.',
    ],
    violatedRules: [],
  };
}

/**
 * Real-time tick-level deterministic safety monitor using live sensor readings.
 */
export function evaluateLiveSensorSafety(
  sensors: SensorReading,
  batteryPct: number,
  isReturningToBase: boolean,
  currentGridPos: GridCoord,
  capabilities?: RobotCapabilities,
  baseCoord: GridCoord = BASE_COORD
): SafetyEvaluation {
  const reasons: string[] = [];
  const violatedRules: string[] = [];

  if (!capabilities?.aerial && sensors.electricalFieldKvM >= MAX_SAFE_EM_FIELD_KVM) {
    violatedRules.push('LIVE_ELECTRICAL_ARC_PROXIMITY');
    reasons.push(
      `High-voltage EM field spike (${sensors.electricalFieldKvM.toFixed(1)} kV/m). Emergency stop engaged.`
    );
  }

  if (!capabilities?.aerial && sensors.vibrationHz >= MAX_SAFE_VIBRATION_HZ) {
    violatedRules.push('LIVE_STRUCTURAL_INSTABILITY');
    reasons.push(
      `Structural vibration threshold exceeded (${sensors.vibrationHz.toFixed(1)} Hz). Emergency stop engaged.`
    );
  }

  if (!capabilities?.hazmatShield && !capabilities?.aerial && sensors.chemicalPpm >= MAX_SAFE_CHEMICAL_PPM) {
    violatedRules.push('LIVE_CHEMICAL_CONTAMINATION');
    reasons.push(
      `Corrosive chemical vapor exceeded safe threshold (${sensors.chemicalPpm.toFixed(1)} ppm). Replanning required.`
    );
  }

  if (!capabilities?.waterproof && !capabilities?.aerial && sensors.waterDepthM >= MAX_SAFE_WATER_DEPTH_M) {
    violatedRules.push('LIVE_FLOOD_INGRESS_RISK');
    reasons.push(
      `Flood depth (${sensors.waterDepthM.toFixed(2)}m) exceeds unsealed chassis tolerance.`
    );
  }

  if (sensors.frontDepthMeters < CRITICAL_FRONT_DEPTH_M) {
    violatedRules.push('LIVE_IMMINENT_COLLISION');
    reasons.push(
      `Obstacle detected at ${sensors.frontDepthMeters.toFixed(2)}m ahead (< ${CRITICAL_FRONT_DEPTH_M}m safety buffer).`
    );
  }

  const atBase =
    Math.hypot(currentGridPos.x - baseCoord.x, currentGridPos.z - baseCoord.z) <= 1.2;

  if (batteryPct <= CRITICAL_BATTERY_PCT && !isReturningToBase && !atBase) {
    violatedRules.push('LIVE_LOW_BATTERY_RETURN');
    reasons.push(
      `Battery dropped to ${batteryPct.toFixed(1)}% (<= ${CRITICAL_BATTERY_PCT}%). Enforcing mandatory return to base.`
    );
    return {
      approved: false,
      riskLevel: 'critical',
      reasons,
      violatedRules,
      recommendedAction: 'return_to_base',
    };
  }

  if (violatedRules.length > 0) {
    return {
      approved: false,
      riskLevel: 'critical',
      reasons,
      violatedRules,
      recommendedAction: 'emergency_stop',
    };
  }

  if (sensors.hazardProximity.type !== 'none' && sensors.hazardProximity.distance < 2.2) {
    return {
      approved: true,
      riskLevel: 'caution',
      reasons: [
        `Proximity caution: ${sensors.hazardProximity.type} zone at ${sensors.hazardProximity.distance.toFixed(1)}m.`,
      ],
      violatedRules: [],
    };
  }

  return {
    approved: true,
    riskLevel: 'nominal',
    reasons: ['All live sensor parameters nominal.'],
    violatedRules: [],
  };
}

function expandWaypointsToCells(waypoints: GridCoord[]): GridCoord[] {
  if (waypoints.length === 0) return [];
  const cells: GridCoord[] = [{ ...waypoints[0] }];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let s = 1; s <= steps; s++) {
      const t = steps === 0 ? 1 : s / steps;
      cells.push({
        x: Math.round(a.x + (b.x - a.x) * t),
        z: Math.round(a.z + (b.z - a.z) * t),
      });
    }
  }
  return cells;
}
