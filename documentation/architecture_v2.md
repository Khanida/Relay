# RELAY 2.0 Architecture — Open World & Multi-Agent System

## 1. High-Level Layers

1. **Shared Simulation Domain (`src/shared/`)**
   - `types.ts`: Canonical interfaces for regions, robots, upgrades, modules, tasks, telemetry, and economy records.
   - `gameCatalog.ts`: Data-driven catalog for 7 Meridian regions, 10 robot models, 6 equipment modules, 6 upgrade trees, 6 campaign chapters, and 3 repeatable side contracts.
   - `disasterMap.ts` & `meridianWorldMaps.ts`: Generates `26×20` separated `initialBeliefGrid` and `groundTruthGrid` maps per region so LiDAR perception discovers collapsed blockages dynamically.

2. **Autonomous Multi-Agent Core (`src/agents/`)**
   - `commanderParser.ts` + `server/commanderAgent.ts`: High-level task decomposition (never low-level motor control).
   - `fleetCoordinator.ts`: Splits and matches objectives across Slot 1 and Slot 2 active robots.
   - `navigationAgent.ts`: Capability-aware A* pathfinder (`aerial`, `waterproof`, `heavyLift`, `hazmatShield`).
   - `safetyAgent.ts`: Deterministic route + tick-level sensor veto engine enforcing collision buffers, EM/seismic/chemical/water thresholds, and mandatory low-battery return-to-base.
   - `logisticsAgent.ts`: Pre-mission diagnostic and repair projection agent.

3. **3D Simulation & Rendering (`src/simulation/`)**
   - `missionEngine.ts`: Dual-unit headless physics/state simulation stepping both autonomous A* task queues and optional W/A/S/D exploration.
   - `robotModels.ts` & `quadrupedRobot.ts`: Distinct procedural multi-part 3D assemblies for all 10 robot classes.
   - `meridianWorld3D.ts`: Regional geometry, roads, bridges, animated floodwater, shipping containers, solar arrays, weather particle field, emergency vehicles, NPCs, and dynamic Time-of-Day lighting.
   - `sensors.ts`: Occlusion-checked line-of-sight survivor perception and ray-cast depth LiDAR.

4. **Backend & Persistence (`server.ts`, `server/db.ts`)**
   - Versioned SQLite migrations (`schema_version` v2) storing `missions`, `agent_events`, `player_profile`, `owned_robots`, `transactions`, and `save_slots`.
