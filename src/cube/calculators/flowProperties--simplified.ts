import { significant } from "../lib.js";
import { ZonalConfig } from "../models/Zone.js";

/**
 * Core physical constants for flow calculations
 * Reference: Section IV - "Turbulent Flow Effects"
 */
export const FLOW_CONSTANTS = {
  // Flow resistance from Section IV "Pack_factor = BASE_FACTOR * height_effect * compression * edge_effect"
  BASE_RESISTANCE: 2.0, // Base flow resistance factor accounting for typical produce configuration

  // Turbulence model parameters from Section IV, 4.1: "I = 0.16 * (Re_local)^(-1/8)"
  TURBULENCE_COEFF: 0.16, // Base turbulence coefficient for empirical correlation

  // Heat transfer correlation from Section III, 3.2: "Convective Heat Transfer"
  NUSSELT_COEFF: 0.023, // Dittus-Boelter correlation coefficient
  REYNOLDS_EXP: 0.8, // Reynolds number exponent for turbulent flow
  PRANDTL_EXP: 0.4, // Prandtl number exponent for heating
} as const;

/**
 * Air properties required for flow calculations
 * Reference: Section X - "Model Parameters"
 */
export interface AirProperties {
  density: number; // Air density (kg/m³)
  viscosity: number; // Dynamic viscosity (Pa·s)
  conductivity: number; // Thermal conductivity (W/(m·K))
  prandtl: number; // Prandtl number (dimensionless)
}

/**
 * Flow properties calculated for each zone
 * Reference: Section IV - "Turbulent Flow Effects"
 */
export interface FlowProperties {
  velocity: number; // Bulk flow velocity (m/s)
  reynolds: number; // Reynolds number (dimensionless)
  turbulence: number; // Turbulence intensity (dimensionless)
  heatTransfer: number; // Heat transfer coefficient (W/m²K)
}

/**
 * Calculate hydraulic diameter for a zone
 * Reference: Section IV, 4.1 - "Local Turbulence"
 *
 * Physical basis:
 * - Treats flow path as equivalent circular duct
 * - Accounts for packing effects on flow area
 * - Uses wetted perimeter concept
 *
 * Dh = 4A/P where:
 * - A = flow area = total area * (1 - packing factor)
 * - P = wetted perimeter
 *
 * @param config - Zonal configuration containing dimensions and packing factor
 * @returns Hydraulic diameter (m)
 */
export function calculateHydraulicDiameter(config: ZonalConfig): number {
  const crossSection = config.zoneDimensions.y * config.zoneDimensions.z;
  const perimeter = 2 * (config.zoneDimensions.y + config.zoneDimensions.z);
  const packingFactor = config.packingFactor || 0.8;

  // Effective flow area accounting for packing
  const effectiveArea = crossSection * (1 - packingFactor);
  return (4 * effectiveArea) / perimeter;
}

/**
 * Calculate bulk flow velocity from mass flow rate
 * Reference: Section II, 2.2 - "Air Energy Balance"
 *
 * Based on mass conservation: ṁ = ρvA
 * Rearranged to: v = ṁ/(ρA)
 *
 * Constraints from Section IV:
 * - Minimum velocity ensures adequate forced convection
 * - Maximum velocity prevents produce damage
 *
 * @param massFlowRate - Mass flow rate of air (kg/s)
 * @param density - Air density (kg/m³)
 * @param area - Flow area (m²)
 * @returns Flow velocity (m/s)
 */
export function calculateVelocity(
  massFlowRate: number,
  density: number,
  area: number
): number {
  const velocity = massFlowRate / (density * area);
  return velocity;
}

/**
 * Calculate Reynolds number for the flow
 * Reference: Section IV, 4.1 - "Re_local = (ρ * v * Dh)/μ"
 *
 * Physical meaning:
 * - Ratio of inertial forces to viscous forces
 * - Determines flow regime (laminar vs turbulent)
 * - Key parameter for heat transfer correlations
 *
 * @param velocity - Flow velocity (m/s)
 * @param density - Air density (kg/m³)
 * @param diameter - Hydraulic diameter (m)
 * @param viscosity - Dynamic viscosity (Pa·s)
 * @returns Reynolds number (dimensionless)
 */
