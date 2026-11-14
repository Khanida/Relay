import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  EQUIPMENT_CATALOG,
  ROBOT_CATALOG,
  STORE_CATALOG,
  UPGRADE_COSTS,
  computeRobotChargeStatus,
} from '../src/shared/gameCatalog';
import type {
  AgentEvent,
  EconomyTransaction,
  EquipmentModuleId,
  MissionRecord,
  OwnedRobotState,
  PlayerProfile,
  PlayerSettings,
  RegionId,
  RobotModelId,
  SaveSlotSummary,
  StoreItemDef,
  StoreSku,
  UpgradeCategory,
} from '../src/shared/types';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'relay.db');
const db = new DatabaseSync(dbPath);

const DEFAULT_SETTINGS: PlayerSettings = {
  graphicsQuality: 'high',
  weatherEnabled: true,
  dayNightCycle: true,
  audioEnabled: true,
  voiceDialogue: false,
  showLidar: true,
};

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS missions (
      mission_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instruction TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      survivor_found INTEGER NOT NULL DEFAULT 0,
      returned_safely INTEGER NOT NULL DEFAULT 0,
      total_score INTEGER NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'D',
      elapsed_sec REAL NOT NULL DEFAULT 0,
      battery_remaining REAL NOT NULL DEFAULT 100,
      replan_count INTEGER NOT NULL DEFAULT 0,
      safety_rejections INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      elapsed_sec REAL NOT NULL,
      actor TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT
    );
  `);

  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as { v?: number };
  const currentVersion = Number(row?.v ?? 0);

  if (currentVersion < 2) {
    // Safe migration for RELAY 2.0 Open World progression, garage, economy, and save slots
    const existingCols = db.prepare(`PRAGMA table_info(missions)`).all() as Array<{ name: string }>;
    const colNames = new Set(existingCols.map((c) => c.name));
    if (!colNames.has('region_id')) {
      db.exec(`ALTER TABLE missions ADD COLUMN region_id TEXT DEFAULT 'industrial_district'`);
    }
    if (!colNames.has('chapter_id')) {
      db.exec(`ALTER TABLE missions ADD COLUMN chapter_id INTEGER DEFAULT 1`);
    }
    if (!colNames.has('credits_earned')) {
      db.exec(`ALTER TABLE missions ADD COLUMN credits_earned INTEGER DEFAULT 0`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS player_profile (
        profile_id TEXT PRIMARY KEY,
        commander_name TEXT NOT NULL,
        credits_rc INTEGER NOT NULL DEFAULT 300,
        current_chapter INTEGER NOT NULL DEFAULT 1,
        completed_missions_json TEXT NOT NULL DEFAULT '[]',
        unlocked_regions_json TEXT NOT NULL DEFAULT '["industrial_district"]',
        active_region TEXT NOT NULL DEFAULT 'industrial_district',
        ashfall_ending TEXT,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS owned_robots (
        robot_id TEXT PRIMARY KEY,
        custom_name TEXT NOT NULL,
        hull_color TEXT NOT NULL,
        integrity_pct REAL NOT NULL DEFAULT 100,
        upgrades_json TEXT NOT NULL,
        equipped_modules_json TEXT NOT NULL,
        deployment_slot INTEGER,
        purchased_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount_rc INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS save_slots (
        slot_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
    `);

    db.prepare(`INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)`).run(
      2,
      new Date().toISOString()
    );
  }

  // Safe v3 migration: persistent battery percentage & timestamp for 24h recharge timers
  const robotCols = db.prepare(`PRAGMA table_info(owned_robots)`).all() as Array<{ name: string }>;
  const robotColNames = new Set(robotCols.map((c) => c.name));
  if (!robotColNames.has('battery_pct')) {
    db.exec(`ALTER TABLE owned_robots ADD COLUMN battery_pct REAL NOT NULL DEFAULT 100`);
  }
  if (!robotColNames.has('battery_updated_at')) {
    db.exec(`ALTER TABLE owned_robots ADD COLUMN battery_updated_at TEXT NOT NULL DEFAULT ''`);
    db.prepare(`UPDATE owned_robots SET battery_updated_at = ? WHERE battery_updated_at = ''`).run(
      new Date().toISOString()
    );
  }

  ensureDefaultProfile();
}

