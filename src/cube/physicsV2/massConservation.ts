import { significant } from "../lib.js";

/**
 * Mass conservation calculations
 * References Section II
 */

/**
 * Calculate product moisture rate of change
 * From Section II, equation 2.2:
 * dwp,i,j/dt = -mevap,i,j/mp,i,j
 */
export function productMoistureRate(
  mevap: number,
  productMass: number,
  sigFigs?: number
): number {
  const dwdt = -mevap / productMass;
  return significant(dwdt, sigFigs);
}

/**
 * Calculate air moisture rate of change
 * From Section II, equation 2.2:
 * ma,i * dwa,i/dt = mevap,i - mdehum,i + mvent,i
 */
export function airMoistureRate(
  mevap: number,
  mdehum: number,
  mvent: number,
  airMass: number,
  sigFigs?: number
): number {
  const dwadt = (mevap - mdehum + mvent) / airMass;
  return significant(dwadt, sigFigs);
}
