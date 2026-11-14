import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  OctagonAlert,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MissionCompleteModal } from './components/MissionCompleteModal';
import { MissionControlPanel, type PanelTab } from './components/MissionControlPanel';
import { RelayViewport, type CameraMode } from './components/RelayViewport';
import type { MissionPlan, MissionRecord } from './shared/types';
import { MissionSimulationEngine } from './simulation/missionEngine';
import { RescueSoundEngine } from './simulation/soundEngine';

const QUICK_COMMANDS = [
  { label: 'Find Survivor', text: 'Find the survivor and return safely.' },
  { label: 'Explore East', text: 'Search the eastern corridor, locate survivors and return to base.' },
  { label: 'Avoid Unstable', text: 'Avoid the unstable area, find the survivor, and return to base.' },
  { label: 'Test Safety Block', text: 'Enter the electrical hazard zone.' },
  { label: 'Scan Area', text: 'Stop and scan the surroundings.' },
];

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
  const [instruction, setInstruction] = useState('Find the survivor and return safely.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [showLidar, setShowLidar] = useState(true);
  const [showFpvPip, setShowFpvPip] = useState(true);
  const [muted, setMuted] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>('overview');

  const [missionHistory, setMissionHistory] = useState<MissionRecord[]>([]);
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const savedMissionIdsRef = useRef<Set<string>>(new Set());

  const forceSync = useCallback(() => {
    setTickVersion((v) => v + 1);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/missions');
      if (res.ok) {
        const data = (await res.json()) as { missions: MissionRecord[] };
        setMissionHistory(data.missions || []);
      }
    } catch {
      // Offline mode safely skips remote history refresh
    }
  }, []);

  // Connect WebSocket telemetry channel & load history on mount
  useEffect(() => {
    fetchHistory();
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
  }, [fetchHistory]);

  // Keyboard shortcut 'H' to collapse/expand bottom command dock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Persist completed/aborted mission once when phase transitions
  useEffect(() => {
    if (
      (engine.phase === 'completed' || engine.phase === 'aborted') &&
      engine.plan &&
      engine.lastScore &&
      !savedMissionIdsRef.current.has(engine.plan.mission_id)
    ) {
      savedMissionIdsRef.current.add(engine.plan.mission_id);
      if (engine.phase === 'completed') {
        setShowDebriefModal(true);
      }
      const record: MissionRecord = {
        mission_id: engine.plan.mission_id,
        title: engine.plan.title,
        instruction: engine.plan.original_instruction,
        status: engine.phase,
        provider: engine.plan.provider,
        survivor_found: engine.survivorFound,
        returned_safely: engine.returnedSafely,
        total_score: engine.lastScore.totalScore,
        grade: engine.lastScore.grade,
        elapsed_sec: engine.lastScore.elapsedSec,
        battery_remaining: Number(engine.batteryPct.toFixed(1)),
        replan_count: engine.replanCount,
        safety_rejections: engine.safetyRejections,
        created_at: new Date().toISOString(),
      };
      fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
        .then(() => fetchHistory())
        .catch(() => {});
    }
  }, [engine.phase, engine, fetchHistory]);

  const handleSubmitInstruction = async (customText?: string) => {
    const text = (customText ?? instruction).trim();
    if (!text || isSubmitting) return;
    if (customText) setInstruction(customText);

    setIsSubmitting(true);
    setApiNotice(null);
    setShowDebriefModal(false);

    const missionId = `mission_${Date.now()}`;
    try {
      const res = await fetch('/api/commander/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text, mission_id: missionId }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Server returned ${res.status}`);
      }

      const data = (await res.json()) as { plan: MissionPlan; warning?: string };
      if (data.warning) {
        setApiNotice(data.warning);
      }
      engine.startMission(data.plan);
      forceSync();
    } catch {
      // Offline / network-free deterministic fallback
      setApiNotice('Backend unreachable — running offline deterministic Commander mode.');
      engine.startFromInstruction(text, missionId);
      forceSync();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetScene = () => {
    engine.reset();
    setShowDebriefModal(false);
    setApiNotice(null);
    setWorldVersion((v) => v + 1);
    forceSync();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
  };

  const snapshot = engine.getSnapshot();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0D10] text-[#F2F4F7] overflow-hidden">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="h-14 shrink-0 px-6 border-b border-[#212834] bg-[#0F1318] flex items-center justify-between gap-8">
        {/* Zone 1: Single-Element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setCameraMode('orbit');
          }}
          className="font-display text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0"
        >
          RELAY
        </a>

        {/* Zone 2: Concise Single-Line View Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setCameraMode('orbit')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              cameraMode === 'orbit'
                ? 'text-orange-400 underline underline-offset-4'
                : 'text-[#9BA3B0] hover:text-white'
            }`}
          >
            Tactical Orbit
          </button>
          <button
            type="button"
            onClick={() => setCameraMode('chase')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              cameraMode === 'chase'
                ? 'text-orange-400 underline underline-offset-4'
                : 'text-[#9BA3B0] hover:text-white'
            }`}
          >
            Follow Robot
          </button>
          <button
            type="button"
            onClick={() => setCameraMode('fpv')}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              cameraMode === 'fpv'
                ? 'text-orange-400 underline underline-offset-4'
                : 'text-[#9BA3B0] hover:text-white'
            }`}
          >
            Robot Camera
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen((p) => !p)}
            className="text-[#9BA3B0] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            {panelOpen ? 'Hide Panel' : 'Show Panel'}
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleResetScene}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D2430] hover:bg-[#283141] border border-[#2D3748] rounded transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw size={13} />
            Reset Scene
          </button>
        </div>
      </header>

      {/* Main Simulation Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Unobstructed 3D Viewport Pane */}
        <main className="relative flex-1 min-w-0 min-h-[340px] h-full">
          <RelayViewport
            engine={engine}
            cameraMode={cameraMode}
            simSpeed={simSpeed}
            showLidar={showLidar}
            showFpvPip={showFpvPip}
            worldVersion={worldVersion}
            onTickSync={forceSync}
          />

          {/* Collapsible Bottom Command Dock (No backdrop-blur over WebGL) */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 bottom-4 w-[min(820px,94%)] z-20 transition-transform duration-200 ${
              dockCollapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
            }`}
          >
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setDockCollapsed((c) => !c)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-md bg-[#12161C]/95 border border-b-0 border-[#28313E] text-[11px] font-medium text-[#9BA3B0] hover:text-white"
              >
                {dockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {dockCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}
              </button>
            </div>

            <div className="rounded-lg bg-[#12161C]/95 border border-[#28313E] p-3.5 space-y-2.5">
              {apiNotice && (
                <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-2.5 py-1.5">
                  {apiNotice}
                </div>
              )}

              {/* Natural-Language Mission Instruction Form */}
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
                  placeholder="Enter mission instruction (e.g., Find the survivor and return safely.)"
                  className="flex-1 min-w-0 px-3 py-2 text-sm bg-[#0B0D10] border border-[#27303D] rounded text-white placeholder:text-[#6B7280] focus:outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !instruction.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  <Send size={13} />
                  {isSubmitting ? 'Planning...' : 'Run Mission'}
                </button>
              </form>

              {/* Presets + Simulation Controls */}
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

                  <button
                    type="button"
                    onClick={() => setShowLidar((v) => !v)}
                    title="Toggle LiDAR Rays"
                    className={`p-1.5 rounded border transition-colors ${
                      showLidar
                        ? 'text-orange-400 bg-[#1A2029] border-orange-500/40'
                        : 'text-[#9BA3B0] bg-[#1A2029] border-[#2B3442]'
                    }`}
                  >
                    <Radar size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFpvPip((v) => !v)}
                    title="Toggle Robot FPV Picture-in-Picture"
                    className={`p-1.5 rounded border transition-colors ${
                      showFpvPip
                        ? 'text-sky-400 bg-[#1A2029] border-sky-500/40'
                        : 'text-[#9BA3B0] bg-[#1A2029] border-[#2B3442]'
                    }`}
                  >
                    <Eye size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    title={muted ? 'Unmute Audio' : 'Mute Audio'}
                    className="p-1.5 rounded border text-[#9BA3B0] hover:text-white bg-[#1A2029] border-[#2B3442]"
                  >
                    {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Dedicated Right Mission Control Column */}
        {panelOpen && (
          <MissionControlPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            phase={engine.phase}
            plan={engine.plan}
            robot={snapshot}
            sensors={engine.latestSensors}
            beliefGrid={engine.beliefGrid}
            activeWaypoints={engine.activeWaypoints.slice(engine.waypointCursor)}
            elapsedSec={engine.elapsedSec}
            survivorFound={engine.survivorFound}
            events={engine.events}
            missionHistory={missionHistory}
            onRefreshHistory={fetchHistory}
          />
        )}
      </div>

      {/* Mission Complete Score Debrief Modal */}
      {showDebriefModal && engine.lastScore && (
        <MissionCompleteModal
          score={engine.lastScore}
          onResetAndPlayAgain={handleResetScene}
          onDismiss={() => setShowDebriefModal(false)}
        />
      )}
    </div>
  );
}
