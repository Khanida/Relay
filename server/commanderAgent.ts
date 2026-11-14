import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { parseInstructionDeterministic } from '../src/agents/commanderParser';
import { BASE_COORD, SECTORS, createDisasterMap, isCellSolidObstacle } from '../src/shared/disasterMap';
import type { MissionPlan, MissionTask, TaskType, MissionPriority } from '../src/shared/types';

const INITIAL_MAP = createDisasterMap().initialBeliefGrid;

function snapToWalkable(x: number, z: number, allowHazard: boolean): { x: number; z: number } {
  const cx = Math.max(1, Math.min(24, Math.round(x)));
  const cz = Math.max(1, Math.min(18, Math.round(z)));
  if (allowHazard) return { x: cx, z: cz };

  const cell = INITIAL_MAP[cz][cx];
  if (!isCellSolidObstacle(cell)) {
    return { x: cx, z: cz };
  }
  // Search outward up to radius 3 for nearest open floor cell
  for (let r = 1; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.max(1, Math.min(24, cx + dx));
        const nz = Math.max(1, Math.min(18, cz + dz));
        if (!isCellSolidObstacle(INITIAL_MAP[nz][nx])) {
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
];

const VALID_PRIORITIES: MissionPriority[] = ['low', 'normal', 'high', 'critical'];

/**
 * Interprets a natural-language rescue commander instruction into a structured MissionPlan.
 * Uses Gemini 4 Hydrogen with strict JSON schema output when configured, and falls back
 * transparently to the deterministic local parser when offline, timed out, or unconfigured.
 */
export async function interpretMissionInstruction(
  instruction: string,
  missionId: string,
  preferOffline = false
): Promise<{ plan: MissionPlan; warning?: string }> {
  const cleanInstruction = instruction.trim();
  if (!cleanInstruction) {
    throw new Error('Mission instruction cannot be empty.');
  }

  const ai = preferOffline ? null : getGeminiClient();
  if (!ai) {
    return {
      plan: parseInstructionDeterministic(cleanInstruction, missionId),
    };
  }

  const sectorContext = Object.values(SECTORS)
    .map(
      (s) =>
        `- sector_id="${s.id}" (${s.name}): center=(${s.center.x},${s.center.z}), desc="${s.description}"`
    )
    .join('\n');

  const systemInstruction = `You are the Commander AI agent for RELAY, an autonomous quadruped disaster-response robot simulation.
Convert the human commander's natural-language instruction into a structured JSON mission plan.
NEVER output motor commands or velocities. Output only high-level mission objectives and target coordinates.

Facility sectors (26x20 grid, valid x: 1..24, z: 1..18):
${sectorContext}

Note:
- Home base is base_bay at (2, 3).
- When searching for survivors, target northeast_bay (20, 5) after exploring eastern_corridor (16, 5), and include a scan_surroundings objective at (20, 5) plus return_to_base at (2, 3) if safe return is requested or implied.
- If the human explicitly commands entering or crossing a hazard zone (e.g. electrical_zone at (11,9) or unstable_zone at (16,16)), set force_unsafe_override=true and task="inspect_hazard" targeting that hazard center so the independent Safety Agent can evaluate and enforce safety rules.
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
        obj.target_x ?? BASE_COORD.x,
        obj.target_z ?? BASE_COORD.z,
        forceUnsafe || taskType === 'inspect_hazard'
      );

      return {
        id: `${missionId}_task_${idx + 1}`,
        mission_id: missionId,
        robot_id: 'robot_001',
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
        plan: parseInstructionDeterministic(cleanInstruction, missionId),
        warning: 'Gemini returned empty objective list; applied deterministic mission planner.',
      };
    }

    return {
      plan: {
        mission_id: missionId,
        title: parsed.title || 'Autonomous Rescue Mission',
        original_instruction: cleanInstruction,
        provider: 'gemini',
        summary: parsed.summary || 'Mission parsed by Gemini Commander AI.',
        avoid_zones: Array.isArray(parsed.avoid_zones) ? parsed.avoid_zones : [],
        require_return_to_base: Boolean(parsed.require_return_to_base),
        force_unsafe_override: Boolean(parsed.force_unsafe_override),
        objectives,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
    return {
      plan: parseInstructionDeterministic(cleanInstruction, missionId),
      warning: `Gemini Commander unavailable (${message}). Running deterministic Commander fallback.`,
    };
  }
}
