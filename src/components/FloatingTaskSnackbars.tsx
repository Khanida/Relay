import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Navigation,
  Play,
  Trophy,
  X,
} from 'lucide-react';
import type {
  CampaignMissionDef,
  MissionPhase,
  MissionPlan,
  MissionScoreBreakdown,
} from '../shared/types';

interface FloatingTaskSnackbarsProps {
  plan: MissionPlan | null;
  phase: MissionPhase;
  elapsedSec: number;
  lastScore: MissionScoreBreakdown | null;
  regionMissions: CampaignMissionDef[];
  completedMissionIds: string[];
  activeCampaignMissionId?: string | null;
  onSelectMission: (mission: CampaignMissionDef) => void;
}

export function FloatingTaskSnackbars({
  plan,
  phase,
  elapsedSec,
  lastScore,
  regionMissions,
  completedMissionIds,
  activeCampaignMissionId,
  onSelectMission,
}: FloatingTaskSnackbarsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Reset dismissed task snackbars whenever a new mission plan starts
  useEffect(() => {
    setDismissedIds(new Set());
  }, [plan?.mission_id]);

  if (!plan) {
    return (
      <div className="pointer-events-auto w-72 space-y-2">
        <div className="rounded-lg bg-[#12161C]/95 border border-[#CBD5E1]/25 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E5C158]">
            Sector Missions · Ready
          </span>
          <span className="text-[10px] font-mono-tabular text-[#CBD5E1]">
            {regionMissions.length} Tasks
          </span>
        </div>

        <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
          {regionMissions.slice(0, 4).map((m) => {
            const done = completedMissionIds.includes(m.id);
            const isSelected = activeCampaignMissionId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMission(m)}
                className={`w-full text-left rounded-lg bg-[#12161C]/95 border px-3 py-2 transition-colors flex items-start justify-between gap-2 ${
                  isSelected
                    ? 'border-[#D4AF37]/80 hover:border-[#E5C158]'
                    : 'border-[#94A3B8]/30 hover:border-[#D4AF37]/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {done ? (
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    ) : (
                      <Play size={11} className="text-[#E5C158] shrink-0" />
                    )}
                    <span className="text-xs font-medium text-[#F2F4F7] truncate">
                      {m.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#CBD5E1] truncate">
                    Lv.{m.chapter || 'Side'} · {m.difficulty} · {m.weather.replace('_', ' ')}
                  </div>
                </div>
                <span className="shrink-0 font-mono-tabular text-[10px] font-semibold text-[#E5C158]">
                  +{m.rewardRc} RC
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const visibleObjectives = plan.objectives.filter((o) => !dismissedIds.has(o.id));
  const completedCount = plan.objectives.filter((o) => o.status === 'completed').length;

  return (
    <div className="pointer-events-auto w-72 space-y-1.5">
      {/* Active Mission Header Snackbar */}
      <div className="rounded-lg bg-[#12161C]/95 border border-[#D4AF37]/50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#E5C158] truncate">{plan.title}</span>
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-semibold uppercase border ${
              phase === 'completed'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : phase === 'returning'
                  ? 'bg-[#1E2532] border-[#CBD5E1]/40 text-[#E2E8F0]'
                  : phase === 'paused' || phase === 'aborted'
                    ? 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                    : 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#E5C158]'
            }`}
          >
            {phase}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono-tabular text-[#CBD5E1]">
          <span>
            Tasks {completedCount}/{plan.objectives.length}
          </span>
          <span>T+{elapsedSec.toFixed(1)}s</span>
        </div>
      </div>

      {/* Mission Score Summary Snackbar when completed */}
      {phase === 'completed' && lastScore && (
        <div className="rounded-lg bg-[#12161C]/95 border border-[#D4AF37]/70 px-3 py-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F2F4F7]">
            <Trophy size={13} className="text-[#E5C158]" />
            Mission Complete
          </span>
          <span className="font-mono-tabular text-xs font-bold text-[#E5C158]">
            {lastScore.totalScore}/1000 · {lastScore.grade}
          </span>
        </div>
      )}

      {/* Individual Task Snackbars */}
      <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
        {visibleObjectives.map((obj, idx) => {
          const isActive = obj.status === 'active';
          const isDone = obj.status === 'completed';
          const isRejected = obj.status === 'rejected';

          return (
            <div
              key={obj.id}
              className={`rounded-lg bg-[#12161C]/95 border px-3 py-2 flex items-start justify-between gap-2 transition-colors ${
                isActive
                  ? 'border-[#D4AF37]/80'
                  : isDone
                    ? 'border-emerald-500/45 opacity-90'
                    : isRejected
                      ? 'border-rose-500/65'
                      : 'border-[#94A3B8]/30'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  ) : isActive ? (
                    <Navigation size={13} className="text-[#E5C158]" />
                  ) : isRejected ? (
                    <AlertTriangle size={13} className="text-rose-400" />
                  ) : (
                    <Circle size={12} className="text-[#94A3B8]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-medium leading-snug ${
                      isDone ? 'text-[#CBD5E1] line-through' : 'text-[#F2F4F7]'
                    }`}
                  >
                    {idx + 1}. {obj.label}
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono-tabular text-[#94A3B8]">
                    {obj.robot_id} · ({obj.target.x}, {obj.target.z})
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-semibold uppercase border ${
                    isActive
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#E5C158]'
                      : isDone
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : isRejected
                          ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                          : 'bg-[#1A2029] border-[#94A3B8]/30 text-[#CBD5E1]'
                  }`}
                >
                  {obj.status}
                </span>
                {!isActive && (
                  <button
                    type="button"
                    aria-label="Dismiss task snackbar"
                    onClick={() =>
                      setDismissedIds((prev) => {
                        const next = new Set(prev);
                        next.add(obj.id);
                        return next;
                      })
                    }
                    className="p-0.5 text-[#94A3B8] hover:text-white"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {dismissedIds.size > 0 && (
        <button
          type="button"
          onClick={() => setDismissedIds(new Set())}
          className="w-full text-center text-[10px] text-[#CBD5E1] hover:text-[#E5C158] py-0.5"
        >
          Show {dismissedIds.size} hidden task{dismissedIds.size > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
