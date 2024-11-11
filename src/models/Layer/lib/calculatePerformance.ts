import { HeatTransferRates } from "../../Container/index.js";
import { GridPosition } from "../../Grid/index.js";
import { LayerFlowConditions } from "./calculateLocalFlow.js";

export interface ContainerState {
  position: GridPosition;
  heatTransfer: HeatTransferRates;
  initialTemp: number;
  finalTemp: number;
}

export interface LayerPerformance {
  averageCoolingEfficiency: number;
  uniformityIndex: number;
  totalHeatTransfer: number; // W
  averageTemperature: number; // °C
  temperatureVariation: number; // °C
  tcpi: number; // Turbulent Cooling Performance Index
  rowTemperatures: number[];
}

export function calculatePerformance(
  currentFlowConditions: LayerFlowConditions | null = null,
  states: ContainerState[],
  totalEnergyTransfer: number
): LayerPerformance {
  if (states.length === 0) {
    return {
      averageCoolingEfficiency: 0,
      uniformityIndex: 0,
      totalHeatTransfer: totalEnergyTransfer,
      averageTemperature: 0,
      temperatureVariation: 0,
      tcpi: 0,
      rowTemperatures: [],
    };
  }

  const finalTemps = states.map((state) => state.finalTemp);
  const avgTemp =
    finalTemps.reduce((sum, temp) => sum + temp, 0) / finalTemps.length;

  const tempVariance =
    finalTemps.reduce((sum, temp) => sum + Math.pow(temp - avgTemp, 2), 0) /
    finalTemps.length;

  const coolingRates = states.map((state) => {
    const targetTemp = currentFlowConditions?.inletTemperature ?? 0;
    const maxPossibleCooling = state.initialTemp - targetTemp;
    const actualCooling = state.initialTemp - state.finalTemp;

    return maxPossibleCooling > 0
      ? Math.max(0, Math.min(1, actualCooling / maxPossibleCooling))
      : 0;
  });

  const avgCoolingEfficiency =
    coolingRates.reduce((sum, rate) => sum + rate, 0) / coolingRates.length;

  // Calculate efficiency variation (σ_η)
  const efficiencyVariance =
    coolingRates.reduce(
      (sum, rate) => sum + Math.pow(rate - avgCoolingEfficiency, 2),
      0
    ) / coolingRates.length;
  const efficiencyStdDev = Math.sqrt(efficiencyVariance);

  // Calculate TCPI components from Section VI.1
  const turbulenceIntensity = currentFlowConditions?.turbulenceIntensity ?? 0;
  const beta = 0.1; // Turbulence impact factor
  const gamma = 0.2; // Variation penalty factor

  // E_factor(t) = (1 + β * I²) * E_baseline
  const energyFactor = (1 + beta * Math.pow(turbulenceIntensity, 2)) * 1.0;

  // TCPI(t) = η̄_cool/Ē_factor * (1 - γ * σ_η/η̄_cool)
  const tcpi =
    avgCoolingEfficiency > 0
      ? (avgCoolingEfficiency / energyFactor) *
        (1 - (gamma * efficiencyStdDev) / avgCoolingEfficiency)
      : 0;

  const uniformityIndex = avgTemp > 0 ? Math.sqrt(tempVariance) / avgTemp : 0;

  return {
    averageCoolingEfficiency: avgCoolingEfficiency,
    uniformityIndex,
    totalHeatTransfer: totalEnergyTransfer,
    averageTemperature: avgTemp,
    temperatureVariation: Math.sqrt(tempVariance),
    tcpi,
    rowTemperatures: [],
  };
}
