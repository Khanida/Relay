import { useEffect, useRef } from 'react';
import { BASE_COORD, MAP_HEIGHT, MAP_WIDTH, SURVIVOR_COORD } from '../shared/disasterMap';
import type { CellType, GridCoord } from '../shared/types';

interface BeliefMapCanvasProps {
  beliefGrid: CellType[][];
  robotGridPos: GridCoord;
  headingRad: number;
  waypoints: GridCoord[];
  survivorFound: boolean;
}

export function BeliefMapCanvas({
  beliefGrid,
  robotGridPos,
  headingRad,
  waypoints,
  survivorFound,
}: BeliefMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / MAP_WIDTH;
    const cellH = h / MAP_HEIGHT;

    ctx.fillStyle = '#0d1015';
    ctx.fillRect(0, 0, w, h);

    for (let z = 0; z < MAP_HEIGHT; z++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = beliefGrid[z][x];
        let color = '#171c24';
        if (cell === 'wall') color = '#475569';
        else if (cell === 'rubble') color = '#64748b';
        else if (cell === 'collapsed_passage') color = '#f97316'; // Discovered blockage
        else if (cell === 'staircase') color = '#52525b';
        else if (cell === 'electrical_hazard') color = '#eab308';
        else if (cell === 'unstable_zone') color = '#ef4444';
        else if (cell === 'charging_base') color = '#10b981';

        ctx.fillStyle = color;
        ctx.fillRect(x * cellW + 0.5, z * cellH + 0.5, cellW - 1, cellH - 1);
      }
    }

    // Draw Base label marker
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (BASE_COORD.x - 1) * cellW,
      (BASE_COORD.z - 1) * cellH,
      cellW * 3,
      cellH * 3
    );

    // Draw planned A* waypoints
    if (waypoints.length > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((robotGridPos.x + 0.5) * cellW, (robotGridPos.z + 0.5) * cellH);
      for (const wp of waypoints) {
        ctx.lineTo((wp.x + 0.5) * cellW, (wp.z + 0.5) * cellH);
      }
      ctx.stroke();
    }

    // Draw survivor marker only after perception discovers it
    if (survivorFound) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(
        (SURVIVOR_COORD.x + 0.5) * cellW,
        (SURVIVOR_COORD.z + 0.5) * cellH,
        cellW * 0.45,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Draw robot pose & heading arrow
    const rx = (robotGridPos.x + 0.5) * cellW;
    const rz = (robotGridPos.z + 0.5) * cellH;
    ctx.save();
    ctx.translate(rx, rz);
    ctx.rotate(-headingRad + Math.PI / 2);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(cellW * 0.55, 0);
    ctx.lineTo(-cellW * 0.35, -cellH * 0.35);
    ctx.lineTo(-cellW * 0.35, cellH * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [beliefGrid, robotGridPos, headingRad, waypoints, survivorFound]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#9BA3B0]">
        <span>Robot Belief Occupancy Map</span>
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
          <span className="w-2.5 h-2.5 rounded-xs bg-[#f97316]" /> Discovered Collapse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#eab308]" /> Electrical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#ef4444]" /> Unstable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-[#38bdf8]" /> A* Path
        </span>
      </div>
    </div>
  );
}
