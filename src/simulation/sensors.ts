import {
  CELL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  SURVIVOR_COORD,
  gridToWorld,
  isCellHazard,
  isCellHighBarrier,
  isCellSolidObstacle,
  isCellWater,
  worldToGrid,
} from '../shared/disasterMap';
import type {
  CellType,
  GridCoord,
  LidarRayReading,
  SensorReading,
} from '../shared/types';

export interface SensorStepResult {
  reading: SensorReading;
  newlyDiscoveredBlockages: GridCoord[];
}

export interface ExtendedSensorOptions {
  chemicalHazardCells?: GridCoord[];
  floodCells?: GridCoord[];
  survivorCoord?: GridCoord;
  lidarRangeM?: number;
  cameraRangeM?: number;
  aerial?: boolean;
}

const LIDAR_ANGLES_DEG = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
const DEFAULT_LIDAR_RANGE_M = 6.5;
const DEFAULT_CAMERA_RANGE_M = 6.0;
const CAMERA_HALF_FOV_RAD = (62 * Math.PI) / 180;

/**
 * Simulates robot-mounted depth LiDAR, optical/thermal camera, and environmental hazard sensors.
 * Strictly reads from `groundTruthGrid` (simulating physical world) and updates `beliefGrid`
 * ONLY for cells actually observed by LiDAR rays.
 */