function ensureDefaultProfile() {
  const existing = db
    .prepare(`SELECT profile_id FROM player_profile WHERE profile_id = 'default'`)
    .get();
  const now = new Date().toISOString();

  if (!existing) {
    db.prepare(
      `INSERT INTO player_profile (
        profile_id, commander_name, credits_rc, current_chapter,
        completed_missions_json, unlocked_regions_json, active_region,
        ashfall_ending, settings_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'default',
      'Commander Vance',
      300,
      1,
      '[]',
      JSON.stringify(['industrial_district']),
      'industrial_district',
      null,
      JSON.stringify(DEFAULT_SETTINGS),
      now
    );
  }

  const starter = db
    .prepare(`SELECT robot_id FROM owned_robots WHERE robot_id = 'relay_01'`)
    .get();
  if (!starter) {
    db.prepare(
      `INSERT INTO owned_robots (
        robot_id, custom_name, hull_color, integrity_pct, battery_pct, battery_updated_at,
        upgrades_json, equipped_modules_json, deployment_slot, purchased_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'relay_01',
      'RELAY-01',
      ROBOT_CATALOG.relay_01.primaryColor,
      100,
      100,
      now,
      JSON.stringify({ battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 }),
      JSON.stringify([]),
      1,
      now
    );
  }
}

runMigrations();

export function getPlayerProfile(): PlayerProfile {
  ensureDefaultProfile();
  const row = db
    .prepare(`SELECT * FROM player_profile WHERE profile_id = 'default'`)
    .get() as Record<string, unknown>;

  return {
    profile_id: String(row.profile_id),
    commander_name: String(row.commander_name),
    credits_rc: Number(row.credits_rc),
    current_chapter: Number(row.current_chapter),
    completed_mission_ids: JSON.parse(String(row.completed_missions_json || '[]')) as string[],
    unlocked_regions: JSON.parse(
      String(row.unlocked_regions_json || '["industrial_district"]')
    ) as RegionId[],
    active_region: String(row.active_region || 'industrial_district') as RegionId,
    ashfall_ending: (row.ashfall_ending as PlayerProfile['ashfall_ending']) ?? null,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(String(row.settings_json || '{}')) as Partial<PlayerSettings>),
    },
    updated_at: String(row.updated_at),
  };
}

