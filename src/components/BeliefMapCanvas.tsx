import { useEffect, useRef } from 'react';
import { MAP_HEIGHT, MAP_WIDTH } from '../shared/disasterMap';
import type { CellType, GridCoord, RobotStateSnapshot } from '../shared/types';

interface BeliefMapCanvasProps {
  beliefGrid: CellType[][];
  baseCoord: GridCoord;
  survivorCoord: GridCoord;
  relayCoord?: GridCoord;
  robots: RobotStateSnapshot[];
  waypoints: GridCoord[];
  survivorFound: boolean;
}

export function BeliefMapCanvas({
  beliefGrid,
  baseCoord,
  survivorCoord,
  relayCoord,
  robots,
  waypoints,
  survivorFound,
}: BeliefMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainCacheRef = useRef<{ canvas: HTMLCanvasElement; cells: string[] } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / MAP_WIDTH;
    const cellH = h / MAP_HEIGHT;

    let cache = terrainCacheRef.current;
    if (!cache || cache.canvas.width !== w || cache.canvas.height !== h) {
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      cache = { canvas: offscreen, cells: new Array(MAP_WIDTH * MAP_HEIGHT).fill('') };
      terrainCacheRef.current = cache;
    }

    let terrainDirty = false;
    for (let z = 0; z < MAP_HEIGHT && !terrainDirty; z++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (cache.cells[z * MAP_WIDTH + x] !== beliefGrid[z][x]) {
          terrainDirty = true;
          break;
        }
      }
    }

    if (terrainDirty) {
      const tCtx = cache.canvas.getContext('2d');
      if (tCtx) {
        tCtx.fillStyle = '#0d1015';
        tCtx.fillRect(0, 0, w, h);

        for (let z = 0; z < MAP_HEIGHT; z++) {
          for (let x = 0; x < MAP_WIDTH; x++) {
            const cell = beliefGrid[z][x];
            cache.cells[z * MAP_WIDTH + x] = cell;
            let color = '#171c24';
            if (cell === 'wall') color = '#475569';
            else if (cell === 'mountain_cliff') color = '#57534e';
            else if (cell === 'rubble') color = '#64748b';
            else if (cell === 'collapsed_passage') color = '#f97316';
            else if (cell === 'staircase') color = '#52525b';
            else if (cell === 'road') color = '#1e293b';
            else if (cell === 'bridge') color = '#78716c';
            else if (cell === 'building_interior') color = '#27303f';
            else if (cell === 'flood_water') color = '#0284c7';
            else if (cell === 'chemical_hazard') color = '#84cc16';
            else if (cell === 'electrical_hazard') color = '#eab308';
            else if (cell === 'unstable_zone') color = '#ef4444';
            else if (cell === 'charging_base') color = '#10b981';

            tCtx.fillStyle = color;
            tCtx.fillRect(x * cellW + 0.5, z * cellH + 0.5, cellW - 1, cellH - 1);
          }
        }
      }
    }

    ctx.drawImage(cache.canvas, 0, 0);

    // Charging Base
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((baseCoord.x - 1) * cellW, (baseCoord.z - 1) * cellH, cellW * 3, cellH * 3);

    // Relay Node
    if (relayCoord) {
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(relayCoord.x * cellW + 2, relayCoord.z * cellH + 2, cellW - 4, cellH - 4);
    }

    // Active A* Path
    const leadRobot = robots[0];
    if (waypoints.length > 0 && leadRobot) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((leadRobot.gridPos.x + 0.5) * cellW, (leadRobot.gridPos.z + 0.5) * cellH);
      for (const wp of waypoints) {
        ctx.lineTo((wp.x + 0.5) * cellW, (wp.z + 0.5) * cellH);
      }
      ctx.stroke();
    }

    // Survivor pin once discovered
    if (survivorFound) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(
        (survivorCoord.x + 0.5) * cellW,
        (survivorCoord.z + 0.5) * cellH,
        cellW * 0.45,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Render all deployed robot markers
    robots.forEach((robot, idx) => {
      const rx = (robot.gridPos.x + 0.5) * cellW;
      const rz = (robot.gridPos.z + 0.5) * cellH;
      ctx.save();
      ctx.translate(rx, rz);
      ctx.rotate(-robot.headingRad + Math.PI / 2);
      ctx.fillStyle = idx === 0 ? '#f97316' : '#10b981';
      ctx.beginPath();
      ctx.moveTo(cellW * 0.55, 0);
      ctx.lineTo(-cellW * 0.35, -cellH * 0.35);
      ctx.lineTo(-cellW * 0.35, cellH * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }, [beliefGrid, baseCoord, survivorCoord, relayCoord, robots, waypoints, survivorFound]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#9BA3B0]">
        <span>Fleet Belief Occupancy Map</span>
        <span className="font-mono-tabular">26m × 20m</span>
      </div>
      <canvas
        ref={canvasRef}
        width={338}
        height={260}
        className="w-full rounded border border-[#222934] bg-[#0D1015]"
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#9BA3B0]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981]" /> Base / Survivor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#0284c7]" /> Floodwater
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#84cc16]" /> Hazmat
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#eab308]" /> Electrical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-[#38bdf8]" /> A* Path
        </span>
      </div>
    </div>
  );
}
