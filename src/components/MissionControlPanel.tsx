import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  AgentActor,
  AgentEvent,
  CellType,
  GridCoord,
  MissionPhase,
  MissionPlan,
  MissionRecord,
  RobotStateSnapshot,
  SensorReading,
  TimeOfDay,
  WeatherType,
} from '../shared/types';
import { BeliefMapCanvas } from './BeliefMapCanvas';

export type PanelTab = 'overview' | 'diagnostics' | 'sensors' | 'logs' | 'history';

interface MissionControlPanelProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  phase: MissionPhase;
  plan: MissionPlan | null;
  units: RobotStateSnapshot[];
  selectedUnitIndex: number;
  onSelectUnit: (index: number) => void;
  sensors: SensorReading;
  beliefGrid: CellType[][];
  baseCoord: GridCoord;
  survivorCoord: GridCoord;
  relayCoord?: GridCoord;
  activeWaypoints: GridCoord[];
  elapsedSec: number;
  survivorFound: boolean;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  events: AgentEvent[];
  missionHistory: MissionRecord[];
  onRefreshHistory: () => void;
}

const ACTOR_COLORS: Record<AgentActor, string> = {
  COMMANDER: 'text-[#E5C158]',
  NAVIGATION: 'text-sky-400',
  SAFETY: 'text-rose-400',
  ROBOT: 'text-emerald-400',
  PERCEPTION: 'text-amber-300',
  FLEET: 'text-indigo-400',
  LOGISTICS: 'text-cyan-400',
};

