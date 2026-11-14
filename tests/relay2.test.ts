import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretMissionInstruction } from '../server/commanderAgent';
import {
  createSaveSlot,
  deleteSaveSlot,
  equipModuleOnRobot,
  getPlayerProfile,
  listOwnedRobots,
  loadSaveSlot,
  processStorePurchase,
  purchaseRobot,
  recordTransaction,
  resetNewGame,
  setRobotDeploymentSlot,
  updatePlayerProfile,
  updateRobotBattery,
  upgradeOwnedRobot,
} from '../server/db';
import { coordinateFleetAssignments } from '../src/agents/fleetCoordinator';
import { evaluateFleetLogistics } from '../src/agents/logisticsAgent';
import { calculateAStarPath } from '../src/agents/navigationAgent';
import { evaluateProposedRoute } from '../src/agents/safetyAgent';
import {
  CAMPAIGN_MISSIONS,
  MERIDIAN_REGIONS,
  ROBOT_CATALOG,
  STORE_CATALOG,
  computeEffectiveRobotStats,
  computeRobotChargeStatus,
} from '../src/shared/gameCatalog';
import {
  createGooglePayPaymentRequest,
  getGooglePayConfig,
} from '../src/services/googlePayService';
import { createRegionWorldMap } from '../src/shared/meridianWorldMaps';
import type { RegionId } from '../src/shared/types';
import { MissionSimulationEngine } from '../src/simulation/missionEngine';

test('All 7 Meridian regions generate valid 26x20 worlds with walkable bases and objectives', () => {
  const regionIds = Object.keys(MERIDIAN_REGIONS) as RegionId[];
  assert.equal(regionIds.length, 7);

  for (const id of regionIds) {
    const map = createRegionWorldMap(id);
    assert.equal(map.groundTruthGrid.length, 20);
    assert.equal(map.groundTruthGrid[0].length, 26);
    assert.equal(map.initialBeliefGrid[map.baseCoord.z][map.baseCoord.x], 'charging_base');
    assert.notEqual(map.groundTruthGrid[map.survivorCoord.z][map.survivorCoord.x], 'wall');
  }
});

test('Floodwater safety & navigation: rejects unsealed RELAY-01 while allowing AQUA-7 amphibious traversal', () => {
  const floodMap = createRegionWorldMap('old_quarter');

  // Direct route across flooded canal (9..24, 9..12) from (14, 7) to (14, 14)
  const relayCaps = ROBOT_CATALOG.relay_01.capabilities;
  const aquaCaps = ROBOT_CATALOG.aqua_7.capabilities;

  const relayDirectWaterCheck = evaluateProposedRoute(
    {
      id: 't1',
      mission_id: 'm1',
      robot_id: 'robot_001',
      task: 'search_area',
      label: 'Cross canal',
      target: { x: 14, z: 14 },
      priority: 'high',
      status: 'pending',
      rationale: 'Test',
    },
    {
      valid: true,
      waypoints: [
        { x: 14, z: 8 },
        { x: 14, z: 11 },
        { x: 14, z: 14 },
      ],
      distanceMeters: 6,
      estimatedBatteryCost: 3.3,
    },
    {
      beliefGrid: floodMap.initialBeliefGrid,
      currentPos: { x: 14, z: 8 },
      batteryPct: 100,
      avoidZones: [],
      capabilities: relayCaps,
    }
  );
  assert.equal(relayDirectWaterCheck.approved, false);
  assert.ok(relayDirectWaterCheck.violatedRules.includes('RULE_FLOOD_WATER_INCOMPATIBLE'));

  const aquaPath = calculateAStarPath(
    floodMap.initialBeliefGrid,
    { x: 14, z: 8 },
    { x: 14, z: 14 },
    { capabilities: aquaCaps }
  );
  assert.equal(aquaPath.valid, true);
  assert.ok(aquaPath.distanceMeters <= 7.5);
});

