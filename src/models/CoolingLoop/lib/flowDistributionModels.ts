import { PHYSICS_CONSTANTS } from "../../constants.js";

// types/FlowDistribution.ts
export interface FlowState {
  temperature: number;
  humidity: number;
  flowRate: number;
}

export interface FlowPosition {
  vertical: number; // Height position (0-1)
  horizontal: number; // Position along flow path (0-1)
  lateral: number; // Position across width (0-1)
}

export interface FlowDistributionResult {
  effectiveFlowRate: number;
  turbulenceIntensity: number;
  bypassFraction?: number; // Optional: for advanced models
  resistance?: number; // Optional: for advanced models
}

export interface FlowModelConfig {
  alpha: number; // Flow reduction factor
  beta: number; // Vertical decay coefficient
  // Future parameters can be added here
}

// Flow distribution calculations as pure functions
export const calculateBasicFlowDistribution = (
  baseFlow: FlowState,
  position: FlowPosition,
  config: FlowModelConfig
): FlowDistributionResult => {
  const verticalEfficiency = calculateVerticalEfficiency(
    position.vertical,
    config
  );
  const effectiveFlowRate = baseFlow.flowRate * verticalEfficiency;
  const reynolds = calculateReynolds(effectiveFlowRate);
  const turbulenceIntensity =
    PHYSICS_CONSTANTS.TURBULENCE_COEFFICIENT * Math.pow(reynolds, -1 / 8);

  return {
    effectiveFlowRate,
    turbulenceIntensity,
  };
};

// Helper functions are also pure
const calculateVerticalEfficiency = (
  height: number,
  config: FlowModelConfig
): number => {
  return (
    PHYSICS_CONSTANTS.MAX_FLOW_EFFICIENCY *
    (1 - config.alpha * Math.exp(-config.beta * height))
  );
};

const calculateReynolds = (flowRate: number): number => {
  return (
    (PHYSICS_CONSTANTS.AIR_DENSITY *
      flowRate *
      PHYSICS_CONSTANTS.HYDRAULIC_DIAMETER) /
    PHYSICS_CONSTANTS.AIR_VISCOSITY
  );
};

// Example of an advanced model as a pure function
export const calculateAdvancedFlowDistribution = (
  baseFlow: FlowState,
  position: FlowPosition,
  config: FlowModelConfig
): FlowDistributionResult => {
  // Get basic calculations first
  const basicResult = calculateBasicFlowDistribution(
    baseFlow,
    position,
    config
  );

  // Add advanced calculations
  return {
    ...basicResult,
    bypassFraction: 0, // To be implemented
    resistance: 0, // To be implemented
  };
};
