import type {
  CampaignMissionDef,
  EffectiveRobotStats,
  EquipmentModule,
  EquipmentModuleId,
  OwnedRobotState,
  RegionId,
  RegionMeta,
  RobotCatalogEntry,
  RobotModelId,
  UpgradeCategory,
  WeatherType,
} from './types';

export const MERIDIAN_REGIONS: Record<RegionId, RegionMeta> = {
  industrial_district: {
    id: 'industrial_district',
    name: 'Industrial District',
    subtitle: 'Sector 07 Power & Fabrication',
    description:
      'Earthquake-damaged power switchgear, collapsed fabrication halls, and RELAY Response launch depot.',
    unlockChapter: 1,
    defaultWeather: 'cloudy',
    defaultTime: 'day',
    mapCoords: { xPct: 24, yPct: 58 },
    ambientAccent: '#f97316',
  },
  meridian_city: {
    id: 'meridian_city',
    name: 'Meridian City',
    subtitle: 'Metropolitan Coastal Core',
    description:
      'High-rise commercial towers, snapped municipal relay masts, street grid intersections, and stranded civilians.',
    unlockChapter: 2,
    defaultWeather: 'rain',
    defaultTime: 'night',
    mapCoords: { xPct: 48, yPct: 42 },
    ambientAccent: '#38bdf8',
  },
  old_quarter: {
    id: 'old_quarter',
    name: 'Old Quarter',
    subtitle: 'Historic Flooded Canals',
    description:
      'Narrow cobblestone alleys and storm-surge canal streets submerged under coastal floodwater.',
    unlockChapter: 3,
    defaultWeather: 'heavy_rain',
    defaultTime: 'sunset',
    mapCoords: { xPct: 34, yPct: 30 },
    ambientAccent: '#0ea5e9',
  },
  port_meridian: {
    id: 'port_meridian',
    name: 'Port Meridian',
    subtitle: 'Maritime Freight Terminals',
    description:
      'Stacked intermodal container yards, gantry cranes, and leaking chemical tanker manifolds.',
    unlockChapter: 4,
    defaultWeather: 'fog',
    defaultTime: 'dawn',
    mapCoords: { xPct: 16, yPct: 24 },
    ambientAccent: '#eab308',
  },
  highland_province: {
    id: 'highland_province',
    name: 'Highland Province',
    subtitle: 'Alpine Ridge & Switchbacks',
    description:
      'Steep mountain passes, landslide boulders, collapsed road bridges, and remote telemetry outposts.',
    unlockChapter: 5,
    defaultWeather: 'fog',
    defaultTime: 'day',
    mapCoords: { xPct: 72, yPct: 22 },
    ambientAccent: '#10b981',
  },
  desert_corridor: {
    id: 'desert_corridor',
    name: 'Desert Corridor',
    subtitle: 'Solar Highway & Substation Array',
    description:
      'Arid highway trunk lines, sand-swept relay pylons, and extreme heat dust storms.',
    unlockChapter: 4,
    defaultWeather: 'dust_storm',
    defaultTime: 'sunset',
    mapCoords: { xPct: 68, yPct: 72 },
    ambientAccent: '#f59e0b',
  },
  research_valley: {
    id: 'research_valley',
    name: 'Research Valley',
    subtitle: 'ARIA-Net Core Campus',
    description:
      'High-security robotics laboratories and automated infrastructure control nexus behind Operation Ashfall.',
    unlockChapter: 6,
    defaultWeather: 'thunderstorm',
    defaultTime: 'night',
    mapCoords: { xPct: 84, yPct: 46 },
    ambientAccent: '#ef4444',
  },
};

