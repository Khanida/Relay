import { BASE_COORD, SECTORS } from '../shared/disasterMap';
import type {
  GridCoord,
  MissionPlan,
  MissionScoreBreakdown,
  MissionTask,
  RegionId,
} from '../shared/types';

export interface DeterministicParseContext {
  regionId?: RegionId;
  baseCoord?: GridCoord;
  survivorCoord?: GridCoord;
  relayCoord?: GridCoord;
  medicalCoord?: GridCoord;
  chemicalCoord?: GridCoord;
}

/**
 * Deterministic Commander natural-language fallback & validator.
 * Ensures the entire simulation remains playable offline or without an API key.
 */
export function parseInstructionDeterministic(
  instruction: string,
  missionId: string,
  robotId = 'robot_001',
  ctx: DeterministicParseContext = {}
): MissionPlan {
  const lower = instruction.toLowerCase().trim();
  const baseCoord = ctx.baseCoord ?? BASE_COORD;
  const survivorTarget = ctx.survivorCoord ?? { x: 20, z: 5 };
  const regionId = ctx.regionId ?? 'industrial_district';

  const avoidZones: string[] = [];
  if (lower.includes('unstable') || lower.includes('stairwell')) {
    avoidZones.push('unstable_zone');
  }
  if (lower.includes('electrical') && (lower.includes('avoid') || lower.includes('skip'))) {
    avoidZones.push('electrical_zone');
  }

  const wantsReturn =
    lower.includes('return') ||
    lower.includes('base') ||
    lower.includes('safely') ||
    lower.includes('come back') ||
    lower.includes('dock');

  const wantsScanOnly =
    (lower.includes('stop') && lower.includes('scan')) ||
    (lower.includes('scan') &&
      !lower.includes('corridor') &&
      !lower.includes('survivor') &&
      !lower.includes('find') &&
      !lower.includes('search') &&
      !lower.includes('chemical') &&
      !lower.includes('hazmat'));

  const wantsUnsafeHazard =
    (lower.includes('electrical') || lower.includes('unstable') || lower.includes('hazard')) &&
    (lower.includes('enter') ||
      lower.includes('cross') ||
      lower.includes('through') ||
      lower.includes('go to') ||
      lower.includes('inspect inside') ||
      lower.includes('ignore safety'));

  const objectives: MissionTask[] = [];
  let seq = 1;
  const nextId = () => `${missionId}_task_${seq++}`;

  if (wantsUnsafeHazard) {
    const hazardSector = lower.includes('unstable') ? SECTORS.unstable_zone : SECTORS.electrical_zone;
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'inspect_hazard',
      label: `Enter ${hazardSector.name}`,
      sector: hazardSector.id,
      target: { ...hazardSector.center },
      priority: 'high',
      status: 'pending',
      rationale: 'Commander interpreted direct instruction to enter designated hazard zone.',
    });

    return {
      mission_id: missionId,
      title: 'Hazard Zone Entry Directive',
      original_instruction: instruction,
      provider: 'deterministic-fallback',
      summary: `Directing unit to enter ${hazardSector.name} (subject to Safety Agent verification).`,
      avoid_zones: avoidZones,
      require_return_to_base: wantsReturn,
      force_unsafe_override: true,
      objectives,
    };
  }

  if (wantsScanOnly) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'scan_surroundings',
      label: 'Halt and perform 360° LiDAR & optical scan',
      target: { ...baseCoord },
      priority: 'high',
      status: 'pending',
      rationale: 'Immediate local perception sweep requested.',
    });

    return {
      mission_id: missionId,
      title: 'Local Sensor Sweep',
      original_instruction: instruction,
      provider: 'deterministic-fallback',
      summary: 'Halting locomotion to execute full environmental and optical scan.',
      avoid_zones: avoidZones,
      require_return_to_base: false,
      force_unsafe_override: false,
      objectives,
    };
  }

  if (
    (lower.includes('return') || lower.includes('base') || lower.includes('dock')) &&
    !lower.includes('find') &&
    !lower.includes('search') &&
    !lower.includes('explore') &&
    !lower.includes('survivor') &&
    !lower.includes('relay') &&
    !lower.includes('medical') &&
    !lower.includes('chemical')
  ) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'return_to_base',
      label: 'Return safely to West Launch & Charging Bay',
      sector: 'base_bay',
      target: { ...baseCoord },
      priority: 'high',
      status: 'pending',
      rationale: 'Commander ordered immediate extraction back to charging base.',
    });

    return {
      mission_id: missionId,
      title: 'Return to Base',
      original_instruction: instruction,
      provider: 'deterministic-fallback',
      summary: 'Returning autonomous unit to home charging station.',
      avoid_zones: avoidZones,
      require_return_to_base: true,
      force_unsafe_override: false,
      objectives,
    };
  }

  // Regional / RELAY 2.0 specialized tasks
  const wantsRelay = lower.includes('relay') || lower.includes('signal') || lower.includes('repeater');
  const wantsMedical = lower.includes('medical') || lower.includes('medicine') || lower.includes('clinic') || lower.includes('trauma');
  const wantsHazmat = lower.includes('chemical') || lower.includes('hazmat') || lower.includes('spill') || lower.includes('leak');
  const wantsDebris = lower.includes('clear') || lower.includes('debris') || lower.includes('breach');

  if (wantsRelay && ctx.relayCoord) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'restore_relay',
      label: 'Restore emergency telemetry relay node',
      sector: regionId,
      target: { ...ctx.relayCoord },
      priority: 'high',
      status: 'pending',
      rationale: 'Re-establish emergency mesh communications across sector.',
    });
  }

  if (wantsMedical && (ctx.medicalCoord || ctx.survivorCoord)) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'deliver_medical',
      label: 'Deliver stabilized medical supply pack',
      sector: regionId,
      target: { ...(ctx.medicalCoord ?? survivorTarget) },
      priority: 'critical',
      status: 'pending',
      rationale: 'Deliver trauma medical cargo to cut-off shelter.',
    });
  }

  if (wantsHazmat && ctx.chemicalCoord) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'hazmat_scan',
      label: 'Inspect chemical spill perimeter',
      sector: regionId,
      target: { ...ctx.chemicalCoord },
      priority: 'high',
      status: 'pending',
      rationale: 'Quantify hazardous concentration and isolate leak boundary.',
    });
  }

  if (wantsDebris && regionId === 'industrial_district') {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'clear_debris',
      label: 'Survey & clear eastern access debris',
      sector: 'eastern_corridor',
      target: { x: 13, z: 5 },
      priority: 'high',
      status: 'pending',
      rationale: 'Verify structural clearance for follow-on human crews.',
    });
  }

  // Standard search / explore / rescue missions (preserving Operation First Light exact sequence)
  const mentionsEastern = lower.includes('east') || lower.includes('corridor');
  const mentionsSouthern = lower.includes('south') || lower.includes('bypass');
  const mentionsSurvivor =
    lower.includes('survivor') ||
    lower.includes('rescue') ||
    lower.includes('locate') ||
    lower.includes('find') ||
    lower.includes('people') ||
    lower.includes('staff') ||
    lower.includes('victim') ||
    lower.includes('trapped') ||
    lower.includes('stranded') ||
    lower.includes('technician') ||
    lower.includes('medic') ||
    lower.includes('engineer');

  if (
    regionId === 'industrial_district' &&
    (mentionsEastern || mentionsSurvivor || !mentionsSouthern) &&
    !wantsRelay &&
    !wantsMedical &&
    !wantsHazmat
  ) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'explore_sector',
      label: 'Traverse Eastern Corridor approach',
      sector: 'eastern_corridor',
      target: { x: 16, z: 5 },
      priority: 'high',
      status: 'pending',
      rationale: 'Primary ingress route to eastern industrial wing per pre-quake blueprints.',
    });
  }

  if (regionId === 'industrial_district' && mentionsSouthern) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'explore_sector',
      label: 'Sweep Southern Maintenance Bypass',
      sector: 'southern_bypass',
      target: { ...SECTORS.southern_bypass.center },
      priority: 'normal',
      status: 'pending',
      rationale: 'Reconnaissance along southern service passage.',
    });
  }

  if (mentionsSurvivor || (!mentionsEastern && objectives.length === 0)) {
    const isDefaultIndustrial =
      regionId === 'industrial_district' &&
      (!ctx.survivorCoord || (ctx.survivorCoord.x === 22 && ctx.survivorCoord.z === 5));
    const searchCoord = isDefaultIndustrial ? { x: 20, z: 5 } : { ...survivorTarget };
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'search_area',
      label:
        regionId === 'industrial_district'
          ? 'Search Northeast Fabrication Bay for survivors'
          : `Search ${regionId.replace('_', ' ')} sector for survivors`,
      sector: regionId === 'industrial_district' ? 'northeast_bay' : regionId,
      target: searchCoord,
      priority: 'critical',
      status: 'pending',
      rationale: 'High-probability shelter pocket for trapped personnel.',
    });

    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'scan_surroundings',
      label: 'Verify survivor vitals & report coordinates',
      sector: regionId === 'industrial_district' ? 'northeast_bay' : regionId,
      target: searchCoord,
      priority: 'critical',
      status: 'pending',
      rationale: 'Confirm optical/thermal signature and transmit rescue beacon coordinates.',
    });
  }

  if (wantsReturn || mentionsSurvivor || objectives.length > 0) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'return_to_base',
      label: 'Return safely to West Launch & Charging Bay',
      sector: 'base_bay',
      target: { ...baseCoord },
      priority: 'high',
      status: 'pending',
      rationale: 'Preserve unit integrity and dock after mission completion.',
    });
  }

  return {
    mission_id: missionId,
    title: wantsHazmat
      ? 'Hazmat Containment Survey'
      : wantsRelay
        ? 'Relay Network Restoration'
        : wantsMedical
          ? 'Autonomous Medical Courier'
          : mentionsSurvivor
            ? 'Operation First Light — Survivor Rescue'
            : 'Sector Reconnaissance',
    original_instruction: instruction,
    provider: 'deterministic-fallback',
    summary: `Structured ${objectives.length}-stage autonomous mission: ${objectives.map((o) => o.label).join(' → ')}.`,
    avoid_zones: avoidZones,
    require_return_to_base: wantsReturn || mentionsSurvivor || wantsRelay || wantsMedical,
    force_unsafe_override: false,
    objectives,
  };
}

