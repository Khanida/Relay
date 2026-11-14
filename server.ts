import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { interpretMissionInstruction, isGeminiConfigured } from './server/commanderAgent';
import {
  createSaveSlot,
  customizeOwnedRobot,
  equipModuleOnRobot,
  getMissionEvents,
  getPlayerProfile,
  insertAgentEvent,
  listMissionRecords,
  listOwnedRobots,
  listSaveSlots,
  listTransactions,
  loadSaveSlot,
  processStorePurchase,
  purchaseRobot,
  recordTransaction,
  repairOwnedRobot,
  resetNewGame,
  setRobotDeploymentSlot,
  updatePlayerProfile,
  updateRobotBattery,
  upgradeOwnedRobot,
  upsertMissionRecord,
} from './server/db';
import { CAMPAIGN_MISSIONS, MERIDIAN_REGIONS, STORE_CATALOG } from './src/shared/gameCatalog';
import type {
  AgentEvent,
  EquipmentModuleId,
  MissionRecord,
  PlayerSettings,
  RegionId,
  RobotModelId,
  StoreSku,
  UpgradeCategory,
} from './src/shared/types';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'relay-mission-backend',
      geminiConfigured: isGeminiConfigured(),
      persistence: 'sqlite',
      timestamp: new Date().toISOString(),
    });
  });

  // Consolidated game progression & fleet state
  app.get('/api/state', (_req, res) => {
    try {
      res.json({
        profile: getPlayerProfile(),
        robots: listOwnedRobots(),
        transactions: listTransactions(30),
        missions: listMissionRecords(25),
        saveSlots: listSaveSlots(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load state.' });
    }
  });

  app.post('/api/profile/settings', (req, res) => {
    try {
      const patch = req.body as Partial<PlayerSettings>;
      const profile = updatePlayerProfile({ settings: patch as PlayerSettings });
      res.json({ profile });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid settings payload.' });
    }
  });

  app.post('/api/profile/region', (req, res) => {
    try {
      const regionId = String(req.body?.regionId || '') as RegionId;
      if (!MERIDIAN_REGIONS[regionId]) {
        res.status(400).json({ error: `Unknown region: ${regionId}` });
        return;
      }
      const profile = getPlayerProfile();
      if (!profile.unlocked_regions.includes(regionId)) {
        res.status(403).json({ error: `${MERIDIAN_REGIONS[regionId].name} is locked until Chapter ${MERIDIAN_REGIONS[regionId].unlockChapter}.` });
        return;
      }
      const updated = updatePlayerProfile({ active_region: regionId });
      res.json({ profile: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to switch region.' });
    }
  });

  app.post('/api/garage/purchase', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const result = purchaseRobot(robotId);
      res.json({ ...result, transactions: listTransactions(30) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Purchase failed.' });
    }
  });

  app.post('/api/garage/upgrade', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const category = String(req.body?.category || '') as UpgradeCategory;
      const result = upgradeOwnedRobot(robotId, category);
      res.json({ ...result, transactions: listTransactions(30) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upgrade failed.' });
    }
  });

  app.post('/api/garage/equip', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const moduleId = String(req.body?.moduleId || '') as EquipmentModuleId;
      const equip = Boolean(req.body?.equip);
      const result = equipModuleOnRobot(robotId, moduleId, equip);
      res.json({ ...result, transactions: listTransactions(30) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Equipment update failed.' });
    }
  });

  app.post('/api/garage/deploy', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const rawSlot = req.body?.slot;
      const slot = rawSlot === 1 || rawSlot === 2 ? rawSlot : null;
      const robots = setRobotDeploymentSlot(robotId, slot);
      res.json({ robots });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Deployment update failed.' });
    }
  });

  app.post('/api/garage/customize', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const customName = String(req.body?.customName || '');
      const hullColor = String(req.body?.hullColor || '#ea580c');
      const robots = customizeOwnedRobot(robotId, customName, hullColor);
      res.json({ robots });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Customization failed.' });
    }
  });

  app.post('/api/garage/repair', (req, res) => {
    try {
      const robotId = String(req.body?.robotId || '') as RobotModelId;
      const result = repairOwnedRobot(robotId);
      res.json({ ...result, transactions: listTransactions(30) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Repair failed.' });
    }
  });

  app.post('/api/garage/battery', (req, res) => {
    try {
      const updates = Array.isArray(req.body?.updates)
        ? (req.body.updates as Array<{ robotId?: string; batteryPct?: number }>)
        : [
            {
              robotId: typeof req.body?.robotId === 'string' ? req.body.robotId : undefined,
              batteryPct: typeof req.body?.batteryPct === 'number' ? req.body.batteryPct : undefined,
            },
          ];
      let robots = listOwnedRobots();
      for (const u of updates) {
        if (u.robotId && typeof u.batteryPct === 'number' && Number.isFinite(u.batteryPct)) {
          robots = updateRobotBattery(u.robotId as RobotModelId, u.batteryPct);
        }
      }
      res.json({ robots });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update battery.' });
    }
  });

  app.get('/api/store/catalog', (_req, res) => {
    res.json({ items: STORE_CATALOG });
  });

  app.post('/api/store/purchase', (req, res) => {
    try {
      const sku = String(req.body?.sku || '') as StoreSku;
      const targetRobotId =
        typeof req.body?.targetRobotId === 'string'
          ? (req.body.targetRobotId as RobotModelId)
          : undefined;
      const paymentDesc =
        typeof req.body?.paymentDescription === 'string' && req.body.paymentDescription.trim()
          ? req.body.paymentDescription.trim().slice(0, 48)
          : '';
      const paymentMode =
        req.body?.paymentMethod === 'google_pay'
          ? paymentDesc
            ? `Google Pay (${paymentDesc})`
            : 'Google Pay'
          : 'Sandbox Demo';
      const result = processStorePurchase(sku, targetRobotId, paymentMode);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Store purchase failed.' });
    }
  });

  app.post('/api/campaign/complete-mission', (req, res) => {
    try {
      const campaignMissionId = String(req.body?.campaignMissionId || 'ch1_first_light');
      const bonusEarned = Boolean(req.body?.bonusEarned);
      const score = Number(req.body?.totalScore ?? 0);
      const def = CAMPAIGN_MISSIONS.find((m) => m.id === campaignMissionId) ?? CAMPAIGN_MISSIONS[0];

      const profileBefore = getPlayerProfile();
      const firstTime = !profileBefore.completed_mission_ids.includes(def.id);
      const baseReward = firstTime ? def.rewardRc : Math.round(def.rewardRc * 0.65);
      const bonusRc = bonusEarned ? def.optionalBonusRc : 0;
      const totalEarned = score >= 500 ? baseReward + bonusRc : Math.round(baseReward * 0.4);

      let updatedProfile = recordTransaction(
        totalEarned,
        'mission_reward',
        `${def.title} payout (${firstTime ? 'Campaign' : 'Replay'}${bonusEarned ? ' + Bonus' : ''})`
      );

      const completedSet = new Set(updatedProfile.completed_mission_ids);
      completedSet.add(def.id);

      const chapterMissions = CAMPAIGN_MISSIONS.filter((m) => m.chapter === updatedProfile.current_chapter);
      const completedInCurrent = chapterMissions.filter((m) => completedSet.has(m.id)).length;
      const maxTierInChapter = Math.max(1, ...chapterMissions.map((m) => m.tier ?? 1));
      const finishedChapterFinale = def.chapter === updatedProfile.current_chapter && (def.tier ?? 1) >= maxTierInChapter;

      const shouldAdvanceChapter =
        def.chapter > 0 &&
        def.chapter >= updatedProfile.current_chapter &&
        score >= 500 &&
        (completedInCurrent >= Math.min(2, chapterMissions.length) || finishedChapterFinale);

      const nextChapter = shouldAdvanceChapter
        ? Math.min(6, updatedProfile.current_chapter + 1)
        : updatedProfile.current_chapter;

      const unlockedSet = new Set<RegionId>(updatedProfile.unlocked_regions);
      for (const reg of Object.values(MERIDIAN_REGIONS)) {
        if (reg.unlockChapter <= nextChapter) {
          unlockedSet.add(reg.id);
        }
      }

      updatedProfile = updatePlayerProfile({
        completed_mission_ids: Array.from(completedSet),
        current_chapter: nextChapter,
        unlocked_regions: Array.from(unlockedSet),
      });

      res.json({
        profile: updatedProfile,
        creditsEarned: totalEarned,
        bonusEarned,
        transactions: listTransactions(30),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to process mission payout.' });
    }
  });

  app.post('/api/campaign/choice', (req, res) => {
    try {
      const choice = req.body?.choice === 'autonomous_accord' ? 'autonomous_accord' : 'human_oversight';
      const profile = updatePlayerProfile({ ashfall_ending: choice });
      res.json({ profile });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to store story choice.' });
    }
  });

  app.post('/api/save', (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'slot_1');
      const label = String(req.body?.label || `Manual Save ${new Date().toLocaleTimeString()}`);
      const slot = createSaveSlot(slotId, label);
      res.json({ slot, saveSlots: listSaveSlots() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save slot.' });
    }
  });

  app.post('/api/save/load', (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'slot_1');
      const result = loadSaveSlot(slotId);
      res.json({ ...result, transactions: listTransactions(30), saveSlots: listSaveSlots() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to load save slot.' });
    }
  });

  app.post('/api/game/new', (req, res) => {
    try {
      const commanderName =
        typeof req.body?.commanderName === 'string' && req.body.commanderName.trim()
          ? req.body.commanderName.trim().slice(0, 28)
          : 'Commander Vance';
      const fresh = resetNewGame();
      const profile = updatePlayerProfile({ commander_name: commanderName });
      res.json({ profile, robots: fresh.robots, transactions: listTransactions(30) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start new game.' });
    }
  });

  app.post('/api/commander/interpret', async (req, res) => {
    try {
      const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction : '';
      const missionId =
        typeof req.body?.mission_id === 'string' && req.body.mission_id.trim()
          ? req.body.mission_id.trim()
          : `mission_${Date.now()}`;
      const preferOffline = Boolean(req.body?.preferOffline);
      const regionId = (req.body?.regionId || 'industrial_district') as RegionId;
      const fleetRobotIds = Array.isArray(req.body?.fleetRobotIds)
        ? (req.body.fleetRobotIds as string[])
        : ['robot_001'];
      const modifiers =
        req.body?.modifiers && typeof req.body.modifiers === 'object' ? req.body.modifiers : undefined;

      if (!instruction.trim()) {
        res.status(400).json({ error: 'Instruction text is required.' });
        return;
      }
      if (instruction.length > 500) {
        res.status(400).json({ error: 'Instruction exceeds maximum length of 500 characters.' });
        return;
      }

      const result = await interpretMissionInstruction(instruction, missionId, {
        preferOffline: req.body?.useCloudAi ? false : true,
        useCloudAi: Boolean(req.body?.useCloudAi),
        regionId,
        fleetRobotIds,
        modifiers,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to interpret mission.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/missions', (_req, res) => {
    try {
      const missions = listMissionRecords(25);
      res.json({ missions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query missions.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/missions', (req, res) => {
    try {
      const body = req.body as Partial<MissionRecord>;
      if (!body.mission_id || !body.instruction) {
        res.status(400).json({ error: 'mission_id and instruction are required.' });
        return;
      }
      const record: MissionRecord = {
        mission_id: String(body.mission_id),
        title: String(body.title ?? 'Rescue Mission'),
        instruction: String(body.instruction),
        region_id: (body.region_id ?? 'industrial_district') as RegionId,
        chapter_id: Number(body.chapter_id ?? 1),
        status: String(body.status ?? 'active'),
        provider: String(body.provider ?? 'deterministic-fallback'),
        survivor_found: Boolean(body.survivor_found),
        returned_safely: Boolean(body.returned_safely),
        total_score: Number(body.total_score ?? 0),
        grade: String(body.grade ?? 'D'),
        credits_earned: Number(body.credits_earned ?? 0),
        elapsed_sec: Number(body.elapsed_sec ?? 0),
        battery_remaining: Number(body.battery_remaining ?? 100),
        replan_count: Number(body.replan_count ?? 0),
        safety_rejections: Number(body.safety_rejections ?? 0),
        created_at: String(body.created_at ?? new Date().toISOString()),
      };
      upsertMissionRecord(record);
      res.status(201).json({ mission: record });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save mission.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/missions/:id/events', (req, res) => {
    try {
      const events = getMissionEvents(req.params.id);
      res.json({ events });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load mission events.';
      res.status(500).json({ error: message });
    }
  });

  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws: WebSocket) => {
    ws.send(
      JSON.stringify({
        type: 'connected',
        geminiConfigured: isGeminiConfigured(),
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; payload?: unknown };
        if (msg.type === 'agent_event' && msg.payload) {
          const ev = msg.payload as AgentEvent;
          if (ev.id && ev.mission_id && ev.message) {
            insertAgentEvent(ev);
          }
        }
      } catch {
        // Ignore malformed telemetry packets safely
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RELAY server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RELAY server:', err);
  process.exit(1);
});
