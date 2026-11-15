import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Film,
  Gamepad2,
  ListChecks,
  LocateFixed,
  OctagonAlert,
  Orbit,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PictureInPicture2,
  Play,
  Radar,
  RotateCcw,
  Send,
  Video,
  Volume2,
  VolumeX,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { FloatingTaskSnackbars } from './components/FloatingTaskSnackbars';
import { GarageView } from './components/GarageView';
import { MainMenuOverlay, type AppScreen } from './components/MainMenuOverlay';
import { MissionBoardView } from './components/MissionBoardView';
import { MissionCompleteModal } from './components/MissionCompleteModal';
import { MissionControlPanel, type PanelTab } from './components/MissionControlPanel';
import { RelayViewport, type CameraMode } from './components/RelayViewport';
import { SettingsModal } from './components/SettingsModal';
import { StoreModal } from './components/StoreModal';
import { StoryBriefingModal } from './components/StoryBriefingModal';
import { WorldMapView } from './components/WorldMapView';
import { CAMPAIGN_MISSIONS, MERIDIAN_REGIONS, computeRobotChargeStatus } from './shared/gameCatalog';
import type {
  CampaignMissionDef,
  ControlMode,
  EconomyTransaction,
  EquipmentModuleId,
  MissionPlan,
  MissionRecord,
  OwnedRobotState,
  PlayerProfile,
  PlayerSettings,
  RegionId,
  RobotModelId,
  SaveSlotSummary,
  UpgradeCategory,
} from './shared/types';
import { MissionSimulationEngine } from './simulation/missionEngine';
import { RescueSoundEngine } from './simulation/soundEngine';

const QUICK_COMMANDS = [
  { label: 'Find Survivor', text: 'Find the survivor and return safely.' },
  { label: 'Restore Relay', text: 'Restore the communication relay, locate the survivor, and return to base.' },
  { label: 'Avoid Unstable', text: 'Avoid the unstable area, find the survivor, and return to base.' },
  { label: 'Test Safety Block', text: 'Enter the electrical hazard zone.' },
  { label: 'Scan Area', text: 'Stop and scan the surroundings.' },
];

const DEFAULT_PROFILE: PlayerProfile = {
  profile_id: 'default',
  commander_name: 'Commander Vance',
  credits_rc: 300,
  current_chapter: 1,
  completed_mission_ids: [],
  unlocked_regions: ['industrial_district'],
  active_region: 'industrial_district',
  ashfall_ending: null,
  settings: {
    graphicsQuality: 'high',
    weatherEnabled: true,
    dayNightCycle: true,
    audioEnabled: true,
    voiceDialogue: false,
    showLidar: true,
  },
  updated_at: new Date().toISOString(),
};

