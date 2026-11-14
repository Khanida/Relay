export interface GridCoord {
  x: number;
  z: number;
}

export interface WorldCoord {
  x: number;
  y: number;
  z: number;
}

export type CellType =
  | 'floor'
  | 'wall'
  | 'rubble'
  | 'collapsed_passage'
  | 'electrical_hazard'
  | 'unstable_zone'
  | 'charging_base'
  | 'staircase';

export type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

export type TaskType =
  | 'explore_sector'
  | 'search_area'
  | 'scan_surroundings'
  | 'avoid_zone'
  | 'return_to_base'
  | 'emergency_stop'
  | 'inspect_hazard';

export type TaskStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'rejected'
  | 'replanned'
  | 'failed';

export interface MissionTask {
  id: string;
  mission_id: string;
  robot_id: string;
  task: TaskType;
  label: string;
  sector?: string;
  target: GridCoord;
  priority: MissionPriority;
  status: TaskStatus;
  rationale: string;
}

export interface MissionPlan {
  mission_id: string;
  title: string;
  original_instruction: string;
  provider: 'gemini' | 'deterministic-fallback';
  summary: string;
  avoid_zones: string[];
  require_return_to_base: boolean;
  force_unsafe_override: boolean;
  objectives: MissionTask[];
}

export interface RoutePlan {
  valid: boolean;
  waypoints: GridCoord[];
  distanceMeters: number;
  estimatedBatteryCost: number;
  blockedEncountered?: GridCoord;
  passesThroughHazard?: boolean;
  hazardTypesEncountered?: string[];
  reason?: string;
}

export interface SafetyEvaluation {
  approved: boolean;
  riskLevel: 'nominal' | 'caution' | 'critical';
  reasons: string[];
  violatedRules: string[];
  recommendedAction?: 'replan' | 'return_to_base' | 'emergency_stop';
}

export type AgentActor =
  | 'COMMANDER'
  | 'NAVIGATION'
  | 'SAFETY'
  | 'ROBOT'
  | 'PERCEPTION';

export type AgentEventCategory =
  | 'decision'
  | 'tool_call'
  | 'navigation'
  | 'safety_rejection'
  | 'sensor'
  | 'mission_status';

export interface AgentEvent {
  id: string;
  mission_id: string;
  timestamp: string;
  elapsedSec: number;
  actor: AgentActor;
  category: AgentEventCategory;
  message: string;
  details?: Record<string, unknown>;
}

export interface LidarRayReading {
  angleRad: number;
  distance: number;
  hitType: 'clear' | 'wall' | 'debris' | 'hazard';
  hitCell?: GridCoord;
}

export interface SensorReading {
  minDepthMeters: number;
  frontDepthMeters: number;
  leftDepthMeters: number;
  rightDepthMeters: number;
  lidarRays: LidarRayReading[];
  temperatureC: number;
  vibrationHz: number;
  electricalFieldKvM: number;
  hazardProximity: {
    type: 'electrical' | 'unstable' | 'none';
    distance: number;
  };
  survivorSignal: {
    detected: boolean;
    confidence: number;
    bearingDeg: number;
    distance: number;
    worldPos?: GridCoord;
  };
}

export type LocomotionState =
  | 'idle'
  | 'walking'
  | 'turning'
  | 'scanning'
  | 'stopped'
  | 'docked'
  | 'emergency_stop';

export interface RobotStateSnapshot {
  robot_id: string;
  position: WorldCoord;
  gridPos: GridCoord;
  headingRad: number;
  speedMps: number;
  batteryPct: number;
  locomotionState: LocomotionState;
  currentTaskLabel: string;
  collisionCount: number;
  replanCount: number;
  safetyRejections: number;
  distanceTraveledM: number;
}

export interface MissionScoreBreakdown {
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  completionPoints: number;
  survivorPoints: number;
  safetyCompliancePoints: number;
  dynamicRecoveryPoints: number;
  batteryEfficiencyPoints: number;
  collisionAvoidancePoints: number;
  timeEfficiencyPoints: number;
  elapsedSec: number;
  survivorFound: boolean;
  returnedSafely: boolean;
}

export type MissionPhase =
  | 'standby'
  | 'interpreting'
  | 'executing'
  | 'paused'
  | 'returning'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface MissionRecord {
  mission_id: string;
  title: string;
  instruction: string;
  status: string;
  provider: string;
  survivor_found: boolean;
  returned_safely: boolean;
  total_score: number;
  grade: string;
  elapsed_sec: number;
  battery_remaining: number;
  replan_count: number;
  safety_rejections: number;
  created_at: string;
}
