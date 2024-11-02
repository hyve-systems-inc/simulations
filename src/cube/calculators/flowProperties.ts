import { Position } from "../models/Position.js";
import { ZonalConfig } from "../models/Zone.js";
import { significant } from "../lib.js";
import * as physicalProps from "./physicalProperties.js";
import { ZonalState } from "../models/SystemState.js";

export interface FlowProperties {
  reynoldsNumber: number; // Dimensionless
  turbulenceIntensity: number; // Dimensionless
  flowDistribution: number; // Dimensionless
  hydraulicDiameter: number; // m
  velocity: number; // m/s
}

export interface VelocityProfile {
  axial: number; // Flow direction velocity (m/s)
  vertical: number; // Height direction velocity (m/s)
  lateral: number; // Width direction velocity (m/s)
}

// Constants from original FLOW_CONSTANTS
const BASE_INTENSITY_COEFF = 0.16;
const OBSTACLE_FACTOR = 1.2;
const DISTRIBUTION_FACTOR = 0.2;
const MIN_VELOCITY = 0.1;
const MAX_VELOCITY = 5.0;
const PROFILE_FACTOR = 0.1;
const BASE_PACKING = 0.8;
const SPECIFIC_SURFACE_AREA = 50;
const EDGE_RESTRICTION = 1.2;

/**
 * Calculate complete flow properties for a zone
 * Reference: Section IV - "Turbulent Flow Effects"
 * Primary calculation combining Reynolds number, turbulence, and flow distribution
 *
 * @param state - Current zone state
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Complete flow properties
 */
export const calculateFlowProperties = (
  state: ZonalState,
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): FlowProperties => {
  const hydraulicDiameter = calculateHydraulicDiameter(position, config);
  const velocity = calculateVelocityProfile(position, state.airTemp, config);
  const reynoldsNumber = calculateReynoldsNumber(state, position, config);
  const turbulenceIntensity = calculateTurbulenceIntensity(reynoldsNumber);
  const flowDistribution = calculateFlowDistribution(
    position,
    turbulenceIntensity,
    config
  );

  return {
    reynoldsNumber: significant(reynoldsNumber, precision),
    turbulenceIntensity: significant(turbulenceIntensity, precision),
    flowDistribution: significant(flowDistribution, precision),
    hydraulicDiameter: significant(hydraulicDiameter, precision),
    velocity: significant(velocity.axial, precision),
  };
};

/**
 * Calculate Reynolds number for flow conditions
 * Reference: Section IV, 4.1
 * "Re_local = (ρ * v * Dh)/μ"
 * Valid range: 4000-100000
 *
 * @param state - Current zone state
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 4)
 * @returns Reynolds number (dimensionless)
 */
export const calculateReynoldsNumber = (
  state: ZonalState,
  position: Position,
  config: ZonalConfig,
  precision: number = 4
): number => {
  const density = physicalProps.calculateDensity(state.airTemp);
  const viscosity = physicalProps.calculateViscosity(state.airTemp);
  const diameter = calculateHydraulicDiameter(position, config);
  const velocity = calculateVelocityProfile(
    position,
    state.airTemp,
    config
  ).axial;

  const result = (density * velocity * diameter) / viscosity;
  return significant(result, precision);
};

/**
 * Calculate turbulence intensity based on Reynolds number
 * Reference: Section IV, 4.1
 * "I = 0.16 * (Re_local)^(-1/8)"
 * Enhanced by obstacle factor for produce presence
 *
 * @param reynoldsNumber - Local Reynolds number
 * @param precision - Optional decimal precision (default 3)
 * @returns Turbulence intensity (dimensionless)
 */
export const calculateTurbulenceIntensity = (
  reynoldsNumber: number,
  precision: number = 3
): number => {
  const baseIntensity = BASE_INTENSITY_COEFF * Math.pow(reynoldsNumber, -1 / 8);
  const result = baseIntensity * OBSTACLE_FACTOR;
  return significant(result, precision);
};

/**
 * Calculate hydraulic diameter for a zone
 * Reference: Section IV, 4.1
 * Accounts for produce presence through packing factor
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Hydraulic diameter (m)
 */
