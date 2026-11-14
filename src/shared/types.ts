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
  | 'staircase'
  | 'road'
  | 'flood_water'
  | 'chemical_hazard'
  | 'mountain_cliff'
  | 'bridge'
  | 'building_interior';

export type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

export type TaskType =
  | 'explore_sector'
  | 'search_area'
  | 'scan_surroundings'
  | 'avoid_zone'
  | 'return_to_base'
  | 'emergency_stop'
  | 'inspect_hazard'
  | 'restore_relay'
  | 'deliver_medical'
  | 'clear_debris'
  | 'hazmat_scan';

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
  | 'PERCEPTION'
  | 'FLEET'
  | 'LOGISTICS';

export type AgentEventCategory =
  | 'decision'
  | 'tool_call'
  | 'navigation'
  | 'safety_rejection'
  | 'sensor'
  | 'mission_status'
  | 'economy'
  | 'fleet';

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
  chemicalPpm: number;
  waterDepthM: number;
  hazardProximity: {
    type: 'electrical' | 'unstable' | 'chemical' | 'flood' | 'none';
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
  | 'emergency_stop'
  | 'hovering'
  | 'swimming'
  | 'working';

export interface RobotStateSnapshot {
  robot_id: string;
  model_id?: RobotModelId;
  name?: string;
  position: WorldCoord;
  gridPos: GridCoord;
  headingRad: number;
  speedMps: number;
  batteryPct: number;
  integrityPct?: number;
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
  creditsEarned?: number;
  optionalBonusCredits?: number;
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
  region_id?: RegionId;
  chapter_id?: number;
  status: string;
  provider: string;
  survivor_found: boolean;
  returned_safely: boolean;
  total_score: number;
  grade: string;
  credits_earned?: number;
  elapsed_sec: number;
  battery_remaining: number;
  replan_count: number;
  safety_rejections: number;
  created_at: string;
}

// ========================= RELAY 2.0 OPEN WORLD TYPES =========================

export type RegionId =
  | 'industrial_district'
  | 'meridian_city'
  | 'old_quarter'
  | 'port_meridian'
  | 'highland_province'
  | 'desert_corridor'
  | 'research_valley';

export type WeatherType =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'fog'
  | 'dust_storm'
  | 'thunderstorm';

export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';

export type ControlMode = 'auto' | 'manual';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type RobotModelId =
  | 'relay_01'
  | 'scout_x'
  | 'titan_r'
  | 'aqua_7'
  | 'swift_drone'
  | 'medic_4'
  | 'spectra'
  | 'crawler_9'
  | 'atlas_m'
  | 'sentinel';

export type RobotLocomotionClass =
  | 'quadruped'
  | 'wheeled'
  | 'tracked'
  | 'amphibious'
  | 'aerial'
  | 'hexapod'
  | 'micro_crawler'
  | 'biped_mech';

export type UpgradeCategory =
  | 'battery'
  | 'speed'
  | 'lidar'
  | 'thermal'
  | 'weather_seal'
  | 'armor';

export type EquipmentModuleId =
  | 'thermal_cam'
  | 'high_gain_lidar'
  | 'med_bay'
  | 'comm_relay_kit'
  | 'hydro_seal'
  | 'debris_claw';

export interface EquipmentModule {
  id: EquipmentModuleId;
  name: string;
  description: string;
  priceRc: number;
  effectSummary: string;
  modifiers: {
    lidarBonusM?: number;
    cameraBonusM?: number;
    batteryBonusPct?: number;
    speedBonusMult?: number;
    waterproof?: boolean;
    hazmatShield?: boolean;
    debrisClear?: boolean;
    medSupply?: boolean;
    relayBoost?: boolean;
  };
}

export interface RobotCapabilities {
  waterproof: boolean;
  aerial: boolean;
  hazmatShield: boolean;
  heavyLift: boolean;
  medicalCargo: boolean;
  narrowAccess: boolean;
  commRelay: boolean;
  thermalSensor: boolean;
}

export interface RobotCatalogEntry {
  id: RobotModelId;
  codeName: string;
  role: string;
  locomotion: RobotLocomotionClass;
  description: string;
  priceRc: number;
  unlockChapter: number;
  primaryColor: string;
  accentColor: string;
  baseStats: {
    speedMps: number;
    batteryCapacity: number; // relative multiplier, 100 = baseline
    lidarRangeM: number;
    cameraRangeM: number;
    weatherResistance: number; // 0..1
    clearanceLevel: number; // 1..3
  };
  capabilities: RobotCapabilities;
  specialAbility: string;
}

export interface OwnedRobotState {
  robot_id: RobotModelId;
  custom_name: string;
  hull_color: string;
  integrity_pct: number;
  upgrades: Record<UpgradeCategory, number>; // level 0..3
  equipped_modules: EquipmentModuleId[];
  deployment_slot: 1 | 2 | null;
  purchased_at: string;
}

export interface EffectiveRobotStats {
  speedMps: number;
  batteryDrainMultiplier: number;
  lidarRangeM: number;
  cameraRangeM: number;
  weatherResistance: number;
  capabilities: RobotCapabilities;
}

export type MissionKind =
  | 'search_and_rescue'
  | 'comm_restoration'
  | 'flood_response'
  | 'hazmat_inspection'
  | 'earthquake_rescue'
  | 'ashfall_finale'
  | 'medical_delivery'
  | 'debris_clearing'
  | 'infrastructure_assessment';

export interface DialogueLine {
  speaker: string;
  role: string;
  text: string;
}

export interface RegionMeta {
  id: RegionId;
  name: string;
  subtitle: string;
  description: string;
  unlockChapter: number;
  defaultWeather: WeatherType;
  defaultTime: TimeOfDay;
  mapCoords: { xPct: number; yPct: number };
  ambientAccent: string;
}

export interface MissionDifficultyModifiers {
  batteryDrainMult?: number;
  hazardDamageMult?: number;
  survivorCoord?: GridCoord;
  relayCoord?: GridCoord;
  medicalCoord?: GridCoord;
  extraHiddenCollapses?: GridCoord[];
  extraElectrical?: GridCoord[];
  extraChemical?: GridCoord[];
  extraUnstable?: GridCoord[];
  extraRubble?: GridCoord[];
}

export interface CampaignMissionDef {
  id: string;
  chapter: number; // 0 for repeatable side missions
  tier?: number; // 1..4 order within a chapter/level
  regionId: RegionId;
  title: string;
  kind: MissionKind;
  difficulty: 'Standard' | 'Elevated' | 'Severe' | 'Critical';
  description: string;
  defaultInstruction: string;
  rewardRc: number;
  optionalBonusRc: number;
  optionalObjectiveLabel: string;
  recommendedRobots: RobotModelId[];
  requiredCapability?: keyof RobotCapabilities;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  modifiers?: MissionDifficultyModifiers;
  briefingDialogue: DialogueLine[];
  completionDialogue: DialogueLine[];
  hasEthicalChoice?: boolean;
}

export interface EconomyTransaction {
  id: string;
  amount_rc: number; // positive = earn, negative = spend
  balance_after: number;
  category: 'mission_reward' | 'robot_purchase' | 'upgrade' | 'equipment' | 'repair' | 'bonus';
  description: string;
  created_at: string;
}

export interface PlayerSettings {
  graphicsQuality: GraphicsQuality;
  weatherEnabled: boolean;
  dayNightCycle: boolean;
  audioEnabled: boolean;
  voiceDialogue: boolean;
  showLidar: boolean;
}

export interface PlayerProfile {
  profile_id: string;
  commander_name: string;
  credits_rc: number;
  current_chapter: number;
  completed_mission_ids: string[];
  unlocked_regions: RegionId[];
  active_region: RegionId;
  ashfall_ending?: 'human_oversight' | 'autonomous_accord' | null;
  settings: PlayerSettings;
  updated_at: string;
}

export interface SaveSlotSummary {
  slot_id: string;
  label: string;
  commander_name: string;
  credits_rc: number;
  current_chapter: number;
  owned_robot_count: number;
  saved_at: string;
}
