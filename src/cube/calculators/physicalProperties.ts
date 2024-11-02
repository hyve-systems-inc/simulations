import { significant } from "../lib.js";

// Constants
const ABSOLUTE_ZERO = 273.15; // K
const STANDARD_PRESSURE = 101325; // Pa
const R_AIR = 287.058; // J/(kg·K)

/**
 * Calculate air density at given temperature
 * Reference: Section II, 2.1 - Used in Reynolds number calculation
 * Section IV, 4.1: "ρ [kg/m³]: Range: 1.1-1.3 kg/m³"
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 4 based on typical sensor accuracy)
 * @returns Density (kg/m³)
 */
export const calculateDensity = (
  temperature: number,
  precision: number = 4
): number => {
  if (temperature < -ABSOLUTE_ZERO) {
    throw new Error("Temperature cannot be below absolute zero");
  }

  const T = temperature + ABSOLUTE_ZERO;
  const result = STANDARD_PRESSURE / (R_AIR * T);
  return significant(result, precision);
};

/**
 * Calculate dynamic viscosity of air using Sutherland's formula
 * Reference: Section IV, 4.1 - Used in Reynolds number calculation
 * "μ [kg/m·s]: Range: 1.7-1.9 × 10⁻⁵ kg/m·s"
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 5 due to small magnitude)
 * @returns Dynamic viscosity (Pa·s)
 */
export const calculateViscosity = (
  temperature: number,
  precision: number = 5
): number => {
  const T = temperature + ABSOLUTE_ZERO;
  const mu0 = 1.825e-5; // Reference viscosity at 293.15 K (20°C)
  const T0 = 293.15; // Reference temperature (K)
  const S = 120; // Sutherland's constant for air (K)

  const result = mu0 * Math.pow(T / T0, 1.5) * ((T0 + S) / (T + S));
  return significant(result, precision);
};

/**
 * Calculate thermal conductivity of air
 * Reference: Section III, 3.2 - Critical for convective heat transfer
 * Used in heat transfer coefficient calculations
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 4 based on measurement accuracy)
 * @returns Thermal conductivity (W/(m·K))
 */
export const calculateThermalConductivity = (
  temperature: number,
  precision: number = 4
): number => {
  const result = 0.0242 + 7.73e-5 * temperature;
  return significant(result, precision);
};

/**
 * Calculate specific heat of air
 * Reference: Section II, 2.1 - Energy conservation equation
 * "cp,air: Range: ~1006 J/kg·K"
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 3 based on typical variation)
 * @returns Specific heat (J/(kg·K))
 */
export const calculateSpecificHeat = (
  temperature: number,
  precision: number = 6
): number => {
  const result = 1006.0 + 0.034 * temperature;
  return significant(result, precision);
};

/**
 * Calculate thermal diffusivity of air
 * Reference: Section VII, 2.2 - Used in Peclet number calculation
 * "α: thermal diffusivity in stability criteria"
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 3 due to compound calculation)
 * @returns Thermal diffusivity (m²/s)
 */
export const calculateDiffusivity = (
  temperature: number,
  precision: number = 3
): number => {
  const k = calculateThermalConductivity(temperature, undefined);
  const rho = calculateDensity(temperature, undefined);
  const cp = calculateSpecificHeat(temperature, undefined);

  const result = k / (rho * cp);
  return significant(result, precision);
};

/**
 * Calculate water vapor saturation pressure using improved Magnus formula
 * Reference: Section III, 2.3 - Evaporative cooling equation
 * "psat(T) = 610.78 * exp((17.27 * T)/(T + 237.3))"
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Number of significant figures (default 4 for humidity calculations)
 * @returns Saturation pressure (Pa)
 */
export const calculateSaturationPressure = (
  temperature: number,
  precision: number = 4
): number => {
  const A = 611.2;
  const B = 17.67;
  const C = 243.5;

  const result = A * Math.exp((B * temperature) / (temperature + C));
  return significant(result, precision);
};

/**
 * Calculate all physical properties for a given temperature
 * Reference: Section X - Model Parameters
 * Provides complete set of physical properties for system calculations
 *
 * @param temperature - Air temperature (°C)
 * @param precision - Optional decimal precision for all values
 * @returns Object containing all physical properties
 */
export const getProperties = (
  temperature: number,
  precision?: number
): PhysicalProperties => ({
  airDensity: calculateDensity(temperature, precision),
  airViscosity: calculateViscosity(temperature, precision),
  thermalConductivity: calculateThermalConductivity(temperature, precision),
  specificHeat: calculateSpecificHeat(temperature, precision),
  diffusivity: calculateDiffusivity(temperature, precision),
});

// Type definitions
export interface PhysicalProperties {
  airDensity: number; // kg/m³
  airViscosity: number; // Pa·s
  thermalConductivity: number; // W/(m·K)
  specificHeat: number; // J/(kg·K)
  diffusivity: number; // m²/s
}

// Example usage:
// const density = calculateDensity(20); // Uses default precision of 4
// const properties = getProperties(20); // Calculate all properties at 20°C
