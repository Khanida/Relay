import { AlertTriangle, CheckCircle2, CloudRain, Lock, Play, ShieldAlert, Zap } from 'lucide-react';
import { evaluateFleetLogistics } from '../agents/logisticsAgent';
import { CAMPAIGN_MISSIONS, MERIDIAN_REGIONS, ROBOT_CATALOG } from '../shared/gameCatalog';
import type { CampaignMissionDef, OwnedRobotState, PlayerProfile, RegionId } from '../shared/types';

interface MissionBoardViewProps {
  profile: PlayerProfile;
  ownedRobots: OwnedRobotState[];
  filterRegion?: RegionId | 'ALL';
  onFilterChange: (region: RegionId | 'ALL') => void;
  onLaunchMission: (mission: CampaignMissionDef) => void;
}

const CHAPTER_LABELS: Record<number, string> = {
  1: 'Level 1 — Industrial District (Sector 07)',
  2: 'Level 2 — Meridian City (Metropolitan Core)',
  3: 'Level 3 — Old Quarter (Flooded Canals)',
  4: 'Level 4 — Port Meridian & Desert Corridor',
  5: 'Level 5 — Highland Province (Alpine Ridge)',
  6: 'Level 6 — Research Valley (ARIA-Net Core)',
};

export function MissionBoardView({
  profile,
  ownedRobots,
  filterRegion = 'ALL',
  onFilterChange,
  onLaunchMission,
}: MissionBoardViewProps) {
  const chapters = [1, 2, 3, 4, 5, 6];
  const sideMissions = CAMPAIGN_MISSIONS.filter((m) => m.chapter === 0);

  const filterFn = (m: CampaignMissionDef) =>
    filterRegion === 'ALL' || m.regionId === filterRegion;

  const renderCard = (mission: CampaignMissionDef) => {
    const region = MERIDIAN_REGIONS[mission.regionId];
    const completed = profile.completed_mission_ids.includes(mission.id);
    const unlocked =
      mission.chapter === 0
        ? profile.unlocked_regions.includes(mission.regionId)
        : mission.chapter <= profile.current_chapter;
    const readiness = evaluateFleetLogistics(ownedRobots, mission, mission.weather);
    const hasWarning = readiness.advisories.some((a) => a.severity === 'warning');
    const drainMult = mission.modifiers?.batteryDrainMult ?? 1.0;
    const hazardMult = mission.modifiers?.hazardDamageMult ?? 1.0;

    return (
      <div
        key={mission.id}
        className={`rounded-lg bg-[#11151C] border p-5 flex flex-col justify-between gap-4 ${
          unlocked ? 'border-[#232B38]' : 'border-[#1A2029] opacity-65'
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#E5C158]">
                {mission.chapter > 0 ? `Level ${mission.chapter}` : 'Repeatable Side Op'} ·{' '}
                {region.name}
              </div>
              <h3 className="font-display text-lg font-bold text-white mt-0.5">{mission.title}</h3>
            </div>
            <div className="shrink-0 text-right font-mono-tabular">
              <div className="text-sm font-semibold text-emerald-400">+{mission.rewardRc} RC</div>
              <div className="text-[11px] text-[#9BA3B0]">+{mission.optionalBonusRc} RC Bonus</div>
            </div>
          </div>

          <p className="text-xs text-[#9BA3B0] leading-relaxed">{mission.description}</p>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-[#D1D5DB]">
            <span className="inline-flex items-center gap-1">
              <CloudRain size={12} className="text-sky-400" />
              {mission.weather.replace('_', ' ')} ({mission.timeOfDay})
            </span>
            <span
              className={
                mission.difficulty === 'Critical'
                  ? 'text-rose-400 font-semibold'
                  : mission.difficulty === 'Severe'
                    ? 'text-amber-300 font-medium'
                    : 'text-[#D1D5DB]'
              }
            >
              {mission.difficulty}
            </span>
            {drainMult > 1.0 && (
              <span className="inline-flex items-center gap-1 text-amber-300 font-mono-tabular">
                <Zap size={11} /> Drain {drainMult.toFixed(2)}x
              </span>
            )}
            {hazardMult > 1.0 && (
              <span className="inline-flex items-center gap-1 text-rose-300 font-mono-tabular">
                <ShieldAlert size={11} /> Hazard {hazardMult.toFixed(1)}x
              </span>
            )}
          </div>

          <div className="text-[11px] text-[#9BA3B0]">
            Recommended: {mission.recommendedRobots.map((r) => ROBOT_CATALOG[r].codeName).join(', ')}
          </div>

          {unlocked && hasWarning && (
            <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-200 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                {readiness.advisories.find((a) => a.severity === 'warning')?.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#1E2531]">
          <div className="text-[11px] text-[#9BA3B0]">
            {completed ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 size={13} /> Completed (Replayable for 65% RC)
              </span>
            ) : (
              <span>Bonus: {mission.optionalObjectiveLabel}</span>
            )}
          </div>
          <button
            type="button"
            disabled={!unlocked}
            onClick={() => onLaunchMission(mission)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0D10] bg-[#D4AF37] hover:bg-[#E2C04D] disabled:bg-[#1E242E] disabled:text-[#7B8494] rounded transition-colors shrink-0"
          >
            {unlocked ? (
              <>
                <Play size={13} /> Briefing &amp; Deploy
              </>
            ) : (
              <>
                <Lock size={13} /> Locked
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 bg-[#0B0D10] overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2530] pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Operation Ashfall — Levels &amp; Missions
            </h2>
            <p className="text-xs text-[#9BA3B0] mt-0.5">
              Each level contains multiple specialized rescue contracts. Complete 2 operations or the level finale to unlock higher difficulty sectors.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onFilterChange('ALL')}
              className={`px-3 py-1.5 text-xs rounded border ${
                filterRegion === 'ALL'
                  ? 'bg-[#D4AF37] border-[#E2C04D] text-[#0B0D10] font-semibold'
                  : 'bg-[#12161D] border-[#242C38] text-[#CBD5E1] hover:text-white'
              }`}
            >
              All Regions
            </button>
            {Object.values(MERIDIAN_REGIONS).map((reg) => (
              <button
                key={reg.id}
                type="button"
                onClick={() => onFilterChange(reg.id)}
                className={`px-3 py-1.5 text-xs rounded border ${
                  filterRegion === reg.id
                    ? 'bg-[#D4AF37] border-[#E2C04D] text-[#0B0D10] font-semibold'
                    : 'bg-[#12161D] border-[#242C38] text-[#CBD5E1] hover:text-white'
                }`}
              >
                {reg.name}
              </button>
            ))}
          </div>
        </div>

        {chapters.map((chap) => {
          const list = CAMPAIGN_MISSIONS.filter((m) => m.chapter === chap && filterFn(m));
          if (list.length === 0) return null;
          const totalInChap = CAMPAIGN_MISSIONS.filter((m) => m.chapter === chap).length;
          const doneInChap = CAMPAIGN_MISSIONS.filter(
            (m) => m.chapter === chap && profile.completed_mission_ids.includes(m.id)
          ).length;
          const unlocked = chap <= profile.current_chapter;

          return (
            <section key={chap} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#D1D5DB]">
                  {CHAPTER_LABELS[chap] ?? `Level ${chap}`}
                </h3>
                <div className="text-xs font-mono-tabular text-[#9BA3B0]">
                  {unlocked
                    ? `${doneInChap} / ${totalInChap} Completed`
                    : `Locked — Unlocks at Level ${chap}`}
                </div>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{list.map(renderCard)}</div>
            </section>
          );
        })}

        {sideMissions.filter(filterFn).length > 0 && (
          <section className="space-y-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#D1D5DB]">
              Regional Side Contracts
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sideMissions.filter(filterFn).map(renderCard)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