export const calculateHydraulicDiameter = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const crossHeight = config.zoneDimensions.y / config.numLayers;
  const crossWidth = config.zoneDimensions.z / config.numPallets;

  const geometricArea = crossHeight * crossWidth;
  const geometricPerimeter = 2 * (crossHeight + crossWidth);

  const packingFactor = calculatePackingFactor(position, config);
  const voidFraction = 1 - packingFactor;

  const effectiveArea = geometricArea * voidFraction;
  const produceSurfaceArea = calculateProduceSurfaceArea(position, config);
  const effectivePerimeter = geometricPerimeter + produceSurfaceArea;

  const result = (4 * effectiveArea) / effectivePerimeter;
  return significant(result, precision);
};

/**
 * Calculate velocity profile in the zone
 * Reference: Section IV, 4.3
 * "εj = εmax * (1 - α*exp(-β*h/H))"
 * "vi,j = v0 * g(h/H) * h(x/L)"
 *
 * @param position - Zone position
 * @param temperature - Air temperature (°C)
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Velocity components in all directions (m/s)
 */
export const calculateVelocityProfile = (
  position: Position,
  temperature: number,
  config: ZonalConfig,
  precision: number = 3
): VelocityProfile => {
  const baseVelocity = calculateBaseVelocity(temperature, config);

  const axial = calculateAxialVelocityProfile(position, baseVelocity, config);
  const vertical = calculateVerticalVelocityProfile(
    position,
    baseVelocity,
    config
  );
  const lateral = calculateLateralVelocityProfile(
    position,
    baseVelocity,
    config
  );

  return {
    axial: significant(axial, precision),
    vertical: significant(vertical, precision),
    lateral: significant(lateral, precision),
  };
};

/**
 * Calculate flow distribution factor
 * Reference: Section IV, 4.3
 * Combines height, length, and lateral distribution effects
 * Enhanced by turbulence
 *
 * @param position - Zone position
 * @param turbulence - Local turbulence intensity
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Flow distribution factor (dimensionless)
 */
export const calculateFlowDistribution = (
  position: Position,
  turbulence: number,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const heightFactor = calculateHeightDistribution(position, config);
  const lengthFactor = calculateLengthDistribution(position, config);
  const lateralFactor = calculateLateralDistribution(position, config);

  const turbulenceEffect = 1 + DISTRIBUTION_FACTOR * turbulence;

  const result = heightFactor * lengthFactor * lateralFactor * turbulenceEffect;
  return significant(result, precision);
};
/**
 *
 * HELPER FUNCTIONS
 *
 */

/**
 * Calculate base velocity from system parameters
 * Reference: Section IV, 4.3
 * Base flow rate calculation accounting for density effects
 * Valid range: 0.5-5.0 m/s
 *
 * @param temperature - Air temperature (°C)
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Base velocity (m/s)
 */
export const calculateBaseVelocity = (
  temperature: number,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const density = physicalProps.calculateDensity(temperature);
  const crossSection = config.zoneDimensions.y * config.zoneDimensions.z;
  const massFlowRate = 0.5; // kg/s (typical for precooling, from Section V)

  const result = Math.max(
    MIN_VELOCITY,
    Math.min(MAX_VELOCITY, massFlowRate / (density * crossSection))
  );
  return significant(result, precision);
};

/**
 * Calculate axial velocity profile
 * Reference: Section IV, 4.3
 * Accounts for flow development and local restrictions
 *
 * @param position - Zone position
 * @param baseVelocity - Base flow velocity (m/s)
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Axial velocity component (m/s)
 */
export const calculateAxialVelocityProfile = (
  position: Position,
  baseVelocity: number,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const developmentFactor = 1 - Math.exp((-3 * position.i) / config.numZones);
  const restrictionFactor = calculateFlowRestriction(position, config);

  const result = (baseVelocity * developmentFactor) / restrictionFactor;
  return significant(result, precision);
};

/**
 * Calculate vertical velocity profile
 * Reference: Section IV, 4.3
 * "Parabolic profile with wall effects"
 *
 * @param position - Zone position
 * @param baseVelocity - Base flow velocity (m/s)
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Vertical velocity component (m/s)
 */
export const calculateVerticalVelocityProfile = (
  position: Position,
  baseVelocity: number,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const relativeHeight = (position.j + 0.5) / config.numLayers;
  const result =
    baseVelocity * 4 * relativeHeight * (1 - relativeHeight) * PROFILE_FACTOR;
  return significant(result, precision);
};

