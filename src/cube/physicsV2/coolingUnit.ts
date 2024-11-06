import { significant } from "../lib.js";

/**
 * Cooling unit calculations
 * References Section V
 */

/**
 * Calculate sensible cooling
 * From Section V, equation 5.1:
 * Qcool,sensible = ṁair * cp,air * (Ta,i - Tcoil)
 */
export function sensibleCooling(
  massFlow: number,
  cpAir: number,
  TaIn: number,
  Tcoil: number,
  sigFigs?: number
): number {
  const Qsensible = massFlow * cpAir * (TaIn - Tcoil);
  return significant(Qsensible, sigFigs);
}

/**
 * Calculate dehumidification rate
 * From Section V, equation 5.2:
 * σ(x) = 0.5 * (1 + tanh(8x))
 * mdehum = ṁair * (wa,i - wsat(Tdp)) * σ((Ta,i - Tdp)/0.2) * σ((wa,i - wsat(Tdp))/0.00005)
 */
export function dehumidificationRate(
  massFlow: number,
  wa: number,
  wsatDp: number,
  Ta: number,
  Tdp: number,
  sigFigs?: number
): number {
  const sigma1 = 0.5 * (1 + Math.tanh((8 * (Ta - Tdp)) / 0.2));
  const sigma2 = 0.5 * (1 + Math.tanh((8 * (wa - wsatDp)) / 0.00005));
  const mdehum = massFlow * (wa - wsatDp) * sigma1 * sigma2;
  return significant(mdehum, sigFigs);
}

/**
 * Calculate actual cooling power
 * From Section V, equation 5.3:
 * Pcool,actual = Pcool,rated * (Qcool,i/Qcool,max)^(1/TCPI(t))
 */
export function actualCoolingPower(
  Prated: number,
  Qcool: number,
  Qmax: number,
  TCPI: number,
  sigFigs?: number
): number {
  const Pactual = Prated * Math.pow(Qcool / Qmax, 1 / TCPI);
  return significant(Pactual, sigFigs);
}
