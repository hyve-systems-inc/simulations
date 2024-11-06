import { ZonalConfig } from "../models/Zone.js";
import { Position } from "../models/Position.js";
import {
  TransientState,
  TransientConfig,
  calculateTimeStep,
  updateTransientState,
  interpolatePressure,
} from "./transientFlowExtensions.js";
import * as flow from "./flowProperties--simplified.js";
import * as physical from "./physicalProperties.js";
import { CommodityProperties, PackagingConfig } from "../cube.js";

/**
 * Represents the complete state of the cooling system
 * Reference: Section I - System Overview
 */
export interface SystemState {
  time: number; // Current simulation time (s)
  zoneStates: TransientState[][][]; // State for each position (i,j,k)
  averageTemperature: number; // System average temperature (°C)
  coolingEffectiveness: number; // Overall cooling effectiveness [0-1]
  totalEnergyRemoved: number; // Cumulative energy removed (J)
  uniformityIndex: number; // Temperature uniformity metric
  commodity: CommodityProperties;
  packaging: PackagingConfig;
}

/**
 * Calculate next state for the entire cooling system
 * Reference: Section XI - "Numerical Solution Method"
 *
 * Algorithm:
 * 1. Calculate time step based on stability criteria
 * 2. Update each zone sequentially along flow path
 * 3. Calculate system-wide metrics
 * 4. Verify conservation principles
 *
 * @param currentState - Current system state
 * @param config - System configuration
 * @param transientConfig - Boundary conditions
 * @returns Next system state
 */
export function calculateNextSystemState(
  currentState: SystemState,
  config: ZonalConfig,
  transientConfig: TransientConfig,
  commodity: CommodityProperties,
  packaging: PackagingConfig
): SystemState {
  // Calculate air properties at average system temperature
  const airProps: flow.AirProperties = {
    density: physical.calculateDensity(currentState.averageTemperature),
    viscosity: physical.calculateViscosity(currentState.averageTemperature),
    conductivity: physical.calculateThermalConductivity(
      currentState.averageTemperature
    ),
    prandtl: 0.713, // Approximate constant for air
  };

  // Determine stable time step for entire system
  let timeStep = Infinity;
  for (let i = 0; i < config.numZones; i++) {
    for (let j = 0; j < config.numLayers; j++) {
      for (let k = 0; k < config.numPallets; k++) {
        const dt = calculateTimeStep(currentState.zoneStates[i][j][k], config);
        timeStep = Math.min(timeStep, dt);
      }
    }
  }

  // Initialize new state arrays
  const newZoneStates: TransientState[][][] = Array(config.numZones)
    .fill(null)
    .map(() =>
      Array(config.numLayers)
        .fill(null)
        .map(() => Array(config.numPallets).fill(null))
    );

  // Update each zone sequentially along flow path
  let totalTemperature = 0;
  let totalEnergy = 0;
  const numZones = config.numZones * config.numLayers * config.numPallets;

  for (let i = 0; i < config.numZones; i++) {
    for (let j = 0; j < config.numLayers; j++) {
      for (let k = 0; k < config.numPallets; k++) {
        // Update boundary conditions based on upstream conditions
        const localConfig = { ...transientConfig };
        const position = new Position(i, j, k);
        if (i > 0) {
          // Use upstream temperature as inlet condition
          localConfig.inletTemp = newZoneStates[i - 1][j][k].temperature;
          localConfig.inletPressure = newZoneStates[i - 1][j][k].pressure;
        }

        // Update zone state
        newZoneStates[i][j][k] = updateTransientState(
          config,
          currentState.zoneStates[i][j][k],
          localConfig,
          position,
          timeStep,
          airProps
        );

        // Accumulate statistics
        totalTemperature += newZoneStates[i][j][k].temperature;
        totalEnergy += newZoneStates[i][j][k].energy;
      }
    }
  }

  // Calculate average temperature
  const averageTemp = totalTemperature / numZones;

  // Calculate temperature variance for uniformity index
  let sumSquaredDiff = 0;
  for (let i = 0; i < config.numZones; i++) {
    for (let j = 0; j < config.numLayers; j++) {
      for (let k = 0; k < config.numPallets; k++) {
        const diff = newZoneStates[i][j][k].temperature - averageTemp;
        sumSquaredDiff += diff * diff;
      }
    }
  }
  const uniformityIndex = Math.sqrt(sumSquaredDiff / numZones) / averageTemp;

  // Calculate cooling effectiveness
  const coolingEffectiveness =
    (transientConfig.wallTemp - averageTemp) /
    (transientConfig.wallTemp - transientConfig.inletTemp);

  // Calculate total energy removed
  const energyRemoved =
    currentState.totalEnergyRemoved +
    (totalEnergy - sumArrayEnergy(currentState.zoneStates));

  return {
    time: currentState.time + timeStep,
    zoneStates: newZoneStates,
    averageTemperature: averageTemp,
    coolingEffectiveness,
    totalEnergyRemoved: energyRemoved,
    uniformityIndex,
    commodity,
    packaging,
  };
}