/**
 * Calculate lateral velocity profile
 * Reference: Section IV, 4.3
 * "Slight lateral flow due to non-uniform resistance"
 *
 * @param position - Zone position
 * @param baseVelocity - Base flow velocity (m/s)
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Lateral velocity component (m/s)
 */
export const calculateLateralVelocityProfile = (
  position: Position,
  baseVelocity: number,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const relativeLateral = (position.k + 0.5) / config.numPallets;
  const result = baseVelocity * Math.sin(Math.PI * relativeLateral) * 0.05;
  return significant(result, precision);
};

/**
 * Calculate packing factor for a specific position
 * Reference: Section IV, "Flow distribution patterns across container"
 * Accounts for height effect, compression, and edge effects
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Packing factor (dimensionless)
 */
export const calculatePackingFactor = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const heightEffect = 1 - 0.1 * (position.j / config.numLayers);
  const compressionEffect = 1 + 0.05 * (position.j / config.numLayers);
  const edgeEffect = position.isEdge(config) ? 0.9 : 1.0;

  const result = BASE_PACKING * heightEffect * compressionEffect * edgeEffect;
  return significant(result, precision);
};

/**
 * Calculate produce surface area contributing to flow resistance
 * Reference: Section IV, 4.1
 * "Additional wetted perimeter from produce surface"
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Surface area (m²)
 */
export const calculateProduceSurfaceArea = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const zoneVolume =
    config.zoneDimensions.x * config.zoneDimensions.y * config.zoneDimensions.z;
  const packingFactor = calculatePackingFactor(position, config);

  const result = SPECIFIC_SURFACE_AREA * zoneVolume * packingFactor;
  return significant(result, precision);
};

/**
 * Calculate flow restriction factor
 * Reference: Section IV, 4.3
 * "Account for produce configuration and local constrictions"
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Flow restriction factor (dimensionless)
 */
export const calculateFlowRestriction = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const baseRestriction = 1.0;
  const packingEffect = calculatePackingFactor(position, config);
  const geometricEffect = position.isEdge(config) ? EDGE_RESTRICTION : 1.0;

  const result = baseRestriction * packingEffect * geometricEffect;
  return significant(result, precision);
};

/**
 * Calculate height-based distribution factor
 * Reference: Section IV, 4.3
 * "Modified exponential profile"
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Height distribution factor (dimensionless)
 */
export const calculateHeightDistribution = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const relativeHeight = (position.j + 0.5) / config.numLayers;
  const result = 1 - Math.exp(-3 * relativeHeight);
  return significant(result, precision);
};

/**
 * Calculate length-based distribution factor
 * Reference: Section IV, 4.3
 * "Exponential decay along flow direction"
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Length distribution factor (dimensionless)
 */
export const calculateLengthDistribution = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const relativeLength = (position.i + 0.5) / config.numZones;
  const result = Math.exp(-relativeLength);
  return significant(result, precision);
};

/**
 * Calculate lateral distribution factor
 * Reference: Section IV, 4.3
 * "Parabolic distribution with edge effects"
 *
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Lateral distribution factor (dimensionless)
 */
export const calculateLateralDistribution = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const relativeLateral = (position.k + 0.5) / config.numPallets;
  const result = 1 - 0.3 * Math.pow(2 * relativeLateral - 1, 2);
  return significant(result, precision);
};

/**
 * Calculate cross-sectional area perpendicular to flow direction
 * Reference: Section I, 1.1 - "Cross-sectional area in flow direction"
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Flow area (m²)
 */
export const calculateFlowArea = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  // Calculate gross cross-sectional area
  const crossArea = config.zoneDimensions.y * config.zoneDimensions.z;

  // Account for packing factor reduction
  const packingFactor = calculatePackingFactor(position, config);
  const effectiveArea = crossArea * (1 - packingFactor);

  return significant(effectiveArea, precision);
};

/**
 * Calculate total flow area including all parallel channels
 * Reference: Section I, 1.1 - "Total system flow area"
 * @param position - Zone position
 * @param config - System configuration
 * @param precision - Optional decimal precision (default 3)
 * @returns Total flow area (m²)
 */
export const calculateTotalFlowArea = (
  position: Position,
  config: ZonalConfig,
  precision: number = 3
): number => {
  const singleArea = calculateFlowArea(position, config);
  const numParallelChannels = config.numLayers * config.numPallets;

  return significant(singleArea * numParallelChannels, precision);
};
