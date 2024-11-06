import { significant } from "../lib.js";

/**
 * Turbulent flow effects calculations
 * References Section IV
 */

/**
 * Calculate local Reynolds number
 * From Section IV, equation 4.1:
 * Re_local = (ρ * v * Dh)/μ
 */
export function reynoldsNumber(
  density: number,
  velocity: number,
  hydraulicDiameter: number,
  viscosity: number,
  sigFigs?: number
): number {
  const Re = (density * velocity * hydraulicDiameter) / viscosity;
  return significant(Re, sigFigs);
}

/**
 * Calculate turbulence intensity
 * From Section IV, equation 4.1:
 * I = 0.16 * (Re_local)^(-1/8)
 */
export function turbulenceIntensity(Re: number, sigFigs?: number): number {
  const I = 0.16 * Math.pow(Re, -0.125);
  return significant(I, sigFigs);
}

/**
 * Calculate effective heat transfer coefficient
 * From Section IV, equation 4.2:
 * h_eff(t) = h_mean * (1 + α * I * N(0,1))
 */
export function effectiveHeatTransfer(
  hMean: number,
  alpha: number,
  I: number,
  sigFigs?: number
): number {
  // Generate standard normal random number
  const N01 =
    Math.sqrt(-2 * Math.log(Math.random())) *
    Math.cos(2 * Math.PI * Math.random());
  const hEff = hMean * (1 + alpha * I * N01);
  return significant(hEff, sigFigs);
}
