import { ZonalConfig, Vector3D } from "./models/Zone.js";
import {
  SystemState,
  initializeSystemState,
  calculateNextSystemState,
} from "./physics/systemSolver.js";

/**
 * Commodity physical properties
 * Reference: Section X - "Model Parameters", 10.1 "Product Properties"
 */
export interface CommodityProperties {
  name: string;
  density: number; // kg/m³
  specificHeat: number; // J/(kg·K)
  respirationRate: {
    // Reference: Section III, 3.1
    referenceRate: number; // W/kg at reference temperature
    temperatureSensitivity: number; // K^-1
    referenceTemperature: number; // °C
  };
  moistureContent: {
    // Reference: Section II, 2.2
    initial: number; // kg water/kg dry matter
    waterActivity: number; // Dimensionless [0-1]
    wetnessFactor: number; // Dimensionless [0-1]
  };
  thermalConductivity: number; // W/(m·K)
}

/**
 * Packaging configuration
 * Reference: Section I - "Physical Domain"
 */
export interface PackagingConfig {
  boxDimensions: Vector3D; // m
  boxWallThickness: number; // m
  boxThermalConductivity: number; // W/(m·K)
  boxesPerPallet: number;
  palletDimensions: Vector3D; // m
  palletBaseHeight: number; // m
  boxMaterialDensity: number; // kg/m³
  boxSpecificHeat: number; // J/(kg·K)
}

/**
 * Cooling system configuration
 * Reference: Section V - "Cooling Unit Model"
 */
export interface CoolingConfig {
  supplyTemperature: number; // °C
  supplyPressure: number; // Pa
  returnPressure: number; // Pa
  maxAirflowRate: number; // m³/s
  initialTemperature: number; // °C
}

/**
 * Pre-defined commodity properties
 * Sources: ASHRAE Handbook, USDA Handbook 66
 */
export const COMMODITY_PROPERTIES: { [key: string]: CommodityProperties } = {
  strawberry: {
    name: "Strawberry",
    density: 920, // kg/m³
    specificHeat: 3900, // J/(kg·K)
    respirationRate: {
      referenceRate: 0.0162, // W/kg at 5°C
      temperatureSensitivity: 0.0865,
      referenceTemperature: 5,
    },
    moistureContent: {
      initial: 0.908, // 90.8% moisture
      waterActivity: 0.98,
      wetnessFactor: 0.85,
    },
    thermalConductivity: 0.386, // W/(m·K)
  },
  // Add other commodities as needed
};

/**
 * Pre-defined packaging configurations
 */
export const PACKAGING_CONFIGS: { [key: string]: PackagingConfig } = {
  "strawberry-standard": {
    boxDimensions: { x: 0.6, y: 0.4, z: 0.15 },
    boxWallThickness: 0.002,
    boxThermalConductivity: 0.033,
    boxesPerPallet: 80, // 8 layers x 10 boxes
    palletDimensions: { x: 1.2, y: 1.0, z: 3 },
    palletBaseHeight: 0.15,
    boxMaterialDensity: 1200, // kg/m³ for corrugated cardboard
    boxSpecificHeat: 1700, // J/(kg·K) for corrugated cardboard
  },
  // Add other packaging configurations as needed
};

export class Cube {
  private state: SystemState;

  /**
   * Create a new cooling cube instance with direct configuration
   * @param config - Zonal configuration
   * @param commodity - Commodity properties
   * @param packaging - Packaging configuration
   * @param cooling - Cooling system configuration
   */

  constructor(
    private config: ZonalConfig,
    private commodity: CommodityProperties,
    private packaging: PackagingConfig,
    private cooling: CoolingConfig,
    dimensions: Vector3D
  ) {
    // Calculate container fill factor
    const totalPalletVolume =
      config.numZones *
      config.numPallets *
      config.numLayers *
      (this.packaging.palletDimensions.x *
        this.packaging.palletDimensions.y *
        this.packaging.palletDimensions.z);
    const containerVolume = dimensions.x * dimensions.y * dimensions.z;
    const containerFillFactor = Math.min(
      0.9,
      totalPalletVolume / containerVolume
    );

    // Add container fill factor to config
    this.config = {
      ...config,
      containerFillFactor, // Add this new property to ZonalConfig interface
    };

    // Initialize system state
    this.state = initializeSystemState(
      this.config,
      {
        wallTemp: cooling.initialTemperature,
        inletTemp: cooling.supplyTemperature,
        inletPressure: cooling.supplyPressure,
        outletPressure: cooling.returnPressure,
      },
      this.commodity,
      this.packaging
    );
  }

  step(): {
    time: number;
    averageTemperature: number;
    coolingEffectiveness: number;
    uniformityIndex: number;
  } {
    this.state = calculateNextSystemState(
      this.state,
      this.config,
      {
        wallTemp: this.cooling.initialTemperature,
        inletTemp: this.cooling.supplyTemperature,
        inletPressure: this.cooling.supplyPressure,
        outletPressure: this.cooling.returnPressure,
      },
      this.commodity,
      this.packaging
    );

    return {
      time: this.state.time,
      averageTemperature: this.state.averageTemperature,
      coolingEffectiveness: this.state.coolingEffectiveness,
      uniformityIndex: this.state.uniformityIndex,
    };
  }

  getState(): SystemState {
    return this.state;
  }

  getConfig(): ZonalConfig {
    return this.config;
  }

  getCommodityProperties(): CommodityProperties {
    return this.commodity;
  }

  getPackagingConfig(): PackagingConfig {
    return this.packaging;
  }
}
