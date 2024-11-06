import { significant } from "../lib.js";

/**
 * Psychrometric calculations module
 * References Section III and IX
 */

/**
 * Calculate saturation vapor pressure
 * From Section III, equation 3.3:
 * psat(T) = 610.78 * exp((17.27 * T)/(T + 237.3))
 *
 * @param T - Temperature in °C
 * @param sigFigs - Optional number of significant figures
 * @returns Saturation pressure in Pascals
 */
export function saturationPressure(T: number, sigFigs?: number): number {
  const psat = 610.78 * Math.exp((17.27 * T) / (T + 237.3));
  return significant(psat, sigFigs);
}

/**
 * Calculate vapor pressure deficit
 * From Section III, equation 3.3:
 * VPD = psat(Tp,i,j) * aw - (wa,i * P)/(0.622 + wa,i)
 *
 * @param T - Temperature in °C
 * @param aw - Water activity (0-1)
 * @param wa - Humidity ratio (kg water/kg dry air)
 * @param P - Total pressure in Pa (default = 101325 Pa)
 * @param sigFigs - Optional number of significant figures
 * @returns Vapor pressure deficit in Pa
 */
export function vaporPressureDeficit(
  T: number,
  aw: number,
  wa: number,
  P: number = 101325,
  sigFigs?: number
): number {
  const psat = saturationPressure(T);
  const vPressureProduct = psat * aw;
  const vPressureAir = (wa * P) / (0.622 + wa);
  const vpd = vPressureProduct - vPressureAir;
  return significant(vpd, sigFigs);
}

/**
 * Check if humidity ratio is within physical bounds
 * From Section IX, constraint 9.1:
 * 0 ≤ wa,i ≤ wsat(Ta,i)
 *
 * @param wa - Actual humidity ratio
 * @param T - Temperature in °C
 * @returns boolean indicating if humidity is valid
 */
export function isHumidityValid(wa: number, T: number): boolean {
  const psat = saturationPressure(T);
  const P = 101325; // Standard atmospheric pressure
  const wsat = (0.622 * psat) / (P - psat); // Maximum possible humidity ratio
  return wa >= 0 && wa <= wsat;
}

/**
 * Calculate humidity ratio at saturation
 * Derived from psychrometric relations:
 * wsat = 0.622 * psat/(P - psat)
 * where 0.622 is the ratio of molecular weights of water vapor to dry air
 *
 * @param T Temperature in °C
 * @param P Total pressure in Pa (default = 101325 Pa)
 * @param sigFigs Optional number of significant figures
 * @returns Saturation humidity ratio in kg water/kg dry air
 * @throws Error if temperature would result in psat ≥ P
 */
export function saturationHumidityRatio(
  T: number,
  P: number = 101325,
  sigFigs?: number
): number {
  const psat = saturationPressure(T);

  // Check if saturation pressure would exceed total pressure
  if (psat >= P) {
    throw new Error("Saturation pressure cannot exceed total pressure");
  }

  const wsat = (0.622 * psat) / (P - psat);
  return significant(wsat, sigFigs);
}

/**
 * Calculate relative humidity
 * Derived from psychrometric relations:
 * RH = wa * P/((0.622 + wa) * psat)
 *
 * @param wa Actual humidity ratio in kg water/kg dry air
 * @param T Temperature in °C
 * @param P Total pressure in Pa (default = 101325 Pa)
 * @param sigFigs Optional number of significant figures
 * @returns Relative humidity as a fraction (0-1)
 * @throws Error if humidity ratio is negative
 */
export function relativeHumidity(
  wa: number,
  T: number,
  P: number = 101325,
  sigFigs?: number
): number {
  if (wa < 0) {
    throw new Error("Humidity ratio cannot be negative");
  }

  const psat = saturationPressure(T);
  const RH = (wa * P) / ((0.622 + wa) * psat);

  // Ensure RH doesn't exceed 1 due to numerical errors
  return significant(Math.min(RH, 1), sigFigs);
}