export interface ScoreInput {
  missionCompleted: boolean;
  survivorFound: boolean;
  returnedSafely: boolean;
  elapsedSec: number;
  batteryRemainingPct: number;
  collisionCount: number;
  replanCount: number;
  safetyRejections: number;
  enteredHazard: boolean;
}

/**
 * Calculates mission score prioritizing safety & recovery over raw speed.
 */
export function calculateMissionScore(input: ScoreInput): MissionScoreBreakdown {
  const completionPoints = input.missionCompleted ? 250 : 0;
  const survivorPoints = input.survivorFound ? 300 : 0;
  const safetyCompliancePoints = input.enteredHazard
    ? 50
    : input.returnedSafely
      ? 200
      : 120;
  const dynamicRecoveryPoints = input.replanCount > 0 ? Math.min(100, input.replanCount * 50 + 50) : 50;
  const batteryEfficiencyPoints = Math.round(
    Math.max(0, Math.min(80, input.batteryRemainingPct * 0.8))
  );
  const collisionAvoidancePoints = Math.max(0, 50 - input.collisionCount * 15);
  const timeEfficiencyPoints = input.missionCompleted
    ? Math.max(0, Math.round(70 - Math.max(0, input.elapsedSec - 35) * 0.6))
    : 0;

  const totalScore = Math.min(
    1000,
    completionPoints +
      survivorPoints +
      safetyCompliancePoints +
      dynamicRecoveryPoints +
      batteryEfficiencyPoints +
      collisionAvoidancePoints +
      timeEfficiencyPoints
  );

  let grade: MissionScoreBreakdown['grade'] = 'D';
  if (totalScore >= 900) grade = 'S';
  else if (totalScore >= 800) grade = 'A';
  else if (totalScore >= 650) grade = 'B';
  else if (totalScore >= 500) grade = 'C';

  return {
    totalScore,
    grade,
    completionPoints,
    survivorPoints,
    safetyCompliancePoints,
    dynamicRecoveryPoints,
    batteryEfficiencyPoints,
    collisionAvoidancePoints,
    timeEfficiencyPoints,
    elapsedSec: Number(input.elapsedSec.toFixed(1)),
    survivorFound: input.survivorFound,
    returnedSafely: input.returnedSafely,
  };
}
