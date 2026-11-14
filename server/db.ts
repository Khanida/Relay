import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AgentEvent, MissionRecord } from '../src/shared/types';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'relay.db');
const db = new DatabaseSync(dbPath);

db.exec(`
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

export function upsertMissionRecord(record: MissionRecord): void {
  const stmt = db.prepare(`
    INSERT INTO missions (
      mission_id, title, instruction, status, provider,
      survivor_found, returned_safely, total_score, grade,
      elapsed_sec, battery_remaining, replan_count, safety_rejections, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mission_id) DO UPDATE SET
      status = excluded.status,
      survivor_found = excluded.survivor_found,
      returned_safely = excluded.returned_safely,
      total_score = excluded.total_score,
      grade = excluded.grade,
      elapsed_sec = excluded.elapsed_sec,
      battery_remaining = excluded.battery_remaining,
      replan_count = excluded.replan_count,
      safety_rejections = excluded.safety_rejections
  `);

  stmt.run(
    record.mission_id,
    record.title,
    record.instruction,
    record.status,
    record.provider,
    record.survivor_found ? 1 : 0,
    record.returned_safely ? 1 : 0,
    record.total_score,
    record.grade,
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
    status: String(row.status),
    provider: String(row.provider),
    survivor_found: Boolean(row.survivor_found),
    returned_safely: Boolean(row.returned_safely),
    total_score: Number(row.total_score),
    grade: String(row.grade),
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
    actor: row.actor as AgentEvent['actor'],
    category: row.category as AgentEvent['category'],
    message: String(row.message),
    details: row.details_json ? JSON.parse(String(row.details_json)) : undefined,
  }));
}