export function updatePlayerProfile(patch: Partial<PlayerProfile>): PlayerProfile {
  const current = getPlayerProfile();
  const merged: PlayerProfile = {
    ...current,
    ...patch,
    settings: {
      ...current.settings,
      ...(patch.settings ?? {}),
    },
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE player_profile SET
      commander_name = ?,
      credits_rc = ?,
      current_chapter = ?,
      completed_missions_json = ?,
      unlocked_regions_json = ?,
      active_region = ?,
      ashfall_ending = ?,
      settings_json = ?,
      updated_at = ?
     WHERE profile_id = 'default'`
  ).run(
    merged.commander_name,
    merged.credits_rc,
    merged.current_chapter,
    JSON.stringify(merged.completed_mission_ids),
    JSON.stringify(merged.unlocked_regions),
    merged.active_region,
    merged.ashfall_ending ?? null,
    JSON.stringify(merged.settings),
    merged.updated_at
  );

  return merged;
}

export function listOwnedRobots(nowMs = Date.now()): OwnedRobotState[] {
  ensureDefaultProfile();
  const nowIso = new Date(nowMs).toISOString();
  const rows = db.prepare(`SELECT * FROM owned_robots ORDER BY purchased_at ASC`).all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => {
    const storedPct = Math.max(0, Math.min(100, Number(r.battery_pct ?? 100)));
    const storedUpdatedAt = String(r.battery_updated_at || nowIso);
    const robot: OwnedRobotState = {
      robot_id: String(r.robot_id) as RobotModelId,
      custom_name: String(r.custom_name),
      hull_color: String(r.hull_color),
      integrity_pct: Number(r.integrity_pct),
      battery_pct: storedPct,
      battery_updated_at: storedUpdatedAt,
      upgrades: JSON.parse(String(r.upgrades_json)),
      equipped_modules: JSON.parse(String(r.equipped_modules_json)) as EquipmentModuleId[],
      deployment_slot:
        r.deployment_slot === 1 || r.deployment_slot === 2 ? (Number(r.deployment_slot) as 1 | 2) : null,
      purchased_at: String(r.purchased_at),
    };

    if (storedPct < 100) {
      const status = computeRobotChargeStatus(robot, nowMs);
      if (status.batteryPct - storedPct >= 0.05 || (status.batteryPct >= 100 && storedPct < 100)) {
        robot.battery_pct = status.batteryPct;
        robot.battery_updated_at = nowIso;
        db.prepare(`UPDATE owned_robots SET battery_pct = ?, battery_updated_at = ? WHERE robot_id = ?`).run(
          status.batteryPct,
          nowIso,
          robot.robot_id
        );
      }
    }
    return robot;
  });
}

export function listTransactions(limit = 30): EconomyTransaction[] {
  const rows = db
    .prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    amount_rc: Number(r.amount_rc),
    balance_after: Number(r.balance_after),
    category: String(r.category) as EconomyTransaction['category'],
    description: String(r.description),
    created_at: String(r.created_at),
  }));
}

export function recordTransaction(
  amountRc: number,
  category: EconomyTransaction['category'],
  description: string
): PlayerProfile {
  const profile = getPlayerProfile();
  const nextBalance = Math.max(0, profile.credits_rc + amountRc);
  const updated = updatePlayerProfile({ credits_rc: nextBalance });

  db.prepare(
    `INSERT INTO transactions (id, amount_rc, balance_after, category, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    amountRc,
    nextBalance,
    category,
    description,
    new Date().toISOString()
  );

  return updated;
}

export function purchaseRobot(robotId: RobotModelId): {
  profile: PlayerProfile;
  robots: OwnedRobotState[];
} {
  const catalog = ROBOT_CATALOG[robotId];
  if (!catalog) {
    throw new Error(`Unknown robot model: ${robotId}`);
  }
  const owned = listOwnedRobots();
  if (owned.some((r) => r.robot_id === robotId)) {
    throw new Error(`${catalog.codeName} is already owned in your garage.`);
  }

  const profile = getPlayerProfile();
  if (profile.current_chapter < catalog.unlockChapter) {
    throw new Error(
      `${catalog.codeName} unlocks in Chapter ${catalog.unlockChapter} (currently Chapter ${profile.current_chapter}).`
    );
  }
  if (profile.credits_rc < catalog.priceRc) {
    throw new Error(
      `Insufficient RELAY Credits: requires ${catalog.priceRc} RC (balance: ${profile.credits_rc} RC).`
    );
  }

  const slot2Taken = owned.some((r) => r.deployment_slot === 2);
  const autoSlot = slot2Taken ? null : 2;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO owned_robots (
      robot_id, custom_name, hull_color, integrity_pct, battery_pct, battery_updated_at,
      upgrades_json, equipped_modules_json, deployment_slot, purchased_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    robotId,
    catalog.codeName,
    catalog.primaryColor,
    100,
    100,
    now,
    JSON.stringify({ battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 }),
    JSON.stringify([]),
    autoSlot,
    now
  );

  const nextProfile = recordTransaction(
    -catalog.priceRc,
    'robot_purchase',
    `Purchased ${catalog.codeName} (${catalog.role})`
  );

  return { profile: nextProfile, robots: listOwnedRobots() };
}

export function upgradeOwnedRobot(
  robotId: RobotModelId,
  category: UpgradeCategory
): { profile: PlayerProfile; robots: OwnedRobotState[] } {
  const owned = listOwnedRobots().find((r) => r.robot_id === robotId);
  if (!owned) throw new Error(`Robot ${robotId} is not owned.`);
  const upgradeSpec = UPGRADE_COSTS[category];
  if (!upgradeSpec) throw new Error(`Invalid upgrade category: ${category}`);

  const currentLevel = Number(owned.upgrades[category] ?? 0);
  if (currentLevel >= 3) {
    throw new Error(`${upgradeSpec.label} is already at maximum Level 3.`);
  }

  const cost = Math.round(upgradeSpec.basePrice * (1 + currentLevel * 0.65));
  const profile = getPlayerProfile();
  if (profile.credits_rc < cost) {
    throw new Error(`Insufficient RC: ${upgradeSpec.label} Lv.${currentLevel + 1} costs ${cost} RC.`);
  }

  const nextUpgrades = { ...owned.upgrades, [category]: currentLevel + 1 };
  db.prepare(`UPDATE owned_robots SET upgrades_json = ? WHERE robot_id = ?`).run(
    JSON.stringify(nextUpgrades),
    robotId
  );

  const nextProfile = recordTransaction(
    -cost,
    'upgrade',
    `Upgraded ${owned.custom_name} ${upgradeSpec.label} to Lv.${currentLevel + 1}`
  );

  return { profile: nextProfile, robots: listOwnedRobots() };
}

export function equipModuleOnRobot(
  robotId: RobotModelId,
  moduleId: EquipmentModuleId,
  equip: boolean
): { profile: PlayerProfile; robots: OwnedRobotState[] } {
  const owned = listOwnedRobots().find((r) => r.robot_id === robotId);
  if (!owned) throw new Error(`Robot ${robotId} is not owned.`);
  const mod = EQUIPMENT_CATALOG[moduleId];
  if (!mod) throw new Error(`Unknown equipment module: ${moduleId}`);

  const profile = getPlayerProfile();
  let modules = [...owned.equipped_modules];

  if (equip) {
    if (modules.includes(moduleId)) {
      throw new Error(`${mod.name} is already equipped on ${owned.custom_name}.`);
    }
    if (modules.length >= 3) {
      throw new Error('Maximum 3 equipment modules per robot. Unequip one first.');
    }
    if (profile.credits_rc < mod.priceRc) {
      throw new Error(`Insufficient RC: ${mod.name} costs ${mod.priceRc} RC.`);
    }
    modules.push(moduleId);
    db.prepare(`UPDATE owned_robots SET equipped_modules_json = ? WHERE robot_id = ?`).run(
      JSON.stringify(modules),
      robotId
    );
    const nextProfile = recordTransaction(
      -mod.priceRc,
      'equipment',
      `Installed ${mod.name} on ${owned.custom_name}`
    );
    return { profile: nextProfile, robots: listOwnedRobots() };
  } else {
    modules = modules.filter((m) => m !== moduleId);
    db.prepare(`UPDATE owned_robots SET equipped_modules_json = ? WHERE robot_id = ?`).run(
      JSON.stringify(modules),
      robotId
    );
    return { profile, robots: listOwnedRobots() };
  }
}

export function setRobotDeploymentSlot(
  robotId: RobotModelId,
  slot: 1 | 2 | null
): OwnedRobotState[] {
  const owned = listOwnedRobots();
  if (!owned.some((r) => r.robot_id === robotId)) {
    throw new Error(`Robot ${robotId} is not owned.`);
  }
  if (slot !== null) {
    db.prepare(`UPDATE owned_robots SET deployment_slot = NULL WHERE deployment_slot = ?`).run(slot);
  }
  db.prepare(`UPDATE owned_robots SET deployment_slot = ? WHERE robot_id = ?`).run(slot, robotId);

  // Ensure slot 1 always remains occupied by at least one unit
  const refreshed = listOwnedRobots();
  if (!refreshed.some((r) => r.deployment_slot === 1)) {
    const fallback = refreshed[0];
    if (fallback) {
      db.prepare(`UPDATE owned_robots SET deployment_slot = 1 WHERE robot_id = ?`).run(
        fallback.robot_id
      );
    }
  }
  return listOwnedRobots();
}

export function customizeOwnedRobot(
  robotId: RobotModelId,
  customName: string,
  hullColor: string
): OwnedRobotState[] {
  db.prepare(`UPDATE owned_robots SET custom_name = ?, hull_color = ? WHERE robot_id = ?`).run(
    customName.trim().slice(0, 24) || robotId,
    hullColor,
    robotId
  );
  return listOwnedRobots();
}

export function repairOwnedRobot(robotId: RobotModelId): {
  profile: PlayerProfile;
  robots: OwnedRobotState[];
} {
  const owned = listOwnedRobots().find((r) => r.robot_id === robotId);
  if (!owned) throw new Error(`Robot ${robotId} is not owned.`);
  const damage = Math.max(0, 100 - owned.integrity_pct);
  const cost = Math.ceil(damage * 2.5);
  const profile = getPlayerProfile();
  if (cost > 0 && profile.credits_rc < cost) {
    throw new Error(`Insufficient RC for repair (${cost} RC required).`);
  }
  db.prepare(`UPDATE owned_robots SET integrity_pct = 100 WHERE robot_id = ?`).run(robotId);
  const nextProfile =
    cost > 0
      ? recordTransaction(-cost, 'repair', `Repaired ${owned.custom_name} chassis to 100%`)
      : profile;
  return { profile: nextProfile, robots: listOwnedRobots() };
}

export function updateRobotBattery(
  robotId: RobotModelId,
  batteryPct: number,
  updatedAtIso = new Date().toISOString()
): OwnedRobotState[] {
  const clamped = Number(Math.max(0, Math.min(100, batteryPct)).toFixed(2));
  db.prepare(`UPDATE owned_robots SET battery_pct = ?, battery_updated_at = ? WHERE robot_id = ?`).run(
    clamped,
    updatedAtIso,
    robotId
  );
  return listOwnedRobots();
}

export function rechargeRobotBatteryFull(robotId?: RobotModelId): OwnedRobotState[] {
  const now = new Date().toISOString();
  if (robotId) {
    db.prepare(`UPDATE owned_robots SET battery_pct = 100, battery_updated_at = ? WHERE robot_id = ?`).run(
      now,
      robotId
    );
  } else {
    db.prepare(`UPDATE owned_robots SET battery_pct = 100, battery_updated_at = ?`).run(now);
  }
  return listOwnedRobots();
}

export function processStorePurchase(
  sku: StoreSku,
  targetRobotId?: RobotModelId,
  paymentRef = 'sandbox'
): {
  profile: PlayerProfile;
  robots: OwnedRobotState[];
  transactions: EconomyTransaction[];
  grantedItem: StoreItemDef;
} {
  const item = STORE_CATALOG.find((s) => s.sku === sku);
  if (!item) {
    throw new Error(`Unknown store SKU: ${sku}`);
  }

  let profile = getPlayerProfile();
  let robots = listOwnedRobots();

  if (item.kind === 'currency' && item.creditsRc) {
    profile = recordTransaction(
      item.creditsRc,
      'store_purchase',
      `Store Purchase: ${item.title} ($${item.priceUsd} · ${paymentRef})`
    );
  } else if (item.kind === 'battery') {
    if (item.fullChargeScope === 'fleet') {
      robots = rechargeRobotBatteryFull();
      profile = recordTransaction(
        0,
        'recharge',
        `Store Purchase: ${item.title} — All units 100% ($${item.priceUsd} · ${paymentRef})`
      );
    } else {
      const slot1 = robots.find((r) => r.deployment_slot === 1) ?? robots[0];
      const targetId = targetRobotId ?? slot1?.robot_id ?? 'relay_01';
      robots = rechargeRobotBatteryFull(targetId);
      const targetName = robots.find((r) => r.robot_id === targetId)?.custom_name ?? targetId;
      profile = recordTransaction(
        0,
        'recharge',
        `Store Purchase: Full 100% Recharge for ${targetName} ($${item.priceUsd} · ${paymentRef})`
      );
    }
  }

  return {
    profile,
    robots,
    transactions: listTransactions(30),
    grantedItem: item,
  };
}

export function resetNewGame(): { profile: PlayerProfile; robots: OwnedRobotState[] } {
  db.exec(`
    DELETE FROM player_profile;
    DELETE FROM owned_robots;
    DELETE FROM transactions;
  `);
  ensureDefaultProfile();
  return { profile: getPlayerProfile(), robots: listOwnedRobots() };
}

export function createSaveSlot(slotId: string, label: string): SaveSlotSummary {
  const profile = getPlayerProfile();
  const robots = listOwnedRobots();
  const transactions = listTransactions(50);
  const now = new Date().toISOString();
  const snapshot = { profile, robots, transactions };

  db.prepare(
    `INSERT INTO save_slots (slot_id, label, snapshot_json, saved_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(slot_id) DO UPDATE SET
       label = excluded.label,
       snapshot_json = excluded.snapshot_json,
       saved_at = excluded.saved_at`
  ).run(slotId, label, JSON.stringify(snapshot), now);

  return {
    slot_id: slotId,
    label,
    commander_name: profile.commander_name,
    credits_rc: profile.credits_rc,
    current_chapter: profile.current_chapter,
    owned_robot_count: robots.length,
    saved_at: now,
  };
}

export function listSaveSlots(): SaveSlotSummary[] {
  const rows = db
    .prepare(`SELECT slot_id, label, snapshot_json, saved_at FROM save_slots ORDER BY saved_at DESC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const snap = JSON.parse(String(r.snapshot_json)) as {
      profile: PlayerProfile;
      robots: OwnedRobotState[];
    };
    return {
      slot_id: String(r.slot_id),
      label: String(r.label),
      commander_name: snap.profile.commander_name,
      credits_rc: snap.profile.credits_rc,
      current_chapter: snap.profile.current_chapter,
      owned_robot_count: snap.robots.length,
      saved_at: String(r.saved_at),
    };
  });
}

export function loadSaveSlot(slotId: string): {
  profile: PlayerProfile;
  robots: OwnedRobotState[];
} {
  const row = db
    .prepare(`SELECT snapshot_json FROM save_slots WHERE slot_id = ?`)
    .get(slotId) as { snapshot_json?: string } | undefined;
  if (!row?.snapshot_json) throw new Error(`Save slot "${slotId}" not found.`);

  const snap = JSON.parse(row.snapshot_json) as {
    profile: PlayerProfile;
    robots: OwnedRobotState[];
  };

  updatePlayerProfile(snap.profile);
  db.prepare(`DELETE FROM owned_robots`).run();
  const ins = db.prepare(
    `INSERT INTO owned_robots (
      robot_id, custom_name, hull_color, integrity_pct, battery_pct, battery_updated_at,
      upgrades_json, equipped_modules_json, deployment_slot, purchased_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  for (const r of snap.robots) {
    ins.run(
      r.robot_id,
      r.custom_name,
      r.hull_color,
      r.integrity_pct,
      r.battery_pct ?? 100,
      r.battery_updated_at ?? now,
      JSON.stringify(r.upgrades),
      JSON.stringify(r.equipped_modules),
      r.deployment_slot,
      r.purchased_at
    );
  }
  return { profile: getPlayerProfile(), robots: listOwnedRobots() };
}

export function deleteSaveSlot(slotId: string): void {
  db.prepare(`DELETE FROM save_slots WHERE slot_id = ?`).run(slotId);
}

export function upsertMissionRecord(record: MissionRecord): void {
  const stmt = db.prepare(`
    INSERT INTO missions (
      mission_id, title, instruction, region_id, chapter_id, status, provider,
      survivor_found, returned_safely, total_score, grade, credits_earned,
      elapsed_sec, battery_remaining, replan_count, safety_rejections, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mission_id) DO UPDATE SET
      status = excluded.status,
      survivor_found = excluded.survivor_found,
      returned_safely = excluded.returned_safely,
      total_score = excluded.total_score,
      grade = excluded.grade,
      credits_earned = excluded.credits_earned,
      elapsed_sec = excluded.elapsed_sec,
      battery_remaining = excluded.battery_remaining,
      replan_count = excluded.replan_count,
      safety_rejections = excluded.safety_rejections
  `);

  stmt.run(
    record.mission_id,
    record.title,
    record.instruction,
    record.region_id ?? 'industrial_district',
    record.chapter_id ?? 1,
    record.status,
    record.provider,
    record.survivor_found ? 1 : 0,
    record.returned_safely ? 1 : 0,
    record.total_score,
    record.grade,
    record.credits_earned ?? 0,
    record.elapsed_sec,
    record.battery_remaining,
    record.replan_count,
    record.safety_rejections,
    record.created_at
  );
}

export function listMissionRecords(limit = 25): MissionRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM missions
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    mission_id: String(row.mission_id),
    title: String(row.title),
    instruction: String(row.instruction),
    region_id: String(row.region_id || 'industrial_district') as RegionId,
    chapter_id: Number(row.chapter_id ?? 1),
    status: String(row.status),
    provider: String(row.provider),
    survivor_found: Boolean(row.survivor_found),
    returned_safely: Boolean(row.returned_safely),
    total_score: Number(row.total_score),
    grade: String(row.grade),
    credits_earned: Number(row.credits_earned ?? 0),
    elapsed_sec: Number(row.elapsed_sec),
    battery_remaining: Number(row.battery_remaining),
    replan_count: Number(row.replan_count),
    safety_rejections: Number(row.safety_rejections),
    created_at: String(row.created_at),
  }));
}

export function insertAgentEvent(ev: AgentEvent): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO agent_events (
      id, mission_id, timestamp, elapsed_sec, actor, category, message, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    ev.id,
    ev.mission_id,
    ev.timestamp,
    ev.elapsedSec,
    ev.actor,
    ev.category,
    ev.message,
    ev.details ? JSON.stringify(ev.details) : null
  );
}

export function getMissionEvents(missionId: string): AgentEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM agent_events
    WHERE mission_id = ?
    ORDER BY elapsed_sec ASC
  `);
  const rows = stmt.all(missionId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    mission_id: String(row.mission_id),
    timestamp: String(row.timestamp),
    elapsedSec: Number(row.elapsed_sec),
    actor: row.actor as AgentActor,
    category: row.category as AgentEventCategory,
    message: String(row.message),
    details: row.details_json ? JSON.parse(String(row.details_json)) : undefined,
  }));
}

type AgentActor = AgentEvent['actor'];
type AgentEventCategory = AgentEvent['category'];
