import { precise } from "../../../lib.js";
import { LayerPerformance } from "../../Layer/lib/calculatePerformance.js";

export interface PalletPerformance {
  averageCoolingEfficiency: number;
  uniformityIndex: number;
  totalHeatTransfer: number;
  averageTemperature: number;
  temperatureVariation: number;
  layerPerformance: LayerPerformance[];
}

// Constants for precision control
export const PRECISION = {
  TEMPERATURE: 1000, // 3 decimal places
  EFFICIENCY: 10000, // 4 decimal places
  ENERGY: 100, // 2 decimal places
  UNIFORMITY: 10000, // 4 decimal places
} as const;

export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return precise(sum / values.length, PRECISION.TEMPERATURE);
}

/**
 * Using the formula: sqrt(sum((T - Tavg)^2)/n)
 */
export function calculateTemperatureVariation(
  temperatures: number[],
  averageTemp: number
): number {
  if (temperatures.length === 0) return 0;

  // Calculate sum of squared differences without rounding
  const sumSquaredDiffs = temperatures.reduce(
    (sum, temp) => sum + Math.pow(temp - averageTemp, 2),
    0
  );

  // Calculate variance and standard deviation in one step
  const stdDev = Math.sqrt(sumSquaredDiffs / temperatures.length);

  // Only round the final result
  return precise(stdDev, PRECISION.TEMPERATURE);
}

/**
 * Calculates uniformity index
 */
export function calculateUniformityIndex(
  temperatureVariation: number,
  averageTemperature: number
): number {
  if (averageTemperature === 0) return 0;

  const index = temperatureVariation / Math.abs(averageTemperature);
  return precise(index, PRECISION.UNIFORMITY);
}

export function createEmptyPerformance(): PalletPerformance {
  return {
    averageCoolingEfficiency: 0,
    uniformityIndex: 0,
    totalHeatTransfer: 0,
    averageTemperature: 0,
    temperatureVariation: 0,
    layerPerformance: [],
  };
}

/**
 * Calculates pallet performance
 */
export function calculatePalletPerformance(
  layerPerformance: LayerPerformance[],
  totalEnergyTransfer: number
): PalletPerformance {
  if (layerPerformance.length === 0) {
    return createEmptyPerformance();
  }

  // Extract raw values
  const coolingEfficiencies = layerPerformance.map(
    (perf) => perf.averageCoolingEfficiency
  );
  const temperatures = layerPerformance.map((perf) => perf.averageTemperature);

  // Calculate averages
  const avgTemp = calculateAverage(temperatures);
  const avgCoolingEfficiency = precise(
    calculateAverage(coolingEfficiencies),
    PRECISION.EFFICIENCY
  );

  // Calculate temperature variation using raw values
  const tempVariation = calculateTemperatureVariation(temperatures, avgTemp);

  // Calculate uniformity index using the final temperature values
  const uniformityIndex = calculateUniformityIndex(tempVariation, avgTemp);

  return {
    averageCoolingEfficiency: avgCoolingEfficiency,
    uniformityIndex,
    totalHeatTransfer: precise(totalEnergyTransfer, PRECISION.ENERGY),
    averageTemperature: avgTemp,
    temperatureVariation: tempVariation,
    layerPerformance,
  };
}
