import {
  BASE_COORD,
  CELL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  isCellHazard,
  isCellHighBarrier,
  isCellSolidObstacle,
  isCellWater,
} from '../shared/disasterMap';
import type { CellType, GridCoord, RobotCapabilities, RoutePlan, WeatherType } from '../shared/types';

export interface PathfindingOptions {
  allowHazardTraversal?: boolean;
  avoidCells?: Set<string>;
  batteryCostPerMeter?: number;
  capabilities?: RobotCapabilities;
  weather?: WeatherType;
}

interface AStarNode {
  x: number;
  z: number;
  g: number;
  f: number;
  parent?: AStarNode;
}

const DIRS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
];

export function coordKey(c: GridCoord): string {
  return `${c.x},${c.z}`;
}

export function isInsideGrid(x: number, z: number): boolean {
  return x >= 0 && x < MAP_WIDTH && z >= 0 && z < MAP_HEIGHT;
}

/**
 * Pure deterministic A* pathfinder operating strictly on the robot's current belief grid.
 * Never uses an LLM and never accesses hidden ground-truth obstacles until discovered.
 */
export function calculateAStarPath(
  beliefGrid: CellType[][],
  start: GridCoord,
  goal: GridCoord,
  options: PathfindingOptions = {}
): RoutePlan {
  const allowHazard = options.allowHazardTraversal ?? false;
  const avoidCells = options.avoidCells ?? new Set<string>();
  const batteryCostPerMeter = options.batteryCostPerMeter ?? 0.55;
  const caps = options.capabilities;

  if (!isInsideGrid(start.x, start.z) || !isInsideGrid(goal.x, goal.z)) {
    return {
      valid: false,
      waypoints: [],
      distanceMeters: 0,
      estimatedBatteryCost: 0,
      reason: 'Start or target coordinate is outside facility perimeter.',
    };
  }

  const isWalkable = (x: number, z: number): boolean => {
    if (!isInsideGrid(x, z)) return false;
    const cell = beliefGrid[z][x];

    if (isCellHighBarrier(cell)) return false;

    if (isCellSolidObstacle(cell)) {
      // Aerial VTOL drones fly over rubble, collapsed passages, and staircases
      if (caps?.aerial) return true;
      // Heavy-lift breachers can clear moderate rubble (not solid collapsed slabs)
      if (caps?.heavyLift && cell === 'rubble') return true;
      return false;
    }

    if (isCellWater(cell)) {
      if (caps?.waterproof || caps?.aerial) return true;
      return false;
    }

    if (cell === 'chemical_hazard') {
      if (allowHazard || caps?.hazmatShield || caps?.aerial) return true;
      return false;
    }

    if (!allowHazard && isCellHazard(cell)) return false;
    if (!allowHazard && avoidCells.has(`${x},${z}`)) return false;
    return true;
  };

  if (!isWalkable(goal.x, goal.z)) {
    return {
      valid: false,
      waypoints: [],
      distanceMeters: 0,
      estimatedBatteryCost: 0,
      reason: `Target (${goal.x}, ${goal.z}) is obstructed or marked impassable (${beliefGrid[goal.z][goal.x]}).`,
    };
  }

  const openList: AStarNode[] = [];
  const gScore = new Map<string, number>();
  const closed = new Set<string>();

  const heuristic = (ax: number, az: number, bx: number, bz: number) =>
    Math.hypot(bx - ax, bz - az);

  const startKey = coordKey(start);
  gScore.set(startKey, 0);
  openList.push({
    x: start.x,
    z: start.z,
    g: 0,
    f: heuristic(start.x, start.z, goal.x, goal.z),
  });

  const hazardPenalty = (x: number, z: number): number => {
    // Encourage slight clearance around hazards when safe alternatives exist
    let penalty = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (isInsideGrid(nx, nz) && isCellHazard(beliefGrid[nz][nx])) {
          penalty += dx === 0 && dz === 0 ? 0.5 : 0.65;
        }
      }
    }
    return penalty;
  };

  while (openList.length > 0) {
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    const cKey = coordKey(current);

    if (current.x === goal.x && current.z === goal.z) {
      const rawPath: GridCoord[] = [];
      let cursor: AStarNode | undefined = current;
      while (cursor) {
        rawPath.unshift({ x: cursor.x, z: cursor.z });
        cursor = cursor.parent;
      }
      const waypoints = simplifyWaypoints(rawPath);
      const distanceMeters = computePathDistance(rawPath) * CELL_SIZE;
      const hazardTypes = new Set<string>();
      for (const p of rawPath) {
        const cell = beliefGrid[p.z][p.x];
        if (isCellHazard(cell)) {
          hazardTypes.add(cell);
        }
      }

      return {
        valid: true,
        waypoints,
        distanceMeters,
        estimatedBatteryCost: Number((distanceMeters * batteryCostPerMeter).toFixed(2)),
        passesThroughHazard: hazardTypes.size > 0,
        hazardTypesEncountered: Array.from(hazardTypes),
      };
    }

    closed.add(cKey);

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const nz = current.z + dir.dz;
      if (!isWalkable(nx, nz)) continue;

      // Prevent diagonal corner cutting past solid obstacles or hazards
      if (dir.dx !== 0 && dir.dz !== 0) {
        if (!isWalkable(current.x + dir.dx, current.z) || !isWalkable(current.x, current.z + dir.dz)) {
          continue;
        }
      }

      const nKey = `${nx},${nz}`;
      if (closed.has(nKey)) continue;

      const tentativeG = current.g + dir.cost + hazardPenalty(nx, nz);
      const prevG = gScore.get(nKey);
      if (prevG === undefined || tentativeG < prevG) {
        gScore.set(nKey, tentativeG);
        const f = tentativeG + heuristic(nx, nz, goal.x, goal.z);
        const existing = openList.find((n) => n.x === nx && n.z === nz);
        if (existing) {
          existing.g = tentativeG;
          existing.f = f;
          existing.parent = current;
        } else {
          openList.push({ x: nx, z: nz, g: tentativeG, f, parent: current });
        }
      }
    }
  }

  return {
    valid: false,
    waypoints: [],
    distanceMeters: 0,
    estimatedBatteryCost: 0,
    reason: `No valid collision-free path from (${start.x}, ${start.z}) to (${goal.x}, ${goal.z}).`,
  };
}