test('Weather penalties degrade speed & sensor depth but are mitigated by upgrades & modules', () => {
  const clearStats = computeEffectiveRobotStats('relay_01', undefined, 'clear');
  const stormStats = computeEffectiveRobotStats('relay_01', undefined, 'thunderstorm');
  assert.ok(stormStats.speedMps < clearStats.speedMps);
  assert.ok(stormStats.cameraRangeM < clearStats.cameraRangeM);

  const upgradedStats = computeEffectiveRobotStats(
    'relay_01',
    {
      robot_id: 'relay_01',
      custom_name: 'RELAY-MAX',
      hull_color: '#ea580c',
      integrity_pct: 100,
      upgrades: { battery: 2, speed: 2, lidar: 2, thermal: 2, weather_seal: 3, armor: 1 },
      equipped_modules: ['high_gain_lidar', 'hydro_seal'],
      deployment_slot: 1,
      purchased_at: new Date().toISOString(),
    },
    'thunderstorm'
  );
  assert.ok(upgradedStats.lidarRangeM > stormStats.lidarRangeM + 3);
  assert.equal(upgradedStats.capabilities.waterproof, true);
});

test('FleetCoordinator splits capabilities across 2 active units and MissionSimulationEngine runs dual fleet', () => {
  const result = coordinateFleetAssignments(
    [
      {
        id: 't_relay',
        mission_id: 'm_dual',
        robot_id: 'robot_001',
        task: 'restore_relay',
        label: 'Restore relay',
        target: { x: 13, z: 13 },
        priority: 'high',
        status: 'pending',
        rationale: 'Comm restore',
      },
      {
        id: 't_med',
        mission_id: 'm_dual',
        robot_id: 'robot_001',
        task: 'deliver_medical',
        label: 'Deliver trauma pack',
        target: { x: 21, z: 14 },
        priority: 'critical',
        status: 'pending',
        rationale: 'Medical drop',
      },
    ],
    [
      {
        robot_id: 'robot_001',
        model_id: 'scout_x',
        name: 'SCOUT-X',
        capabilities: ROBOT_CATALOG.scout_x.capabilities,
        batteryPct: 100,
      },
      {
        robot_id: 'robot_002',
        model_id: 'medic_4',
        name: 'MEDIC-4',
        capabilities: ROBOT_CATALOG.medic_4.capabilities,
        batteryPct: 100,
      },
    ]
  );

  assert.equal(result.objectives[0].robot_id, 'robot_001'); // scout_x has commRelay
  assert.equal(result.objectives[1].robot_id, 'robot_002'); // medic_4 has medicalCargo

  const dualEngine = new MissionSimulationEngine({}, {
    regionId: 'meridian_city',
    weather: 'rain',
    timeOfDay: 'night',
    deployedRobots: [
      {
        robot_id: 'scout_x',
        custom_name: 'SCOUT-X',
        hull_color: '#0284c7',
        integrity_pct: 100,
        upgrades: { battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 },
        equipped_modules: [],
        deployment_slot: 1,
        purchased_at: new Date().toISOString(),
      },
      {
        robot_id: 'medic_4',
        custom_name: 'MEDIC-4',
        hull_color: '#f8fafc',
        integrity_pct: 100,
        upgrades: { battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 },
        equipped_modules: [],
        deployment_slot: 2,
        purchased_at: new Date().toISOString(),
      },
    ],
  });

  assert.equal(dualEngine.units.length, 2);
  dualEngine.startFromInstruction('Restore the relay and deliver medical supplies and return to base');
  for (let i = 0; i < 60; i++) dualEngine.step(0.05);
  assert.ok(dualEngine.units.every((u) => u.distanceTraveledM >= 0));
});

test('SQLite v2 progression: robot purchase, upgrade, equip, deployment slots, and save/load snapshots', () => {
  resetNewGame();
  const initial = getPlayerProfile();
  assert.equal(initial.credits_rc, 300);

  // Award campaign credits so we can buy SCOUT-X (400 RC) and upgrade
  recordTransaction(800, 'mission_reward', 'Test Campaign Payout');
  updatePlayerProfile({ current_chapter: 3, unlocked_regions: ['industrial_district', 'meridian_city', 'old_quarter'] });

  const afterBuy = purchaseRobot('scout_x');
  assert.equal(afterBuy.robots.length, 2);
  assert.equal(afterBuy.profile.credits_rc, 700);

  const afterUpgrade = upgradeOwnedRobot('scout_x', 'speed');
  assert.equal(
    afterUpgrade.robots.find((r) => r.robot_id === 'scout_x')?.upgrades.speed,
    1
  );

  const afterEquip = equipModuleOnRobot('relay_01', 'thermal_cam', true);
  assert.ok(
    afterEquip.robots.find((r) => r.robot_id === 'relay_01')?.equipped_modules.includes('thermal_cam')
  );

  setRobotDeploymentSlot('scout_x', 2);
  const robotsNow = listOwnedRobots();
  assert.equal(robotsNow.find((r) => r.robot_id === 'scout_x')?.deployment_slot, 2);

  // Logistics advisory check for Chapter 3 Floodline
  const ch3 = CAMPAIGN_MISSIONS.find((m) => m.id === 'ch3_floodline')!;
  const logistics = evaluateFleetLogistics(robotsNow, ch3, ch3.weather);
  assert.ok(logistics.advisories.some((a) => a.severity === 'warning'));

  // Save snapshot, reset, and restore
  createSaveSlot('test_slot', 'Pre-Floodline Save');
  resetNewGame();
  assert.equal(listOwnedRobots().length, 1);

  const restored = loadSaveSlot('test_slot');
  assert.equal(restored.robots.length, 2);
  assert.equal(restored.profile.current_chapter, 3);
  deleteSaveSlot('test_slot');
  resetNewGame();
});

