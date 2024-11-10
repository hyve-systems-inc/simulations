import { PHYSICS_CONSTANTS } from "../../constants.js";
import { LayerFlowConditions } from "../../Layer/lib/calculateLocalFlow.js";

/**
 * Calculates the vertical flow efficiency at a given relative height.
 * Implementation of Section IV.3 equation:
 * εj = εmax * (1 - α*exp(-β*h/H))
 *
 * @param relativeHeight - Height position (0 to 1) from bottom to top
 * @param alpha - Flow reduction factor (default: 0.2)
 * @param beta - Vertical decay coefficient (default: 3.0)
 */
export function calculateVerticalEfficiency(
  relativeHeight: number,
  alpha: number = 0.2,
  beta: number = 3.0
): number {
  return (
    PHYSICS_CONSTANTS.MAX_FLOW_EFFICIENCY *
    (1 - alpha * Math.exp(-beta * relativeHeight))
  );
}

/**
 * Adjusts flow conditions based on vertical position in pallet.
 */
export function adjustFlowConditions(
  baseConditions: LayerFlowConditions,
  relativeHeight: number,
  currentAirTemp: number,
  currentAirHumidity: number,
  alpha?: number,
  beta?: number
): LayerFlowConditions {
  const verticalEfficiency = calculateVerticalEfficiency(
    relativeHeight,
    alpha,
    beta
  );

  return {
    ...baseConditions,
    massFlowRate: baseConditions.massFlowRate * verticalEfficiency,
    inletTemperature: currentAirTemp,
    inletHumidity: currentAirHumidity,
  };
}
