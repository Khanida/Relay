import type { CampaignMissionDef, MissionScoreBreakdown } from '../shared/types';

interface MissionCompleteModalProps {
  score: MissionScoreBreakdown;
  campaignMission?: CampaignMissionDef | null;
  creditsEarned?: number;
  bonusEarned?: boolean;
  onResetAndPlayAgain: () => void;
  onReturnToBoard: () => void;
  onDismiss: () => void;
}

export function MissionCompleteModal({
  score,
  campaignMission,
  creditsEarned,
  bonusEarned,
  onResetAndPlayAgain,
  onReturnToBoard,
  onDismiss,
}: MissionCompleteModalProps) {
  const rows = [
    { label: 'Mission Completion', pts: score.completionPoints, max: 250 },
    { label: 'Survivor Detection & Reporting', pts: score.survivorPoints, max: 300 },
    { label: 'Safety Compliance & Safe Return', pts: score.safetyCompliancePoints, max: 200 },
    { label: 'Dynamic Route Recovery', pts: score.dynamicRecoveryPoints, max: 100 },
    { label: 'Battery Efficiency', pts: score.batteryEfficiencyPoints, max: 80 },
    { label: 'Collision Avoidance', pts: score.collisionAvoidancePoints, max: 50 },
    { label: 'Time Efficiency', pts: score.timeEfficiencyPoints, max: 70 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-lg bg-[#13171D] border border-[#28313E] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-orange-400 font-medium">
              {campaignMission ? campaignMission.title : 'Operation First Light'}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-white">
              Mission Debrief
            </h2>
            <p className="mt-1 text-xs text-[#9BA3B0]">
              {score.survivorFound ? 'Survivor located and reported' : 'Survivor not located'} ·{' '}
              {score.returnedSafely ? 'Unit docked safely' : 'Unit did not reach base'} ·{' '}
              <span className="font-mono-tabular">{score.elapsedSec.toFixed(1)}s</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-display font-bold text-orange-400 font-mono-tabular">
              {score.grade}
            </div>
            <div className="text-xs font-mono-tabular text-[#9BA3B0]">
              {score.totalScore} / 1000
            </div>
          </div>
        </div>

        {typeof creditsEarned === 'number' && creditsEarned > 0 && (
          <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold text-emerald-300">RELAY Credits Awarded</div>
              {bonusEarned && (
                <div className="text-[11px] text-emerald-400/90">
                  Optional bonus objective achieved!
                </div>
              )}
            </div>
            <div className="font-mono-tabular text-base font-bold text-emerald-300">
              +{creditsEarned} RC
            </div>
          </div>
        )}

        <div className="space-y-2 border-y border-[#222A36] py-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-xs">
              <span className="text-[#D1D5DB]">{r.label}</span>
              <span className="font-mono-tabular text-white">
                {r.pts} / {r.max}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="px-3.5 py-2 text-xs font-medium text-[#D1D5DB] bg-[#1C222B] hover:bg-[#252D39] rounded transition-colors"
          >
            Inspect Scene
          </button>
          <button
            type="button"
            onClick={onResetAndPlayAgain}
            className="px-3.5 py-2 text-xs font-medium text-[#D1D5DB] bg-[#1C222B] hover:bg-[#252D39] rounded transition-colors"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={onReturnToBoard}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded transition-colors"
          >
            Mission Board
          </button>
        </div>
      </div>
    </div>
  );
}
