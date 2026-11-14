import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { parseInstructionDeterministic } from '../src/agents/commanderParser';
import { BASE_COORD, SECTORS, isCellHighBarrier, isCellSolidObstacle } from '../src/shared/disasterMap';
import { createRegionWorldMap } from '../src/shared/meridianWorldMaps';
import type {
  MissionDifficultyModifiers,
  MissionPriority,
  MissionPlan,
  MissionTask,
  RegionId,
  TaskType,
} from '../src/shared/types';

function snapToWalkable(
  x: number,
  z: number,
  allowHazard: boolean,
  regionId: RegionId = 'industrial_district'
): { x: number; z: number } {
  const cx = Math.max(1, Math.min(24, Math.round(x)));
  const cz = Math.max(1, Math.min(18, Math.round(z)));
  if (allowHazard) return { x: cx, z: cz };

  const grid = createRegionWorldMap(regionId).initialBeliefGrid;
  const cell = grid[cz][cx];
  if (!isCellHighBarrier(cell) && !isCellSolidObstacle(cell)) {
    return { x: cx, z: cz };
  }
  for (let r = 1; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.max(1, Math.min(24, cx + dx));
        const nz = Math.max(1, Math.min(18, cz + dz));
        const candidate = grid[nz][nx];
        if (!isCellHighBarrier(candidate) && !isCellSolidObstacle(candidate)) {
          return { x: nx, z: nz };
        }
      }
    }
  }
  return { ...BASE_COORD };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  return getGeminiClient() !== null;
}

const VALID_TASKS: TaskType[] = [
  'explore_sector',
  'search_area',
  'scan_surroundings',
  'avoid_zone',
  'return_to_base',
  'emergency_stop',
  'inspect_hazard',
  'restore_relay',
  'deliver_medical',
  'clear_debris',
  'hazmat_scan',
];

const VALID_PRIORITIES: MissionPriority[] = ['low', 'normal', 'high', 'critical'];

export interface InterpretMissionOptions {
  preferOffline?: boolean;
  useCloudAi?: boolean;
  regionId?: RegionId;
  fleetRobotIds?: string[];
  modifiers?: MissionDifficultyModifiers;
}

// Cache successful Gemini responses for identical instructions & circuit-break on 429 quota exhaustion
const GEMINI_PLAN_CACHE = new Map<string, MissionPlan>();
let geminiQuotaCooldownUntil = 0;

/**
 * Interprets a natural-language rescue commander instruction into a structured MissionPlan.
 * Uses Gemini 4 Hydrogen with strict JSON schema output when configured, and falls back
 * transparently to the deterministic local parser when offline, rate-limited, or unconfigured.
 */
