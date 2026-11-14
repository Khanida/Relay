import type {
  AgentEvent,
  MissionTask,
  RobotCapabilities,
  RobotModelId,
} from '../shared/types';

export interface ActiveFleetUnit {
  robot_id: string;
  model_id: RobotModelId;
  name: string;
  capabilities: RobotCapabilities;
  batteryPct: number;
}

export interface FleetAssignmentResult {
  objectives: MissionTask[];
  events: Array<{ message: string; details: Record<string, unknown> }>;
}

/**
 * Multi-Agent Fleet Coordinator.
 * Deterministically assigns mission tasks across 1 or 2 active robots based on
 * robot capabilities, battery health, and non-conflicting sector coverage.
 */
export function coordinateFleetAssignments(
  objectives: MissionTask[],
  units: ActiveFleetUnit[]
): FleetAssignmentResult {
  if (units.length <= 1) {
    const primaryId = units[0]?.robot_id ?? 'robot_001';
    return {
      objectives: objectives.map((o) => ({ ...o, robot_id: primaryId })),
      events: [],
    };
  }

  const [u1, u2] = units;
  const assigned: MissionTask[] = [];
  const events: Array<{ message: string; details: Record<string, unknown> }> = [];

  for (let i = 0; i < objectives.length; i++) {
    const obj = { ...objectives[i] };

    // Capability-matched routing first
    if (obj.task === 'hazmat_scan') {
      const best = u2.capabilities.hazmatShield && !u1.capabilities.hazmatShield ? u2 : u1.capabilities.hazmatShield ? u1 : u2.capabilities.aerial ? u2 : u1;
      obj.robot_id = best.robot_id;
    } else if (obj.task === 'deliver_medical') {
      const best = u2.capabilities.medicalCargo && !u1.capabilities.medicalCargo ? u2 : u1.capabilities.medicalCargo ? u1 : u2;
      obj.robot_id = best.robot_id;
    } else if (obj.task === 'restore_relay') {
      const best = u2.capabilities.commRelay && !u1.capabilities.commRelay ? u2 : u1.capabilities.commRelay ? u1 : u2;
      obj.robot_id = best.robot_id;
    } else if (obj.task === 'clear_debris') {
      const best = u2.capabilities.heavyLift && !u1.capabilities.heavyLift ? u2 : u1.capabilities.heavyLift ? u1 : u1;
      obj.robot_id = best.robot_id;
    } else if (obj.task === 'explore_sector') {
      // Send faster/aerial/recon Slot 2 ahead to map corridors when available
      obj.robot_id = u2.capabilities.aerial || u2.capabilities.commRelay ? u2.robot_id : u1.robot_id;
    } else if (obj.task === 'return_to_base') {
      obj.robot_id = u1.robot_id;
    } else {
      obj.robot_id = i % 2 === 1 && u2.batteryPct > 35 ? u2.robot_id : u1.robot_id;
    }

    assigned.push(obj);
  }

  // Ensure both units have an explicit return_to_base if mission requires return and u2 had tasks
  const u2HasTasks = assigned.some((o) => o.robot_id === u2.robot_id && o.task !== 'return_to_base');
  const u2HasRtb = assigned.some((o) => o.robot_id === u2.robot_id && o.task === 'return_to_base');
  const existingRtb = assigned.find((o) => o.task === 'return_to_base');
  if (u2HasTasks && !u2HasRtb && existingRtb) {
    assigned.push({
      ...existingRtb,
      id: `${existingRtb.id}_${u2.robot_id}`,
      robot_id: u2.robot_id,
      label: `${u2.name}: Return safely to Charging Bay`,
      status: 'pending',
    });
  }

  events.push({
    message: `Fleet Coordinator balanced ${assigned.length} objectives between ${u1.name} and ${u2.name}.`,
    details: {
      slot1: u1.name,
      slot2: u2.name,
      slot1Tasks: assigned.filter((t) => t.robot_id === u1.robot_id).length,
      slot2Tasks: assigned.filter((t) => t.robot_id === u2.robot_id).length,
    },
  });

  return { objectives: assigned, events };
}

export function formatFleetSummaryEvent(
  missionId: string,
  elapsedSec: number,
  message: string,
  details?: Record<string, unknown>
): AgentEvent {
  return {
    id: `${missionId}_fleet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mission_id: missionId,
    timestamp: new Date().toISOString(),
    elapsedSec: Number(elapsedSec.toFixed(1)),
    actor: 'FLEET',
    category: 'fleet',
    message,
    details,
  };
}
