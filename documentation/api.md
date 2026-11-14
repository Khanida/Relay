# RELAY Backend API & WebSocket Reference

## HTTP Endpoints (`server.ts`)

- `GET /api/health` — Returns backend readiness, SQLite status, and whether `GEMINI_API_KEY` is configured.
- `POST /api/commander/interpret` — Accepts `{ instruction: string, mission_id?: string, preferOffline?: boolean }` and returns `{ plan: MissionPlan, warning?: string }`.
- `GET /api/missions` — Lists recent SQLite-persisted `MissionRecord` entries.
- `POST /api/missions` — Persists or updates a `MissionRecord` in `data/relay.db`.
- `GET /api/missions/:id/events` — Returns chronological `AgentEvent[]` logs for a mission.

## WebSocket Channel (`/ws`)

- Streams `AgentEvent` telemetry packets `{ type: "agent_event", payload: AgentEvent }` from the active simulation into SQLite `agent_events`.
