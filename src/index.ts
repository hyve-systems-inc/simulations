import { writeFileSync } from "fs";
import { CubeParameters, SystemState } from "./energyCalcs/cube/cube.types.js";
import { Cube } from "./energyCalcs/cube/cube.js";

export const strawberryParameters: CubeParameters = {
  dimensions: {
    length: 3,
    width: 3,
    height: 3,
  },

  packingProperties: {
    // Typical values for field packed strawberries in plastic clamshells
    // stacked on pallets
    voidFraction: 0.25, // 45% air space considering packaging and stacking
    bulkDensity: 150, // kg/m³, accounts for product, packaging, and air spaces
    specificSurfaceArea: 5, // m²/m³, high due to individual berry surface area
    characteristicDimension: 0.025, // m, typical strawberry diameter
    tortuosity: 1.8, // Moderate tortuosity due to regular packing pattern
  },

  productProperties: {
    // Values specific to fresh strawberries
    cp: 3900, // J/kg·K, specific heat capacity of strawberries
    wpInitial: 0.92, // Initial moisture content (92% wet basis)
    rRef: 0.0086, // W/kg, reference respiration rate at 20°C
    k: 0.0867, // Temperature coefficient for respiration
    Tref: 20, // °C, reference temperature for respiration
    aw: 0.98, // Water activity of fresh strawberries
    trueDensity: 920, // kg/m³, density of strawberry tissue
  },

  systemProperties: {
    // Forced-air cooling system properties
    h0: 25, // W/m²·K, base heat transfer coefficient
    mAirFlow: 1, // kg/s, (~2250 m³/hr for 3m³ space)
    PcoolRated: 26376, // W, cooling capacity
    Tdp: 2, // °C, dew point temperature
    pressure: 101325, // Pa, standard atmospheric pressure
  },

  controlParams: {
    // Control system tuning for optimal cooling uniformity
    alpha: 0.15, // Moderate turbulence sensitivity
    beta: 0.25, // Energy factor coefficient
    gamma: 0.12, // Variance penalty factor
    TCPITarget: 0.85, // Target cooling performance index
  },
};

/**
 * Typical initial conditions for field-harvested strawberries
 */
export const startingConditions: SystemState = {
  Tp: 25, // °C, typical field temperature
  Ta: 25, // °C, starting air temperature
  wp: 0.92, // kg/kg, initial product moisture content
  wa: 0.008, // kg/kg, initial air humidity ratio at ~25°C, 50% RH
};

/**
 * Recommended operating conditions
 */
export const operatingConditions = {
  targetTemperature: 4, // °C, optimal storage temperature
  maxDuration: 10800, // seconds (3 hours max for precooling)
  maxMoistureTargetLoss: 0.02, // Maximum 2% moisture loss target
  optimalRelativeHumidity: 0.9, // 90% RH target in storage
};

const cube = new Cube(strawberryParameters, startingConditions);

const metrics = cube.getMetrics();
const state = cube.getCurrentState();
const states: any[] = [];
let i = 0;
while (i < 10) {
  const newState = cube.nextState();
  states.push(newState);
  i += 1;
}

writeFileSync(
  "./output.json",
  JSON.stringify(
    {
      startingConditions: { systemMetrics: metrics, initialState: state },
      timeSeries: states,
    },
    undefined,
    2
  )
);