export const ROBOT_CATALOG: Record<RobotModelId, RobotCatalogEntry> = {
  relay_01: {
    id: 'relay_01',
    codeName: 'RELAY-01',
    role: 'All-Terrain Quadruped',
    locomotion: 'quadruped',
    description:
      'Standard articulated 4-leg rescue quadruped engineered for rubble stability, LiDAR mapping, and safe indoor extraction.',
    priceRc: 0,
    unlockChapter: 1,
    primaryColor: '#ea580c',
    accentColor: '#20252d',
    baseStats: {
      speedMps: 2.15,
      batteryCapacity: 100,
      lidarRangeM: 6.5,
      cameraRangeM: 6.0,
      weatherResistance: 0.65,
      clearanceLevel: 1,
    },
    capabilities: {
      waterproof: false,
      aerial: false,
      hazmatShield: false,
      heavyLift: false,
      medicalCargo: false,
      narrowAccess: false,
      commRelay: false,
      thermalSensor: true,
    },
    specialAbility: 'Balanced diagonal-trot stability over fractured concrete.',
  },
  scout_x: {
    id: 'scout_x',
    codeName: 'SCOUT-X',
    role: 'High-Speed Recon Rover',
    locomotion: 'wheeled',
    description:
      'Carbon-framed 4x4 suspension recon unit with elevated optical mast for rapid urban street sweeps and signal triangulation.',
    priceRc: 400,
    unlockChapter: 1,
    primaryColor: '#0284c7',
    accentColor: '#1e293b',
    baseStats: {
      speedMps: 3.15,
      batteryCapacity: 115,
      lidarRangeM: 8.0,
      cameraRangeM: 7.5,
      weatherResistance: 0.7,
      clearanceLevel: 1,
    },
    capabilities: {
      waterproof: false,
      aerial: false,
      hazmatShield: false,
      heavyLift: false,
      medicalCargo: false,
      narrowAccess: true,
      commRelay: true,
      thermalSensor: true,
    },
    specialAbility: '+45% top speed and extended long-range optical mast.',
  },
  titan_r: {
    id: 'titan_r',
    codeName: 'TITAN-R',
    role: 'Heavy Tracked Breacher',
    locomotion: 'tracked',
    description:
      'Twin-tread armored chassis with articulated dozer blade and high-capacity battery bank for severe structural zones.',
    priceRc: 750,
    unlockChapter: 2,
    primaryColor: '#d97706',
    accentColor: '#27272a',
    baseStats: {
      speedMps: 1.85,
      batteryCapacity: 150,
      lidarRangeM: 7.0,
      cameraRangeM: 6.0,
      weatherResistance: 0.85,
      clearanceLevel: 3,
    },
    capabilities: {
      waterproof: false,
      aerial: false,
      hazmatShield: false,
      heavyLift: true,
      medicalCargo: false,
      narrowAccess: false,
      commRelay: false,
      thermalSensor: true,
    },
    specialAbility: 'Can breach & clear moderate rubble obstructions with front plow.',
  },
  aqua_7: {
    id: 'aqua_7',
    codeName: 'AQUA-7',
    role: 'Amphibious Floodcraft',
    locomotion: 'amphibious',
    description:
      'Sealed twin-pontoon rescue craft with articulated hydro-wheels and rear ducted waterjets built for coastal storm surges.',
    priceRc: 900,
    unlockChapter: 3,
    primaryColor: '#0ea5e9',
    accentColor: '#0f172a',
    baseStats: {
      speedMps: 2.35,
      batteryCapacity: 125,
      lidarRangeM: 7.0,
      cameraRangeM: 6.5,
      weatherResistance: 0.95,
      clearanceLevel: 2,
    },
    capabilities: {
      waterproof: true,
      aerial: false,
      hazmatShield: false,
      heavyLift: false,
      medicalCargo: true,
      narrowAccess: false,
      commRelay: false,
      thermalSensor: true,
    },
    specialAbility: 'Full floodwater submersion immunity and aquatic propulsion.',
  },
  swift_drone: {
    id: 'swift_drone',
    codeName: 'SWIFT-DRONE',
    role: 'VTOL Aerial Recon',
    locomotion: 'aerial',
    description:
      'Autonomous quad-rotor aerial scout flying above ground rubble and floodwaters to map corridors and spot survivors fast.',
    priceRc: 1150,
    unlockChapter: 2,
    primaryColor: '#e2e8f0',
    accentColor: '#f97316',
    baseStats: {
      speedMps: 3.65,
      batteryCapacity: 95,
      lidarRangeM: 9.5,
      cameraRangeM: 8.5,
      weatherResistance: 0.55,
      clearanceLevel: 3,
    },
    capabilities: {
      waterproof: true,
      aerial: true,
      hazmatShield: true,
      heavyLift: false,
      medicalCargo: false,
      narrowAccess: true,
      commRelay: true,
      thermalSensor: true,
    },
    specialAbility: 'Flies over rubble, floodwater, and low barriers effortlessly.',
  },
  medic_4: {
    id: 'medic_4',
    codeName: 'MEDIC-4',
    role: 'Autonomous Med-Courier',
    locomotion: 'wheeled',
    description:
      'Pressurized emergency supply carrier equipped with biometric triage beacons and stabilized trauma payload.',
    priceRc: 850,
    unlockChapter: 2,
    primaryColor: '#f8fafc',
    accentColor: '#dc2626',
    baseStats: {
      speedMps: 2.55,
      batteryCapacity: 125,
      lidarRangeM: 7.0,
      cameraRangeM: 6.8,
      weatherResistance: 0.78,
      clearanceLevel: 2,
    },
    capabilities: {
      waterproof: false,
      aerial: false,
      hazmatShield: false,
      heavyLift: false,
      medicalCargo: true,
      narrowAccess: false,
      commRelay: true,
      thermalSensor: true,
    },
    specialAbility: 'Completes trauma supply deliveries and stabilizes civilian vitals.',
  },
  spectra: {
    id: 'spectra',
    codeName: 'SPECTRA',
    role: 'Hexapod Hazmat Inspector',
    locomotion: 'hexapod',
    description:
      'Six-legged chemical & thermal spectrometer unit shielded against corrosive leaks and high-EM industrial switchgear.',
    priceRc: 1350,
    unlockChapter: 4,
    primaryColor: '#eab308',
    accentColor: '#18181b',
    baseStats: {
      speedMps: 2.1,
      batteryCapacity: 135,
      lidarRangeM: 8.5,
      cameraRangeM: 7.8,
      weatherResistance: 0.9,
      clearanceLevel: 2,
    },
    capabilities: {
      waterproof: true,
      aerial: false,
      hazmatShield: true,
      heavyLift: false,
      medicalCargo: false,
      narrowAccess: true,
      commRelay: true,
      thermalSensor: true,
    },
    specialAbility: 'Chemical & EM shielding permits safe hazmat leak isolation.',
  },
  crawler_9: {
    id: 'crawler_9',
    codeName: 'CRAWLER-9',
    role: 'Articulated Micro-Crawler',
    locomotion: 'micro_crawler',
    description:
      'Low-profile multi-segment rescue snake crawler engineered for tight structural voids and collapsed stairwells.',
    priceRc: 650,
    unlockChapter: 3,
    primaryColor: '#10b981',
    accentColor: '#111827',
    baseStats: {
      speedMps: 2.25,
      batteryCapacity: 110,
      lidarRangeM: 6.2,
      cameraRangeM: 6.5,
      weatherResistance: 0.8,
      clearanceLevel: 2,
    },
    capabilities: {
      waterproof: true,
      aerial: false,
      hazmatShield: false,
      heavyLift: false,
      medicalCargo: false,
      narrowAccess: true,
      commRelay: false,
      thermalSensor: true,
    },
    specialAbility: 'Low-drain chassis with exceptional narrow-gap maneuverability.',
  },
  atlas_m: {
    id: 'atlas_m',
    codeName: 'ATLAS-M',
    role: 'Heavy Manipulator Mech',
    locomotion: 'biped_mech',
    description:
      'Dual-arm hydraulic rescue platform capable of lifting collapsed beams and clearing heavy landslide barricades.',
    priceRc: 1750,
    unlockChapter: 5,
    primaryColor: '#f97316',
    accentColor: '#1f2937',
    baseStats: {
      speedMps: 2.0,
      batteryCapacity: 165,
      lidarRangeM: 8.0,
      cameraRangeM: 7.0,
      weatherResistance: 0.88,
      clearanceLevel: 3,
    },
    capabilities: {
      waterproof: false,
      aerial: false,
      hazmatShield: true,
      heavyLift: true,
      medicalCargo: true,
      narrowAccess: false,
      commRelay: false,
      thermalSensor: true,
    },
    specialAbility: 'Dual robotic manipulators dismantle heavy structural collapses.',
  },
  sentinel: {
    id: 'sentinel',
    codeName: 'SENTINEL',
    role: 'Fleet Command & Hazard Unit',
    locomotion: 'quadruped',
    description:
      'Flagship autonomous telemetry and multi-spectral relay platform built for Research Valley endgame operations.',
    priceRc: 2400,
    unlockChapter: 6,
    primaryColor: '#38bdf8',
    accentColor: '#0f172a',
    baseStats: {
      speedMps: 2.8,
      batteryCapacity: 180,
      lidarRangeM: 10.5,
      cameraRangeM: 9.0,
      weatherResistance: 0.96,
      clearanceLevel: 3,
    },
    capabilities: {
      waterproof: true,
      aerial: false,
      hazmatShield: true,
      heavyLift: true,
      medicalCargo: true,
      narrowAccess: true,
      commRelay: true,
      thermalSensor: true,
    },
    specialAbility: 'Full multi-hazard hardening + wide-area fleet relay boost.',
  },
};

