# RELAY 2.0 Backend REST & WebSocket API

Base URL: `http://localhost:3000`

## Health & Consolidated State
- `GET /api/health` — Backend status, SQLite connectivity, and `geminiConfigured` flag.
- `GET /api/state` — Returns `{ profile, robots, transactions, missions, saveSlots }`.

## Profile & World Navigation
- `POST /api/profile/settings` — Updates `{ graphicsQuality, weatherEnabled, dayNightCycle, audioEnabled, voiceDialogue, showLidar }`.
- `POST /api/profile/region` — Switches `active_region` (validated against `unlocked_regions`).

## Garage & Fleet Management
- `POST /api/garage/purchase` — `{ robotId }`: Validates chapter unlock & RC balance, deducts RC, adds unit to `owned_robots`.
- `POST /api/garage/upgrade` — `{ robotId, category }`: Upgrades subsystem `Lv.0 -> Lv.3` and logs wallet transaction.
- `POST /api/garage/equip` — `{ robotId, moduleId, equip }`: Equips/unequips up to 3 modules per unit.
- `POST /api/garage/deploy` — `{ robotId, slot: 1 | 2 | null }`: Assigns active Slot 1 / Slot 2 fleet deployment.
- `POST /api/garage/customize` — `{ robotId, customName, hullColor }`: Updates unit callsign and hull livery.
- `POST /api/garage/repair` — `{ robotId }`: Restores hull integrity to 100% for calculated RC cost.

## Campaign, Commander & Saves
- `POST /api/commander/interpret` — `{ instruction, mission_id, regionId, fleetRobotIds, preferOffline }`: Returns structured `MissionPlan`.
- `POST /api/campaign/complete-mission` — `{ campaignMissionId, bonusEarned, totalScore }`: Pays RC rewards and unlocks next campaign chapters/regions.
- `POST /api/campaign/choice` — `{ choice: 'human_oversight' | 'autonomous_accord' }`: Records Chapter 6 ending.
- `POST /api/missions` & `GET /api/missions` — Persists and lists mission debrief records.
- `GET /api/missions/:id/events` — Returns stored agent telemetry events.
- `POST /api/save`, `POST /api/save/load`, `POST /api/game/new` — Manages persistent SQLite save snapshots and career resets.

## WebSocket Telemetry
- `WS /ws` — Streams live `agent_event` packets into SQLite `agent_events`.
