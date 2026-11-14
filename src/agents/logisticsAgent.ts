import { ROBOT_CATALOG, computeEffectiveRobotStats } from '../shared/gameCatalog';
import type {
  CampaignMissionDef,
  OwnedRobotState,
  WeatherType,
} from '../shared/types';

export interface LogisticsAdvisory {
  severity: 'nominal' | 'advisory' | 'warning';
  message: string;
  robotId?: string;
  estimatedRepairRc?: number;
}

export interface FleetReadinessReport {
  ready: boolean;
  deployedCount: number;
  advisories: LogisticsAdvisory[];
  totalRepairCostRc: number;
}

/**
 * Deterministic Logistics Agent.
 * Inspects fleet integrity, capability coverage against mission hazards/weather,
 * and computes maintenance repair cost projections.
 */
export function evaluateFleetLogistics(
  ownedRobots: OwnedRobotState[],
  mission?: CampaignMissionDef | null,
  weather: WeatherType = 'clear'
): FleetReadinessReport {
  const deployed = ownedRobots
    .filter((r) => r.deployment_slot === 1 || r.deployment_slot === 2)
    .sort((a, b) => (a.deployment_slot ?? 9) - (b.deployment_slot ?? 9));

  const advisories: LogisticsAdvisory[] = [];
  let totalRepairCostRc = 0;

  if (deployed.length === 0) {
    return {
      ready: false,
      deployedCount: 0,
      advisories: [
        {
          severity: 'warning',
          message: 'No robot assigned to Deployment Slot 1. Assign a unit in the Garage.',
        },
      ],
      totalRepairCostRc: 0,
    };
  }

  for (const unit of deployed) {
    const damage = Math.max(0, 100 - unit.integrity_pct);
    const repairCost = Math.ceil(damage * 2.5);
    totalRepairCostRc += repairCost;

    if (unit.integrity_pct < 65) {
      advisories.push({
        severity: 'warning',
        robotId: unit.robot_id,
        estimatedRepairRc: repairCost,
        message: `${unit.custom_name} hull integrity is at ${unit.integrity_pct.toFixed(0)}%. Repair recommended (${repairCost} RC).`,
      });
    } else if (unit.integrity_pct < 90) {
      advisories.push({
        severity: 'advisory',
        robotId: unit.robot_id,
        estimatedRepairRc: repairCost,
        message: `${unit.custom_name} shows minor field wear (${unit.integrity_pct.toFixed(0)}% integrity).`,
      });
    }

    const stats = computeEffectiveRobotStats(unit.robot_id, unit, weather);
    if ((weather === 'heavy_rain' || weather === 'thunderstorm' || weather === 'dust_storm') && stats.weatherResistance < 0.72) {
      advisories.push({
        severity: 'advisory',
        robotId: unit.robot_id,
        message: `${unit.custom_name} has ${(stats.weatherResistance * 100).toFixed(0)}% weather sealing against ${weather.replace('_', ' ')}. Sensor range will be degraded.`,
      });
    }
  }

  if (mission?.requiredCapability) {
    const req = mission.requiredCapability;
    const anyMatches = deployed.some((u) => {
      const stats = computeEffectiveRobotStats(u.robot_id, u, weather);
      return Boolean(stats.capabilities[req]);
    });

    if (!anyMatches) {
      const recs = mission.recommendedRobots
        .map((id) => ROBOT_CATALOG[id]?.codeName ?? id)
        .join(', ');
      advisories.push({
        severity: 'warning',
        message: `Mission requires "${req}" capability. Safety Agent will block non-compliant units from hazard cells. Recommended: ${recs} or equip matching module in Garage.`,
      });
    }
  }

  if (advisories.length === 0) {
    advisories.push({
      severity: 'nominal',
      message: `${deployed.length} active unit${deployed.length > 1 ? 's' : ''} verified mission-ready with full diagnostic clearance.`,
    });
  }

  return {
    ready: true,
    deployedCount: deployed.length,
    advisories,
    totalRepairCostRc,
  };
}