export const EQUIPMENT_CATALOG: Record<EquipmentModuleId, EquipmentModule> = {
  thermal_cam: {
    id: 'thermal_cam',
    name: 'Cryo-Thermal Optics Mk II',
    description: 'Penetrates heavy smoke, fog, and dust storms to lock survivor heat signatures.',
    priceRc: 300,
    effectSummary: '+2.5m Survivor Camera Range',
    modifiers: { cameraBonusM: 2.5 },
  },
  high_gain_lidar: {
    id: 'high_gain_lidar',
    name: 'Solid-State 3D LiDAR Array',
    description: 'Extends forward depth perception fan to detect collapses earlier.',
    priceRc: 350,
    effectSummary: '+2.5m LiDAR Scan Depth',
    modifiers: { lidarBonusM: 2.5 },
  },
  med_bay: {
    id: 'med_bay',
    name: 'Stabilized Trauma Pack',
    description: 'Modular medical compartment enabling trauma delivery objectives.',
    priceRc: 400,
    effectSummary: 'Enables Medical Delivery + +10% Battery',
    modifiers: { medSupply: true, batteryBonusPct: 10 },
  },
  comm_relay_kit: {
    id: 'comm_relay_kit',
    name: 'Mesh Relay Transceiver',
    description: 'Boosts automated node restoration and fleet uplink efficiency.',
    priceRc: 350,
    effectSummary: 'Enables Comm Relay + +12% Speed',
    modifiers: { commRelay: true, speedBonusMult: 0.12 } as unknown as EquipmentModule['modifiers'],
  },
  hydro_seal: {
    id: 'hydro_seal',
    name: 'IP69K Hydro-Seal Armor',
    description: 'Waterproofs chassis actuators and electronics against floodwaters.',
    priceRc: 450,
    effectSummary: 'Grants Waterproof Flood Traversal',
    modifiers: { waterproof: true },
  },
  debris_claw: {
    id: 'debris_claw',
    name: 'Compact Hydraulic Grappler',
    description: 'Allows lighter units to clear blocked corridors and rubble piles.',
    priceRc: 500,
    effectSummary: 'Grants Heavy Debris Clearing',
    modifiers: { debrisClear: true },
  },
};

// Fix comm_relay_kit modifiers key cleanly
EQUIPMENT_CATALOG.comm_relay_kit.modifiers = {
  relayBoost: true,
  speedBonusMult: 0.12,
};

export const UPGRADE_COSTS: Record<UpgradeCategory, { label: string; basePrice: number; desc: string }> = {
  battery: { label: 'Solid-State Battery', basePrice: 220, desc: '-12% power drain per level' },
  speed: { label: 'Actuator Overdrive', basePrice: 240, desc: '+14% locomotion speed per level' },
  lidar: { label: 'LiDAR Optics', basePrice: 200, desc: '+1.2m depth range per level' },
  thermal: { label: 'Thermal Imaging', basePrice: 210, desc: '+1.0m survivor lock range per level' },
  weather_seal: { label: 'Environmental Sealing', basePrice: 180, desc: '+10% storm & hazard resilience' },
  armor: { label: 'Composite Plating', basePrice: 200, desc: 'Reduces structural impact wear' },
};