export function sampleRobotSensors(
  worldX: number,
  worldZ: number,
  headingRad: number,
  groundTruthGrid: CellType[][],
  beliefGrid: CellType[][],
  electricalHazardCells: GridCoord[],
  unstableZoneCells: GridCoord[],
  options: ExtendedSensorOptions = {}
): SensorStepResult {
  const maxLidarRange = options.lidarRangeM ?? DEFAULT_LIDAR_RANGE_M;
  const maxCameraRange = options.cameraRangeM ?? DEFAULT_CAMERA_RANGE_M;
  const survivorCoord = options.survivorCoord ?? SURVIVOR_COORD;
  const chemicalCells = options.chemicalHazardCells ?? [];
  const floodCells = options.floodCells ?? [];
  const isAerial = Boolean(options.aerial);

  const lidarRays: LidarRayReading[] = [];
  const newlyDiscoveredBlockages: GridCoord[] = [];
  const discoveredKeys = new Set<string>();

  let minDepth = maxLidarRange;
  let frontDepth = maxLidarRange;
  let leftDepth = maxLidarRange;
  let rightDepth = maxLidarRange;

  for (const angleDeg of LIDAR_ANGLES_DEG) {
    const relRad = (angleDeg * Math.PI) / 180;
    const worldRayRad = headingRad + relRad;
    const dirX = Math.sin(worldRayRad);
    const dirZ = Math.cos(worldRayRad);

    let hitDistance = maxLidarRange;
    let hitType: LidarRayReading['hitType'] = 'clear';
    let hitCell: GridCoord | undefined;

    const stepSize = 0.18;
    for (let d = 0.35; d <= maxLidarRange; d += stepSize) {
      const px = worldX + dirX * d;
      const pz = worldZ + dirZ * d;
      const cellCoord = worldToGrid(px, pz);

      if (
        cellCoord.x < 0 ||
        cellCoord.x >= MAP_WIDTH ||
        cellCoord.z < 0 ||
        cellCoord.z >= MAP_HEIGHT
      ) {
        hitDistance = d;
        hitType = 'wall';
        break;
      }

      const cell = groundTruthGrid[cellCoord.z][cellCoord.x];

      const blocksRay = isAerial ? isCellHighBarrier(cell) : isCellSolidObstacle(cell);

      if (isCellSolidObstacle(cell) || isCellWater(cell)) {
        if (beliefGrid[cellCoord.z][cellCoord.x] !== cell) {
          beliefGrid[cellCoord.z][cellCoord.x] = cell;
          if (isCellSolidObstacle(cell)) {
            const k = `${cellCoord.x},${cellCoord.z}`;
            if (!discoveredKeys.has(k)) {
              discoveredKeys.add(k);
              newlyDiscoveredBlockages.push(cellCoord);
            }
          }
        }
      }

      if (blocksRay) {
        hitDistance = d;
        hitCell = cellCoord;
        hitType = cell === 'wall' || cell === 'mountain_cliff' ? 'wall' : 'debris';
        break;
      }

      if (isCellHazard(cell) && hitType === 'clear') {
        if (beliefGrid[cellCoord.z][cellCoord.x] !== cell) {
          beliefGrid[cellCoord.z][cellCoord.x] = cell;
        }
      }
    }

    lidarRays.push({
      angleRad: relRad,
      distance: Number(hitDistance.toFixed(2)),
      hitType,
      hitCell,
    });

    minDepth = Math.min(minDepth, hitDistance);
    if (Math.abs(angleDeg) <= 15) {
      frontDepth = Math.min(frontDepth, hitDistance);
    } else if (angleDeg < -15) {
      leftDepth = Math.min(leftDepth, hitDistance);
    } else if (angleDeg > 15) {
      rightDepth = Math.min(rightDepth, hitDistance);
    }
  }

  // Environmental sensors (temperature, vibration, EM field, chemical ppm, flood depth)
  let minElecDist = 99;
  for (const c of electricalHazardCells) {
    const w = gridToWorld(c);
    minElecDist = Math.min(minElecDist, Math.hypot(w.x - worldX, w.z - worldZ));
  }

  let minUnstableDist = 99;
  for (const c of unstableZoneCells) {
    const w = gridToWorld(c);
    minUnstableDist = Math.min(minUnstableDist, Math.hypot(w.x - worldX, w.z - worldZ));
  }

  let minChemicalDist = 99;
  for (const c of chemicalCells) {
    const w = gridToWorld(c);
    minChemicalDist = Math.min(minChemicalDist, Math.hypot(w.x - worldX, w.z - worldZ));
  }

  let minFloodDist = 99;
  for (const c of floodCells) {
    const w = gridToWorld(c);
    minFloodDist = Math.min(minFloodDist, Math.hypot(w.x - worldX, w.z - worldZ));
  }

  const electricalFieldKvM = Number(
    Math.max(0.12, 14.5 * Math.exp(-minElecDist * 0.72)).toFixed(2)
  );
  const vibrationHz = Number(
    Math.max(1.4, 38.0 * Math.exp(-minUnstableDist * 0.65)).toFixed(2)
  );
  const chemicalPpm = Number(
    (chemicalCells.length > 0 ? Math.max(0.5, 65.0 * Math.exp(-minChemicalDist * 0.62)) : 0.4).toFixed(1)
  );
  const currentGrid = worldToGrid(worldX, worldZ);
  const onWaterCell = groundTruthGrid[currentGrid.z]?.[currentGrid.x] === 'flood_water';
  const waterDepthM = Number(
    (onWaterCell ? 0.85 : minFloodDist < 1.3 ? 0.32 : 0).toFixed(2)
  );
  const temperatureC = Number(
    (21.5 + 18.0 * Math.exp(-minElecDist * 0.6) + Math.sin(worldX + worldZ) * 0.4).toFixed(1)
  );

  let hazardType: SensorReading['hazardProximity']['type'] = 'none';
  const minAll = Math.min(minElecDist, minUnstableDist, minChemicalDist, minFloodDist);
  let hazardDist = minAll;
  if (minAll < 4.5) {
    if (minAll === minElecDist) hazardType = 'electrical';
    else if (minAll === minUnstableDist) hazardType = 'unstable';
    else if (minAll === minChemicalDist) hazardType = 'chemical';
    else hazardType = 'flood';
  }
  hazardDist = Number(hazardDist.toFixed(2));

  // Survivor optical/thermal camera perception with occlusion check
  const survivorWorld = gridToWorld(survivorCoord);
  const dx = survivorWorld.x - worldX;
  const dz = survivorWorld.z - worldZ;
  const distToSurvivor = Math.hypot(dx, dz);
  const angleToSurvivor = Math.atan2(dx, dz);
  const relBearing = normalizeAngle(angleToSurvivor - headingRad);

  let survivorDetected = false;
  let confidence = 0;

  if (
    distToSurvivor <= maxCameraRange &&
    (Math.abs(relBearing) <= CAMERA_HALF_FOV_RAD || distToSurvivor <= 2.4)
  ) {
    const clearLOS = hasLineOfSight(
      worldX,
      worldZ,
      survivorWorld.x,
      survivorWorld.z,
      groundTruthGrid,
      survivorCoord,
      isAerial
    );
    if (clearLOS) {
      survivorDetected = true;
      confidence = Math.min(99, Math.round(72 + (1 - distToSurvivor / maxCameraRange) * 27));
    }
  }

  return {
    reading: {
      minDepthMeters: Number(minDepth.toFixed(2)),
      frontDepthMeters: Number(frontDepth.toFixed(2)),
      leftDepthMeters: Number(leftDepth.toFixed(2)),
      rightDepthMeters: Number(rightDepth.toFixed(2)),
      lidarRays,
      temperatureC,
      vibrationHz,
      electricalFieldKvM,
      chemicalPpm,
      waterDepthM,
      hazardProximity: {
        type: hazardType,
        distance: hazardDist,
      },
      survivorSignal: {
        detected: survivorDetected,
        confidence,
        bearingDeg: Math.round((relBearing * 180) / Math.PI),
        distance: Number(distToSurvivor.toFixed(2)),
        worldPos: survivorDetected ? { ...survivorCoord } : undefined,
      },
    },
    newlyDiscoveredBlockages,
  };
}

function hasLineOfSight(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  groundTruthGrid: CellType[][],
  survivorCoord: GridCoord,
  isAerial: boolean
): boolean {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(dist / (CELL_SIZE * 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    const cellCoord = worldToGrid(px, pz);
    if (cellCoord.x === survivorCoord.x && cellCoord.z === survivorCoord.z) continue;
    const cell = groundTruthGrid[cellCoord.z][cellCoord.x];
    if (isAerial ? isCellHighBarrier(cell) : isCellSolidObstacle(cell)) {
      return false;
    }
  }
  return true;
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

