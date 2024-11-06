import { Cube } from "./cube/modelV2/cube.js";
import {
  SystemParameters,
  SystemState,
} from "./cube/modelV2/systemEvolution.js";
import dotenv from "dotenv";
dotenv.config();

function randomTemp(base: number, variation: number): number {
  return base + (Math.random() * 2 - 1) * variation;
}

/**
 * Debug function to analyze energy flows
 */
export function debugEnergyFlows(state: SystemState, params: SystemParameters) {
  // 1. Calculate total cooling capacity
  const sensibleCooling =
    params.airFlow *
    params.airSpecificHeat *
    (state.airTemp[0] - params.coilTemp);

  // 2. Calculate heat flows for first zone as example
  const airTemp = state.airTemp[0];
  const productTemp = state.productTemp[0][0];
  const productMass = params.productMass[0][0];

  // Respiration heat (expected to be positive)
  const respHeat =
    params.respirationRate *
    Math.exp(
      params.respirationTempCoeff * (productTemp - params.respirationRefTemp)
    ) *
    productMass *
    params.respirationEnthalpy;

  // Convective heat transfer (positive when product is warmer than air)
  const convHeat =
    params.baseHeatTransfer *
    params.productArea[0][0] *
    (productTemp - airTemp);

  // Net energy flow
  const netFlow = respHeat - convHeat - sensibleCooling;

  return {
    temps: {
      product: productTemp,
      air: airTemp,
      coil: params.coilTemp,
    },
    flows: {
      respiration: respHeat,
      convection: convHeat,
      cooling: sensibleCooling,
      net: netFlow,
    },
    powers: {
      actual: state.coolingPower,
      available: params.maxCoolingPower,
      rated: params.ratedPower,
    },
  };
}

/**
 * Initialize a storage cube for cilantro with specific parameters
 * Container: 2.5m x 2.5m x 2.5m
 * Pallets: 4x (1.2m x 1m x 2.13m(7ft))
 * Product: Fresh cut cilantro in cardboard boxes
 * Initial temp: 18°C ± 1°C
 * Cooling capacity: 90,000 BTU
 */

// Calculate zones and layers based on physical arrangement
const zones = 2; // Split length into 2 zones
const layers = 3; // Split height into 3 layers for better resolution

// Initialize system parameters
const params: SystemParameters = {
  // Physical dimensions
  zones,
  layers,
  containerLength: 2.5,
  containerWidth: 2.5,
  containerHeight: 2.5,

  // Product properties - based on typical values for leafy greens
  productMass: Array(zones)
    .fill(0)
    .map(
      () => Array(layers).fill(100) // Approximately 100kg per section
    ),
  productArea: Array(zones)
    .fill(0)
    .map(
      () => Array(layers).fill(1.2) // Surface area per section in m²
    ),
  specificHeat: 3900, // J/(kg·K) for leafy vegetables
  waterActivity: 0.98, // High for fresh cilantro
  respirationRate: 0.15, // Higher than average due to fresh cut
  respirationTempCoeff: 0.1,
  respirationRefTemp: 5, // Reference temp for respiration
  respirationEnthalpy: 250,

  // Air properties
  airMass: Array(zones).fill(2.5), // Approximate air mass per zone
  airFlow: 0.5, // kg/s - moderate flow rate
  airSpecificHeat: 1006, // J/(kg·K)

  // Heat transfer properties
  baseHeatTransfer: 25, // W/(m²·K)
  positionFactor: Array(zones)
    .fill(0)
    .map(
      () =>
        Array(layers)
          .fill(0)
          .map((_, j) => 1 - j * 0.2) // Decreasing effectiveness with height
    ),
  evaporativeMassTransfer: 0.008, // m/s
  surfaceWetness: 0.9, // High for fresh product

  // Cooling system
  maxCoolingPower: 26_392.96, // 90,000 BTU in Watts
  ratedPower: 26_392.96, // Same as max for simplicity
  coilTemp: 2, // °C - Slightly above freezing

  // Control parameters
  TCPITarget: 0.9,
  alpha: 0.2,

  // Environmental parameters
  pressure: 101325, // Standard atmospheric pressure
  wallHeatTransfer: Array(zones).fill(50), // Moderate insulation
};

// Initialize system state
const state: SystemState = {
  // Initialize product temperatures with random variation
  productTemp: Array(zones)
    .fill(0)
    .map(() =>
      Array(layers)
        .fill(0)
        .map(() => randomTemp(18, 1))
    ),

  // Initialize product moisture (typical for fresh cilantro)
  productMoisture: Array(zones)
    .fill(0)
    .map(() => Array(layers).fill(0.9)),

  // Initialize air conditions
  airTemp: Array(zones).fill(18),
  airHumidity: Array(zones).fill(0.012), // High initial humidity

  // Initialize control variables
  TCPI: 0.9,
  coolingPower: 0, // Start with cooling off
  t: 0,
};

// Example usage and validation
const cube = new Cube(state, params);
const validation = cube.validateState();
console.log("Initial state validation:", validation);

// Monitor initial conditions
const energyBalance = cube.getEnergyBalance();
console.log("Initial energy balance:", energyBalance);

const moistureBalance = cube.getMoistureBalance();
console.log("Initial moisture balance:", moistureBalance);

const metrics = cube.getPerformanceMetrics();
console.log("Initial performance metrics:", metrics);

const getAverageTemp = () =>
  cube
    .getCurrentState()
    .productTemp.flat()
    .reduce((a, b) => a + b) /
  (cube.getParameters().zones * cube.getParameters().layers);

const initialAverageTemp = getAverageTemp();

for (let i = 0; i < Number(process.env.STEPS!); i++) {
  cube.nextDt();

  const currentAverageTemp = getAverageTemp();

  const stateSummary = {
    time: cube.getCurrentState().t,
    avgTemp: currentAverageTemp,
    cumulativeDt: Math.abs(initialAverageTemp - currentAverageTemp),
    coolingPower: cube.getCurrentState().coolingPower,
    TCPI: cube.getCurrentState().TCPI,
  };
  // console.log(debugEnergyFlows(cube.getCurrentState(), params));
  console.log(stateSummary);
}
