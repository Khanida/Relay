import { ArrowRight, CloudRain, Lock, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { CAMPAIGN_MISSIONS, MERIDIAN_REGIONS } from '../shared/gameCatalog';
import type { PlayerProfile, RegionId } from '../shared/types';

interface WorldMapViewProps {
  profile: PlayerProfile;
  onSelectRegion: (regionId: RegionId) => void;
  onOpenMissionBoard: (regionId: RegionId) => void;
}

const HIGHWAY_LINKS: Array<[RegionId, RegionId]> = [
  ['industrial_district', 'meridian_city'],
  ['industrial_district', 'old_quarter'],
  ['old_quarter', 'port_meridian'],
  ['meridian_city', 'old_quarter'],
  ['meridian_city', 'highland_province'],
  ['meridian_city', 'desert_corridor'],
  ['highland_province', 'research_valley'],
  ['desert_corridor', 'research_valley'],
];

export function WorldMapView({
  profile,
  onSelectRegion,
  onOpenMissionBoard,
}: WorldMapViewProps) {
  const regions = Object.values(MERIDIAN_REGIONS);
  const selected = MERIDIAN_REGIONS[profile.active_region];
  const selectedMissions = CAMPAIGN_MISSIONS.filter((m) => m.regionId === selected.id);
  const isUnlocked = profile.unlocked_regions.includes(selected.id);

  return (
    <div className="flex-1 min-h-0 bg-[#0B0D10] overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Meridian Map Canvas */}
        <div className="lg:col-span-8 rounded-lg bg-[#11151C] border border-[#222A36] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Meridian Coastal Region
              </h2>
              <p className="text-xs text-[#9BA3B0]">
                Select any unlocked sector to travel your mobile command depot or inspect active incidents.
              </p>
            </div>
            <div className="text-xs font-mono-tabular text-[#9BA3B0]">
              {profile.unlocked_regions.length} / {regions.length} Regions Active
            </div>
          </div>

          <div className="relative w-full aspect-[16/10] rounded-lg bg-[#0A0E14] border border-[#1E2632] overflow-hidden">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              {/* Coastal Bay Water */}
              <path
                d="M 0 0 L 42 0 Q 26 26, 20 44 Q 14 68, 28 100 L 0 100 Z"
                fill="#0c1d2e"
                opacity="0.85"
              />
              {/* Elevation contours */}
              <path
                d="M 55 0 Q 68 35, 92 48 L 100 48 L 100 0 Z"
                fill="#141a21"
                opacity="0.65"
              />
              <path
                d="M 52 60 Q 75 56, 100 72 L 100 100 L 45 100 Z"
                fill="#1d1812"
                opacity="0.55"
              />

              {/* Regional Highway Network */}
              {HIGHWAY_LINKS.map(([aId, bId]) => {
                const a = MERIDIAN_REGIONS[aId];
                const b = MERIDIAN_REGIONS[bId];
                const activeLink =
                  profile.unlocked_regions.includes(aId) &&
                  profile.unlocked_regions.includes(bId);
                return (
                  <line
                    key={`${aId}-${bId}`}
                    x1={a.mapCoords.xPct}
                    y1={a.mapCoords.yPct}
                    x2={b.mapCoords.xPct}
                    y2={b.mapCoords.yPct}
                    stroke={activeLink ? '#334155' : '#1e2530'}
                    strokeWidth="0.65"
                    strokeDasharray={activeLink ? undefined : '1.4 1.4'}
                  />
                );
              })}
            </svg>

            {/* Interactive Sector Pins */}
            {regions.map((reg) => {
              const unlocked = profile.unlocked_regions.includes(reg.id);
              const isSelected = profile.active_region === reg.id;
              const regionMissions = CAMPAIGN_MISSIONS.filter((m) => m.regionId === reg.id);
              const completedCount = regionMissions.filter((m) =>
                profile.completed_mission_ids.includes(m.id)
              ).length;

              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => unlocked && onSelectRegion(reg.id)}
                  style={{
                    left: `${reg.mapCoords.xPct}%`,
                    top: `${reg.mapCoords.yPct}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group text-left transition-transform ${
                    unlocked ? 'hover:scale-105 cursor-pointer' : 'opacity-65 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#D4AF37] border-[#E5C158] text-[#0B0D10] font-semibold shadow-lg'
                        : unlocked
                          ? 'bg-[#141923] border-[#2C3646] text-[#E5E7EB] hover:border-[#D4AF37]/60'
                          : 'bg-[#0E1218] border-[#1F2632] text-[#7B8494]'
                    }`}
                  >
                    {unlocked ? (
                      <MapPin size={13} className={isSelected ? 'text-[#0B0D10]' : 'text-[#E5C158]'} />
                    ) : (
                      <Lock size={12} />
                    )}
                    <span className="font-medium">{reg.name}</span>
                    {unlocked && (
                      <span className="font-mono-tabular text-[10px] opacity-80">
                        {completedCount}/{regionMissions.length}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Region Dossier */}
        <div className="lg:col-span-4 rounded-lg bg-[#11151C] border border-[#222A36] p-5 space-y-5">
          <div>
            <div className="text-xs font-medium text-[#E5C158]">{selected.subtitle}</div>
            <h3 className="font-display text-2xl font-bold text-white mt-1">{selected.name}</h3>
            <p className="mt-2 text-xs text-[#9BA3B0] leading-relaxed">{selected.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
              <div className="text-[#9BA3B0] flex items-center gap-1.5">
                <CloudRain size={12} /> Weather Forecast
              </div>
              <div className="mt-1 font-medium text-white capitalize">
                {selected.defaultWeather.replace('_', ' ')}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161B23] border border-[#222A36]">
              <div className="text-[#9BA3B0] flex items-center gap-1.5">
                <Zap size={12} /> Local Time
              </div>
              <div className="mt-1 font-medium text-white capitalize">{selected.defaultTime}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-[#D1D5DB]">Available Operations</div>
            {selectedMissions.map((m) => {
              const done = profile.completed_mission_ids.includes(m.id);
              return (
                <div
                  key={m.id}
                  className="p-3 rounded bg-[#151A22] border border-[#222A36] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{m.title}</div>
                    <div className="text-[11px] font-mono-tabular text-[#9BA3B0]">
                      Reward: {m.rewardRc} RC · {m.difficulty}
                    </div>
                  </div>
                  {done && <ShieldCheck size={15} className="text-emerald-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!isUnlocked}
            onClick={() => onOpenMissionBoard(selected.id)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#0B0D10] bg-[#D4AF37] hover:bg-[#E2C04D] disabled:opacity-40 rounded transition-colors"
          >
            Deploy to {selected.name}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