test('All 23 missions across Levels 1-6 generate solvable A* routes for recommended robots', () => {
  for (const mission of CAMPAIGN_MISSIONS) {
    const map = createRegionWorldMap(mission.regionId, mission.modifiers);
    const recId = mission.recommendedRobots[0];
    const caps = ROBOT_CATALOG[recId].capabilities;

    assert.notEqual(map.groundTruthGrid[map.survivorCoord.z][map.survivorCoord.x], 'wall', mission.id);
    const toSurvivor = calculateAStarPath(map.initialBeliefGrid, map.baseCoord, map.survivorCoord, {
      capabilities: caps,
      weather: mission.weather,
    });
    assert.equal(toSurvivor.valid, true, `Route to survivor failed for ${mission.id} (${mission.title})`);

    if (map.relayCoord) {
      const toRelay = calculateAStarPath(map.initialBeliefGrid, map.baseCoord, map.relayCoord, {
        capabilities: caps,
        weather: mission.weather,
      });
      assert.equal(toRelay.valid, true, `Route to relay failed for ${mission.id}`);
    }
    if (map.medicalCoord) {
      const toMed = calculateAStarPath(map.initialBeliefGrid, map.baseCoord, map.medicalCoord, {
        capabilities: caps,
        weather: mission.weather,
      });
      assert.equal(toMed.valid, true, `Route to medical target failed for ${mission.id}`);
    }
  }
});

test('Control mode defaults to Automatic AI and Remote Control enables manual keyboard steering', () => {
  const lvl1 = CAMPAIGN_MISSIONS.find((m) => m.id === 'ch1_first_light')!;
  const lvl6 = CAMPAIGN_MISSIONS.find((m) => m.id === 'ch6_ashfall')!;
  assert.ok((lvl6.modifiers?.batteryDrainMult ?? 1) > (lvl1.modifiers?.batteryDrainMult ?? 1));

  const engine = new MissionSimulationEngine({}, { regionId: 'industrial_district' });
  assert.equal(engine.controlMode, 'auto');

  const startX = engine.robotPos.x;
  const startZ = engine.robotPos.z;
  engine.setManualInput(1, 0);
  for (let i = 0; i < 10; i++) engine.step(0.05);
  // In auto standby mode, manual input must NOT move the robot
  assert.equal(engine.robotPos.x, startX);
  assert.equal(engine.robotPos.z, startZ);

  // Engage Remote Control
  engine.setControlMode('manual');
  engine.setManualInput(1, 0);
  for (let i = 0; i < 10; i++) engine.step(0.05);
  assert.ok(Math.hypot(engine.robotPos.x - startX, engine.robotPos.z - startZ) > 0.2);

  // Switching back to Auto clears manualInput
  engine.setControlMode('auto');
  assert.equal(engine.manualInput.forward, 0);
  assert.equal(engine.manualInput.turn, 0);
});

