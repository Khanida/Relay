import {
  BASE_COORD,
  MAP_HEIGHT,
  MAP_WIDTH,
  SURVIVOR_COORD,
  createDisasterMap,
  type DisasterMapData,
} from './disasterMap';
import type { CellType, GridCoord, MissionDifficultyModifiers, RegionId } from './types';

export interface RegionWorldMap extends DisasterMapData {
  regionId: RegionId;
  baseCoord: GridCoord;
  survivorCoord: GridCoord;
  relayCoord?: GridCoord;
  medicalCoord?: GridCoord;
  chemicalHazardCells: GridCoord[];
  floodCells: GridCoord[];
}

function emptyGrid(): CellType[][] {
  return Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, () => 'floor' as CellType)
  );
}

function fillRect(
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

function addPerimeter(grid: CellType[][]) {
  fillRect(grid, 0, 0, MAP_WIDTH - 1, 0, 'wall');
  fillRect(grid, 0, MAP_HEIGHT - 1, MAP_WIDTH - 1, MAP_HEIGHT - 1, 'wall');
  fillRect(grid, 0, 0, 0, MAP_HEIGHT - 1, 'wall');
  fillRect(grid, MAP_WIDTH - 1, 0, MAP_WIDTH - 1, MAP_HEIGHT - 1, 'wall');
}

/**
 * Generates region-specific ground-truth and initial-belief maps across all 7 Meridian zones.
 * Preserves exact Operation First Light layout for `industrial_district`.
 */
export function createRegionWorldMap(
  regionId: RegionId,
  modifiers?: MissionDifficultyModifiers
): RegionWorldMap {
  if (regionId === 'industrial_district' && !modifiers) {
    const base = createDisasterMap();
    return {
      ...base,
      regionId,
      baseCoord: { ...BASE_COORD },
      survivorCoord: { ...SURVIVOR_COORD },
      relayCoord: { x: 16, z: 5 },
      chemicalHazardCells: [],
      floodCells: [],
    };
  }

  if (regionId === 'industrial_district' && modifiers) {
    const base = createDisasterMap();
    const initialBeliefGrid = base.initialBeliefGrid.map((r) => [...r]);
    const groundTruthGrid = base.groundTruthGrid.map((r) => [...r]);
    const hiddenCollapsedCells = [...base.hiddenCollapsedCells];
    const electricalHazardCells = [...base.electricalHazardCells];
    const unstableZoneCells = [...base.unstableZoneCells];
    const chemicalHazardCells: GridCoord[] = [];
    const survivorCoord = modifiers.survivorCoord ? { ...modifiers.survivorCoord } : { ...SURVIVOR_COORD };
    const relayCoord = modifiers.relayCoord ? { ...modifiers.relayCoord } : { x: 16, z: 5 };
    const medicalCoord = modifiers.medicalCoord ? { ...modifiers.medicalCoord } : undefined;

    applyModifiersToGrids(
      initialBeliefGrid,
      groundTruthGrid,
      hiddenCollapsedCells,
      electricalHazardCells,
      unstableZoneCells,
      chemicalHazardCells,
      modifiers
    );

    return {
      regionId,
      groundTruthGrid,
      initialBeliefGrid,
      hiddenCollapsedCells,
      electricalHazardCells,
      unstableZoneCells,
      chemicalHazardCells,
      floodCells: [],
      baseCoord: { ...BASE_COORD },
      survivorCoord,
      relayCoord,
      medicalCoord,
    };
  }

  const initial = emptyGrid();
  addPerimeter(initial);
  fillRect(initial, 1, 2, 3, 4, 'charging_base');

  const electricalHazardCells: GridCoord[] = [];
  const unstableZoneCells: GridCoord[] = [];
  const chemicalHazardCells: GridCoord[] = [];
  const floodCells: GridCoord[] = [];
  const hiddenCollapsedCells: GridCoord[] = [];

  let survivorCoord: GridCoord = { x: 22, z: 5 };
  let relayCoord: GridCoord | undefined = { x: 14, z: 12 };
  let medicalCoord: GridCoord | undefined;

  if (regionId === 'meridian_city') {
    // Urban street grid with highways & commercial blocks
    fillRect(initial, 1, 5, 24, 6, 'road');
    fillRect(initial, 1, 13, 24, 14, 'road');
    fillRect(initial, 7, 1, 8, 18, 'road');
    fillRect(initial, 18, 1, 19, 18, 'road');

    // Commercial tower footprints
    fillRect(initial, 10, 2, 16, 4, 'wall');
    fillRect(initial, 10, 8, 16, 11, 'wall');
    fillRect(initial, 11, 9, 15, 10, 'building_interior'); // accessible lobby
    initial[11][13] = 'floor'; // south doorway
    fillRect(initial, 20, 2, 23, 4, 'wall');
    fillRect(initial, 20, 8, 23, 11, 'wall');

    // Downed power line electrical hazard on main boulevard
    for (const c of [
      { x: 12, z: 5 },
      { x: 13, z: 5 },
      { x: 12, z: 6 },
    ]) {
      initial[c.z][c.x] = 'electrical_hazard';
      electricalHazardCells.push(c);
    }
    initial[15][10] = 'rubble';
    initial[15][11] = 'rubble';

    // Hidden fallen streetlight/scaffold blocking 18-19 avenue at z=5..6
    hiddenCollapsedCells.push({ x: 18, z: 5 }, { x: 18, z: 6 });
    relayCoord = { x: 13, z: 13 };
    medicalCoord = { x: 21, z: 14 };
    survivorCoord = { x: 22, z: 6 };
  } else if (regionId === 'old_quarter') {
    // Historic alleys + flooded central canal
    fillRect(initial, 1, 9, 24, 12, 'flood_water');
    // Narrow stone bridges (south bridge open, north bridge collapsed!)
    fillRect(initial, 19, 9, 20, 12, 'bridge');
    fillRect(initial, 9, 9, 10, 12, 'bridge');
    for (let z = 9; z <= 12; z++) {
      for (let x = 1; x <= 24; x++) {
        if (initial[z][x] === 'flood_water') floodCells.push({ x, z });
      }
    }

    // Historic townhouses
    fillRect(initial, 6, 2, 8, 6, 'wall');
    fillRect(initial, 12, 2, 16, 6, 'wall');
    fillRect(initial, 6, 15, 10, 17, 'wall');
    fillRect(initial, 14, 15, 17, 17, 'wall');

    // Hidden collapsed archway blocking bridge at (9..10, 10)
    hiddenCollapsedCells.push({ x: 9, z: 10 }, { x: 10, z: 10 });
    for (const c of [
      { x: 15, z: 13 },
      { x: 16, z: 13 },
    ]) {
      initial[c.z][c.x] = 'unstable_zone';
      unstableZoneCells.push(c);
    }
    survivorCoord = { x: 22, z: 15 };
    relayCoord = { x: 18, z: 5 };
  } else if (regionId === 'port_meridian') {
    // Harbor dockside road + shipping container stacks
    fillRect(initial, 1, 16, 24, 18, 'flood_water');
    for (let x = 1; x <= 24; x++) {
      for (let z = 16; z <= 18; z++) floodCells.push({ x, z });
    }
    fillRect(initial, 1, 6, 24, 7, 'road');
    fillRect(initial, 1, 13, 24, 14, 'road');

    // Shipping container rows
    fillRect(initial, 7, 2, 10, 4, 'wall');
    fillRect(initial, 13, 2, 16, 4, 'wall');
    fillRect(initial, 8, 9, 11, 11, 'wall');
    fillRect(initial, 15, 9, 18, 11, 'wall');

    // Chemical tanker spill zone
    for (const c of [
      { x: 12, z: 9 },
      { x: 13, z: 9 },
      { x: 12, z: 10 },
      { x: 13, z: 10 },
    ]) {
      initial[c.z][c.x] = 'chemical_hazard';
      chemicalHazardCells.push(c);
    }
    hiddenCollapsedCells.push({ x: 14, z: 6 }, { x: 14, z: 7 });
    survivorCoord = { x: 22, z: 10 };
    relayCoord = { x: 20, z: 4 };
  } else if (regionId === 'highland_province') {
    // Mountain switchback road + cliff faces
    fillRect(initial, 1, 5, 24, 6, 'road');
    fillRect(initial, 1, 13, 24, 14, 'road');
    fillRect(initial, 6, 1, 11, 4, 'mountain_cliff');
    fillRect(initial, 14, 1, 19, 4, 'mountain_cliff');
    fillRect(initial, 9, 8, 16, 11, 'mountain_cliff');
    fillRect(initial, 6, 16, 12, 18, 'mountain_cliff');

    for (const c of [
      { x: 15, z: 15 },
      { x: 16, z: 15 },
      { x: 16, z: 16 },
    ]) {
      initial[c.z][c.x] = 'unstable_zone';
      unstableZoneCells.push(c);
    }
    hiddenCollapsedCells.push({ x: 13, z: 5 }, { x: 13, z: 6 });
    survivorCoord = { x: 22, z: 4 };
    relayCoord = { x: 20, z: 13 };
  } else if (regionId === 'desert_corridor') {
    // Arid solar substation highway
    fillRect(initial, 1, 8, 24, 10, 'road');
    fillRect(initial, 8, 2, 11, 5, 'wall');
    fillRect(initial, 15, 2, 18, 5, 'wall');
    fillRect(initial, 8, 13, 12, 16, 'wall');
    for (const c of [
      { x: 13, z: 12 },
      { x: 14, z: 12 },
    ]) {
      initial[c.z][c.x] = 'electrical_hazard';
      electricalHazardCells.push(c);
    }
    hiddenCollapsedCells.push({ x: 14, z: 8 }, { x: 14, z: 9 }, { x: 14, z: 10 });
    relayCoord = { x: 21, z: 5 };
    survivorCoord = { x: 22, z: 14 };
  } else {
    // Research Valley — ARIA-Net Campus
    fillRect(initial, 1, 9, 24, 10, 'road');
    fillRect(initial, 7, 2, 11, 7, 'wall');
    fillRect(initial, 14, 2, 18, 7, 'wall');
    fillRect(initial, 7, 12, 11, 17, 'wall');
    fillRect(initial, 14, 12, 18, 17, 'wall');
    // Walkway doors
    initial[5][11] = 'floor';
    initial[5][14] = 'floor';

    for (const c of [
      { x: 12, z: 4 },
      { x: 13, z: 4 },
    ]) {
      initial[c.z][c.x] = 'electrical_hazard';
      electricalHazardCells.push(c);
    }
    for (const c of [
      { x: 12, z: 14 },
      { x: 13, z: 14 },
    ]) {
      initial[c.z][c.x] = 'chemical_hazard';
      chemicalHazardCells.push(c);
    }
    hiddenCollapsedCells.push({ x: 13, z: 9 }, { x: 13, z: 10 });
    relayCoord = { x: 19, z: 5 };
    survivorCoord = { x: 22, z: 9 };
  }

  if (modifiers?.survivorCoord) survivorCoord = { ...modifiers.survivorCoord };
  if (modifiers?.relayCoord) relayCoord = { ...modifiers.relayCoord };
  if (modifiers?.medicalCoord) medicalCoord = { ...modifiers.medicalCoord };

  const groundTruthGrid = initial.map((r) => [...r]);
  for (const c of hiddenCollapsedCells) {
    groundTruthGrid[c.z][c.x] = 'collapsed_passage';
  }

  if (modifiers) {
    applyModifiersToGrids(
      initial,
      groundTruthGrid,
      hiddenCollapsedCells,
      electricalHazardCells,
      unstableZoneCells,
      chemicalHazardCells,
      modifiers
    );
  }

  return {
    regionId,
    groundTruthGrid,
    initialBeliefGrid: initial,
    hiddenCollapsedCells,
    electricalHazardCells,
    unstableZoneCells,
    chemicalHazardCells,
    floodCells,
    baseCoord: { ...BASE_COORD },
    survivorCoord,
    relayCoord,
    medicalCoord,
  };
}

function applyModifiersToGrids(
  initialBeliefGrid: CellType[][],
  groundTruthGrid: CellType[][],
  hiddenCollapsedCells: GridCoord[],
  electricalHazardCells: GridCoord[],
  unstableZoneCells: GridCoord[],
  chemicalHazardCells: GridCoord[],
  modifiers: MissionDifficultyModifiers
) {
  const isProtectedCoord = (c: GridCoord) =>
    (c.x >= 1 && c.x <= 3 && c.z >= 2 && c.z <= 4) ||
    (modifiers.survivorCoord && c.x === modifiers.survivorCoord.x && c.z === modifiers.survivorCoord.z) ||
    (modifiers.relayCoord && c.x === modifiers.relayCoord.x && c.z === modifiers.relayCoord.z) ||
    (modifiers.medicalCoord && c.x === modifiers.medicalCoord.x && c.z === modifiers.medicalCoord.z);

  const inBounds = (c: GridCoord) => c.x > 0 && c.x < MAP_WIDTH - 1 && c.z > 0 && c.z < MAP_HEIGHT - 1;

  for (const c of modifiers.extraRubble ?? []) {
    if (inBounds(c) && !isProtectedCoord(c)) {
      initialBeliefGrid[c.z][c.x] = 'rubble';
      groundTruthGrid[c.z][c.x] = 'rubble';
    }
  }
  for (const c of modifiers.extraElectrical ?? []) {
    if (inBounds(c) && !isProtectedCoord(c)) {
      initialBeliefGrid[c.z][c.x] = 'electrical_hazard';
      groundTruthGrid[c.z][c.x] = 'electrical_hazard';
      electricalHazardCells.push(c);
    }
  }
  for (const c of modifiers.extraUnstable ?? []) {
    if (inBounds(c) && !isProtectedCoord(c)) {
      initialBeliefGrid[c.z][c.x] = 'unstable_zone';
      groundTruthGrid[c.z][c.x] = 'unstable_zone';
      unstableZoneCells.push(c);
    }
  }
  for (const c of modifiers.extraChemical ?? []) {
    if (inBounds(c) && !isProtectedCoord(c)) {
      initialBeliefGrid[c.z][c.x] = 'chemical_hazard';
      groundTruthGrid[c.z][c.x] = 'chemical_hazard';
      chemicalHazardCells.push(c);
    }
  }
  for (const c of modifiers.extraHiddenCollapses ?? []) {
    if (inBounds(c) && !isProtectedCoord(c)) {
      groundTruthGrid[c.z][c.x] = 'collapsed_passage';
      hiddenCollapsedCells.push(c);
    }
  }
}
