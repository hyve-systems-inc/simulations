import { PHYSICS_CONSTANTS } from "../constants.js";
import { Container, ThermalState } from "../Container/index.js";
import { Layer } from "../Layer/index.js";
import { LayerFlowConditions } from "../Layer/lib/calculateLocalFlow.js";
import { adjustFlowConditions } from "./lib/flowDistribution.js";
import {
  calculatePalletPerformance,
  PalletPerformance,
} from "./lib/palletPerformance.js";
import { PalletConfig, validatePalletConfig } from "./lib/validator.js";

/**
 * Manages a vertical stack of cooling layers in a pallet.
 * Coordinates thermal interactions between layers while maintaining
 * proper airflow distribution.
 */
export class Pallet {
  private layers: Layer[] = [];
  private config: PalletConfig;
  private lastPerformance: PalletPerformance | null = null;

  constructor(config: PalletConfig) {
    validatePalletConfig(config);
    this.config = config;

    // Initialize layers
    for (let i = 0; i < config.numLayers; i++) {
      this.layers.push(
        new Layer(config.gridDimensions, config.layerDimensions)
      );
    }
  }

  public placeContainersInLayer(
    layerIndex: number,
    containers: (Container | null)[][]
  ): boolean {
    if (layerIndex < 0 || layerIndex >= this.layers.length) {
      return false;
    }
    return this.layers[layerIndex].placeContainers(containers);
  }

  public updateThermalState(
    baseConditions: LayerFlowConditions,
    timeStep: number
  ): PalletPerformance {
    const layerPerformance = [];
    let totalHeatTransfer = 0;
    let currentAirTemp = baseConditions.inletTemperature;
    let currentAirHumidity = baseConditions.inletHumidity;

    // Process layers from bottom to top
    for (let i = 0; i < this.layers.length; i++) {
      const relativeHeight = (i + 0.5) / this.layers.length;

      // Get adjusted flow conditions for this layer
      const layerConditions = adjustFlowConditions(
        baseConditions,
        relativeHeight,
        currentAirTemp,
        currentAirHumidity
      );

      // Update layer state
      const performance = this.layers[i].updateThermalState(
        layerConditions,
        timeStep
      );
      layerPerformance.push(performance);
      totalHeatTransfer += performance.totalHeatTransfer;

      // Update air conditions for next layer
      if (i < this.layers.length - 1) {
        const energyToAir = -performance.totalHeatTransfer;
        const deltaT =
          energyToAir /
          (baseConditions.massFlowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR);
        currentAirTemp += deltaT;
      }
    }

    // Calculate aggregate performance metrics
    const performance = calculatePalletPerformance(
      layerPerformance,
      totalHeatTransfer
    );
    this.lastPerformance = performance;
    return performance;
  }

  public getAverageThermalState(): ThermalState {
    const states = this.layers.map((layer) => layer.getAverageThermalState());
    if (states.length === 0) return { temperature: 0, moisture: 0 };

    return {
      temperature:
        states.reduce((sum, state) => sum + state.temperature, 0) /
        states.length,
      moisture:
        states.reduce((sum, state) => sum + state.moisture, 0) / states.length,
    };
  }

  public getLastPerformance(): PalletPerformance | null {
    return this.lastPerformance;
  }
}
