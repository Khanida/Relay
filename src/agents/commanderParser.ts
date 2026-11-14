import { BASE_COORD, SECTORS } from '../shared/disasterMap';
import type {
  MissionPlan,
  MissionScoreBreakdown,
  MissionTask,
} from '../shared/types';

/**
 * Deterministic Commander natural-language fallback & validator.
 * Ensures the entire simulation remains playable offline or without an API key.
 */
export function parseInstructionDeterministic(
  instruction: string,
  missionId: string,
  robotId = 'robot_001'
): MissionPlan {
  const lower = instruction.toLowerCase().trim();
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
    (lower.includes('scan') && !lower.includes('corridor') && !lower.includes('survivor') && !lower.includes('find') && !lower.includes('search'));

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
      target: { ...BASE_COORD },
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
    !lower.includes('survivor')
  ) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'return_to_base',
      label: 'Return safely to West Launch & Charging Bay',
      sector: 'base_bay',
      target: { ...BASE_COORD },
      priority: 'high',
      status: 'pending',
      rationale: 'Commander ordered immediate extraction back to charging base.',
    });

    return {
      mission_id: missionId,
      title: 'Return to Base',
      original_instruction: instruction,
      provider: 'deterministic-fallback',
      summary: 'Returning quadruped unit to home charging station.',
      avoid_zones: avoidZones,
      require_return_to_base: true,
      force_unsafe_override: false,
      objectives,
    };
  }

  // Standard search / explore / rescue missions
  const mentionsEastern = lower.includes('east') || lower.includes('corridor');
  const mentionsSouthern = lower.includes('south') || lower.includes('bypass');
  const mentionsSurvivor =
    lower.includes('survivor') ||
    lower.includes('rescue') ||
    lower.includes('locate') ||
    lower.includes('find') ||
    lower.includes('people') ||
    lower.includes('victim');

  if (mentionsEastern || mentionsSurvivor || !mentionsSouthern) {
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

  if (mentionsSouthern) {
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

  if (mentionsSurvivor || !mentionsEastern) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'search_area',
      label: 'Search Northeast Fabrication Bay for survivors',
      sector: 'northeast_bay',
      target: { x: 20, z: 5 },
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
      sector: 'northeast_bay',
      target: { x: 20, z: 5 },
      priority: 'critical',
      status: 'pending',
      rationale: 'Confirm optical/thermal signature and transmit rescue beacon coordinates.',
    });
  }

  if (wantsReturn || mentionsSurvivor) {
    objectives.push({
      id: nextId(),
      mission_id: missionId,
      robot_id: robotId,
      task: 'return_to_base',
      label: 'Return safely to West Launch & Charging Bay',
      sector: 'base_bay',
      target: { ...BASE_COORD },
      priority: 'high',
      status: 'pending',
      rationale: 'Preserve unit integrity and dock after reporting survivor status.',
    });
  }

  return {
    mission_id: missionId,
    title: mentionsSurvivor ? 'Operation First Light — Survivor Rescue' : 'Sector Reconnaissance',
    original_instruction: instruction,
    provider: 'deterministic-fallback',
    summary: `Structured ${objectives.length}-stage autonomous mission: ${objectives.map((o) => o.label).join(' → ')}.`,
    avoid_zones: avoidZones,
    require_return_to_base: wantsReturn || mentionsSurvivor,
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