test('Zero-quota Commander executes locally without Cloud AI warnings, and 24h recharge + Store work end-to-end', async () => {
  const res = await interpretMissionInstruction('Find the survivor and return safely.', 'm_local_1');
  assert.equal(res.plan.provider, 'deterministic-fallback');
  assert.equal(res.warning, undefined);
  assert.ok(res.plan.objectives.length >= 3);

  // Baseline RELAY-01 = 24h full charge; Battery Lv.3 = 6h full charge; SENTINEL = 4h full charge
  assert.equal(computeEffectiveRobotStats('relay_01').effectiveChargeHours, 24);
  assert.equal(
    computeEffectiveRobotStats('relay_01', {
      robot_id: 'relay_01',
      custom_name: 'RELAY-01',
      hull_color: '#d4af37',
      integrity_pct: 100,
      upgrades: { battery: 3, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 },
      equipped_modules: [],
      deployment_slot: 1,
      purchased_at: new Date().toISOString(),
    }).effectiveChargeHours,
    6
  );
  assert.equal(computeEffectiveRobotStats('sentinel').effectiveChargeHours, 4);

  // Simulate 12 hours elapsed from 0% battery on un-upgraded RELAY-01 => ~50%
  const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const halfCharge = computeRobotChargeStatus({
    robot_id: 'relay_01',
    custom_name: 'RELAY-01',
    hull_color: '#d4af37',
    integrity_pct: 100,
    battery_pct: 0,
    battery_updated_at: twelveHoursAgo,
    upgrades: { battery: 0, speed: 0, lidar: 0, thermal: 0, weather_seal: 0, armor: 0 },
    equipped_modules: [],
    deployment_slot: 1,
    purchased_at: twelveHoursAgo,
  });
  assert.ok(halfCharge.batteryPct >= 49.9 && halfCharge.batteryPct <= 50.1);

  // Depleted unit cannot run missions until recharged
  resetNewGame();
  updateRobotBattery('relay_01', 0);
  const drainedFleet = listOwnedRobots();
  assert.equal(drainedFleet[0].battery_pct, 0);

  const drainedEngine = new MissionSimulationEngine({}, { deployedRobots: drainedFleet });
  drainedEngine.startFromInstruction('Find the survivor and return safely.');
  assert.equal(drainedEngine.phase, 'failed');

  // Store purchase grants RC pack & instant 100% battery recharge
  const rcBuy = processStorePurchase('rc_pack_1000', 'relay_01', 'sandbox');
  assert.equal(rcBuy.profile.credits_rc, 1300);

  const batBuy = processStorePurchase('battery_unit_full', 'relay_01', 'sandbox');
  assert.equal(batBuy.robots.find((r) => r.robot_id === 'relay_01')?.battery_pct, 100);
  resetNewGame();
});

test('Google Pay service initializes payment requests from VITE_GOOGLE_PAY_* env vars for currency and battery purchases', () => {
  const defaultCfg = getGooglePayConfig({});
  assert.equal(defaultCfg.environment, 'TEST');
  assert.equal(defaultCfg.isLiveConfigured, false);
  assert.equal(defaultCfg.gateway, 'example');

  const liveCfg = getGooglePayConfig({
    VITE_GOOGLE_PAY_MERCHANT_ID: 'BCR2DN4T12345678',
    VITE_GOOGLE_PAY_GATEWAY: 'stripe',
    VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID: 'acct_live_relay',
    VITE_GOOGLE_PAY_ENV: 'PRODUCTION',
  });
  assert.equal(liveCfg.environment, 'PRODUCTION');
  assert.equal(liveCfg.isLiveConfigured, true);
  assert.equal(liveCfg.merchantId, 'BCR2DN4T12345678');
  assert.equal(liveCfg.gateway, 'stripe');

  const currencyItem = STORE_CATALOG.find((s) => s.kind === 'currency')!;
  const currencyReq = createGooglePayPaymentRequest(currencyItem, liveCfg);
  assert.equal(currencyReq.apiVersion, 2);
  assert.equal(currencyReq.merchantInfo.merchantId, 'BCR2DN4T12345678');
  assert.equal(currencyReq.allowedPaymentMethods[0].tokenizationSpecification.parameters.gateway, 'stripe');
  assert.equal(currencyReq.transactionInfo.totalPrice, currencyItem.priceUsd);
  assert.ok(currencyReq.transactionInfo.totalPriceLabel.includes('RELAY Credits Pack'));

  const batteryItem = STORE_CATALOG.find((s) => s.kind === 'battery')!;
  const batteryReq = createGooglePayPaymentRequest(batteryItem, liveCfg);
  assert.equal(batteryReq.transactionInfo.totalPrice, batteryItem.priceUsd);
  assert.equal(batteryReq.transactionInfo.currencyCode, 'USD');
  assert.ok(batteryReq.transactionInfo.totalPriceLabel.includes('Instant Battery Overcharge'));
});

