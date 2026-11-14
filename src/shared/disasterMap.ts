import type { CellType, GridCoord } from './types';

export const MAP_WIDTH = 26;
export const MAP_HEIGHT = 20;
export const CELL_SIZE = 1.0;

export const BASE_COORD: GridCoord = { x: 2, z: 3 };
export const SURVIVOR_COORD: GridCoord = { x: 22, z: 5 };

export interface SectorDefinition {
  id: string;
  name: string;
  center: GridCoord;
  searchWaypoints: GridCoord[];
  description: string;
}

export const SECTORS: Record<string, SectorDefinition> = {
  base_bay: {
    id: 'base_bay',
    name: 'West Launch & Charging Bay',
    center: { x: 2, z: 3 },
    searchWaypoints: [{ x: 2, z: 3 }],
    description: 'Home charging dock and safe staging area.',
  },
  central_concourse: {
    id: 'central_concourse',
    name: 'Central Concourse',
    center: { x: 8, z: 5 },
    searchWaypoints: [
      { x: 7, z: 5 },
      { x: 9, z: 10 },
    ],
    description: 'Main assembly hall with scattered concrete rubble.',
  },
  eastern_corridor: {
    id: 'eastern_corridor',
    name: 'Eastern Corridor',
    center: { x: 16, z: 5 },
    searchWaypoints: [
      { x: 11, z: 5 },
      { x: 16, z: 5 },
      { x: 19, z: 5 },
    ],
    description: 'Primary eastbound access corridor toward the fabrication wing.',
  },
  southern_bypass: {
    id: 'southern_bypass',
    name: 'Southern Maintenance Bypass',
    center: { x: 14, z: 13 },
    searchWaypoints: [
      { x: 9, z: 13 },
      { x: 14, z: 13 },
      { x: 19, z: 11 },
    ],
    description: 'Secondary service passage south of the electrical switchgear.',
  },
  northeast_bay: {
    id: 'northeast_bay',
    name: 'Northeast Fabrication Bay',
    center: { x: 20, z: 5 },
    searchWaypoints: [
      { x: 20, z: 6 },
      { x: 21, z: 4 },
      { x: 22, z: 7 },
    ],
    description: 'Partially collapsed manufacturing bay with suspected trapped personnel.',
  },
  electrical_zone: {
    id: 'electrical_zone',
    name: 'Switchgear Electrical Hazard',
    center: { x: 11, z: 9 },
    searchWaypoints: [{ x: 11, z: 9 }],
    description: 'Live severed high-voltage conduit on wet concrete.',
  },
  unstable_zone: {
    id: 'unstable_zone',
    name: 'Fractured South Stairwell',
    center: { x: 16, z: 16 },
    searchWaypoints: [{ x: 16, z: 16 }],
    description: 'Structurally unstable ceiling slab with high seismic vibration.',
  },
};

export interface DisasterMapData {
  groundTruthGrid: CellType[][];
  initialBeliefGrid: CellType[][];
  hiddenCollapsedCells: GridCoord[];
  electricalHazardCells: GridCoord[];
  unstableZoneCells: GridCoord[];
}

function createEmptyGrid(): CellType[][] {
  return Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, () => 'floor' as CellType)
  );
}

function setRect(
  grid: CellType[][],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  type: CellType
) {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (z >= 0 && z < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
        grid[z][x] = type;
      }
    }
  }
}

/**
 * Generates the Operation First Light industrial facility layout.
 *
 * Key design principle:
 * - `initialBeliefGrid` reflects pre-earthquake blueprints + known primary hazards.
 * - `groundTruthGrid` includes newly collapsed debris in the Eastern Corridor at (14,5)-(14,6)
 *   which blocks the direct eastbound route. The robot's depth LiDAR discovers this collapse
 *   only upon approaching it, forcing dynamic A* route replanning through the Southern Bypass!
 */
