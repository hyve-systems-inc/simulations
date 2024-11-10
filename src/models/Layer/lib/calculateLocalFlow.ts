import { PHYSICS_CONSTANTS } from "../../constants.js";

export interface LayerFlowConditions {
  massFlowRate: number; // kg/s
  inletTemperature: number; // °C
  inletHumidity: number; // kg water/kg dry air
  ambientTemperature: number; // °C
}

export interface FlowDistribution {
  velocity: number; // m/s
  reynolds: number;
  turbulenceIntensity: number;
  effectiveHeatTransfer: number; // W/(m²·K)
}

export function calculateLocalFlow(
  crossSectionalArea: number,
  baseConditions: LayerFlowConditions,
  relativePosition: number // 0 to 1 from inlet to outlet along flow path
): FlowDistribution {
  // Calculate effective flow area accounting for flow distribution
  const effectiveArea =
    crossSectionalArea * PHYSICS_CONSTANTS.FLOW_DISTRIBUTION_FACTOR;

  // Calculate base velocity from mass flow rate
  const baseVelocity =
    baseConditions.massFlowRate /
    (PHYSICS_CONSTANTS.AIR_DENSITY * effectiveArea);

  // Calculate local flow distribution factor
  // Flow distribution now models lateral variation rather than vertical
  const flowDistributionFactor = 1 - 0.2 * relativePosition; // Linear reduction along flow path

  // Calculate local velocity
  const localVelocity = baseVelocity * flowDistributionFactor;

  // Calculate Reynolds number with minimum bound
  const reynolds = Math.max(
    2000,
    (PHYSICS_CONSTANTS.AIR_DENSITY *
      localVelocity *
      PHYSICS_CONSTANTS.HYDRAULIC_DIAMETER) /
      PHYSICS_CONSTANTS.AIR_VISCOSITY
  );

  // Calculate turbulence intensity with upper bound
  const turbulenceIntensity = Math.min(
    0.5,
    PHYSICS_CONSTANTS.TURBULENCE_COEFFICIENT * Math.pow(reynolds, -1 / 8)
  );

  // Calculate effective heat transfer coefficient with minimum bound
  const effectiveHeatTransfer = Math.max(
    PHYSICS_CONSTANTS.MIN_HEAT_TRANSFER_COEFF,
    PHYSICS_CONSTANTS.BASE_HEAT_TRANSFER_COEFF *
      flowDistributionFactor *
      Math.pow(reynolds / 5000, 0.8)
  );

  return {
    velocity: localVelocity,
    reynolds,
    turbulenceIntensity,
    effectiveHeatTransfer,
  };
}
