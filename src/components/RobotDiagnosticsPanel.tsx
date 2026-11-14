import { Cpu, Flame, ShieldAlert, Wrench } from 'lucide-react';
import type { ActuatorStatus, MissionPhase, RobotStateSnapshot } from '../shared/types';

interface RobotDiagnosticsPanelProps {
  robot: RobotStateSnapshot;
  phase: MissionPhase;
}

function getStatusBadgeClass(status: ActuatorStatus): string {
  switch (status) {
    case 'Fault':
      return 'bg-rose-950/80 border-rose-500/60 text-rose-300';
    case 'Thermal Caution':
      return 'bg-amber-950/80 border-amber-500/60 text-amber-300';
    case 'High Load':
      return 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#E5C158]';
    case 'Nominal':
      return 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300';
    default:
      return 'bg-[#1A2029] border-[#94A3B8]/40 text-[#CBD5E1]';
  }
}

export function RobotDiagnosticsPanel({ robot, phase }: RobotDiagnosticsPanelProps) {
  const integrity = Math.max(0, Math.min(100, robot.integrityPct ?? 100));
  const motorTempC = robot.motorTempC ?? 34.0;
  const actuatorLoadPct = Math.max(0, Math.min(100, robot.actuatorLoadPct ?? 0));
  const actuatorStatus: ActuatorStatus = robot.actuatorStatus ?? 'Standby';

  const integrityBarColor =
    integrity >= 75 ? 'bg-emerald-400' : integrity >= 45 ? 'bg-[#E5C158]' : 'bg-rose-500';
  const integrityTextColor =
    integrity >= 75 ? 'text-emerald-300' : integrity >= 45 ? 'text-[#E5C158]' : 'text-rose-400';

  const tempNorm = Math.max(0, Math.min(100, ((motorTempC - 25) / 80) * 100));
  const tempColor =
    motorTempC >= 78 ? 'text-rose-400' : motorTempC >= 58 ? 'text-[#E5C158]' : 'text-sky-300';
  const tempBarColor =
    motorTempC >= 78 ? 'bg-rose-500' : motorTempC >= 58 ? 'bg-[#E5C158]' : 'bg-sky-400';

  const isLive = phase === 'executing' || phase === 'returning';

  return (
    <div
      data-testid="robot-diagnostics-hud"
      className="pointer-events-auto w-[230px] rounded-lg bg-[#12161C]/95 border border-[#94A3B8]/35 p-2.5 text-[11px] text-[#D1D5DB] space-y-2"
    >
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#222934]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#E5C158] tracking-wide uppercase text-[10px]">
          <Wrench size={11} className="text-[#CBD5E1]" />
          Unit Diagnostics
        </span>
        <span
          className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(
            actuatorStatus
          )}`}
        >
          {actuatorStatus}
        </span>
      </div>

      {/* Mechanical Integrity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between font-mono-tabular">
          <span className="inline-flex items-center gap-1 text-[#CBD5E1]">
            <ShieldAlert size={11} className="text-[#94A3B8]" />
            Mech Integrity
          </span>
          <span className={`font-semibold ${integrityTextColor}`}>{integrity.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${integrityBarColor}`}
            style={{ width: `${integrity}%` }}
          />
        </div>
      </div>

      {/* Motor Temperature */}
      <div className="space-y-1">
        <div className="flex items-center justify-between font-mono-tabular">
          <span className="inline-flex items-center gap-1 text-[#CBD5E1]">
            <Flame size={11} className="text-[#94A3B8]" />
            Motor Temp
          </span>
          <span className={`font-semibold ${tempColor}`}>{motorTempC.toFixed(1)} °C</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${tempBarColor}`}
            style={{ width: `${tempNorm}%` }}
          />
        </div>
      </div>

      {/* Actuator Status & Load */}
      <div className="pt-1 border-t border-[#222934] grid grid-cols-2 gap-2 font-mono-tabular text-[10px]">
        <div>
          <div className="inline-flex items-center gap-1 text-[#9BA3B0]">
            <Cpu size={10} />
            Actuator Load
          </div>
          <div className="text-white font-semibold mt-0.5">{actuatorLoadPct.toFixed(0)}%</div>
        </div>
        <div className="text-right">
          <div className="text-[#9BA3B0]">Drive Mode</div>
          <div className="text-[#E5C158] font-semibold capitalize mt-0.5 truncate">
            {robot.locomotionState.replace('_', ' ')}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono-tabular text-[#9BA3B0] pt-0.5">
        <span className="truncate">{robot.name ?? robot.robot_id}</span>
        <span className={isLive ? 'text-emerald-400' : 'text-[#9BA3B0]'}>
          {isLive ? 'LIVE TELEMETRY' : phase.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
