// Physical constants for calculations
export const PHYSICS_CONSTANTS = {
  AIR_DENSITY: 1.225, // kg/m³ at standard conditions
  AIR_VISCOSITY: 1.81e-5, // kg/(m·s)
  SPECIFIC_HEAT_AIR: 1006, // J/(kg·K)
  HYDRAULIC_DIAMETER: 0.1, // m (typical for produce containers)
  MAX_FLOW_EFFICIENCY: 0.95,
  TURBULENCE_COEFFICIENT: 0.16,
  VERTICAL_FLOW_DECAY: 0.2, // m^-1
  BASE_HEAT_TRANSFER_COEFF: 25, // W/(m²·K)
  MIN_HEAT_TRANSFER_COEFF: 5, // W/(m²·K)
  FLOW_DISTRIBUTION_FACTOR: 0.85, // Account for flow bypassing
} as const;
