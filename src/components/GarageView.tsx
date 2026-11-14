import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Check, Lock, Shield, Wrench } from 'lucide-react';
import {
  EQUIPMENT_CATALOG,
  ROBOT_CATALOG,
  UPGRADE_COSTS,
  computeEffectiveRobotStats,
} from '../shared/gameCatalog';
import type {
  EquipmentModuleId,
  OwnedRobotState,
  PlayerProfile,
  RobotModelId,
  UpgradeCategory,
} from '../shared/types';
import { createRobotModel } from '../simulation/robotModels';

interface GarageViewProps {
  profile: PlayerProfile;
  ownedRobots: OwnedRobotState[];
  onPurchase: (robotId: RobotModelId) => Promise<void>;
  onUpgrade: (robotId: RobotModelId, category: UpgradeCategory) => Promise<void>;
  onEquip: (robotId: RobotModelId, moduleId: EquipmentModuleId, equip: boolean) => Promise<void>;
  onDeploySlot: (robotId: RobotModelId, slot: 1 | 2 | null) => Promise<void>;
  onCustomize: (robotId: RobotModelId, name: string, hullColor: string) => Promise<void>;
  onRepair: (robotId: RobotModelId) => Promise<void>;
}

const PAINT_SWATCHES = ['#ea580c', '#0284c7', '#eab308', '#10b981', '#dc2626', '#e2e8f0'];

