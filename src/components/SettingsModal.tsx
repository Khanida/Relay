import { useState } from 'react';
import { HardDrive, RefreshCw, Save, Sliders } from 'lucide-react';
import type {
  EconomyTransaction,
  GraphicsQuality,
  PlayerProfile,
  PlayerSettings,
  SaveSlotSummary,
} from '../shared/types';

interface SettingsModalProps {
  profile: PlayerProfile;
  saveSlots: SaveSlotSummary[];
  transactions: EconomyTransaction[];
  onUpdateSettings: (patch: Partial<PlayerSettings>) => Promise<void>;
  onSaveSlot: (slotId: string, label: string) => Promise<void>;
  onLoadSlot: (slotId: string) => Promise<void>;
  onNewGame: () => Promise<void>;
}

export function SettingsModal({
  profile,
  saveSlots,
  transactions,
  onUpdateSettings,
  onSaveSlot,
  onLoadSlot,
  onNewGame,
}: SettingsModalProps) {
  const [slotLabel, setSlotLabel] = useState(`Operation Chapter ${profile.current_chapter}`);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const settings = profile.settings;

  const notify = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  return (
    <div className="flex-1 min-h-0 bg-[#0B0D10] overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        {/* Visual, Simulation & Audio Settings */}
        <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-[#1E2531] pb-3">
            <Sliders size={16} className="text-orange-400" />
            <h2 className="font-display text-lg font-bold text-white">Graphics &amp; Simulation</h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-medium text-[#D1D5DB]">Graphics Quality Preset</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdateSettings({ graphicsQuality: q })}
                    className={`py-2 rounded border capitalize font-medium transition-colors ${
                      settings.graphicsQuality === q
                        ? 'bg-orange-600 border-orange-500 text-white'
                        : 'bg-[#161B23] border-[#252E3C] text-[#9BA3B0] hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#7B8494]">
                High/Ultra enables hardware Bloom &amp; Vignette post-processing when a dedicated GPU is present.
              </p>
            </div>

            {(
              [
                ['weatherEnabled', 'Dynamic Weather Effects', 'Rain, storm fog, dust particles, and lightning flashes'],
                ['dayNightCycle', 'Dynamic Day / Night Cycle', 'Advance regional lighting naturally across mission phases'],
                ['audioEnabled', 'Procedural Spatial Audio', 'Web Audio servo steps, LiDAR pings, and alarm tones'],
                ['voiceDialogue', 'Voice-Over Story Briefings', 'Speak campaign dialogue via browser Speech Synthesis'],
                ['showLidar', '3D LiDAR Ray Visualization', 'Render live forward obstacle ray-cast fan'],
              ] as const
            ).map(([key, title, desc]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-4 p-3 rounded bg-[#161B23] border border-[#222A36] cursor-pointer"
              >
                <div>
                  <div className="font-medium text-white">{title}</div>
                  <div className="text-[11px] text-[#9BA3B0]">{desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => onUpdateSettings({ [key]: e.target.checked })}
                  className="w-4 h-4 accent-orange-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Save Slots & Economy Transaction Ledger */}
        <div className="space-y-5">
          <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2531] pb-3">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-sky-400" />
                <h2 className="font-display text-lg font-bold text-white">Save &amp; Career Slots</h2>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onNewGame();
                  notify('Started fresh career profile.');
                }}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
              >
                <RefreshCw size={12} /> Reset Career
              </button>
            </div>

            {statusNotice && (
              <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300">
                {statusNotice}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="Save slot label..."
                className="flex-1 px-3 py-2 text-xs bg-[#0B0D10] border border-[#262F3D] rounded text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  const id = `slot_${Date.now()}`;
                  await onSaveSlot(id, slotLabel || 'Manual Save');
                  notify('Saved current fleet and campaign progress.');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded"
              >
                <Save size={13} /> Save Game
              </button>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto">
              {saveSlots.length === 0 ? (
                <p className="text-xs text-[#7B8494]">No manual save snapshots created yet.</p>
              ) : (
                saveSlots.map((slot) => (
                  <div
                    key={slot.slot_id}
                    className="p-2.5 rounded bg-[#161B23] border border-[#222A36] flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-medium text-white">{slot.label}</div>
                      <div className="text-[11px] font-mono-tabular text-[#9BA3B0]">
                        Ch.{slot.current_chapter} · {slot.credits_rc} RC · {slot.owned_robot_count} Robots
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await onLoadSlot(slot.slot_id);
                        notify(`Loaded "${slot.label}".`);
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-[#1E2532] hover:bg-sky-600 text-white rounded transition-colors"
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Economy Ledger */}
          <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">
                RELAY Credits Transaction Ledger
              </h3>
              <span className="font-mono-tabular text-xs text-orange-400">
                Balance: {profile.credits_rc.toLocaleString()} RC
              </span>
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-xs text-[#7B8494]">No wallet transactions recorded yet.</p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2 rounded bg-[#161B23] border border-[#222A36] flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-[#D1D5DB] truncate">{tx.description}</span>
                    <span
                      className={`font-mono-tabular font-semibold shrink-0 ${
                        tx.amount_rc >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.amount_rc >= 0 ? `+${tx.amount_rc}` : tx.amount_rc} RC
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
