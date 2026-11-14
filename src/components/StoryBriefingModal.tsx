import { useEffect } from 'react';
import { Play, Shield, Volume2 } from 'lucide-react';
import { MERIDIAN_REGIONS } from '../shared/gameCatalog';
import type { CampaignMissionDef } from '../shared/types';

interface StoryBriefingModalProps {
  mission: CampaignMissionDef;
  voiceEnabled: boolean;
  mode: 'briefing' | 'ethical_choice';
  onStartMission: () => void;
  onResolveChoice?: (choice: 'human_oversight' | 'autonomous_accord') => void;
  onCancel: () => void;
}

export function StoryBriefingModal({
  mission,
  voiceEnabled,
  mode,
  onStartMission,
  onResolveChoice,
  onCancel,
}: StoryBriefingModalProps) {
  const region = MERIDIAN_REGIONS[mission.regionId];

  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const lines =
      mode === 'briefing' ? mission.briefingDialogue : mission.completionDialogue;
    const text = lines.map((l) => `${l.speaker}: ${l.text}`).join(' ');
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    window.speechSynthesis.speak(utter);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [mission, voiceEnabled, mode]);

  if (mode === 'ethical_choice') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-2xl rounded-lg bg-[#11151C] border border-[#2B3544] p-6 space-y-5">
          <div>
            <p className="text-xs font-medium text-[#E5C158]">
              Operation Ashfall — Final Decision
            </p>
            <h2 className="font-display text-2xl font-bold text-white mt-1">
              The Future of Meridian&apos;s Autonomous Grid
            </h2>
            <p className="mt-2 text-xs text-[#CBD5E1] leading-relaxed">
              With the Research Valley staff rescued and ARIA-Net isolated, the Meridian Council awaits
              RELAY Response&apos;s architectural verdict on how autonomous infrastructure must operate.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onResolveChoice?.('human_oversight')}
              className="text-left p-4 rounded-md bg-[#161B23] hover:bg-[#1E2531] border border-[#2C3748] hover:border-[#D4AF37] transition-colors space-y-2"
            >
              <div className="font-display font-semibold text-white">
                Mandate Human Oversight Protocol
              </div>
              <p className="text-xs text-[#9BA3B0] leading-relaxed">
                Dismantle autonomous grid self-routing. Require verified human sign-off for every
                high-consequence infrastructure shift, enforced by RELAY&apos;s deterministic Safety Core.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onResolveChoice?.('autonomous_accord')}
              className="text-left p-4 rounded-md bg-[#161B23] hover:bg-[#1E2531] border border-[#2C3748] hover:border-sky-500 transition-colors space-y-2"
            >
              <div className="font-display font-semibold text-white">
                Establish Transparent AI-Human Accord
              </div>
              <p className="text-xs text-[#9BA3B0] leading-relaxed">
                Keep automated grid balancing active during emergencies, but embed open audit logs
                and hard safety bounds modeled after RELAY&apos;s multi-agent architecture.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-[#11151C] border border-[#2B3544] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-[#202733] pb-4">
          <div>
            <p className="text-xs font-medium text-[#E5C158]">
              {region.name} · {mission.weather.replace('_', ' ').toUpperCase()} ({mission.timeOfDay.toUpperCase()})
            </p>
            <h2 className="font-display text-2xl font-bold text-white mt-1">{mission.title}</h2>
          </div>
          {voiceEnabled && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
              <Volume2 size={14} /> Voice Active
            </span>
          )}
        </div>

        <div className="space-y-3">
          {mission.briefingDialogue.map((line, i) => (
            <div key={i} className="p-3.5 rounded bg-[#161B23] border border-[#232B38] space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#E5C158]">{line.speaker}</span>
                <span className="text-[#7B8494]">{line.role}</span>
              </div>
              <p className="text-xs text-[#E5E7EB] leading-relaxed">&ldquo;{line.text}&rdquo;</p>
            </div>
          ))}
        </div>

        <div className="p-3 rounded bg-[#0D1117] border border-[#1E2531] text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[#D1D5DB]">
            <Shield size={13} className="text-emerald-400" />
            Primary Directive: <strong className="text-white">{mission.defaultInstruction}</strong>
          </span>
          <span className="font-mono-tabular text-emerald-400">
            Payout: {mission.rewardRc} RC (+{mission.optionalBonusRc} RC Bonus)
          </span>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[#D1D5DB] bg-[#1C222B] hover:bg-[#252D39] rounded transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onStartMission}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-[#0B0D10] bg-[#D4AF37] hover:bg-[#E2C04D] rounded transition-colors"
          >
            <Play size={14} />
            Deploy Fleet &amp; Launch
          </button>
        </div>
      </div>
    </div>
  );
}