export function MissionControlPanel({
  activeTab,
  onTabChange,
  phase,
  plan,
  units,
  selectedUnitIndex,
  onSelectUnit,
  sensors,
  beliefGrid,
  baseCoord,
  survivorCoord,
  relayCoord,
  activeWaypoints,
  elapsedSec,
  survivorFound,
  weather,
  timeOfDay,
  events,
  missionHistory,
  onRefreshHistory,
}: MissionControlPanelProps) {
  const [actorFilter, setActorFilter] = useState<'ALL' | AgentActor>('ALL');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const robot = units[selectedUnitIndex] ?? units[0];
  const filteredEvents =
    actorFilter === 'ALL' ? events : events.filter((e) => e.actor === actorFilter);
  const headingDeg = Math.round(((robot.headingRad * 180) / Math.PI + 360) % 360);

  return (
    <aside className="w-full lg:w-[396px] shrink-0 h-full bg-[#11151B] border-l border-[#212834] flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-[#212834] space-y-2">
        <div className="grid grid-cols-5 gap-1 p-1 rounded-md bg-[#0B0D10] border border-[#1E242E]">
          {(
            [
              { id: 'overview', label: 'Mission' },
              { id: 'diagnostics', label: 'Diag' },
              { id: 'sensors', label: 'Sensors' },
              { id: 'logs', label: 'Agents' },
              { id: 'history', label: 'History' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                if (tab.id === 'history') onRefreshHistory();
              }}
              className={`py-1.5 px-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#1D2430] text-white'
                  : 'text-[#9BA3B0] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Multi-Robot Switcher when 2 units deployed */}
        {units.length > 1 && (
          <div className="grid grid-cols-2 gap-1.5">
            {units.map((u, idx) => (
              <button
                key={u.robot_id}
                type="button"
                onClick={() => onSelectUnit(idx)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium border text-left transition-colors ${
                  idx === selectedUnitIndex
                    ? 'bg-[#1B222D] border-[#D4AF37] text-white'
                    : 'bg-[#0D1015] border-[#1F2630] text-[#CBD5E1] hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{u.name ?? u.robot_id}</span>
                  <span className="font-mono-tabular text-[11px]">{u.batteryPct.toFixed(0)}%</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'overview' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold tracking-wide text-[#F2F4F7]">
                  Unit Telemetry · {robot.name ?? robot.robot_id}
                </h2>
                <span className="text-xs font-mono-tabular text-[#9BA3B0]">
                  {phase.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[11px] text-[#9BA3B0]">Battery Charge</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span
                      className={`text-lg font-semibold font-mono-tabular ${
                        robot.batteryPct > 40
                          ? 'text-emerald-400'
                          : robot.batteryPct > 22
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {robot.batteryPct.toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-[#9BA3B0]">
                      Hull {(robot.integrityPct ?? 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        robot.batteryPct > 40
                          ? 'bg-emerald-500'
                          : robot.batteryPct > 22
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, robot.batteryPct))}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[11px] text-[#9BA3B0]">Survivors &amp; Weather</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-lg font-semibold font-mono-tabular text-white">
                      {survivorFound ? '1 / 1' : '0 / 1'}
                    </span>
                    <span className="text-[11px] capitalize text-sky-400">
                      {weather.replace('_', ' ')} · {timeOfDay}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-mono-tabular text-[#9BA3B0]">
                    Mission Timer: {elapsedSec.toFixed(1)}s
                  </div>
                </div>
              </div>

              <div className="p-3 rounded bg-[#161B23] border border-[#222A36] grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[#9BA3B0]">Grid Pose</div>
                  <div className="mt-0.5 font-mono-tabular text-white">
                    ({robot.gridPos.x}, {robot.gridPos.z})
                  </div>
                </div>
                <div>
                  <div className="text-[#9BA3B0]">Speed</div>
                  <div className="mt-0.5 font-mono-tabular text-white">
                    {robot.speedMps.toFixed(2)} m/s
                  </div>
                </div>
                <div>
                  <div className="text-[#9BA3B0]">Heading</div>
                  <div className="mt-0.5 font-mono-tabular text-white">{headingDeg}°</div>
                </div>
                <div>
                  <div className="text-[#9BA3B0]">State</div>
                  <div className="mt-0.5 font-mono-tabular text-[#E5C158] capitalize">
                    {robot.locomotionState.replace('_', ' ')}
                  </div>
                </div>
                <div>
                  <div className="text-[#9BA3B0]">Replans</div>
                  <div className="mt-0.5 font-mono-tabular text-white">{robot.replanCount}</div>
                </div>
                <div>
                  <div className="text-[#9BA3B0]">Safety Blocks</div>
                  <div className="mt-0.5 font-mono-tabular text-white">
                    {robot.safetyRejections}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3 pt-2 border-t border-[#212834]">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold tracking-wide text-[#F2F4F7]">
                  Commander Objectives
                </h2>
                {plan && (
                  <span className="text-[11px] text-[#CBD5E1]">
                    RELAY Autonomous Core
                  </span>
                )}
              </div>

              {!plan ? (
                <div className="p-3.5 rounded bg-[#161B23] border border-[#222A36] text-xs text-[#9BA3B0] leading-relaxed">
                  Fleet staged at Launch Bay. Enter a natural-language instruction below, choose a
                  mission preset, or use W/A/S/D for manual safety-guarded exploration.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="p-3 rounded bg-[#161B23] border border-[#222A36] text-xs space-y-1">
                    <div className="font-medium text-white">{plan.title}</div>
                    <div className="text-[#9BA3B0] leading-relaxed">{plan.summary}</div>
                  </div>

                  <div className="space-y-1.5">
                    {plan.objectives.map((obj, idx) => (
                      <div
                        key={obj.id}
                        className="p-2.5 rounded bg-[#151A21] border border-[#222A36] flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#F2F4F7]">
                            {idx + 1}. {obj.label}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono-tabular text-[#9BA3B0]">
                            {obj.robot_id} · ({obj.target.x}, {obj.target.z}) · {obj.priority}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-[11px] font-medium capitalize ${
                            obj.status === 'completed'
                              ? 'text-emerald-400'
                              : obj.status === 'active'
                                ? 'text-[#E5C158]'
                                : obj.status === 'rejected'
                                  ? 'text-rose-400'
                                  : 'text-[#CBD5E1]'
                          }`}
                        >
                          {obj.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'diagnostics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold tracking-wide text-[#F2F4F7]">
                Mechanical &amp; Actuator Diagnostics
              </h2>
              <span className="text-[11px] font-mono-tabular text-[#E5C158]">
                {robot.name ?? robot.robot_id}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
                <div className="text-[11px] text-[#9BA3B0]">Mechanical Integrity</div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono-tabular ${
                    (robot.integrityPct ?? 100) >= 75
                      ? 'text-emerald-400'
                      : (robot.integrityPct ?? 100) >= 45
                        ? 'text-[#E5C158]'
                        : 'text-rose-400'
                  }`}
                >
                  {(robot.integrityPct ?? 100).toFixed(1)}%
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (robot.integrityPct ?? 100) >= 75
                        ? 'bg-emerald-500'
                        : (robot.integrityPct ?? 100) >= 45
                          ? 'bg-[#E5C158]'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, robot.integrityPct ?? 100))}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
                <div className="text-[11px] text-[#9BA3B0]">Motor Temperature</div>
                <div
                  className={`mt-1 text-lg font-semibold font-mono-tabular ${
                    (robot.motorTempC ?? 34) >= 78
                      ? 'text-rose-400'
                      : (robot.motorTempC ?? 34) >= 58
                        ? 'text-[#E5C158]'
                        : 'text-sky-300'
                  }`}
                >
                  {(robot.motorTempC ?? 34).toFixed(1)} °C
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (robot.motorTempC ?? 34) >= 78
                        ? 'bg-rose-500'
                        : (robot.motorTempC ?? 34) >= 58
                          ? 'bg-[#E5C158]'
                          : 'bg-sky-400'
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, (((robot.motorTempC ?? 34) - 25) / 80) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 rounded bg-[#161B23] border border-[#222A36] grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <div className="text-[#9BA3B0]">Actuator Status</div>
                <div className="mt-0.5 font-mono-tabular font-semibold text-[#E5C158]">
                  {robot.actuatorStatus ?? 'Standby'}
                </div>
              </div>
              <div>
                <div className="text-[#9BA3B0]">Actuator Torque Load</div>
                <div className="mt-0.5 font-mono-tabular font-semibold text-white">
                  {(robot.actuatorLoadPct ?? 0).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[#9BA3B0]">Drive Train</div>
                <div className="mt-0.5 font-mono-tabular text-white capitalize">
                  {robot.locomotionState.replace('_', ' ')} ({robot.speedMps.toFixed(2)} m/s)
                </div>
              </div>
              <div>
                <div className="text-[#9BA3B0]">Collisions Logged</div>
                <div className="mt-0.5 font-mono-tabular text-white">{robot.collisionCount}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sensors' && (
          <div className="space-y-5">
            <BeliefMapCanvas
              beliefGrid={beliefGrid}
              baseCoord={baseCoord}
              survivorCoord={survivorCoord}
              relayCoord={relayCoord}
              robots={units}
              waypoints={activeWaypoints}
              survivorFound={survivorFound}
            />

            <section className="space-y-2.5 pt-2 border-t border-[#212834]">
              <h2 className="font-display text-sm font-semibold tracking-wide text-[#F2F4F7]">
                Depth LiDAR &amp; Environmental Telemetry
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">Front Clearance</div>
                  <div className="mt-0.5 font-mono-tabular text-sm text-white">
                    {sensors.frontDepthMeters.toFixed(2)} m
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">Chemical Vapor</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-sm ${
                      sensors.chemicalPpm > 20 ? 'text-lime-400' : 'text-white'
                    }`}
                  >
                    {sensors.chemicalPpm.toFixed(1)} ppm
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">EM Field / Voltage</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-sm ${
                      sensors.electricalFieldKvM > 5 ? 'text-amber-400' : 'text-white'
                    }`}
                  >
                    {sensors.electricalFieldKvM.toFixed(2)} kV/m
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">Flood Water Depth</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-sm ${
                      sensors.waterDepthM > 0.25 ? 'text-sky-400' : 'text-white'
                    }`}
                  >
                    {sensors.waterDepthM.toFixed(2)} m
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">Seismic Vibration</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-sm ${
                      sensors.vibrationHz > 15 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {sensors.vibrationHz.toFixed(1)} Hz
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[#9BA3B0]">Survivor Perception</div>
                  <div
                    className={`mt-0.5 font-mono-tabular text-sm ${
                      sensors.survivorSignal.detected ? 'text-emerald-400' : 'text-[#9BA3B0]'
                    }`}
                  >
                    {sensors.survivorSignal.detected
                      ? `${sensors.survivorSignal.confidence}% Lock`
                      : 'No Line of Sight'}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'COMMANDER', 'FLEET', 'NAVIGATION', 'SAFETY', 'PERCEPTION', 'ROBOT'] as const).map(
                (actor) => (
                  <button
                    key={actor}
                    type="button"
                    onClick={() => setActorFilter(actor)}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      actorFilter === actor
                        ? 'bg-[#1D2430] border-[#364152] text-white'
                        : 'bg-[#0D1015] border-[#1F2630] text-[#9BA3B0] hover:text-white'
                    }`}
                  >
                    {actor === 'ALL' ? 'All' : actor.charAt(0) + actor.slice(1).toLowerCase()}
                  </button>
                )
              )}
            </div>

            {filteredEvents.length === 0 ? (
              <div className="p-4 rounded bg-[#161B23] border border-[#222A36] text-xs text-[#9BA3B0]">
                No agent activity recorded yet. Launch a mission to inspect real-time decisions.
              </div>
            ) : (
              <div className="space-y-1.5">
                {[...filteredEvents].reverse().map((ev) => {
                  const isOpen = expandedEventId === ev.id;
                  return (
                    <div
                      key={ev.id}
                      className="p-2.5 rounded bg-[#151A21] border border-[#222A36] text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={`font-semibold ${ACTOR_COLORS[ev.actor]}`}>
                            {ev.actor}
                          </span>
                          <span className="mx-1.5 text-[#525D6D]">·</span>
                          <span className="font-mono-tabular text-[11px] text-[#9BA3B0]">
                            T+{ev.elapsedSec.toFixed(1)}s
                          </span>
                          <p className="mt-1 text-[#E5E7EB] leading-snug">{ev.message}</p>
                        </div>
                        {ev.details && (
                          <button
                            type="button"
                            onClick={() => setExpandedEventId(isOpen ? null : ev.id)}
                            aria-label="Toggle event payload"
                            className="p-1 text-[#9BA3B0] hover:text-white shrink-0"
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </div>
                      {isOpen && ev.details && (
                        <pre className="mt-2 p-2 rounded bg-[#0B0D10] text-[11px] font-mono-tabular text-[#9BA3B0] overflow-x-auto">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#F2F4F7]">
                Saved Mission Records
              </h2>
              <button
                type="button"
                onClick={onRefreshHistory}
                className="text-xs text-[#E5C158] hover:text-[#F0D37A]"
              >
                Refresh
              </button>
            </div>
            {missionHistory.length === 0 ? (
              <div className="p-4 rounded bg-[#161B23] border border-[#222A36] text-xs text-[#9BA3B0]">
                No completed missions stored in SQLite yet.
              </div>
            ) : (
              <div className="space-y-2">
                {missionHistory.map((m) => (
                  <div
                    key={m.mission_id}
                    className="p-3 rounded bg-[#161B23] border border-[#222A36] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white truncate">{m.title}</span>
                      <span className="font-mono-tabular font-semibold text-[#E5C158] shrink-0">
                        {m.total_score}/1000 ({m.grade})
                      </span>
                    </div>
                    <div className="text-[#9BA3B0] truncate">&ldquo;{m.instruction}&rdquo;</div>
                    <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-[#9BA3B0]">
                      <span>{m.survivor_found ? 'Survivor Located' : 'No Survivor'}</span>
                      <span>·</span>
                      <span>{m.returned_safely ? 'Docked Safely' : m.status}</span>
                      <span>·</span>
                      <span>{m.elapsed_sec.toFixed(1)}s</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
