import { significant } from "../lib.js";

/**
 * Heat transfer calculations module for refrigeration system
 * References Section II and III of documentation
 */

/**
 * Calculate respiration heat generation over a time step
 * From Section III, equation 3.1:
 * R(T) = rRef * exp(k * (Tp,i,j - Tref))
 * Qresp,i,j = R(T) * mp,i,j * hResp
 *
 * @param T - Product temperature in °C
 * @param rRef - Reference respiration rate in W/kg/h
 * @param k - Temperature sensitivity coefficient in 1/K
 * @param Tref - Reference temperature in °C
 * @param mass - Product mass in kg
 * @param hResp - Specific respiration enthalpy in J/kg
 * @param dt - Time step in seconds
 * @param sigFigs - Optional number of significant figures
 * @returns Respiration heat generated during dt in Joules
 */
export function respirationHeat(
  T: number,
  rRef: number,
  k: number,
  Tref: number,
  mass: number,
  hResp: number,
  dt: number,
  sigFigs?: number
): number {
  // Convert hourly rate to rate for current time step
  const dtHours = dt / 3600; // Convert seconds to hours

  // Calculate temperature-adjusted respiration rate
  const R = rRef * Math.exp(k * (T - Tref));

  // Calculate heat generated during this time step
  const Qresp = R * mass * hResp * dtHours;

  return significant(Qresp, sigFigs);
}

/**
 * Calculate convective heat transfer
 * From Section III, equation 3.2:
 * hi,j(t) = h0 * εj * TCPI(t) * f(Re_local)
 * Qconv,i,j = hi,j * Ap,i,j * (Tp,i,j - Ta,i)
 *
 * @param h0 - Base heat transfer coefficient in W/(m²·K)
 * @param epsilon - Position factor (0-1)
 * @param TCPI - Turbulent cooling performance index (0-1)
 * @param Re - Reynolds number
 * @param area - Heat transfer surface area in m²
 * @param Tp - Product temperature in °C
 * @param Ta - Air temperature in °C
 * @param sigFigs - Optional number of significant figures
 * @returns Convective heat transfer in Watts
 */
export function convectiveHeat(
  h0: number, // Base heat transfer coefficient
  epsilon: number, // Position factor
  TCPI: number, // Cooling performance index
  Re: number, // Reynolds number
  area: number, // Heat transfer surface area
  Tp: number, // Product temperature
  Ta: number, // Air temperature
  sigFigs?: number
): number {
  // Simplified Reynolds number correction
  const fRe = Math.pow(Re / 5000, 0.8);
  const h = h0 * epsilon * TCPI * fRe;

  // Positive when heat flows FROM product TO air (Tp > Ta)
  const Qconv = h * area * (Tp - Ta);
  return significant(Qconv, sigFigs);
}

/**
 * Calculate evaporative cooling
 * From Section III, equation 3.3:
 * mevap,i,j = (hm,i,j * Ap,i,j * fw * VPD)/(461.5 * (Tp,i,j + 273.15))
 * Qevap,i,j = mevap,i,j * λ
 *
 * @param hm - Mass transfer coefficient in m/s
 * @param area - Surface area in m²
 * @param fw - Wetness factor (0-1)
 * @param VPD - Vapor pressure deficit in Pa
 * @param T - Product temperature in °C
 * @param lambda - Latent heat of vaporization in J/kg
 * @param sigFigs - Optional number of significant figures
 * @returns Evaporative cooling heat in Watts
 */
export function evaporativeCooling(
  hm: number,
  area: number,
  fw: number,
  VPD: number,
  T: number,
  lambda: number,
  sigFigs?: number
): number {
  const mevap = (hm * area * fw * VPD) / (461.5 * (T + 273.15));
  const Qevap = mevap * lambda;
  return significant(Qevap, sigFigs);
}