export function calculateReynolds(
  velocity: number,
  density: number,
  diameter: number,
  viscosity: number
): number {
  return (density * velocity * diameter) / viscosity;
}

/**
 * Calculate turbulence intensity
 * Reference: Section IV, 4.1 - "I = 0.16 * (Re_local)^(-1/8)"
 *
 * Physical basis:
 * - Empirical correlation for duct flow
 * - Decreases with increasing Reynolds number
 * - Minimum level ensures adequate mixing
 * - Enhanced by produce obstacles (OBSTACLE_FACTOR in original model)
 *
 * @param reynolds - Reynolds number
 * @returns Turbulence intensity (dimensionless)
 */
export function calculateTurbulence(
  reynolds: number,
  precision: number = 6
): number {
  const turbulence = 0.16 * Math.pow(reynolds, -0.125);
  return significant(turbulence, precision);
}

/**
 * Calculate convective heat transfer coefficient
 * Reference: Section III, 3.2 - "Convective Heat Transfer"
 *
 * Uses Dittus-Boelter correlation:
 * Nu = 0.023 * Re^0.8 * Pr^0.4
 * h = Nu * k/D
 *
 * Valid for:
 * - Turbulent flow (Re > 10000)
 * - 0.7 < Pr < 160
 * - Fully developed flow
 *
 * @param reynolds - Reynolds number
 * @param prandtl - Prandtl number
 * @param conductivity - Thermal conductivity (W/(m·K))
 * @param diameter - Hydraulic diameter (m)
 * @returns Heat transfer coefficient (W/m²K)
 */
export function calculateHeatTransfer(
  reynolds: number,
  prandtl: number,
  conductivity: number,
  diameter: number
): number {
  const nusselt =
    FLOW_CONSTANTS.NUSSELT_COEFF *
    Math.pow(reynolds, FLOW_CONSTANTS.REYNOLDS_EXP) *
    Math.pow(prandtl, FLOW_CONSTANTS.PRANDTL_EXP);

  return (nusselt * conductivity) / diameter;
}

/**
 * Calculate complete set of flow properties
 * Reference: Section IV - "Turbulent Flow Effects Analysis"
 *
 * Combines all core calculations:
 * 1. Geometric parameters (hydraulic diameter)
 * 2. Flow parameters (velocity, Reynolds number)
 * 3. Turbulence characteristics
 * 4. Heat transfer performance
 *
 * @param config - Zone configuration
 * @param massFlowRate - Air mass flow rate (kg/s)
 * @param airProps - Air physical properties
 * @returns Complete set of flow properties
 */
export function calculateFlowProperties(
  config: ZonalConfig,
  massFlowRate: number,
  airProps: AirProperties
): FlowProperties {
  // Calculate basic geometric parameters
  const diameter = calculateHydraulicDiameter(config);
  const area = (Math.PI * Math.pow(diameter, 2)) / 4;

  // Calculate primary flow properties
  const velocity = calculateVelocity(massFlowRate, airProps.density, area);

  // Calculate Reynolds number
  const reynolds = calculateReynolds(
    velocity,
    airProps.density,
    diameter,
    airProps.viscosity
  );

  // Calculate derived properties
  const turbulence = calculateTurbulence(reynolds);
  const heatTransfer = calculateHeatTransfer(
    reynolds,
    airProps.prandtl,
    airProps.conductivity,
    diameter
  );

  return {
    velocity,
    reynolds,
    turbulence,
    heatTransfer,
  };
}

/**
 * Calculate pressure drop across zone
 * Reference: Section IV - "Flow distribution patterns across container"
 *
 * Simplified Darcy-Weisbach approach:
 * ΔP = f * (ρv²/2)
 * where f = BASE_RESISTANCE * packingEffect
 *
 * Physical basis:
 * - Dynamic pressure (ρv²/2) captures basic flow energy
 * - BASE_RESISTANCE accounts for typical produce arrangement
 * - Simple packing correction maintains model consistency
 * - Neglects complex geometric effects for model simplicity
 *
 * @param velocity - Flow velocity (m/s)
 * @param density - Air density (kg/m³)
 * @param config - Zone configuration for packing factor
 * @returns Pressure drop (Pa)
 */
