import { ArrowRight, Compass, Cpu, FolderOpen, Layers, Settings, ShieldAlert } from 'lucide-react';
import { MERIDIAN_REGIONS } from '../shared/gameCatalog';
import type { PlayerProfile } from '../shared/types';

export type AppScreen = 'menu' | 'operations' | 'world_map' | 'garage' | 'missions' | 'settings';

interface MainMenuOverlayProps {
  profile: PlayerProfile;
  ownedCount: number;
  hasExistingProgress: boolean;
  onNavigate: (screen: AppScreen) => void;
  onContinue: () => void;
  onNewGame: () => void;
}

export function MainMenuOverlay({
  profile,
  ownedCount,
  hasExistingProgress,
  onNavigate,
  onContinue,
  onNewGame,
}: MainMenuOverlayProps) {
  const activeRegion = MERIDIAN_REGIONS[profile.active_region];

  return (
    <div className="fixed inset-0 z-40 bg-[#080A0E] text-[#F2F4F7] overflow-y-auto flex flex-col justify-between p-6 md:p-12">
      {/* Subtle architectural grid backdrop */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 72% 28%, rgba(249,115,22,0.18), transparent 45%), linear-gradient(to right, #1b222d 1px, transparent 1px), linear-gradient(to bottom, #1b222d 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
        }}
      />

      <div className="relative z-10 max-w-6xl w-full mx-auto flex items-center justify-between border-b border-[#1E2530] pb-5">
        <div>
          <span className="font-display text-2xl font-bold tracking-wider text-white">RELAY 2.0</span>
          <p className="text-xs text-[#9BA3B0] mt-0.5">
            Operation Ashfall · Meridian Autonomous Response Network
          </p>
        </div>
        <div className="text-right font-mono-tabular text-xs">
          <div className="text-orange-400 font-semibold">{profile.credits_rc.toLocaleString()} RC</div>
          <div className="text-[#9BA3B0]">
            Chapter {profile.current_chapter} / 6 · {ownedCount} / 10 Units
          </div>
        </div>
      </div>

      <main className="relative z-10 max-w-6xl w-full mx-auto my-auto py-10 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-orange-400">
              Open-World Autonomous Robotics Simulation
            </p>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.06]">
              When humans can&apos;t reach, intelligence goes further.
            </h1>
            <p className="text-sm md:text-base text-[#9BA3B0] max-w-2xl leading-relaxed">
              Command multi-agent rescue fleets across seven interconnected districts of coastal Meridian.
              Coordinate aerial scouts, amphibious floodcraft, hazmat hexapods, and heavy breachers under
              strict deterministic safety enforcement.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-md transition-colors"
            >
              {hasExistingProgress ? 'Continue Operations' : 'Enter Field Operations'}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('missions')}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[#171C24] hover:bg-[#202733] border border-[#2A3342] rounded-md transition-colors"
            >
              <Layers size={15} />
              Campaign &amp; Missions
            </button>
            <button
              type="button"
              onClick={onNewGame}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-[#D1D5DB] bg-[#11151B] hover:bg-[#191F28] border border-[#242C38] rounded-md transition-colors"
            >
              <FolderOpen size={15} />
              New Career
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('world_map')}
            className="text-left p-5 rounded-lg bg-[#12161D] hover:bg-[#181E27] border border-[#232B38] transition-colors space-y-2"
          >
            <Compass size={20} className="text-sky-400" />
            <div className="font-display font-semibold text-base text-white">Meridian World Map</div>
            <p className="text-xs text-[#9BA3B0]">
              Active Sector: {activeRegion.name}. Deploy across {profile.unlocked_regions.length} unlocked regions.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('garage')}
            className="text-left p-5 rounded-lg bg-[#12161D] hover:bg-[#181E27] border border-[#232B38] transition-colors space-y-2"
          >
            <Cpu size={20} className="text-orange-400" />
            <div className="font-display font-semibold text-base text-white">Robotics Garage</div>
            <p className="text-xs text-[#9BA3B0]">
              Acquire 10 specialized chassis, install equipment modules, and configure Dual-Fleet slots.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('missions')}
            className="text-left p-5 rounded-lg bg-[#12161D] hover:bg-[#181E27] border border-[#232B38] transition-colors space-y-2"
          >
            <ShieldAlert size={20} className="text-emerald-400" />
            <div className="font-display font-semibold text-base text-white">Operation Ashfall</div>
            <p className="text-xs text-[#9BA3B0]">
              6-chapter narrative campaign investigating cascading ARIA-Net failures.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-left p-5 rounded-lg bg-[#12161D] hover:bg-[#181E27] border border-[#232B38] transition-colors space-y-2"
          >
            <Settings size={20} className="text-[#9BA3B0]" />
            <div className="font-display font-semibold text-base text-white">System &amp; Saves</div>
            <p className="text-xs text-[#9BA3B0]">
              Graphics quality, dynamic weather, save slots, and RC transaction ledger.
            </p>
          </button>
        </div>
      </main>

      <footer className="relative z-10 max-w-6xl w-full mx-auto border-t border-[#1E2530] pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#7B8494]">
        <span>Deterministic Navigation &amp; Safety Core · Dual-Unit Fleet Support · Local SQLite Persistence</span>
        <span>Press W/A/S/D in Operations for manual exploration override</span>
      </footer>
    </div>
  );
}
