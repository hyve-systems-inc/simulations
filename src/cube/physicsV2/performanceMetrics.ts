import { significant } from "../lib.js";

/**
 * Performance metrics calculations
 * References Section VIII
 */

/**
 * Calculate Cooling Rate Index
 * From Section VIII, equation 8.1:
 * CRIi,j = (Tp,i,j - Ta,i)/(Tp,initial - Ta,supply)
 */
export function coolingRateIndex(
  Tp: number,
  Ta: number,
  TpInitial: number,
  TaSupply: number,
  sigFigs?: number
): number {
  const CRI = (Tp - Ta) / (TpInitial - TaSupply);
  return significant(CRI, sigFigs);
}

/**
 * Calculate Uniformity Index
 * From Section VIII, equation 8.1:
 * UI = std_dev(SECT)/mean(SECT)
 */
export function uniformityIndex(SECT: number[], sigFigs?: number): number {
  const mean = SECT.reduce((a, b) => a + b) / SECT.length;
  const variance =
    SECT.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / SECT.length;
  const stdDev = Math.sqrt(variance);
  const UI = stdDev / mean;
  return significant(UI, sigFigs);
}

/**
 * Calculate Coefficient of Performance
 * From Section VIII, equation 8.2:
 * COP = (Qcool,sensible + Qcool,latent)/(Power input)
 */
export function coefficientOfPerformance(
  Qsensible: number,
  Qlatent: number,
  power: number,
  sigFigs?: number
): number {
  const COP = (Qsensible + Qlatent) / power;
  return significant(COP, sigFigs);
}
