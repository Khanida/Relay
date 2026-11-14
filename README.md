# PROJECT RELAY 2.0 — Operation Ashfall

> *"When humans can't reach, intelligence goes further."*

RELAY 2.0 is an open-world 3D autonomous rescue robotics adventure and simulation built with **Three.js (WebGL2)**, **React + TypeScript**, **Express + WebSockets**, **SQLite (`node:sqlite`)**, and the **Gemini API (`@google/genai`)**.

## Published Website

- **Live App:** [https://ais-pre-ljwz73q3rpj5y2ophd4rwn-885189251864.europe-west2.run.app](https://ais-pre-ljwz73q3rpj5y2ophd4rwn-885189251864.europe-west2.run.app)

## Key Features

- **Operation Ashfall Campaign (6 Chapters + Side Contracts)**: Explore 7 interconnected Meridian districts (*Industrial District*, *Meridian City*, *Old Quarter*, *Port Meridian*, *Highland Province*, *Desert Corridor*, *Research Valley*) culminating in a player-driven ethical choice.
- **10 Distinct Procedural 3D Robots**: Acquire and deploy `RELAY-01`, `SCOUT-X`, `TITAN-R`, `AQUA-7`, `SWIFT-DRONE`, `MEDIC-4`, `SPECTRA`, `CRAWLER-9`, `ATLAS-M`, and `SENTINEL`—each with unique multi-part 3D chassis, animations, and terrain capabilities.
- **Multi-Agent Architecture**:
  - **Commander AI (`server/commanderAgent.ts` & `src/agents/commanderParser.ts`)**: Translates natural-language orders into structured mission tasks using Gemini 4 Hydrogen with automatic deterministic fallback.
  - **Fleet Coordinator (`src/agents/fleetCoordinator.ts`)**: Distributes objectives simultaneously across Slot 1 & Slot 2 active robots matched by capability.
  - **Navigation Agent (`src/agents/navigationAgent.ts`)**: Deterministic A* pathfinder operating strictly on the robot fleet's live belief grid (`flood_water`, `chemical_hazard`, `rubble`, `mountain_cliff`, `road`, `bridge`).
  - **Safety Agent (`src/agents/safetyAgent.ts`)**: Independent deterministic guardrail vetoing hazard entries, incompatible water/chemical exposure, and low-battery expeditions.
  - **Logistics Agent (`src/agents/logisticsAgent.ts`)**: Evaluates fleet readiness, hull wear, weather sealing, and repair projections.
- **Economy, Upgrades & Save Slots (`server/db.ts`)**: Earn **RELAY Credits (RC)**, purchase units, upgrade 6 subsystems (`Lv.0–3`), fit equipment modules (up to 3 per unit), customize callsigns/paint, and manage manual SQLite save slots.
- **Open-World Visuals & Camera Suite**: Dynamic Day/Night cycles, reactive Weather particles (`rain`, `heavy_rain`, `thunderstorm`, `fog`, `dust_storm`), hardware-gated `UnrealBloomPass` post-processing, 5 camera modes (`Orbit`, `3rd Person`, `Follow`, `Robot FPV` + PiP, `Cinematic`), and W/A/S/D safety-guarded manual driving.

## Quick Start

```bash
npm install
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`.