export default function App() {
  const soundRef = useRef<RescueSoundEngine | null>(null);
  if (!soundRef.current) {
    soundRef.current = new RescueSoundEngine();
  }

  const wsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<MissionSimulationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MissionSimulationEngine({
      onEvent: (ev) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'agent_event', payload: ev }));
        }
      },
      onSoundCue: (cue) => {
        const s = soundRef.current;
        if (!s) return;
        if (cue === 'footstep') s.playFootstep(performance.now());
        else if (cue === 'scan') s.playScanSweep();
        else if (cue === 'safety_alert') s.playSafetyAlert();
        else if (cue === 'survivor_found') s.playSurvivorFound();
      },
    });
  }
  const engine = engineRef.current;

  const [, setTickVersion] = useState(0);
  const [worldVersion, setWorldVersion] = useState(0);
  const [screen, setScreen] = useState<AppScreen>('menu');
  const [mapRegionFilter, setMapRegionFilter] = useState<RegionId | 'ALL'>('ALL');

  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  const [ownedRobots, setOwnedRobots] = useState<OwnedRobotState[]>([]);
  const [transactions, setTransactions] = useState<EconomyTransaction[]>([]);
  const [missionHistory, setMissionHistory] = useState<MissionRecord[]>([]);
  const [saveSlots, setSaveSlots] = useState<SaveSlotSummary[]>([]);

  const [activeCampaignMission, setActiveCampaignMission] = useState<CampaignMissionDef | null>(
    CAMPAIGN_MISSIONS[0]
  );
  const [briefingMission, setBriefingMission] = useState<CampaignMissionDef | null>(null);
  const [showEthicalChoice, setShowEthicalChoice] = useState(false);
  const [lastPayout, setLastPayout] = useState<{ credits: number; bonus: boolean } | null>(null);

  const [instruction, setInstruction] = useState('Find the survivor and return safely.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [viewResetNonce, setViewResetNonce] = useState(0);
  const [controlMode, setControlMode] = useState<ControlMode>('auto');
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [showFpvPip, setShowFpvPip] = useState(true);
  const [showPerfOverlay, setShowPerfOverlay] = useState(true);
  const [showDiagnosticsHud, setShowDiagnosticsHud] = useState(true);
  const [showTaskSnackbars, setShowTaskSnackbars] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('overview');
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [showStore, setShowStore] = useState(false);

  const savedMissionIdsRef = useRef<Set<string>>(new Set());

  const forceSync = useCallback(() => {
    setTickVersion((v) => v + 1);
  }, []);

  const syncEngineToProfileAndFleet = useCallback(
    (
      nextProfile: PlayerProfile,
      robots: OwnedRobotState[],
      missionOverride?: CampaignMissionDef | null
    ) => {
      const deployed = robots
        .filter((r) => r.deployment_slot === 1 || r.deployment_slot === 2)
        .sort((a, b) => (a.deployment_slot ?? 9) - (b.deployment_slot ?? 9));
      const regMeta = MERIDIAN_REGIONS[nextProfile.active_region];
      const weather = missionOverride?.weather ?? regMeta.defaultWeather;
      const timeOfDay = missionOverride?.timeOfDay ?? regMeta.defaultTime;

      engine.configureEnvironment({
        regionId: nextProfile.active_region,
        weather,
        timeOfDay,
        deployedRobots: deployed,
        missionModifiers: missionOverride?.modifiers,
      });
      soundRef.current?.setMuted(!nextProfile.settings.audioEnabled);
      setWorldVersion((v) => v + 1);
      forceSync();
    },
    [engine, forceSync]
  );

  const handleSetControlMode = useCallback(
    (nextMode: ControlMode) => {
      setControlMode(nextMode);
      engine.setControlMode(nextMode);
      forceSync();
    },
    [engine, forceSync]
  );

  const loadFullState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = (await res.json()) as {
        profile: PlayerProfile;
        robots: OwnedRobotState[];
        transactions: EconomyTransaction[];
        missions: MissionRecord[];
        saveSlots: SaveSlotSummary[];
      };
      setProfile(data.profile);
      setOwnedRobots(data.robots);
      setTransactions(data.transactions || []);
      setMissionHistory(data.missions || []);
      setSaveSlots(data.saveSlots || []);
      syncEngineToProfileAndFleet(data.profile, data.robots);
    } catch {
      // Offline mode safe
    }
  }, [syncEngineToProfileAndFleet]);

  useEffect(() => {
    loadFullState();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onerror = () => {};
    wsRef.current = ws;
    return () => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [loadFullState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const syncUnitBatteriesToServer = useCallback(async () => {
    if (engine.units.length === 0) return;
    try {
      const res = await fetch('/api/garage/battery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: engine.units.map((u) => ({
            robotId: u.model_id,
            batteryPct: u.batteryPct,
          })),
        }),
      });
      if (res.ok) {
        const d = (await res.json()) as { robots: OwnedRobotState[] };
        if (Array.isArray(d.robots)) {
          setOwnedRobots(d.robots);
        }
      }
    } catch {
      // Ignore offline battery sync errors
    }
  }, [engine]);

  // Periodically persist battery drain while units are active in mission
  useEffect(() => {
    if (engine.phase !== 'executing' && engine.phase !== 'returning') return;
    const id = window.setInterval(() => {
      syncUnitBatteriesToServer();
    }, 5000);
    return () => window.clearInterval(id);
  }, [engine.phase, syncUnitBatteriesToServer]);

  // Refresh live standby battery charge display once per 15s while idle/recharging
  useEffect(() => {
    const anyCharging = ownedRobots.some((r) => (r.battery_pct ?? 100) < 99.9);
    if (!anyCharging) return;
    const id = window.setInterval(() => {
      if (engine.phase === 'standby' || engine.phase === 'paused' || engine.phase === 'failed') {
        forceSync();
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [ownedRobots, engine.phase, forceSync]);

  // Persist completed/aborted/failed mission + award RC & unlock chapters
  useEffect(() => {
    if (
      engine.phase === 'completed' ||
      engine.phase === 'aborted' ||
      engine.phase === 'failed' ||
      engine.phase === 'paused'
    ) {
      syncUnitBatteriesToServer();
    }

    if (
      (engine.phase === 'completed' || engine.phase === 'aborted' || engine.phase === 'failed') &&
      engine.plan &&
      engine.lastScore &&
      !savedMissionIdsRef.current.has(engine.plan.mission_id)
    ) {
      savedMissionIdsRef.current.add(engine.plan.mission_id);
      const score = engine.lastScore;
      const activeDef = activeCampaignMission;

      const bonusEarned = Boolean(
        engine.phase === 'completed' &&
          !engine.enteredHazard &&
          engine.batteryPct >= 45 &&
          score.totalScore >= 800
      );

      if (engine.phase === 'completed') {
        setShowDebriefModal(true);
      }

      const record: MissionRecord = {
        mission_id: engine.plan.mission_id,
        title: engine.plan.title,
        instruction: engine.plan.original_instruction,
        region_id: engine.regionId,
        chapter_id: activeDef?.chapter ?? 0,
        status: engine.phase,
        provider: engine.plan.provider,
        survivor_found: engine.survivorFound,
        returned_safely: engine.returnedSafely,
        total_score: score.totalScore,
        grade: score.grade,
        elapsed_sec: score.elapsedSec,
        battery_remaining: Number(engine.batteryPct.toFixed(1)),
        replan_count: engine.replanCount,
        safety_rejections: engine.safetyRejections,
        created_at: new Date().toISOString(),
      };

      fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch(() => {});

      if (engine.phase === 'completed' && activeDef) {
        fetch('/api/campaign/complete-mission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignMissionId: activeDef.id,
            bonusEarned,
            totalScore: score.totalScore,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((resData) => {
            if (!resData) return;
            setProfile(resData.profile);
            setTransactions(resData.transactions || []);
            setLastPayout({ credits: resData.creditsEarned, bonus: resData.bonusEarned });
            if (activeDef.hasEthicalChoice && !resData.profile.ashfall_ending) {
              setShowEthicalChoice(true);
            }
          })
          .catch(() => {});
      }
    }
  }, [engine.phase, engine, activeCampaignMission]);

  const handleSubmitInstruction = async (
    customText?: string,
    modifiersOverride?: CampaignMissionDef['modifiers']
  ) => {
    const text = (customText ?? instruction).trim();
    if (!text || isSubmitting) return;
    if (customText) setInstruction(customText);

    setIsSubmitting(true);
    setApiNotice(null);
    setShowDebriefModal(false);
    setLastPayout(null);
    if (controlMode !== 'auto') {
      handleSetControlMode('auto');
    }

    const missionId = `mission_${Date.now()}`;
    try {
      const res = await fetch('/api/commander/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: text,
          mission_id: missionId,
          regionId: engine.regionId,
          fleetRobotIds: engine.units.map((u) => u.robot_id),
          modifiers: modifiersOverride ?? activeCampaignMission?.modifiers,
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Server returned ${res.status}`);
      }

      const data = (await res.json()) as { plan: MissionPlan; warning?: string };
      engine.startMission(data.plan);
      forceSync();
    } catch {
      engine.startFromInstruction(text, missionId);
      forceSync();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetDefaultView = useCallback(() => {
    setCameraMode('orbit');
    setPanelOpen(false);
    setDockCollapsed(false);
    setShowFpvPip(true);
    setShowPerfOverlay(true);
    setShowDiagnosticsHud(true);
    setShowTaskSnackbars(true);
    setViewResetNonce((n) => n + 1);
  }, []);

  const handleResetScene = async () => {
    await syncUnitBatteriesToServer();
    handleSetControlMode('auto');
    setShowDebriefModal(false);
    setLastPayout(null);
    setApiNotice(null);
    syncEngineToProfileAndFleet(profile, ownedRobots, activeCampaignMission);
  };

  const handleUpdateSettings = async (patch: Partial<PlayerSettings>) => {
    const nextSettings = { ...profile.settings, ...patch };
    const nextProfile = { ...profile, settings: nextSettings };
    setProfile(nextProfile);
    soundRef.current?.setMuted(!nextSettings.audioEnabled);

    await fetch('/api/profile/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const handleSelectRegion = async (regionId: RegionId) => {
    try {
      const res = await fetch('/api/profile/region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { profile: PlayerProfile };
      setProfile(data.profile);
      syncEngineToProfileAndFleet(data.profile, ownedRobots);
    } catch {
      // Ignore offline error
    }
  };

  const postGarage = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    if (data.profile) setProfile(data.profile);
    if (data.robots) setOwnedRobots(data.robots);
    if (data.transactions) setTransactions(data.transactions);
    const nextProf = (data.profile ?? profile) as PlayerProfile;
    const nextRobots = (data.robots ?? ownedRobots) as OwnedRobotState[];
    syncEngineToProfileAndFleet(nextProf, nextRobots, activeCampaignMission);
  };

  const handleLaunchCampaignMission = async (mission: CampaignMissionDef) => {
    setActiveCampaignMission(mission);
    setInstruction(mission.defaultInstruction);
    if (mission.regionId !== profile.active_region) {
      await handleSelectRegion(mission.regionId);
    }
    setBriefingMission(mission);
  };

  const handleConfirmBriefingDeploy = () => {
    if (!briefingMission) return;
    const mission = briefingMission;
    setBriefingMission(null);
    handleSetControlMode('auto');
    const updatedProfile = { ...profile, active_region: mission.regionId };
    setProfile(updatedProfile);
    syncEngineToProfileAndFleet(updatedProfile, ownedRobots, mission);
    setScreen('operations');
    setTimeout(() => {
      handleSubmitInstruction(mission.defaultInstruction, mission.modifiers);
    }, 120);
  };

  const activeRegionMeta = MERIDIAN_REGIONS[profile.active_region];
  const unitSnapshots = engine.getUnitSnapshots();
  const activeUnit = engine.units[engine.selectedUnitIndex] ?? engine.units[0];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0D10] text-[#F2F4F7] overflow-hidden">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="h-14 shrink-0 px-6 border-b border-[#212834] bg-[#0F1318] flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => setScreen('menu')}
          className="font-display text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0 hover:text-[#E5C158] transition-colors"
        >
          RELAY
        </button>

        {/* Zone 2: Concise Single-Line View Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {(
            [
              ['operations', 'Operations'],
              ['world_map', 'World Map'],
              ['garage', 'Garage'],
              ['missions', 'Campaign'],
              ['settings', 'Settings'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                screen === id
                  ? 'text-[#E5C158] underline underline-offset-4'
                  : 'text-[#9BA3B0] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Wallet, Store & Primary Scene Reset / Deploy */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowStore(true)}
            title="Buy RELAY Credits or Instant 100% Battery Recharge"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#161B23] hover:bg-[#1E2531] border border-[#D4AF37]/45 text-left transition-colors whitespace-nowrap shrink-0"
          >
            <Wallet size={14} className="text-[#E5C158] shrink-0" />
            <div className="font-mono-tabular text-xs leading-tight">
              <div className="text-[#E5C158] font-semibold">{profile.credits_rc.toLocaleString()} RC</div>
              <div className="text-[10px] text-[#CBD5E1] hidden sm:block">{activeRegionMeta.name}</div>
            </div>
          </button>
          {screen === 'operations' ? (
            <button
              type="button"
              onClick={handleResetScene}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#E2E8F0] bg-[#1D2430] hover:bg-[#283141] border border-[#94A3B8]/40 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw size={13} />
              Reset Scene
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScreen('operations')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B0D10] bg-[#D4AF37] hover:bg-[#E2C04D] rounded transition-colors whitespace-nowrap shrink-0"
            >
              Field View
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {screen === 'world_map' && (
        <WorldMapView
          profile={profile}
          onSelectRegion={handleSelectRegion}
          onOpenMissionBoard={(reg) => {
            setMapRegionFilter(reg);
            setScreen('missions');
          }}
        />
      )}

      {screen === 'garage' && (
        <GarageView
          profile={profile}
          ownedRobots={ownedRobots}
          onPurchase={(robotId: RobotModelId) => postGarage('/api/garage/purchase', { robotId })}
          onUpgrade={(robotId: RobotModelId, category: UpgradeCategory) =>
            postGarage('/api/garage/upgrade', { robotId, category })
          }
          onEquip={(robotId: RobotModelId, moduleId: EquipmentModuleId, equip: boolean) =>
            postGarage('/api/garage/equip', { robotId, moduleId, equip })
          }
          onDeploySlot={(robotId: RobotModelId, slot: 1 | 2 | null) =>
            postGarage('/api/garage/deploy', { robotId, slot })
          }
          onCustomize={(robotId: RobotModelId, customName: string, hullColor: string) =>
            postGarage('/api/garage/customize', { robotId, customName, hullColor })
          }
          onRepair={(robotId: RobotModelId) => postGarage('/api/garage/repair', { robotId })}
          onOpenStore={() => setShowStore(true)}
        />
      )}

      {screen === 'missions' && (
        <MissionBoardView
          profile={profile}
          ownedRobots={ownedRobots}
          filterRegion={mapRegionFilter}
          onFilterChange={setMapRegionFilter}
          onLaunchMission={handleLaunchCampaignMission}
        />
      )}

      {screen === 'settings' && (
        <SettingsModal
          profile={profile}
          saveSlots={saveSlots}
          transactions={transactions}
          onUpdateSettings={handleUpdateSettings}
          onSaveSlot={async (slotId, label) => {
            const res = await fetch('/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotId, label }),
            });
            if (res.ok) {
              const d = await res.json();
              setSaveSlots(d.saveSlots || []);
            }
          }}
          onLoadSlot={async (slotId) => {
            const res = await fetch('/api/save/load', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotId }),
            });
            if (res.ok) {
              const d = await res.json();
              setProfile(d.profile);
              setOwnedRobots(d.robots);
              setTransactions(d.transactions || []);
              syncEngineToProfileAndFleet(d.profile, d.robots);
            }
          }}
          onNewGame={async () => {
            const res = await fetch('/api/game/new', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (res.ok) {
              const d = await res.json();
              setProfile(d.profile);
              setOwnedRobots(d.robots);
              setTransactions(d.transactions || []);
              syncEngineToProfileAndFleet(d.profile, d.robots, CAMPAIGN_MISSIONS[0]);
            }
          }}
        />
      )}

      {screen === 'operations' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          <main className="relative flex-1 min-w-0 min-h-[340px] h-full">
            <RelayViewport
              engine={engine}
              cameraMode={cameraMode}
              viewResetNonce={viewResetNonce}
              controlMode={controlMode}
              simSpeed={simSpeed}
              showLidar={profile.settings.showLidar}
              showFpvPip={showFpvPip}
              weatherEnabled={profile.settings.weatherEnabled}
              graphicsQuality={profile.settings.graphicsQuality}
              worldVersion={worldVersion}
              showPerfOverlay={showPerfOverlay}
              showDiagnosticsHud={showDiagnosticsHud}
              autoOptimize={autoOptimize}
              onToggleAutoOptimize={() => setAutoOptimize((v) => !v)}
              activeOwnedRobot={ownedRobots.find((r) => r.robot_id === activeUnit?.model_id)}
              onOpenStore={() => setShowStore(true)}
              rightOverlay={
                showTaskSnackbars ? (
                  <FloatingTaskSnackbars
                    plan={engine.plan}
                    phase={engine.phase}
                    elapsedSec={engine.elapsedSec}
                    lastScore={engine.lastScore}
                    regionMissions={CAMPAIGN_MISSIONS.filter(
                      (m) =>
                        m.regionId === profile.active_region &&
                        (m.chapter === 0 || m.chapter <= profile.current_chapter)
                    )}
                    completedMissionIds={profile.completed_mission_ids}
                    activeCampaignMissionId={activeCampaignMission?.id}
                    onSelectMission={handleLaunchCampaignMission}
                  />
                ) : undefined
              }
              onTickSync={forceSync}
            />

            {/* Top-Right Viewport Icon Toolbar: Camera Views, Follow Robot, Robot FPV, Remote Control, LiDAR, Audio, Task Snackbars, Perf, HUD */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1 p-1 rounded-lg bg-[#12161C]/95 border border-[#94A3B8]/35">
              {(
                [
                  { mode: 'orbit', label: 'Orbit Camera', Icon: Orbit },
                  { mode: 'third_person', label: '3rd Person Camera', Icon: Crosshair },
                  { mode: 'chase', label: 'Follow Robot', Icon: LocateFixed },
                  { mode: 'fpv', label: 'Robot Camera (FPV)', Icon: Video },
                  { mode: 'cinematic', label: 'Cinematic Camera', Icon: Film },
                ] as const
              ).map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => setCameraMode(mode)}
                  className={`p-2 rounded transition-colors ${
                    cameraMode === mode
                      ? 'bg-[#D4AF37] text-[#0B0D10]'
                      : 'text-[#CBD5E1] hover:text-white hover:bg-[#1E2530]'
                  }`}
                >
                  <Icon size={15} />
                </button>
              ))}

              <div className="w-px h-5 bg-[#28313E] mx-0.5" />

              <button
                type="button"
                title="Toggle Robot Camera Picture-in-Picture"
                aria-label="Toggle Robot Camera Picture-in-Picture"
                onClick={() => setShowFpvPip((v) => !v)}
                className={`p-2 rounded transition-colors ${
                  showFpvPip
                    ? 'text-sky-400 bg-[#1A2230]'
                    : 'text-[#9BA3B0] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <PictureInPicture2 size={15} />
              </button>

              <button
                type="button"
                title={
                  controlMode === 'manual'
                    ? 'Remote Control Active (WASD / Arrows) — Click for Automatic AI'
                    : 'Automatic AI Active — Click to enable Keyboard Remote Control'
                }
                aria-label="Toggle Remote Control"
                onClick={() => handleSetControlMode(controlMode === 'manual' ? 'auto' : 'manual')}
                className={`p-2 rounded transition-colors ${
                  controlMode === 'manual'
                    ? 'bg-sky-600 text-white'
                    : 'text-[#9BA3B0] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <Gamepad2 size={15} />
              </button>

              <button
                type="button"
                title="Toggle LiDAR Rays"
                aria-label="Toggle LiDAR Rays"
                onClick={() => handleUpdateSettings({ showLidar: !profile.settings.showLidar })}
                className={`p-2 rounded transition-colors ${
                  profile.settings.showLidar
                    ? 'text-[#E5C158] bg-[#1A2029]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <Radar size={15} />
              </button>

              <button
                type="button"
                title={profile.settings.audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                aria-label={profile.settings.audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                onClick={() =>
                  handleUpdateSettings({ audioEnabled: !profile.settings.audioEnabled })
                }
                className="p-2 rounded text-[#CBD5E1] hover:text-white hover:bg-[#1E2530] transition-colors"
              >
                {profile.settings.audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>

              <button
                type="button"
                title={showTaskSnackbars ? 'Hide Floating Task Snackbars' : 'Show Floating Task Snackbars'}
                aria-label="Toggle Floating Task Snackbars"
                onClick={() => setShowTaskSnackbars((v) => !v)}
                className={`p-2 rounded transition-colors ${
                  showTaskSnackbars
                    ? 'text-[#E5C158] bg-[#1A2029]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <ListChecks size={15} />
              </button>

              <button
                type="button"
                title={showDiagnosticsHud ? 'Hide Unit Diagnostics HUD' : 'Show Unit Diagnostics HUD'}
                aria-label="Toggle Unit Diagnostics HUD"
                onClick={() => setShowDiagnosticsHud((v) => !v)}
                className={`p-2 rounded transition-colors ${
                  showDiagnosticsHud
                    ? 'text-[#E5C158] bg-[#1A2029]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <Wrench size={15} />
              </button>

              <button
                type="button"
                title={showPerfOverlay ? 'Hide Performance Monitor' : 'Show Performance Monitor'}
                aria-label="Toggle Performance Monitor"
                onClick={() => setShowPerfOverlay((v) => !v)}
                className={`p-2 rounded transition-colors ${
                  showPerfOverlay
                    ? 'text-sky-400 bg-[#1A2230]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-[#1E2530]'
                }`}
              >
                <Activity size={15} />
              </button>

              <button
                type="button"
                title="Reset Default View"
                aria-label="Reset Default View"
                onClick={handleResetDefaultView}
                className="p-2 rounded text-[#CBD5E1] hover:text-[#E5C158] hover:bg-[#1E2530] transition-colors"
              >
                <RotateCcw size={15} />
              </button>

              <button
                type="button"
                title={panelOpen ? 'Hide Mission HUD' : 'Show Mission HUD'}
                aria-label={panelOpen ? 'Hide Mission HUD' : 'Show Mission HUD'}
                onClick={() => setPanelOpen((p) => !p)}
                className="p-2 rounded text-[#CBD5E1] hover:text-white hover:bg-[#1E2530] transition-colors"
              >
                {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </div>

            {/* Collapsible Bottom Command & Execution Dock */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 bottom-4 w-[min(820px,95%)] z-20 transition-transform duration-200 ${
                dockCollapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
              }`}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setDockCollapsed((c) => !c)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-md bg-[#12161C]/95 border border-b-0 border-[#94A3B8]/35 text-[11px] font-medium text-[#CBD5E1] hover:text-white"
                >
                  {dockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {dockCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}
                </button>
              </div>

              <div className="rounded-lg bg-[#12161C]/95 border border-[#94A3B8]/35 p-3.5 space-y-2.5">
                {(() => {
                  const slot1Owned = ownedRobots.find((r) => r.robot_id === activeUnit?.model_id);
                  const chargeStatus = slot1Owned ? computeRobotChargeStatus(slot1Owned) : null;
                  const unitDepleted =
                    (activeUnit && activeUnit.batteryPct <= 0.5) ||
                    Boolean(chargeStatus && chargeStatus.isDepleted);
                  if (!unitDepleted) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-200 bg-rose-950/60 border border-rose-700/60 rounded px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <BatteryCharging size={14} className="text-[#E5C158] shrink-0" />
                        Battery depleted ({chargeStatus?.formattedRemaining ?? '24h 00m'} to full). Upgrade Battery, switch robots, or Instant Charge.
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScreen('garage')}
                          className="px-2 py-1 rounded bg-[#1D2430] hover:bg-[#283141] border border-[#94A3B8]/40 text-white text-[11px]"
                        >
                          Garage
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowStore(true)}
                          className="px-2.5 py-1 rounded bg-[#D4AF37] hover:bg-[#E5C158] text-[#0B0D10] font-semibold text-[11px]"
                        >
                          Instant 100%
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {apiNotice && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#E2E8F0] bg-[#181E27] border border-[#94A3B8]/30 rounded px-2.5 py-1.5">
                    <span className="truncate">{apiNotice}</span>
                    <button
                      type="button"
                      onClick={() => setApiNotice(null)}
                      aria-label="Dismiss notice"
                      className="text-[#CBD5E1] hover:text-white shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmitInstruction();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Enter natural-language mission directive..."
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-[#0B0D10] border border-[#27303D] rounded text-white placeholder:text-[#6B7280] focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !instruction.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0D10] bg-[#D4AF37] hover:bg-[#E2C04D] disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send size={13} />
                    {isSubmitting ? 'Planning...' : 'Run Mission'}
                  </button>
                </form>

                {/* Execution Controls + Remote Control Toggle + Quick Presets */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_COMMANDS.map((cmd) => (
                      <button
                        key={cmd.label}
                        type="button"
                        onClick={() => handleSubmitInstruction(cmd.text)}
                        className="px-2.5 py-1 text-[11px] font-medium text-[#D1D5DB] bg-[#1A2029] hover:bg-[#232B37] border border-[#2B3442] rounded transition-colors whitespace-nowrap"
                      >
                        {cmd.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleSetControlMode(controlMode === 'manual' ? 'auto' : 'manual')
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap ${
                        controlMode === 'manual'
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-[#1A2029] border-[#2B3442] text-[#D1D5DB] hover:bg-[#232B37]'
                      }`}
                    >
                      <Gamepad2 size={12} />
                      {controlMode === 'manual' ? 'Remote: ON' : 'Remote Control'}
                    </button>

                    {engine.phase === 'paused' ? (
                      <button
                        type="button"
                        onClick={() => {
                          engine.resume();
                          forceSync();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-300 bg-[#1A2029] hover:bg-[#232B37] border border-[#2B3442] rounded whitespace-nowrap"
                      >
                        <Play size={12} /> Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          engine.pause();
                          forceSync();
                        }}
                        disabled={engine.phase !== 'executing' && engine.phase !== 'returning'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#D1D5DB] bg-[#1A2029] hover:bg-[#232B37] disabled:opacity-40 border border-[#2B3442] rounded whitespace-nowrap"
                      >
                        <Pause size={12} /> Pause
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        handleSetControlMode('auto');
                        engine.triggerReturnToBaseOverride();
                        forceSync();
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-[#D1D5DB] bg-[#1A2029] hover:bg-[#232B37] border border-[#2B3442] rounded whitespace-nowrap"
                    >
                      Return Home
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        engine.emergencyStop();
                        forceSync();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 rounded whitespace-nowrap"
                    >
                      <OctagonAlert size={12} /> Stop
                    </button>

                    <button
                      type="button"
                      onClick={() => setSimSpeed((s) => (s === 1 ? 2 : 1))}
                      className="px-2 py-1 text-[11px] font-mono-tabular text-[#D1D5DB] bg-[#1A2029] hover:bg-[#232B37] border border-[#2B3442] rounded whitespace-nowrap"
                    >
                      {simSpeed}x
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {panelOpen && (
            <MissionControlPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              phase={engine.phase}
              plan={engine.plan}
              units={unitSnapshots}
              selectedUnitIndex={engine.selectedUnitIndex}
              onSelectUnit={(idx) => {
                engine.setSelectedUnit(idx);
                forceSync();
              }}
              sensors={activeUnit?.latestSensors ?? engine.latestSensors}
              beliefGrid={engine.beliefGrid}
              baseCoord={engine.mapData.baseCoord}
              survivorCoord={engine.mapData.survivorCoord}
              relayCoord={engine.mapData.relayCoord}
              activeWaypoints={
                activeUnit ? activeUnit.activeWaypoints.slice(activeUnit.waypointCursor) : []
              }
              elapsedSec={engine.elapsedSec}
              survivorFound={engine.survivorFound}
              weather={engine.weather}
              timeOfDay={engine.timeOfDay}
              events={engine.events}
              missionHistory={missionHistory}
              onRefreshHistory={loadFullState}
            />
          )}
        </div>
      )}

      {/* Main Menu Overlay */}
      {screen === 'menu' && (
        <MainMenuOverlay
          profile={profile}
          ownedCount={ownedRobots.length || 1}
          hasExistingProgress={
            profile.completed_mission_ids.length > 0 || ownedRobots.length > 1
          }
          onNavigate={(next) => setScreen(next)}
          onContinue={() => setScreen('operations')}
          onNewGame={async () => {
            await fetch('/api/game/new', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            await loadFullState();
            setScreen('missions');
          }}
        />
      )}

      {/* Story Briefing or Chapter 6 Ethical Decision Modal */}
      {briefingMission && (
        <StoryBriefingModal
          mission={briefingMission}
          voiceEnabled={profile.settings.voiceDialogue}
          mode="briefing"
          onStartMission={handleConfirmBriefingDeploy}
          onCancel={() => setBriefingMission(null)}
        />
      )}

      {showEthicalChoice && activeCampaignMission?.hasEthicalChoice && (
        <StoryBriefingModal
          mission={activeCampaignMission}
          voiceEnabled={profile.settings.voiceDialogue}
          mode="ethical_choice"
          onStartMission={() => setShowEthicalChoice(false)}
          onResolveChoice={async (choice) => {
            const res = await fetch('/api/campaign/choice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ choice }),
            });
            if (res.ok) {
              const d = await res.json();
              setProfile(d.profile);
            }
            setShowEthicalChoice(false);
          }}
          onCancel={() => setShowEthicalChoice(false)}
        />
      )}

      {showDebriefModal && engine.lastScore && (
        <MissionCompleteModal
          score={engine.lastScore}
          campaignMission={activeCampaignMission}
          creditsEarned={lastPayout?.credits}
          bonusEarned={lastPayout?.bonus}
          onResetAndPlayAgain={handleResetScene}
          onReturnToBoard={() => {
            setShowDebriefModal(false);
            setScreen('missions');
          }}
          onDismiss={() => setShowDebriefModal(false)}
        />
      )}

      {showStore && (
        <StoreModal
          profile={profile}
          ownedRobots={ownedRobots}
          onClose={() => setShowStore(false)}
          onPurchaseComplete={(data) => {
            setProfile(data.profile);
            setOwnedRobots(data.robots);
            setTransactions((data.transactions as EconomyTransaction[]) || []);
            engine.updateUnitBatteriesFromFleet(data.robots);
            forceSync();
          }}
        />
      )}
    </div>
  );
}