export function calculatePressureDrop(
  velocity: number,
  density: number,
  config: ZonalConfig
): number {
  // Simple correction for packing density
  const packingEffect = config.packingFactor || 0.8;
  const resistanceFactor = FLOW_CONSTANTS.BASE_RESISTANCE * (1 + packingEffect);

  const dynamicPressure = 0.5 * density * Math.pow(velocity, 2);
  return resistanceFactor * dynamicPressure;
}

/**
 * Calculate cross-sectional area available for flow
 * Reference: Section IV - "Flow distribution patterns across container"
 *
 * Accounts for:
 * - Geometric cross-section
 * - Packing factor reduction
 * - Produce arrangement effects
 *
 * @param config - Zone configuration
 * @returns Available flow area (m²)
 */
export function calculateFlowArea(config: ZonalConfig): number {
  const totalArea = config.zoneDimensions.y * config.zoneDimensions.z;
  const packingFactor = config.packingFactor || 0.8;
  return totalArea * (1 - packingFactor);
}

/**
 * Calculate Darcy friction factor
 * Reference: Section IV - "Flow Resistance"
 *
 * Uses:
 * - Laminar: f = 64/Re (Re < 2300)
 * - Turbulent smooth pipe: Blasius equation
 *   f = 0.316 * Re^(-0.25) (2300 < Re < 10⁵)
 * - Turbulent rough pipe: Colebrook-White equation
 *   1/√f = -2log₁₀(ε/3.7D + 2.51/Re*√f)
 *
 * @param reynolds - Reynolds number
 * @param hydraulicDiam - Hydraulic diameter (m)
 * @param roughness - Surface roughness (m), default 1.5e-6 (smooth pipe)
 * @returns Darcy friction factor (dimensionless)
 */
export function calculateFrictionFactor(
  reynolds: number,
  hydraulicDiam: number,
  roughness: number = 1.5e-6
): number {
  // Laminar flow
  if (reynolds < 2300) {
    return 64 / reynolds;
  }

  // Turbulent flow in smooth pipes (Blasius equation)
  if (reynolds < 1e5 && roughness < 1e-5) {
    return 0.316 * Math.pow(reynolds, -0.25);
  }

  // Turbulent flow in rough pipes (Colebrook-White equation)
  // Iterative solution
  const relativeRoughness = roughness / hydraulicDiam;
  let f = 0.02; // Initial guess

  // Newton-Raphson iteration
  for (let i = 0; i < 50; i++) {
    const sqrtF = Math.sqrt(f);
    const rhs =
      -2 * Math.log10(relativeRoughness / 3.7 + 2.51 / (reynolds * sqrtF));
    const fnew = Math.pow(1 / rhs, 2);

    if (Math.abs(fnew - f) < 1e-6) {
      return fnew;
    }
    f = fnew;
  }

  // Fallback to Blasius if iteration doesn't converge
  return 0.316 * Math.pow(reynolds, -0.25);
}

/**
 * Calculate total area available for heat transfer
 * Reference: Section III, 3.2 - "Convective Heat Transfer"
 *
 * Includes:
 * - Surface area of the produce (using packing factor)
 * - Wall surface area of the zone
 *
 * @param config - Zone configuration
 * @returns Total heat transfer area (m²)
 */
export function calculateHeatTransferArea(config: ZonalConfig): number {
  // Wall surface area (four sides of the duct)
  const wallArea =
    2 *
    (config.zoneDimensions.y + config.zoneDimensions.z) *
    config.zoneDimensions.x;

  // Produce surface area based on packing
  const packingFactor = config.packingFactor || 0.8;
  const volume =
    config.zoneDimensions.x * config.zoneDimensions.y * config.zoneDimensions.z;
  const specificSurfaceArea = 50; // m²/m³, typical for packed produce
  const produceArea = volume * packingFactor * specificSurfaceArea;

  return wallArea + produceArea;
}