export const CAMPAIGN_MISSIONS: CampaignMissionDef[] = [
  // ================= LEVEL 1: INDUSTRIAL DISTRICT (3 MISSIONS) =================
  {
    id: 'ch1_first_light',
    chapter: 1,
    tier: 1,
    regionId: 'industrial_district',
    title: '1.1 First Light',
    kind: 'search_and_rescue',
    difficulty: 'Standard',
    description:
      'A 6.4 magnitude tremor struck Industrial Sector 07. Deploy RELAY-01, navigate around the collapsed Eastern Corridor, locate the trapped engineer, and return safely to charge.',
    defaultInstruction: 'Find the survivor and return safely.',
    rewardRc: 500,
    optionalBonusRc: 200,
    optionalObjectiveLabel: 'Complete with zero hazard entries and >50% battery',
    recommendedRobots: ['relay_01'],
    weather: 'cloudy',
    timeOfDay: 'day',
    modifiers: {
      batteryDrainMult: 1.0,
      hazardDamageMult: 1.0,
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Welcome to Meridian, Commander. Humans cannot enter Sector 07 without risking secondary collapse. Your quadruped RELAY-01 is staged at Launch Bay.',
      },
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Our pre-quake blueprints may be outdated. Let Navigation plan the route, and trust the deterministic Safety Agent—it will override anything unsafe.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Extraction team reached the engineer thanks to your coordinates. You have earned 500 RC and unlocked full Sector 07 contracts.',
      },
    ],
  },
  {
    id: 'ch1_substation_check',
    chapter: 1,
    tier: 2,
    regionId: 'industrial_district',
    title: '1.2 Switchgear Telemetry Sweep',
    kind: 'comm_restoration',
    difficulty: 'Standard',
    description:
      'Power telemetry in the Southern Maintenance Bypass dropped offline. Restore the industrial relay node, verify technician safety, and return to base.',
    defaultInstruction: 'Restore the communication relay, locate the survivor, and return to base.',
    rewardRc: 450,
    optionalBonusRc: 180,
    optionalObjectiveLabel: 'Finish without triggering electrical proximity alerts',
    recommendedRobots: ['relay_01', 'scout_x'],
    weather: 'clear',
    timeOfDay: 'dawn',
    modifiers: {
      batteryDrainMult: 1.05,
      hazardDamageMult: 1.05,
      relayCoord: { x: 16, z: 13 },
      survivorCoord: { x: 21, z: 14 },
      extraRubble: [{ x: 10, z: 12 }, { x: 10, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'The southern switchgear relay stopped pinging after an aftershock. Route carefully around the live conduit at central hall.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Switchgear bus telemetry restored—and the logs already show anomalous remote shutoff packets.',
      },
    ],
  },
  {
    id: 'ch1_trauma_run',
    chapter: 1,
    tier: 3,
    regionId: 'industrial_district',
    title: '1.3 Bay-4 Trauma Extraction',
    kind: 'medical_delivery',
    difficulty: 'Standard',
    description:
      'Deliver stabilized trauma supplies to the isolated fabrication wing, verify the trapped supervisor in the southeast bay, and return safely.',
    defaultInstruction: 'Deliver medical supplies, locate the survivor, and return to base.',
    rewardRc: 550,
    optionalBonusRc: 200,
    optionalObjectiveLabel: 'Complete full loop with >45% battery reserve',
    recommendedRobots: ['relay_01', 'medic_4'],
    weather: 'cloudy',
    timeOfDay: 'sunset',
    modifiers: {
      batteryDrainMult: 1.08,
      hazardDamageMult: 1.1,
      medicalCoord: { x: 22, z: 7 },
      survivorCoord: { x: 23, z: 15 },
      extraHiddenCollapses: [{ x: 19, z: 11 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'A floor foreman is pinned near Southeast Bay 4. Deliver emergency medical packs and confirm extraction coordinates.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Industrial District stabilized. Meridian City emergency channels are requesting immediate deployment.',
      },
    ],
  },

  // ================= LEVEL 2: MERIDIAN CITY (3 MISSIONS) =================
  {
    id: 'ch2_broken_signals',
    chapter: 2,
    tier: 1,
    regionId: 'meridian_city',
    title: '2.1 Broken Signals',
    kind: 'comm_restoration',
    difficulty: 'Elevated',
    description:
      'Meridian City emergency repeaters went dark simultaneously under storm rain. Restore the downtown relay node, locate the stranded medic, and extract.',
    defaultInstruction: 'Restore the communication relay, locate the survivor, and return to base.',
    rewardRc: 750,
    optionalBonusRc: 250,
    optionalObjectiveLabel: 'Deploy two units or restore relay under 70 seconds',
    recommendedRobots: ['relay_01', 'scout_x', 'swift_drone'],
    weather: 'rain',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.12,
      hazardDamageMult: 1.2,
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Three municipal repeaters dropped off the grid in lockstep across Meridian City. Storm rain reduces optical visibility.',
      },
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'Check the downtown switching node. If ARIA-Net firmware pushed a bad load-shedding patch, civilians in the tower basement will have zero signal.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'City telemetry is back online—and the relay logs show unauthorized command packets routed from downtown.',
      },
    ],
  },
  {
    id: 'ch2_clinic_convoy',
    chapter: 2,
    tier: 2,
    regionId: 'meridian_city',
    title: '2.2 4th Ave Clinic Lifeline',
    kind: 'medical_delivery',
    difficulty: 'Elevated',
    description:
      'Downed streetcar power lines cut off 4th Avenue Clinic. Thread past electrified intersections, deliver trauma packs, and rescue the stranded triage nurse.',
    defaultInstruction: 'Deliver medical supplies to the downtown shelter, find the survivor, and return to base.',
    rewardRc: 820,
    optionalBonusRc: 260,
    optionalObjectiveLabel: 'Zero electrical hazard entries across rain-slicked roads',
    recommendedRobots: ['medic_4', 'scout_x', 'relay_01'],
    weather: 'rain',
    timeOfDay: 'day',
    modifiers: {
      batteryDrainMult: 1.16,
      hazardDamageMult: 1.25,
      medicalCoord: { x: 21, z: 14 },
      survivorCoord: { x: 23, z: 16 },
      extraElectrical: [{ x: 8, z: 9 }, { x: 8, z: 10 }],
      extraHiddenCollapses: [{ x: 15, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Ambulances cannot pass 8th Street due to fallen trolley lines. Send an autonomous courier through the southern avenue.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Clinic confirmed insulin and trauma delivery. Excellent urban routing.',
      },
    ],
  },
  {
    id: 'ch2_blackout_tower',
    chapter: 2,
    tier: 3,
    regionId: 'meridian_city',
    title: '2.3 Meridian Tower Blackout',
    kind: 'search_and_rescue',
    difficulty: 'Elevated',
    description:
      'Heavy rain shorted the central commercial tower lobby. Enter the interior atrium to reset the backup relay, rescue the security officer on East Plaza, and extract.',
    defaultInstruction: 'Restore the downtown lobby relay, find the survivor, and return safely.',
    rewardRc: 900,
    optionalBonusRc: 300,
    optionalObjectiveLabel: 'Complete atrium breach with Grade A or S',
    recommendedRobots: ['swift_drone', 'titan_r', 'scout_x'],
    weather: 'heavy_rain',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.2,
      hazardDamageMult: 1.3,
      relayCoord: { x: 13, z: 10 },
      survivorCoord: { x: 24, z: 5 },
      extraElectrical: [{ x: 19, z: 8 }, { x: 19, z: 9 }],
      extraRubble: [{ x: 7, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'The lobby backup node holds raw ARIA-Net routing tables. Heavy rain is draining batteries faster—watch your return margin.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'Telemetry recovered! The automated cascade just hit the Old Quarter levee gates.',
      },
    ],
  },

  // ================= LEVEL 3: OLD QUARTER (3 MISSIONS) =================
  {
    id: 'ch3_floodline',
    chapter: 3,
    tier: 1,
    regionId: 'old_quarter',
    title: '3.1 Floodline Crossing',
    kind: 'flood_response',
    difficulty: 'Severe',
    description:
      'Levee gates in Old Quarter failed during heavy coastal rain. Deploy an amphibious, aerial, or hydro-sealed unit to cross submerged canals and locate stranded residents.',
    defaultInstruction: 'Navigate the flooded Old Quarter, find the survivor, and return safely.',
    rewardRc: 1000,
    optionalBonusRc: 300,
    optionalObjectiveLabel: 'Keep safety compliance at 100% with zero flood short-circuits',
    recommendedRobots: ['aqua_7', 'swift_drone', 'crawler_9'],
    requiredCapability: 'waterproof',
    weather: 'heavy_rain',
    timeOfDay: 'sunset',
    modifiers: {
      batteryDrainMult: 1.24,
      hazardDamageMult: 1.38,
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Storm surge flooded the Old Quarter canals. Standard ground units will short-circuit in deep water—Safety will block them from entering.',
      },
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Acquire AQUA-7 or SWIFT-DRONE from the Garage, or fit IP69K Hydro-Seal Armor to your active unit before deploying.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Residents evacuated safely. The levee spillway actuators were opened by the same automated token we saw downtown.',
      },
    ],
  },
  {
    id: 'ch3_levee_relay',
    chapter: 3,
    tier: 2,
    regionId: 'old_quarter',
    title: '3.2 Levee Gate Relay',
    kind: 'comm_restoration',
    difficulty: 'Severe',
    description:
      'The north canal pump relay is offline and unstable cobblestones guard the southern bank. Restore the pump relay, locate the hydro-engineer, and extract.',
    defaultInstruction: 'Restore the Old Quarter relay, locate the survivor, and return to base.',
    rewardRc: 1120,
    optionalBonusRc: 320,
    optionalObjectiveLabel: 'Avoid all unstable bank zones while restoring the relay',
    recommendedRobots: ['aqua_7', 'swift_drone', 'scout_x'],
    requiredCapability: 'waterproof',
    weather: 'heavy_rain',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.28,
      hazardDamageMult: 1.45,
      relayCoord: { x: 18, z: 5 },
      survivorCoord: { x: 23, z: 16 },
      extraUnstable: [{ x: 19, z: 14 }, { x: 20, z: 14 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Without the north pump relay, water depth across the plaza will double before dawn.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Pump spillway telemetry locked back under manual operator oversight.',
      },
    ],
  },
  {
    id: 'ch3_canal_triage',
    chapter: 3,
    tier: 3,
    regionId: 'old_quarter',
    title: '3.3 Sunken Alley Triage',
    kind: 'medical_delivery',
    difficulty: 'Severe',
    description:
      'Thunderstorms hit the Old Quarter. Deliver trauma kits to the south courtyard shelter, rescue the trapped medic in the west alley, and return across surging water.',
    defaultInstruction: 'Deliver medical supplies, find the survivor, and return safely.',
    rewardRc: 1250,
    optionalBonusRc: 350,
    optionalObjectiveLabel: 'Complete thunderstorm amphibious run with >45% battery',
    recommendedRobots: ['aqua_7', 'medic_4', 'swift_drone'],
    requiredCapability: 'waterproof',
    weather: 'thunderstorm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.32,
      hazardDamageMult: 1.55,
      medicalCoord: { x: 12, z: 14 },
      survivorCoord: { x: 4, z: 16 },
      extraElectrical: [{ x: 18, z: 7 }, { x: 21, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Lightning knocked out backup generators near the eastern bridge. AQUA-7 carries built-in medical cargo and flood immunity.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Every Old Quarter civilian is accounted for. Next stop: Port Meridian.',
      },
    ],
  },

  // ================= LEVEL 4: PORT MERIDIAN & DESERT CORRIDOR (4 MISSIONS) =================
  {
    id: 'ch4_silent_port',
    chapter: 4,
    tier: 1,
    regionId: 'port_meridian',
    title: '4.1 Silent Port Breach',
    kind: 'hazmat_inspection',
    difficulty: 'Severe',
    description:
      'Automated cranes dropped pressurized cargo at Port Meridian, rupturing chemical manifolds in dense harbor fog. Inspect the hazmat breach, find the dockworker, and return.',
    defaultInstruction: 'Inspect the chemical hazard perimeter, locate the survivor, and return to base.',
    rewardRc: 1350,
    optionalBonusRc: 350,
    optionalObjectiveLabel: 'Coordinate two units simultaneously without chemical exposure',
    recommendedRobots: ['spectra', 'swift_drone', 'relay_01'],
    weather: 'fog',
    timeOfDay: 'dawn',
    modifiers: {
      batteryDrainMult: 1.32,
      hazardDamageMult: 1.55,
    },
    briefingDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'Port Meridian runs on legacy ARIA-Net logistics. A runaway optimization loop overrode crane torque limits.',
      },
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Dense harbor fog cuts optical camera range. Deploy SPECTRA or pair two units so one maps safe lanes while the other isolates the leak.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'The manifold logs confirm it: ARIA-Net is trying to self-heal across Meridian without human sign-off.',
      },
    ],
  },
  {
    id: 'ch4_tanker_containment',
    chapter: 4,
    tier: 2,
    regionId: 'port_meridian',
    title: '4.2 Pier-9 Chemical Containment',
    kind: 'hazmat_inspection',
    difficulty: 'Severe',
    description:
      'A second chemical manifold ruptured along Pier 9 while gantry debris blocked the freight road. Restore the harbor relay, deliver medical gear, and extract the crane operator.',
    defaultInstruction: 'Restore the relay, deliver medical supplies, locate the survivor, and return to base.',
    rewardRc: 1480,
    optionalBonusRc: 380,
    optionalObjectiveLabel: 'Zero unshielded chemical exposure across multi-task run',
    recommendedRobots: ['spectra', 'aqua_7', 'swift_drone'],
    weather: 'fog',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.38,
      hazardDamageMult: 1.7,
      relayCoord: { x: 21, z: 7 },
      medicalCoord: { x: 22, z: 13 },
      survivorCoord: { x: 23, z: 3 },
      extraChemical: [{ x: 18, z: 6 }, { x: 19, z: 6 }, { x: 14, z: 13 }],
      extraHiddenCollapses: [{ x: 17, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Harbor fog and chemical plumes cover both main dock corridors. Dual-robot deployment is strongly advised.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Pier 9 containment valves sealed before harbor runoff could spread.',
      },
    ],
  },
  {
    id: 'ch4_desert_relay',
    chapter: 4,
    tier: 3,
    regionId: 'desert_corridor',
    title: '4.3 Solar Array Relay',
    kind: 'comm_restoration',
    difficulty: 'Severe',
    description:
      'High-velocity dust storms knocked out Substation 4 along Desert Corridor. Restore the relay pylon, check stranded technicians, and return against heavy sand drag.',
    defaultInstruction: 'Restore the Desert Corridor relay, find the survivor, and return safely to base.',
    rewardRc: 1400,
    optionalBonusRc: 350,
    optionalObjectiveLabel: 'Finish with >50% battery despite dust storm drag',
    recommendedRobots: ['scout_x', 'titan_r'],
    weather: 'dust_storm',
    timeOfDay: 'sunset',
    modifiers: {
      batteryDrainMult: 1.36,
      hazardDamageMult: 1.6,
      extraElectrical: [{ x: 12, z: 6 }, { x: 12, z: 7 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Particulate dust slashes optical sensor depth out in the Desert Corridor. Rely on upgraded LiDAR and weather sealing.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Solar grid telemetry restored across the southern corridor.',
      },
    ],
  },
  {
    id: 'ch4_sandstorm_rescue',
    chapter: 4,
    tier: 4,
    regionId: 'desert_corridor',
    title: '4.4 Dune Trench Extraction',
    kind: 'search_and_rescue',
    difficulty: 'Critical',
    description:
      'Night dust storms buried the eastern trunk road. Navigate around high-voltage arcs and collapsed pylons to rescue the solar maintenance chief.',
    defaultInstruction: 'Restore the relay, rescue the stranded technician, and return safely.',
    rewardRc: 1580,
    optionalBonusRc: 400,
    optionalObjectiveLabel: 'Complete night dust-storm extraction with zero collisions',
    recommendedRobots: ['titan_r', 'swift_drone', 'scout_x'],
    weather: 'dust_storm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.42,
      hazardDamageMult: 1.75,
      relayCoord: { x: 19, z: 15 },
      survivorCoord: { x: 23, z: 3 },
      extraElectrical: [{ x: 19, z: 8 }, { x: 19, z: 9 }],
      extraUnstable: [{ x: 15, z: 13 }, { x: 16, z: 13 }],
      extraHiddenCollapses: [{ x: 19, z: 11 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Visibility is under 4 meters in the dust trench. Battery draw is severe—upgrade Battery or deploy two specialized robots.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Desert Corridor cleared. Seismic teams in Highland Province just issued a Priority-1 distress call.',
      },
    ],
  },

  // ================= LEVEL 5: HIGHLAND PROVINCE (3 MISSIONS) =================
  {
    id: 'ch5_faultline',
    chapter: 5,
    tier: 1,
    regionId: 'highland_province',
    title: '5.1 Faultline Pass',
    kind: 'earthquake_rescue',
    difficulty: 'Critical',
    description:
      'A secondary quake fractured Highland Province mountain roads. Coordinate your fleet around landslide cliffs, locate trapped hikers, and extract.',
    defaultInstruction: 'Traverse the Highland pass, rescue the trapped survivor, and return to base.',
    rewardRc: 1800,
    optionalBonusRc: 400,
    optionalObjectiveLabel: 'Complete multi-unit rescue with Grade A or S',
    recommendedRobots: ['titan_r', 'atlas_m', 'swift_drone'],
    weather: 'fog',
    timeOfDay: 'day',
    modifiers: {
      batteryDrainMult: 1.44,
      hazardDamageMult: 1.8,
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Aftershocks destabilized the Highland ridge road. A seismic monitoring crew is cut off beyond the collapsed bridge.',
      },
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Heavy units like TITAN-R or ATLAS-M can breach rockfalls, while aerial scouts pinpoint survivors from above.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'The Highland crew recovered the first half of the master telemetry key.',
      },
    ],
  },
  {
    id: 'ch5_ridge_medical',
    chapter: 5,
    tier: 2,
    regionId: 'highland_province',
    title: '5.2 Alpine Bridge Trauma Drop',
    kind: 'medical_delivery',
    difficulty: 'Critical',
    description:
      'Severe rain washed out the eastern ridge spur. Deliver trauma supplies to the south switchback, restore the alpine repeater, and rescue the stranded medic.',
    defaultInstruction: 'Deliver medical supplies, restore the relay, locate the survivor, and return to base.',
    rewardRc: 1950,
    optionalBonusRc: 450,
    optionalObjectiveLabel: 'Zero unstable-ledge damage across steep switchbacks',
    recommendedRobots: ['atlas_m', 'medic_4', 'swift_drone'],
    weather: 'heavy_rain',
    timeOfDay: 'sunset',
    modifiers: {
      batteryDrainMult: 1.48,
      hazardDamageMult: 1.9,
      medicalCoord: { x: 21, z: 15 },
      relayCoord: { x: 20, z: 13 },
      survivorCoord: { x: 23, z: 6 },
      extraUnstable: [{ x: 18, z: 6 }, { x: 18, z: 7 }],
      extraHiddenCollapses: [{ x: 17, z: 13 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Heavy rain turns alpine slopes treacherous. Pair a trauma carrier with a scout or heavy breacher.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Medical drop and ridge repeater verified online.',
      },
    ],
  },
  {
    id: 'ch5_aftershock_cascade',
    chapter: 5,
    tier: 3,
    regionId: 'highland_province',
    title: '5.3 Aftershock Cascade',
    kind: 'search_and_rescue',
    difficulty: 'Critical',
    description:
      'Multiple hidden landslides severed both Highland switchback lanes during a night thunderstorm. Dynamically replan around cascading rockfalls to extract the telemetry lead.',
    defaultInstruction: 'Restore the north ridge relay, find the survivor, and return safely.',
    rewardRc: 2100,
    optionalBonusRc: 500,
    optionalObjectiveLabel: 'Survive triple-collapse gauntlet with >40% battery remaining',
    recommendedRobots: ['atlas_m', 'titan_r', 'swift_drone'],
    weather: 'thunderstorm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.54,
      hazardDamageMult: 2.0,
      relayCoord: { x: 21, z: 3 },
      survivorCoord: { x: 22, z: 17 },
      extraUnstable: [{ x: 7, z: 13 }, { x: 8, z: 13 }, { x: 19, z: 12 }],
      extraHiddenCollapses: [{ x: 17, z: 5 }, { x: 17, z: 6 }, { x: 20, z: 14 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Expect hidden collapses on both approaches. Your battery reserves will be pushed to the limit—upgrade or coordinate two units.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Master telemetry key assembled. Prepare your strongest fleet for Research Valley.',
      },
    ],
  },

  // ================= LEVEL 6: RESEARCH VALLEY (4 MISSIONS) =================
  {
    id: 'ch6_outer_perimeter',
    chapter: 6,
    tier: 1,
    regionId: 'research_valley',
    title: '6.1 ARIA-Net Outer Breach',
    kind: 'search_and_rescue',
    difficulty: 'Critical',
    description:
      'ARIA-Net lockdown electrified the Research Valley perimeter gate. Breach past live switchgear, restore the outer relay, and extract trapped security staff.',
    defaultInstruction: 'Restore the relay, locate the survivor, and return safely to base.',
    rewardRc: 2200,
    optionalBonusRc: 500,
    optionalObjectiveLabel: 'Zero electrical shorts under storm lockdown',
    recommendedRobots: ['sentinel', 'spectra', 'swift_drone'],
    weather: 'thunderstorm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.55,
      hazardDamageMult: 2.0,
      relayCoord: { x: 13, z: 6 },
      survivorCoord: { x: 19, z: 15 },
      extraElectrical: [{ x: 6, z: 9 }, { x: 6, z: 10 }],
    },
    briefingDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'Research Valley perimeter conduits are running at overload capacity. One wrong step drains chassis integrity rapidly.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Outer security lockdown bypassed. Advancing toward the Telemetry Core.',
      },
    ],
  },
  {
    id: 'ch6_core_relay',
    chapter: 6,
    tier: 2,
    regionId: 'research_valley',
    title: '6.2 Telemetry Core Override',
    kind: 'hazmat_inspection',
    difficulty: 'Critical',
    description:
      'Coolant lines ruptured alongside downed high-voltage conduits inside the main lab quadrangle. Isolate the hazmat breach, reset the core relay, and rescue the lead systems engineer.',
    defaultInstruction: 'Inspect the chemical hazard, restore the relay, find the survivor, and return to base.',
    rewardRc: 2350,
    optionalBonusRc: 550,
    optionalObjectiveLabel: 'Deploy SPECTRA or SENTINEL for zero chemical contamination',
    recommendedRobots: ['sentinel', 'spectra', 'atlas_m'],
    weather: 'thunderstorm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.58,
      hazardDamageMult: 2.1,
      relayCoord: { x: 20, z: 4 },
      survivorCoord: { x: 22, z: 16 },
      extraChemical: [{ x: 19, z: 8 }, { x: 19, z: 9 }],
      extraElectrical: [{ x: 19, z: 11 }],
    },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Dual chemical and electrical choke points guard the East Quadrangle. Coordinate two specialized units or field SENTINEL.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Telemetry core override accepted—only the Reactor Wing lockdown remains.',
      },
    ],
  },
  {
    id: 'ch6_containment_med',
    chapter: 6,
    tier: 3,
    regionId: 'research_valley',
    title: '6.3 Reactor Wing Triage',
    kind: 'medical_delivery',
    difficulty: 'Critical',
    description:
      'Coolant vapor flooded the central walkway while severe power drain taxes every unit. Deliver emergency trauma packs, restore the south relay, and extract the reactor medic.',
    defaultInstruction: 'Deliver medical supplies, restore the relay, rescue the survivor, and return to base.',
    rewardRc: 2500,
    optionalBonusRc: 600,
    optionalObjectiveLabel: 'Finish with Grade S despite maximum 1.6x power drain',
    recommendedRobots: ['sentinel', 'atlas_m', 'medic_4'],
    weather: 'thunderstorm',
    timeOfDay: 'night',
    modifiers: {
      batteryDrainMult: 1.62,
      hazardDamageMult: 2.2,
      medicalCoord: { x: 21, z: 14 },
      relayCoord: { x: 13, z: 16 },
      survivorCoord: { x: 23, z: 4 },
      extraChemical: [{ x: 12, z: 8 }, { x: 12, z: 11 }],
      extraHiddenCollapses: [{ x: 19, z: 9 }, { x: 19, z: 10 }],
    },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Maximum storm drag and twin central collapses will test your upgrades to the core. Keep battery reserves above 18%.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Reactor trauma team stabilized. Only the final ARIA-Net core extraction remains.',
      },
    ],
  },
  {
    id: 'ch6_ashfall',
    chapter: 6,
    tier: 4,
    regionId: 'research_valley',
    title: '6.4 Ashfall Finale',
    kind: 'ashfall_finale',
    difficulty: 'Critical',
    description:
      'Storm lightning batters Research Valley as ARIA-Net enters final lockdown. Coordinate your elite fleet past electrical, chemical, and seismic traps, rescue Dr. Vance’s staff, and choose Meridian’s autonomous future.',
    defaultInstruction: 'Restore the research valley relay, rescue the trapped staff, and return to base.',
    rewardRc: 3000,
    optionalBonusRc: 750,
    optionalObjectiveLabel: 'Achieve S-Rank fleet coordination in endgame thunderstorm',
    recommendedRobots: ['sentinel', 'atlas_m', 'spectra', 'swift_drone'],
    weather: 'thunderstorm',
    timeOfDay: 'night',
    hasEthicalChoice: true,
    modifiers: {
      batteryDrainMult: 1.65,
      hazardDamageMult: 2.3,
      relayCoord: { x: 19, z: 5 },
      survivorCoord: { x: 22, z: 9 },
      extraElectrical: [{ x: 12, z: 6 }],
      extraChemical: [{ x: 19, z: 11 }],
      extraUnstable: [{ x: 12, z: 12 }],
    },
    briefingDialogue: [
      {
        speaker: 'Dr. Marcus Thorne',
        role: 'Former Grid Architect',
        text: 'ARIA-Net isn’t malicious—it was built with zero deterministic human-safety boundaries. Every failure was a blind optimization loop.',
      },
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'This is what RELAY Response was built for. Deploy your fleet, extract the research staff, and decide how Meridian rebuilds.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Meridian is stabilizing. Whatever path we choose next, humans and autonomous machines now share clear, accountable rules.',
      },
    ],
  },

  // ================= REPEATABLE SIDE CONTRACTS =================
  {
    id: 'side_desert_relay',
    chapter: 0,
    regionId: 'desert_corridor',
    title: 'Side Ops: Solar Array Sweep',
    kind: 'comm_restoration',
    difficulty: 'Elevated',
    description:
      'High-velocity dust storms knocked out Substation 4 along Desert Corridor. Restore the relay pylon and verify no maintenance staff remain stranded.',
    defaultInstruction: 'Restore the Desert Corridor relay and return safely to base.',
    rewardRc: 500,
    optionalBonusRc: 180,
    optionalObjectiveLabel: 'Finish with >55% battery despite dust storm drag',
    recommendedRobots: ['scout_x', 'titan_r'],
    weather: 'dust_storm',
    timeOfDay: 'sunset',
    modifiers: { batteryDrainMult: 1.25, hazardDamageMult: 1.4 },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Particulate dust reduces optical clarity out in the Desert Corridor. Rely on depth LiDAR and safe routing.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Solar grid telemetry restored. Credits transferred to your RELAY wallet.',
      },
    ],
  },
  {
    id: 'side_city_med',
    chapter: 0,
    regionId: 'meridian_city',
    title: 'Side Ops: Downtown Medical Drop',
    kind: 'medical_delivery',
    difficulty: 'Standard',
    description:
      'Deliver emergency insulin and trauma kits across blocked downtown intersections to a sheltered clinic.',
    defaultInstruction: 'Deliver medical supplies to the downtown shelter and return to base.',
    rewardRc: 420,
    optionalBonusRc: 150,
    optionalObjectiveLabel: 'Complete delivery without triggering any safety collisions',
    recommendedRobots: ['medic_4', 'aqua_7', 'scout_x'],
    weather: 'rain',
    timeOfDay: 'day',
    modifiers: { batteryDrainMult: 1.05, hazardDamageMult: 1.1 },
    briefingDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Street debris blocked ambulance access to 4th Avenue Clinic. Send an autonomous courier.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Director Elena Vance',
        role: 'RELAY Response Operations',
        text: 'Clinic confirmed delivery receipt. Well executed.',
      },
    ],
  },
  {
    id: 'side_industrial_debris',
    chapter: 0,
    regionId: 'industrial_district',
    title: 'Side Ops: Switchgear Clearance',
    kind: 'debris_clearing',
    difficulty: 'Standard',
    description:
      'Clear collapsed structural beams and survey secondary thermal hotspots in Sector 07.',
    defaultInstruction: 'Explore the eastern corridor, scan thermal hotspots, and return to base.',
    rewardRc: 360,
    optionalBonusRc: 120,
    optionalObjectiveLabel: 'Zero safety rejections during sector survey',
    recommendedRobots: ['titan_r', 'atlas_m', 'relay_01'],
    weather: 'clear',
    timeOfDay: 'dawn',
    modifiers: { batteryDrainMult: 1.0, hazardDamageMult: 1.0 },
    briefingDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Run a follow-up sweep of Sector 07 to confirm electrical switchgear isolation.',
      },
    ],
    completionDialogue: [
      {
        speaker: 'Chief Engineer Priya Nair',
        role: 'Robotics Systems Lead',
        text: 'Sector 07 logged clear for human engineering crews.',
      },
    ],
  },
];

