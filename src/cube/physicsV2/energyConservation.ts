import { significant } from "../lib.js";

/**
 * Energy conservation calculations
 * References Section II
 */

/**
 * Calculate product energy rate of change
 * From Section II, equation 2.1:
 * mp,i,j * cp * dTp,i,j/dt = Qresp,i,j - Qconv,i,j - Qevap,i,j
 *
 * @param Qresp Respiration heat in W
 * @param Qconv Convective heat in W
 * @param Qevap Evaporative cooling in W
 * @param mass Product mass in kg
 * @param cp Specific heat capacity in J/(kg·K)
 * @param sigFigs Optional number of significant figures
 * @returns Temperature change rate in K/s
 */
export function productTemperatureRate(
  Qresp: number,
  Qconv: number,
  Qevap: number,
  mass: number,
  cp: number,
  sigFigs?: number
): number {
  const dTdt = (Qresp - Qconv - Qevap) / (mass * cp);
  return significant(dTdt, sigFigs);
}

/**
 * Calculate air energy rate of change
 * From Section II, equation 2.1:
 * ma,i * cp,air * dTa,i/dt = ṁa * cp,air * (Ta,i-1 - Ta,i) + Σj(Qp-a,i,j) + Qwalls,i - Qcool,i
 */
export function airTemperatureRate(
  massAir: number,
  cpAir: number,
  massFlow: number,
  TaIn: number,
  TaOut: number,
  QproductAir: number,
  Qwalls: number,
  Qcool: number,
  sigFigs?: number
): number {
  const dTadt =
    (massFlow * cpAir * (TaIn - TaOut) + QproductAir + Qwalls - Qcool) /
    (massAir * cpAir);
  return significant(dTadt, sigFigs);
}