export function GarageView({
  profile,
  ownedRobots,
  onPurchase,
  onUpgrade,
  onEquip,
  onDeploySlot,
  onCustomize,
  onRepair,
}: GarageViewProps) {
  const catalogList = Object.values(ROBOT_CATALOG);
  const [selectedId, setSelectedId] = useState<RobotModelId>('relay_01');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const previewMountRef = useRef<HTMLDivElement | null>(null);

  const selectedCatalog = ROBOT_CATALOG[selectedId];
  const owned = ownedRobots.find((r) => r.robot_id === selectedId);
  const effectiveStats = computeEffectiveRobotStats(selectedId, owned, 'clear');

  useEffect(() => {
    setNameDraft(owned?.custom_name ?? selectedCatalog.codeName);
  }, [selectedId, owned?.custom_name, selectedCatalog.codeName]);

  // Live 3D Turntable Preview of selected Robot Model
  useEffect(() => {
    const mount = previewMountRef.current;
    if (!mount) return;

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1017);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x94a3b8, 0x1e293b, 0.9);
    const key = new THREE.DirectionalLight(0xfff1e0, 1.8);
    key.position.set(4, 6, 4);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rim.position.set(-4, 3, -3);
    scene.add(hemi, key, rim);

    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x18202c, metalness: 0.7, roughness: 0.3 })
    );
    turntable.position.y = -0.04;
    scene.add(turntable);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.06, 1.12, 32),
      new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    const handle = createRobotModel(selectedId, owned?.hull_color ?? selectedCatalog.primaryColor);
    scene.add(handle.root);

    const cam = new THREE.PerspectiveCamera(42, width / height, 0.1, 30);
    cam.position.set(1.65, 1.25, 2.05);
    cam.lookAt(0, 0.35, 0);

    let disposed = false;
    let raf = 0;
    let prev = performance.now();

    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      handle.root.rotation.y += dt * 0.55;
      handle.updateAnimation(dt, 0.4, 0, 'idle', 100, [], false, now);
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      env.dispose();
      renderer.dispose();
    };
  }, [selectedId, owned?.hull_color, selectedCatalog.primaryColor]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setErrorMsg(null);
    setBusyAction(label);
    try {
      await fn();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const chapterLocked = profile.current_chapter < selectedCatalog.unlockChapter;
  const canAfford = profile.credits_rc >= selectedCatalog.priceRc;

  return (
    <div className="flex-1 min-h-0 bg-[#0B0D10] overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-6">
        {/* Left Roster: All 10 Robots */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-display text-lg font-bold text-white">Fleet Hangar (10 Units)</h2>
            <span className="font-mono-tabular text-xs text-orange-400">
              {profile.credits_rc.toLocaleString()} RC
            </span>
          </div>

          <div className="space-y-1.5 max-h-[calc(100vh-170px)] overflow-y-auto pr-1">
            {catalogList.map((entry) => {
              const unitOwned = ownedRobots.find((r) => r.robot_id === entry.id);
              const locked = profile.current_chapter < entry.unlockChapter;
              const isSelected = selectedId === entry.id;

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(entry.id);
                    setErrorMsg(null);
                  }}
                  className={`w-full text-left p-3 rounded-md border transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#19202B] border-orange-500'
                      : 'bg-[#11151C] border-[#212834] hover:border-[#344054]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: unitOwned?.hull_color ?? entry.primaryColor }}
                      />
                      <span className="font-display text-sm font-semibold text-white truncate">
                        {unitOwned?.custom_name ?? entry.codeName}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9BA3B0] mt-0.5 truncate">{entry.role}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono-tabular text-xs">
                    {unitOwned ? (
                      <span className="text-emerald-400 font-medium">
                        {unitOwned.deployment_slot ? `Slot ${unitOwned.deployment_slot}` : 'Owned'}
                      </span>
                    ) : locked ? (
                      <span className="text-[#7B8494] inline-flex items-center gap-1">
                        <Lock size={11} /> Ch.{entry.unlockChapter}
                      </span>
                    ) : (
                      <span className="text-orange-400">{entry.priceRc} RC</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center/Right: 3D Turntable + Specs + Upgrades + Equipment */}
        <div className="lg:col-span-8 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          <div className="grid md:grid-cols-12 gap-5 rounded-lg bg-[#11151C] border border-[#222A36] p-5">
            <div className="md:col-span-6 h-[270px] rounded-md overflow-hidden border border-[#1E2532] bg-[#0C1017]">
              <div ref={previewMountRef} className="w-full h-full" />
            </div>

            <div className="md:col-span-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-orange-400 uppercase tracking-wider">
                    {selectedCatalog.locomotion.replace('_', ' ')} Chassis
                  </span>
                  {owned && (
                    <span className="text-xs font-mono-tabular text-[#9BA3B0]">
                      Hull {owned.integrity_pct.toFixed(0)}%
                    </span>
                  )}
                </div>
                <h3 className="font-display text-2xl font-bold text-white mt-0.5">
                  {owned ? owned.custom_name : selectedCatalog.codeName}
                </h3>
                <p className="text-xs text-[#9BA3B0] mt-1.5 leading-relaxed">
                  {selectedCatalog.description}
                </p>
                <p className="text-xs text-sky-300 mt-2">{selectedCatalog.specialAbility}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                <div className="p-2 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[10px] text-[#9BA3B0]">Top Speed</div>
                  <div className="text-white font-semibold">{effectiveStats.speedMps} m/s</div>
                </div>
                <div className="p-2 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[10px] text-[#9BA3B0]">LiDAR</div>
                  <div className="text-white font-semibold">{effectiveStats.lidarRangeM} m</div>
                </div>
                <div className="p-2 rounded bg-[#161B23] border border-[#222A36]">
                  <div className="text-[10px] text-[#9BA3B0]">Optics</div>
                  <div className="text-white font-semibold">{effectiveStats.cameraRangeM} m</div>
                </div>
              </div>

              {/* Capability Matrix */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {(
                  [
                    ['waterproof', 'Waterproof'],
                    ['aerial', 'Aerial VTOL'],
                    ['hazmatShield', 'Hazmat Shield'],
                    ['heavyLift', 'Heavy Breacher'],
                    ['medicalCargo', 'Med Bay'],
                    ['commRelay', 'Comm Relay'],
                  ] as const
                )
                  .filter(([k]) => effectiveStats.capabilities[k])
                  .map(([, label]) => (
                    <span
                      key={label}
                      className="px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/60 text-emerald-300"
                    >
                      {label}
                    </span>
                  ))}
              </div>

              {!owned ? (
                <button
                  type="button"
                  disabled={chapterLocked || !canAfford || busyAction !== null}
                  onClick={() => runAction('purchase', () => onPurchase(selectedId))}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-45 rounded transition-colors"
                >
                  {chapterLocked
                    ? `Unlocks in Chapter ${selectedCatalog.unlockChapter}`
                    : !canAfford
                      ? `Need ${selectedCatalog.priceRc} RC (Insufficient Credits)`
                      : `Acquire ${selectedCatalog.codeName} — ${selectedCatalog.priceRc} RC`}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runAction('slot1', () => onDeploySlot(selectedId, 1))}
                    className={`flex-1 py-2 px-3 text-xs font-medium rounded border transition-colors ${
                      owned.deployment_slot === 1
                        ? 'bg-orange-600 border-orange-400 text-white'
                        : 'bg-[#161B23] border-[#293242] text-[#D1D5DB] hover:border-orange-500/60'
                    }`}
                  >
                    {owned.deployment_slot === 1 ? 'Active in Slot 1' : 'Assign Slot 1'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAction('slot2', () =>
                        onDeploySlot(selectedId, owned.deployment_slot === 2 ? null : 2)
                      )
                    }
                    className={`flex-1 py-2 px-3 text-xs font-medium rounded border transition-colors ${
                      owned.deployment_slot === 2
                        ? 'bg-emerald-700 border-emerald-500 text-white'
                        : 'bg-[#161B23] border-[#293242] text-[#D1D5DB] hover:border-emerald-500/60'
                    }`}
                  >
                    {owned.deployment_slot === 2 ? 'Active in Slot 2' : 'Assign Slot 2'}
                  </button>
                  {owned.integrity_pct < 100 && (
                    <button
                      type="button"
                      onClick={() => runAction('repair', () => onRepair(selectedId))}
                      className="py-2 px-3 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Repair ({Math.ceil((100 - owned.integrity_pct) * 2.5)} RC)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {owned && (
            <div className="grid md:grid-cols-2 gap-5">
              {/* Subsystem Upgrades */}
              <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-display font-semibold text-white">
                  <Wrench size={15} className="text-orange-400" />
                  Subsystem Upgrades
                </div>
                <div className="space-y-2">
                  {(Object.keys(UPGRADE_COSTS) as UpgradeCategory[]).map((cat) => {
                    const spec = UPGRADE_COSTS[cat];
                    const lvl = owned.upgrades[cat] ?? 0;
                    const cost = Math.round(spec.basePrice * (1 + lvl * 0.65));
                    const maxed = lvl >= 3;
                    return (
                      <div
                        key={cat}
                        className="p-2.5 rounded bg-[#161B23] border border-[#222A36] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-white">
                            {spec.label}{' '}
                            <span className="font-mono-tabular text-orange-400">Lv.{lvl}/3</span>
                          </div>
                          <div className="text-[11px] text-[#9BA3B0]">{spec.desc}</div>
                        </div>
                        <button
                          type="button"
                          disabled={maxed || profile.credits_rc < cost || busyAction !== null}
                          onClick={() => runAction(`up_${cat}`, () => onUpgrade(selectedId, cat))}
                          className="shrink-0 px-3 py-1.5 rounded bg-[#212936] hover:bg-orange-600 disabled:opacity-40 text-white font-mono-tabular transition-colors"
                        >
                          {maxed ? 'Max' : `${cost} RC`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Equipment Modules + Paint Customization */}
              <div className="space-y-4">
                <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-display font-semibold text-white">
                      <Shield size={15} className="text-sky-400" />
                      Equipment Modules
                    </div>
                    <span className="text-xs font-mono-tabular text-[#9BA3B0]">
                      {owned.equipped_modules.length} / 3 Equipped
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.values(EQUIPMENT_CATALOG).map((mod) => {
                      const equipped = owned.equipped_modules.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          className="p-2.5 rounded bg-[#161B23] border border-[#222A36] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-white">{mod.name}</div>
                            <div className="text-[11px] text-[#9BA3B0]">{mod.effectSummary}</div>
                          </div>
                          <button
                            type="button"
                            disabled={
                              busyAction !== null ||
                              (!equipped &&
                                (owned.equipped_modules.length >= 3 || profile.credits_rc < mod.priceRc))
                            }
                            onClick={() =>
                              runAction(`eq_${mod.id}`, () => onEquip(selectedId, mod.id, !equipped))
                            }
                            className={`shrink-0 px-3 py-1.5 rounded font-mono-tabular transition-colors ${
                              equipped
                                ? 'bg-emerald-700 hover:bg-rose-700 text-white'
                                : 'bg-[#212936] hover:bg-sky-600 disabled:opacity-40 text-white'
                            }`}
                          >
                            {equipped ? (
                              <span className="inline-flex items-center gap-1">
                                <Check size={12} /> Fitted
                              </span>
                            ) : (
                              `${mod.priceRc} RC`
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Callsign & Hull Paint */}
                <div className="rounded-lg bg-[#11151C] border border-[#222A36] p-4 space-y-3">
                  <div className="text-xs font-semibold text-white">Unit Callsign &amp; Livery</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={24}
                      className="flex-1 px-3 py-1.5 text-xs bg-[#0B0D10] border border-[#283140] rounded text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        runAction('rename', () => onCustomize(selectedId, nameDraft, owned.hull_color))
                      }
                      className="px-3 py-1.5 text-xs font-medium bg-[#1F2734] hover:bg-[#2A3445] text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {PAINT_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() =>
                          runAction('color', () => onCustomize(selectedId, owned.custom_name, hex))
                        }
                        style={{ backgroundColor: hex }}
                        className={`w-6 h-6 rounded border-2 ${
                          owned.hull_color.toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        aria-label={`Paint ${hex}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
