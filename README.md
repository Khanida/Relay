# RELAY — Autonomous Rescue Robotics Simulation

**Tagline:** *When humans can't reach, intelligence goes further.*

RELAY is an interactive 3D autonomous rescue robotics simulation where players command a quadruped rescue robot using natural-language instructions during disaster-response missions.

## Runtime Adaptation Note

Because this container environment runs a Node.js + Vite + React web runtime without a Unity Editor desktop binary, RELAY is implemented as a real-time **Three.js / WebGL 3D simulation** paired with an **Express + TypeScript + SQLite + WebSocket backend** (`server.ts`) and server-side **Gemini 4 Hydrogen** Commander parsing (`@google/genai`), complete with an offline deterministic fallback so all missions run locally without internet or external credentials.

## Key Capabilities

- **3D Disaster Facility (*Operation First Light*)**: Partially collapsed industrial building with damaged concrete walls, exposed rebar, rubble, broken staircase, an undiscovered collapsed corridor beam, an electrical switchgear hazard, an unstable structural zone, charging dock, and a trapped survivor.
- **Articulated Quadruped Robot (`RELAY-01`)**: 12-part procedural 3D model with 4 articulated 2-joint legs driven by diagonal trot gait kinematics, live OLED status display, battery indicator, spinning LiDAR turret, and a mounted First-Person Robot Camera (FPV + PiP).
- **Three Independent AI Components**:
  1. **Commander (`server/commanderAgent.ts`, `src/agents/commanderParser.ts`)**: Translates natural-language orders into structured JSON `MissionPlan` objectives using Gemini 4 Hydrogen or deterministic fallback.
  2. **Navigation (`src/agents/navigationAgent.ts`)**: Deterministic A* pathfinding over the robot's *belief occupancy grid* with corner-cut prevention and real-time route replanning.
  3. **Safety (`src/agents/safetyAgent.ts`)**: Deterministic rule engine independent of any LLM—rejects hazardous routes, verifies round-trip battery reserves, and triggers emergency stops or low-battery return-to-base overrides.
- **Decoupled Sensor Simulation (`src/simulation/sensors.ts`)**: Simulates 9-ray depth LiDAR, occluded optical/thermal survivor perception, EM field, seismic vibration, and ambient temperature against ground truth without leaking unvisited obstacles to the AI.
- **SQLite Persistence (`server/db.ts`)**: Stores mission records and structured agent decision logs in `data/relay.db`.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, enter `"Find the survivor and return safely."`, and click **Run Mission**.

## Running Tests

```bash
npm test
npm run lint
npm run build
```
