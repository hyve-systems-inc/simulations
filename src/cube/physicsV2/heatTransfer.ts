import { significant } from "../lib.js";

/**
 * Heat transfer calculations module for refrigeration system
 * References Section II and III of documentation
 */

/**
 * Calculate respiration heat generation
 * From Section III, equation 3.1:
 * R(T) = rRef * exp(k * (Tp,i,j - Tref))
 * Qresp,i,j = R(T) * mp,i,j * hResp
 *
 * @param T - Product temperature in °C
 * @param rRef - Reference respiration rate in W/kg
 * @param k - Temperature sensitivity coefficient in 1/K
 * @param Tref - Reference temperature in °C
 * @param mass - Product mass in kg
 * @param hResp - Specific respiration enthalpy in J/kg
 * @param sigFigs - Optional number of significant figures
 * @returns Respiration heat in Watts
 */
export function respirationHeat(
  T: number,
  rRef: number,
  k: number,
  Tref: number,
  mass: number,
  hResp: number,
  sigFigs?: number
): number {
  const R = rRef * Math.exp(k * (T - Tref));
  const Qresp = R * mass * hResp;
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
  h0: number,
  epsilon: number,
  TCPI: number,
  Re: number,
  area: number,
  Tp: number,
  Ta: number,
  sigFigs?: number
): number {
  // Simplified Reynolds number correction function
  const fRe = Math.pow(Re / 5000, 0.8); // Typical turbulent flow correlation

  const h = h0 * epsilon * TCPI * fRe;
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
