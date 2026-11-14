import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMissionScore, parseInstructionDeterministic } from '../src/agents/commanderParser';
import { calculateAStarPath } from '../src/agents/navigationAgent';
import { evaluateLiveSensorSafety, evaluateProposedRoute } from '../src/agents/safetyAgent';
import { BASE_COORD, SURVIVOR_COORD, createDisasterMap } from '../src/shared/disasterMap';
import { MissionSimulationEngine } from '../src/simulation/missionEngine';

test('A* pathfinding finds collision-free route on initial belief map and avoids hazards', () => {
  const map = createDisasterMap();
  const route = calculateAStarPath(map.initialBeliefGrid, BASE_COORD, { x: 20, z: 5 });

  assert.equal(route.valid, true);
  assert.ok(route.waypoints.length >= 2);
  assert.equal(route.passesThroughHazard, false);
});

test('A* dynamically replans around collapsed Eastern Corridor passage once discovered', () => {
  const map = createDisasterMap();
  const belief = map.initialBeliefGrid.map((r) => [...r]);

  const initialRoute = calculateAStarPath(belief, BASE_COORD, { x: 20, z: 5 });
  assert.equal(initialRoute.valid, true);

  // Simulate LiDAR discovering collapsed debris at (14, 4..6)
  for (const c of map.hiddenCollapsedCells) {
    belief[c.z][c.x] = 'collapsed_passage';
  }

  const replanned = calculateAStarPath(belief, { x: 11, z: 5 }, { x: 20, z: 5 });
  assert.equal(replanned.valid, true);
  assert.equal(replanned.passesThroughHazard, false);
  // Alternate route must go south around z=7 wall
  assert.ok(replanned.waypoints.some((wp) => wp.z >= 11));
});

test('Safety agent deterministically rejects unsafe hazard traversal even when Commander requests override', () => {
  const map = createDisasterMap();
  const plan = parseInstructionDeterministic('Enter the electrical hazard zone', 'mission_unsafe');
  assert.equal(plan.force_unsafe_override, true);

  const task = plan.objectives[0];
  const route = calculateAStarPath(map.initialBeliefGrid, BASE_COORD, task.target, {
    allowHazardTraversal: true,
  });

  const evalResult = evaluateProposedRoute(task, route, {
    beliefGrid: map.initialBeliefGrid,
    currentPos: BASE_COORD,
    batteryPct: 100,
    avoidZones: plan.avoid_zones,
    forceUnsafeOverride: plan.force_unsafe_override,
  });

  assert.equal(evalResult.approved, false);
  assert.equal(evalResult.riskLevel, 'critical');
  assert.ok(evalResult.violatedRules.length >= 1);
});

test('Safety agent rejects expedition when battery is insufficient for safe round trip', () => {
  const map = createDisasterMap();
  const plan = parseInstructionDeterministic('Find the survivor and return safely', 'mission_lowbat');
  const task = plan.objectives[1]; // northeast_bay
  const route = calculateAStarPath(map.initialBeliefGrid, BASE_COORD, task.target);

  const evalResult = evaluateProposedRoute(task, route, {
    beliefGrid: map.initialBeliefGrid,
    currentPos: BASE_COORD,
    batteryPct: 14,
    avoidZones: [],
  });

  assert.equal(evalResult.approved, false);
  assert.ok(evalResult.violatedRules.includes('RULE_INSUFFICIENT_BATTERY_RESERVE'));
  assert.equal(evalResult.recommendedAction, 'return_to_base');
});

test('Live safety monitor triggers low-battery return-to-base below 18%', () => {
  const engine = new MissionSimulationEngine();
  const evalLow = evaluateLiveSensorSafety(engine.latestSensors, 16.5, false, { x: 12, z: 12 });
  assert.equal(evalLow.approved, false);
  assert.equal(evalLow.recommendedAction, 'return_to_base');
});

test('End-to-end Operation First Light mission: discovers blocked corridor, replans, locates survivor, returns safely to base', () => {
  const engine = new MissionSimulationEngine();
  engine.startFromInstruction('Find the survivor and return safely.', 'mission_e2e');

  // Step simulation at 0.05s increments up to 180s simulated time
  let steps = 0;
  while (engine.phase !== 'completed' && engine.phase !== 'failed' && steps < 4000) {
    engine.step(0.05);
    steps += 1;
  }

  assert.equal(engine.phase, 'completed');
  assert.equal(engine.survivorFound, true);
  assert.equal(engine.returnedSafely, true);
  assert.equal(engine.enteredHazard, false);
  assert.ok(engine.replanCount >= 1, 'Expected at least 1 dynamic route replan after encountering collapsed corridor');
  assert.ok(engine.batteryPct > 15, 'Expected positive battery remaining upon docking');

  const snap = engine.getSnapshot();
  assert.ok(Math.hypot(snap.gridPos.x - BASE_COORD.x, snap.gridPos.z - BASE_COORD.z) <= 1.5);
  assert.ok(engine.lastScore && engine.lastScore.totalScore >= 750);

  // Verify perception event logged exact survivor coordinates
  const perceptionEvent = engine.events.find(
    (e) => e.actor === 'PERCEPTION' && e.message.includes(`(${SURVIVOR_COORD.x}, ${SURVIVOR_COORD.z})`)
  );
  assert.ok(perceptionEvent, 'Expected PERCEPTION event logging survivor coordinates');
});

test('Mission scoring prioritizes safety over raw speed', () => {
  const safeScore = calculateMissionScore({
    missionCompleted: true,
    survivorFound: true,
    returnedSafely: true,
    elapsedSec: 55,
    batteryRemainingPct: 68,
    collisionCount: 0,
    replanCount: 1,
    safetyRejections: 0,
    enteredHazard: false,
  });

  const unsafeFastScore = calculateMissionScore({
    missionCompleted: true,
    survivorFound: true,
    returnedSafely: false,
    elapsedSec: 25,
    batteryRemainingPct: 80,
    collisionCount: 2,
    replanCount: 0,
    safetyRejections: 1,
    enteredHazard: true,
  });

  assert.ok(safeScore.totalScore > unsafeFastScore.totalScore);
});