export function simplifyWaypoints(rawPath: GridCoord[]): GridCoord[] {
  if (rawPath.length <= 2) return rawPath;
  const result: GridCoord[] = [rawPath[0]];
  for (let i = 1; i < rawPath.length - 1; i++) {
    const prev = rawPath[i - 1];
    const curr = rawPath[i];
    const next = rawPath[i + 1];
    const dx1 = curr.x - prev.x;
    const dz1 = curr.z - prev.z;
    const dx2 = next.x - curr.x;
    const dz2 = next.z - curr.z;
    if (dx1 !== dx2 || dz1 !== dz2) {
      result.push(curr);
    }
  }
  result.push(rawPath[rawPath.length - 1]);
  return result;
}

export function computePathDistance(path: GridCoord[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return Number(total.toFixed(2));
}

export function estimateReturnToBaseCost(
  beliefGrid: CellType[][],
  from: GridCoord
): { distanceMeters: number; estimatedBatteryCost: number; reachable: boolean } {
  const route = calculateAStarPath(beliefGrid, from, BASE_COORD);
  if (!route.valid) {
    const direct = Math.hypot(BASE_COORD.x - from.x, BASE_COORD.z - from.z) * 1.4;
    return {
      distanceMeters: direct,
      estimatedBatteryCost: Number((direct * 0.6).toFixed(2)),
      reachable: false,
    };
  }
  return {
    distanceMeters: route.distanceMeters,
    estimatedBatteryCost: route.estimatedBatteryCost,
    reachable: true,
  };
}
