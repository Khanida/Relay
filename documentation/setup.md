# Setup & Verification Guide

## Environment Variables

Copy `.env.example` if running locally outside AI Studio:

- `GEMINI_API_KEY` *(optional)* — Enables server-side `gemini-4-hydrogen` natural-language mission parsing. When omitted, RELAY automatically uses the deterministic Commander parser so all missions run offline.

## Commands

- `npm run dev` — Starts Express + WebSocket + Vite dev server on port `3000`.
- `npm test` — Runs automated tests in `tests/mission.test.ts` (A* pathfinding, dynamic corridor replanning, unsafe command rejection, battery reserve enforcement, end-to-end Operation First Light rescue, and safety-weighted scoring).
- `npm run lint` — Runs TypeScript type checking (`tsc --noEmit`).
- `npm run build` — Builds production frontend bundle into `dist/`.
