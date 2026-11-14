import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { interpretMissionInstruction, isGeminiConfigured } from './server/commanderAgent';
import {
  getMissionEvents,
  insertAgentEvent,
  listMissionRecords,
  upsertMissionRecord,
} from './server/db';
import type { AgentEvent, MissionRecord } from './src/shared/types';

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

  app.post('/api/commander/interpret', async (req, res) => {
    try {
      const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction : '';
      const missionId =
        typeof req.body?.mission_id === 'string' && req.body.mission_id.trim()
          ? req.body.mission_id.trim()
          : `mission_${Date.now()}`;
      const preferOffline = Boolean(req.body?.preferOffline);

      if (!instruction.trim()) {
        res.status(400).json({ error: 'Instruction text is required.' });
        return;
      }
      if (instruction.length > 500) {
        res.status(400).json({ error: 'Instruction exceeds maximum length of 500 characters.' });
        return;
      }

      const result = await interpretMissionInstruction(instruction, missionId, preferOffline);
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
        status: String(body.status ?? 'active'),
        provider: String(body.provider ?? 'deterministic-fallback'),
        survivor_found: Boolean(body.survivor_found),
        returned_safely: Boolean(body.returned_safely),
        total_score: Number(body.total_score ?? 0),
        grade: String(body.grade ?? 'D'),
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