function calculateInitialVelocity(
  config: ZonalConfig,
  transientConfig: TransientConfig,
  systemAverageDensity: number
): number {
  const pressureDiff =
    transientConfig.inletPressure - transientConfig.outletPressure;
  const length = config.systemDimensions.x; // Total flow path length
  const hydraulicDiam = flow.calculateHydraulicDiameter(config);

  // Initial guess - assume significant friction loss
  let velocity = Math.sqrt(Math.abs(pressureDiff) / (systemAverageDensity * 4));

  // Major loss coefficient for the full length
  const Kmajor = length / hydraulicDiam;
  // Minor loss coefficient for entrance, bends, exit
  const Kminor = 2.5; // Typical value for entrance + exit losses

  // Total loss coefficient
  const Ktotal = Kmajor + Kminor;

  // Using the full pressure drop equation:
  // ΔP = (K * ρv²)/2
  // v = sqrt(2ΔP/(ρK))
  velocity = Math.sqrt(
    (2 * Math.abs(pressureDiff)) / (systemAverageDensity * Ktotal)
  );

  return velocity;
}

/**
 * Initialize state for a single zone
 * Reference: Section V - "Initial Conditions"
 */
function initializeZoneState(
  zonalConfig: ZonalConfig,
  transientConfig: TransientConfig,
  commodity: CommodityProperties,
  packaging: PackagingConfig,
  position: Position,
  initialVelocity: number // Pass in pre-calculated velocity
): TransientState {
  // Get zone-specific temperature from configuration
  const temperature =
    zonalConfig.temperatures[position.i][position.j][position.k];

  // Calculate local pressure
  const pressure = interpolatePressure(transientConfig, position, zonalConfig);

  // Calculate local density based on local temperature and pressure
  const density = physical.calculateDensity(temperature, pressure);

  // Calculate mass flow and energy
  const area = flow.calculateFlowArea(zonalConfig);
  const volume = area * zonalConfig.zoneDimensions.x;
  const massFlow = density * initialVelocity * area;

  // Calculate energy components
  const productVolume = volume * zonalConfig.containerFillFactor!;
  const productMass = commodity.density * productVolume;
  const productEnergy = productMass * commodity.specificHeat * temperature;

  const airVolume = volume * (1 - zonalConfig.containerFillFactor!);
  const airMass = density * airVolume;
  const airEnergy =
    airMass * physical.calculateSpecificHeat(temperature) * temperature;

  const boxWallArea = flow.calculateHeatTransferArea(zonalConfig);
  const boxMass =
    boxWallArea * packaging.boxWallThickness * packaging.boxMaterialDensity;
  const boxEnergy = boxMass * packaging.boxSpecificHeat * temperature;

  const totalEnergy = productEnergy + airEnergy + boxEnergy;

  return {
    time: 0,
    velocity: initialVelocity,
    temperature: temperature,
    pressure: pressure,
    density: density,
    massFlow: massFlow,
    energy: totalEnergy,
    development: 0,
  };
}

/**
 * Initialize complete system state
 * Reference: Section V - "Initial Conditions"
 */
export function initializeSystemState(
  zonalConfig: ZonalConfig,
  transientConfig: TransientConfig,
  commodity: CommodityProperties,
  packaging: PackagingConfig
): SystemState {
  // Calculate system average density and temperature first
  const initialTemps = zonalConfig.temperatures
    ? zonalConfig.temperatures.flat(2)
    : [transientConfig.inletTemp]; // Fallback if temperatures not specified
  const avgTemp =
    initialTemps.reduce((sum, temp) => sum + temp, 0) / initialTemps.length;

  // Get all air properties at average temperature
  const airProps = physical.getProperties(avgTemp);

  // Calculate initial velocity based on system average density
  const initialVelocity = calculateInitialVelocity(
    zonalConfig,
    transientConfig,
    airProps.airDensity
  );

  // Initialize zone states
  const zoneStates: TransientState[][][] = Array(zonalConfig.numZones)
    .fill(null)
    .map((_, i) =>
      Array(zonalConfig.numLayers)
        .fill(null)
        .map((_, j) =>
          Array(zonalConfig.numPallets)
            .fill(null)
            .map((_, k) =>
              initializeZoneState(
                zonalConfig,
                transientConfig,
                commodity,
                packaging,
                new Position(i, j, k),
                initialVelocity
              )
            )
        )
    );

  // Calculate system metrics
  const allTemps = zoneStates.flat(2).map((state) => state.temperature);
  const avgFinalTemp =
    allTemps.reduce((sum, temp) => sum + temp, 0) / allTemps.length;

  const tempVariance =
    allTemps.reduce((sum, temp) => sum + Math.pow(temp - avgFinalTemp, 2), 0) /
    allTemps.length;
  const uniformityIndex = Math.sqrt(tempVariance) / avgFinalTemp;

  return {
    time: 0,
    zoneStates,
    averageTemperature: avgFinalTemp,
    coolingEffectiveness: 0,
    totalEnergyRemoved: 0,
    uniformityIndex,
    commodity,
    packaging,
  };
}

/**
 * Calculate total energy in the system
 */
function sumArrayEnergy(states: TransientState[][][]): number {
  return states.reduce(
    (sum1, layer) =>
      sum1 +
      layer.reduce(
        (sum2, row) =>
          sum2 + row.reduce((sum3, state) => sum3 + state.energy, 0),
        0
      ),
    0
  );
}