export async function interpretMissionInstruction(
  instruction: string,
  missionId: string,
  preferOfflineOrOpts: boolean | InterpretMissionOptions = true
): Promise<{ plan: MissionPlan; warning?: string }> {
  const opts: InterpretMissionOptions =
    typeof preferOfflineOrOpts === 'boolean'
      ? { preferOffline: preferOfflineOrOpts }
      : preferOfflineOrOpts;
  // Default to local zero-quota deterministic execution like a standalone game;
  // Cloud AI is strictly opt-in via opts.useCloudAi === true.
  const useLocalOnly = opts.preferOffline !== false && opts.useCloudAi !== true;
  const regionId: RegionId = opts.regionId ?? 'industrial_district';
  const fleetRobotIds = opts.fleetRobotIds?.length ? opts.fleetRobotIds : ['robot_001'];

  const cleanInstruction = instruction.trim();
  if (!cleanInstruction) {
    throw new Error('Mission instruction cannot be empty.');
  }

  const regionMap = createRegionWorldMap(regionId, opts.modifiers);
  const deterministicFallback = () =>
    parseInstructionDeterministic(cleanInstruction, missionId, fleetRobotIds[0], {
      regionId,
      baseCoord: regionMap.baseCoord,
      survivorCoord: regionMap.survivorCoord,
      relayCoord: regionMap.relayCoord,
      medicalCoord: regionMap.medicalCoord,
      chemicalCoord: regionMap.chemicalHazardCells[0],
    });

  if (useLocalOnly) {
    return {
      plan: deterministicFallback(),
    };
  }

  const cacheKey = `${regionId}|${JSON.stringify(opts.modifiers ?? {})}|${fleetRobotIds.join(',')}|${cleanInstruction.toLowerCase()}`;
  const cached = GEMINI_PLAN_CACHE.get(cacheKey);
  if (cached) {
    return {
      plan: {
        ...cached,
        mission_id: missionId,
        objectives: cached.objectives.map((o, idx) => ({
          ...o,
          id: `${missionId}_task_${idx + 1}`,
          mission_id: missionId,
          status: 'pending',
        })),
      },
    };
  }

  const inQuotaCooldown = Date.now() < geminiQuotaCooldownUntil;
  const ai = inQuotaCooldown ? null : getGeminiClient();
  if (!ai) {
    return {
      plan: deterministicFallback(),
    };
  }

  const sectorContext =
    regionId === 'industrial_district'
      ? Object.values(SECTORS)
          .map(
            (s) =>
              `- sector_id="${s.id}" (${s.name}): center=(${s.center.x},${s.center.z}), desc="${s.description}"`
          )
          .join('\n')
      : `- active_region="${regionId}"\n- base_bay: (${regionMap.baseCoord.x},${regionMap.baseCoord.z})\n- survivor_pocket: (${regionMap.survivorCoord.x},${regionMap.survivorCoord.z})${
          regionMap.relayCoord
            ? `\n- relay_node: (${regionMap.relayCoord.x},${regionMap.relayCoord.z})`
            : ''
        }${
          regionMap.medicalCoord
            ? `\n- medical_drop: (${regionMap.medicalCoord.x},${regionMap.medicalCoord.z})`
            : ''
        }${
          regionMap.chemicalHazardCells[0]
            ? `\n- chemical_perimeter: (${regionMap.chemicalHazardCells[0].x},${regionMap.chemicalHazardCells[0].z})`
            : ''
        }`;

  const systemInstruction = `You are the Commander AI agent for RELAY 2.0, an open-world autonomous disaster-response robotics organization operating across Meridian.
Convert the human commander's natural-language instruction into a structured JSON mission plan.
NEVER output motor commands or velocities. Output only high-level mission objectives, task types, robot_id assignments (${fleetRobotIds.join(' or ')}), and target coordinates.

Active region (${regionId}, 26x20 grid, valid x: 1..24, z: 1..18):
${sectorContext}

Supported task types: explore_sector, search_area, scan_surroundings, avoid_zone, return_to_base, emergency_stop, inspect_hazard, restore_relay, deliver_medical, clear_debris, hazmat_scan.
Note:
- Home base is base_bay at (${regionMap.baseCoord.x}, ${regionMap.baseCoord.z}).
- In industrial_district, when searching for survivors, target northeast_bay (20, 5) after exploring eastern_corridor (16, 5), include scan_surroundings, and include return_to_base at (2, 3) when safe return is requested or implied.
- If the human explicitly commands entering or crossing an electrical/unstable hazard zone, set force_unsafe_override=true and task="inspect_hazard" so the independent Safety Agent can enforce safety rules.
- If the human asks to avoid a zone (like unstable area), include its sector_id in avoid_zones.`;

  try {
    const timeoutMs = 8000;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Commander instruction: "${cleanInstruction}"`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              avoid_zones: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              require_return_to_base: { type: Type.BOOLEAN },
              force_unsafe_override: { type: Type.BOOLEAN },
              objectives: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    robot_id: { type: Type.STRING },
                    task: { type: Type.STRING },
                    label: { type: Type.STRING },
                    sector: { type: Type.STRING },
                    target_x: { type: Type.INTEGER },
                    target_z: { type: Type.INTEGER },
                    priority: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: ['task', 'label', 'target_x', 'target_z', 'priority', 'rationale'],
                },
              },
            },
            required: [
              'title',
              'summary',
              'avoid_zones',
              'require_return_to_base',
              'force_unsafe_override',
              'objectives',
            ],
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Commander AI request timed out')), timeoutMs)
      ),
    ]);

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Empty response from Gemini Commander.');
    }

    const parsed = JSON.parse(rawText) as {
      title: string;
      summary: string;
      avoid_zones: string[];
      require_return_to_base: boolean;
      force_unsafe_override: boolean;
      objectives: Array<{
        robot_id?: string;
        task: string;
        label: string;
        sector?: string;
        target_x: number;
        target_z: number;
        priority: string;
        rationale: string;
      }>;
    };

    const forceUnsafe = Boolean(parsed.force_unsafe_override);

    const objectives: MissionTask[] = (parsed.objectives || []).map((obj, idx) => {
      const taskType: TaskType = VALID_TASKS.includes(obj.task as TaskType)
        ? (obj.task as TaskType)
        : 'explore_sector';
      const priority: MissionPriority = VALID_PRIORITIES.includes(obj.priority as MissionPriority)
        ? (obj.priority as MissionPriority)
        : 'normal';

      const target = snapToWalkable(
        obj.target_x ?? regionMap.baseCoord.x,
        obj.target_z ?? regionMap.baseCoord.z,
        forceUnsafe || taskType === 'inspect_hazard',
        regionId
      );

      const assignedRobot =
        obj.robot_id && fleetRobotIds.includes(obj.robot_id) ? obj.robot_id : fleetRobotIds[0];

      return {
        id: `${missionId}_task_${idx + 1}`,
        mission_id: missionId,
        robot_id: assignedRobot,
        task: taskType,
        label: obj.label || `Execute ${taskType}`,
        sector: obj.sector,
        target,
        priority,
        status: 'pending',
        rationale: obj.rationale || 'Structured by Commander AI.',
      };
    });

    if (objectives.length === 0) {
      return {
        plan: deterministicFallback(),
        warning: 'Gemini returned empty objective list; applied deterministic mission planner.',
      };
    }

    const planResult: MissionPlan = {
      mission_id: missionId,
      title: parsed.title || 'Autonomous Rescue Mission',
      original_instruction: cleanInstruction,
      provider: 'gemini',
      summary: parsed.summary || 'Mission parsed by Gemini Commander AI.',
      avoid_zones: Array.isArray(parsed.avoid_zones) ? parsed.avoid_zones : [],
      require_return_to_base: Boolean(parsed.require_return_to_base),
      force_unsafe_override: Boolean(parsed.force_unsafe_override),
      objectives,
    };

    GEMINI_PLAN_CACHE.set(cacheKey, planResult);
    return { plan: planResult };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unknown Gemini API error';
    const isQuotaError =
      rawMsg.includes('429') ||
      rawMsg.includes('RESOURCE_EXHAUSTED') ||
      rawMsg.toLowerCase().includes('quota') ||
      rawMsg.toLowerCase().includes('rate-limit');
    if (isQuotaError) {
      geminiQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
      return {
        plan: deterministicFallback(),
        warning: 'Cloud AI daily quota reached — running local deterministic Commander.',
      };
    }
    const shortMsg = rawMsg.length > 110 ? `${rawMsg.slice(0, 110)}...` : rawMsg;
    return {
      plan: deterministicFallback(),
      warning: `Cloud AI unavailable (${shortMsg}) — running local deterministic Commander.`,
    };
  }
}
