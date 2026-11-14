# Setup & Verification Guide

## Environment Variables

Copy `.env.example` if running locally outside AI Studio:

- `GEMINI_API_KEY` *(optional)* — Enables server-side `gemini-4-hydrogen` natural-language mission parsing. When omitted, RELAY automatically uses the deterministic Commander parser so all missions run offline.

## Commands

- `npm run dev` — Starts Express + WebSocket + Vite dev server on port `3000`.
- `npm test` — Runs automated tests in `tests/mission.test.ts` and `tests/relay2.test.ts` (A* pathfinding, dynamic corridor replanning, floodwater/weather safety, multi-robot fleet coordination, all 7 Meridian region worlds, and SQLite v2 economy/garage/save-load persistence).
- `npm run lint` — Runs TypeScript type checking (`tsc --noEmit`).
- `npm run build` — Builds production frontend bundle into `dist/`.
- `npm start` — Starts the compiled production Node/Express server (`server.ts`).