export function createDisasterMap(): DisasterMapData {
  const initialBelief = createEmptyGrid();

  // Outer perimeter walls
  setRect(initialBelief, 0, 0, MAP_WIDTH - 1, 0, 'wall');
  setRect(initialBelief, 0, MAP_HEIGHT - 1, MAP_WIDTH - 1, MAP_HEIGHT - 1, 'wall');
  setRect(initialBelief, 0, 0, 0, MAP_HEIGHT - 1, 'wall');
  setRect(initialBelief, MAP_WIDTH - 1, 0, MAP_WIDTH - 1, MAP_HEIGHT - 1, 'wall');

  // Charging & launch base pad at (2, 3)
  setRect(initialBelief, 1, 2, 3, 4, 'charging_base');

  // West bay divider wall with doorway at z=4..6
  setRect(initialBelief, 5, 1, 5, 3, 'wall');
  setRect(initialBelief, 5, 7, 5, 14, 'wall');

  // Eastern Corridor partition walls (upper bulkhead at z=3, lower bulkhead at z=7..8)
  // Leaving corridor at z=4..6 (which is clear on pre-quake blueprints!)
  setRect(initialBelief, 9, 1, 9, 3, 'wall');
  setRect(initialBelief, 18, 1, 18, 3, 'wall');
  setRect(initialBelief, 9, 3, 18, 3, 'wall');
  setRect(initialBelief, 9, 7, 18, 8, 'wall');

  // Structural pillars and rubble in Central Concourse
  initialBelief[10][7] = 'rubble';
  initialBelief[11][7] = 'rubble';
  initialBelief[15][6] = 'rubble';
  initialBelief[16][6] = 'rubble';
  initialBelief[4][10] = 'rubble';
  initialBelief[3][14] = 'rubble';

  // Broken staircase in central-south sector
  setRect(initialBelief, 13, 10, 15, 11, 'staircase');

  // Northeast Fabrication Bay partial bulkhead & debris (survivor sheltered at 22,5)
  setRect(initialBelief, 18, 9, 18, 11, 'wall');
  setRect(initialBelief, 20, 10, 23, 10, 'wall');
  initialBelief[3][21] = 'rubble';
  initialBelief[3][22] = 'rubble';
  initialBelief[8][22] = 'rubble';
  initialBelief[8][23] = 'rubble';
  initialBelief[5][24] = 'rubble';
  initialBelief[6][24] = 'rubble';

  // Known electrical hazard zone (severed switchgear) south of Eastern Corridor
  const electricalHazardCells: GridCoord[] = [
    { x: 10, z: 9 },
    { x: 11, z: 9 },
    { x: 11, z: 10 },
    { x: 12, z: 9 },
  ];
  for (const c of electricalHazardCells) {
    initialBelief[c.z][c.x] = 'electrical_hazard';
  }

  // Known unstable structural zone in far south sector
  const unstableZoneCells: GridCoord[] = [
    { x: 15, z: 15 },
    { x: 16, z: 15 },
    { x: 16, z: 16 },
    { x: 17, z: 16 },
  ];
  for (const c of unstableZoneCells) {
    initialBelief[c.z][c.x] = 'unstable_zone';
  }

  // Additional south-east rubble creating realistic narrow corridors
  initialBelief[15][11] = 'rubble';
  initialBelief[16][11] = 'rubble';
  initialBelief[14][20] = 'rubble';
  initialBelief[15][20] = 'rubble';

  // Clone initial belief into ground truth, then add undiscovered post-quake collapse!
  const groundTruthGrid: CellType[][] = initialBelief.map((row) => [...row]);

  // Dynamic hidden collapsed passage in Eastern Corridor at x=14, z=4..6!
  // On pre-quake blueprints this corridor looks open, so Navigation will plan through it first,
  // then robot LiDAR detects the fallen concrete beam and triggers real-time replanning via z=12..14!
  const hiddenCollapsedCells: GridCoord[] = [
    { x: 14, z: 4 },
    { x: 14, z: 5 },
    { x: 14, z: 6 },
  ];
  for (const c of hiddenCollapsedCells) {
    groundTruthGrid[c.z][c.x] = 'collapsed_passage';
  }

  return {
    groundTruthGrid,
    initialBeliefGrid: initialBelief,
    hiddenCollapsedCells,
    electricalHazardCells,
    unstableZoneCells,
  };
}

export function gridToWorld(coord: GridCoord): { x: number; z: number } {
  return {
    x: (coord.x - MAP_WIDTH / 2 + 0.5) * CELL_SIZE,
    z: (coord.z - MAP_HEIGHT / 2 + 0.5) * CELL_SIZE,
  };
}

export function worldToGrid(x: number, z: number): GridCoord {
  const gx = Math.floor(x / CELL_SIZE + MAP_WIDTH / 2);
  const gz = Math.floor(z / CELL_SIZE + MAP_HEIGHT / 2);
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - 1, gx)),
    z: Math.max(0, Math.min(MAP_HEIGHT - 1, gz)),
  };
}

export function isCellSolidObstacle(cell: CellType): boolean {
  return (
    cell === 'wall' ||
    cell === 'rubble' ||
    cell === 'collapsed_passage' ||
    cell === 'staircase'
  );
}

export function isCellHazard(cell: CellType): boolean {
  return cell === 'electrical_hazard' || cell === 'unstable_zone';
}