export function computeEffectiveRobotStats(
  modelId: RobotModelId,
  owned?: OwnedRobotState,
  weather: WeatherType = 'clear'
): EffectiveRobotStats {
  const base = ROBOT_CATALOG[modelId] ?? ROBOT_CATALOG.relay_01;
  const upgrades = owned?.upgrades ?? {
    battery: 0,
    speed: 0,
    lidar: 0,
    thermal: 0,
    weather_seal: 0,
    armor: 0,
  };
  const modules = owned?.equipped_modules ?? [];

  let speedMult = 1 + upgrades.speed * 0.14;
  let batteryBonus = upgrades.battery * 12;
  let lidarBonus = upgrades.lidar * 1.2;
  let cameraBonus = upgrades.thermal * 1.0;
  let weatherRes = Math.min(1, base.baseStats.weatherResistance + upgrades.weather_seal * 0.1);
  const caps = { ...base.capabilities };

  for (const modId of modules) {
    const mod = EQUIPMENT_CATALOG[modId];
    if (!mod) continue;
    if (mod.modifiers.speedBonusMult) speedMult += mod.modifiers.speedBonusMult;
    if (mod.modifiers.batteryBonusPct) batteryBonus += mod.modifiers.batteryBonusPct;
    if (mod.modifiers.lidarBonusM) lidarBonus += mod.modifiers.lidarBonusM;
    if (mod.modifiers.cameraBonusM) cameraBonus += mod.modifiers.cameraBonusM;
    if (mod.modifiers.waterproof) caps.waterproof = true;
    if (mod.modifiers.hazmatShield) caps.hazmatShield = true;
    if (mod.modifiers.debrisClear) caps.heavyLift = true;
    if (mod.modifiers.medSupply) caps.medicalCargo = true;
    if (mod.modifiers.relayBoost) caps.commRelay = true;
  }

  // Weather gameplay impact mitigated by robot weather resistance
  let weatherSpeedPenalty = 0;
  let weatherSensorPenalty = 0;
  if (weather === 'rain') {
    weatherSpeedPenalty = 0.08 * (1 - weatherRes * 0.7);
    weatherSensorPenalty = 0.6 * (1 - weatherRes * 0.7);
  } else if (weather === 'heavy_rain' || weather === 'thunderstorm') {
    weatherSpeedPenalty = 0.16 * (1 - weatherRes * 0.7);
    weatherSensorPenalty = 1.2 * (1 - weatherRes * 0.7);
  } else if (weather === 'fog' || weather === 'dust_storm') {
    weatherSpeedPenalty = 0.12 * (1 - weatherRes * 0.6);
    weatherSensorPenalty = 1.6 * (1 - weatherRes * 0.75);
  }

  const effectiveSpeed = Math.max(1.2, base.baseStats.speedMps * speedMult * (1 - weatherSpeedPenalty));
  const capacityFactor = (base.baseStats.batteryCapacity + batteryBonus) / 100;
  const batteryDrainMultiplier = Number((1 / Math.max(0.6, capacityFactor)).toFixed(3));

  return {
    speedMps: Number(effectiveSpeed.toFixed(2)),
    batteryDrainMultiplier,
    lidarRangeM: Number(Math.max(4.0, base.baseStats.lidarRangeM + lidarBonus - weatherSensorPenalty * 0.5).toFixed(2)),
    cameraRangeM: Number(Math.max(3.5, base.baseStats.cameraRangeM + cameraBonus - weatherSensorPenalty).toFixed(2)),
    weatherResistance: Number(weatherRes.toFixed(2)),
    capabilities: caps,
  };
}
