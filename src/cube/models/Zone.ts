/**
 * Three-dimensional vector type for dimensions
 */
export interface Vector3D {
  x: number; // meters
  y: number; // meters
  z: number; // meters
}

export interface ToleranceConfig {
  geometric: number; // 1e-6 for dimensions
  conservation: number; // 1e-4 for mass/energy
  properties: number; // 1e-3 for physical properties
  control: number; // 1e-2 for control parameters
}

/**
 * Zone position in the system
 * Reference: Section 1.1
 */
export interface ZonePosition {
  i: number; // Zone index in flow direction
  j: number; // Layer index in vertical direction
  k: number; // Pallet index in lateral direction
}

/**
 * Temperature configuration for a zone
 * Reference: Section V - "Initial Conditions"
 */
export interface ZoneTemperature {
  position: ZonePosition;
  temperature: number; // °C
}

/**
 * Configuration interface for zonal dimensions and layout
 * Reference: Section 1.1
 */
export interface ZonalConfig {
  // System dimensions
  zoneDimensions: Vector3D; // Dimensions of each zone
  systemDimensions: Vector3D; // Total system dimensions

  // Zone counts
  numZones: number; // Number of zones in flow direction
  numLayers: number; // Number of vertical layers
  numPallets: number; // Number of pallets

  // Configuration parameters
  tolerance: ToleranceConfig; // Numerical tolerance for calculations
  commodityPackingFactor: number; // Default packing factor for produce
  containerFillFactor?: number; // The proportion of the cube internal volume occupied by goods

  // Temperature configuration - now required
  temperatures: number[][][]; // 3D array of temperatures [zone][layer][pallet]
}

export const defaultToleranceConfig: ToleranceConfig = {
  geometric: 1e-6, // 1e-6 for dimensions
  conservation: 1e-4, // 1e-4 for mass/energy
  properties: 1e-3, // 1e-3 for physical properties
  control: 1e-2, // 1e-2 for control parameters
};

/**
 * Utility class for handling zonal dimensions and calculations
 */
export class ZonalDimensions {
  // Previous volume and area calculation methods remain the same
  static calculateZoneVolume(config: ZonalConfig): number {
    return (
      config.zoneDimensions.x *
      config.zoneDimensions.y *
      config.zoneDimensions.z
    );
  }

  static calculateSystemVolume(config: ZonalConfig): number {
    return (
      config.systemDimensions.x *
      config.systemDimensions.y *
      config.systemDimensions.z
    );
  }

  static calculateFlowArea(config: ZonalConfig): number {
    return config.zoneDimensions.y * config.zoneDimensions.z;
  }

  static calculateZoneDimensions(
    systemDimensions: Vector3D,
    numZones: number,
    numLayers: number,
    numPallets: number
  ): Vector3D {
    return {
      x: systemDimensions.x / numZones,
      y: systemDimensions.y / numLayers,
      z: systemDimensions.z / numPallets,
    };
  }

  /**
   * Initialize temperature array with a default temperature
   */
  private static initializeTemperatures(
    numZones: number,
    numLayers: number,
    numPallets: number,
    defaultTemp: number
  ): number[][][] {
    return Array(numZones)
      .fill(null)
      .map(() =>
        Array(numLayers)
          .fill(null)
          .map(() => Array(numPallets).fill(defaultTemp))
      );
  }

  /**
   * Apply specific zone temperatures to the temperature array
   */
  private static applyZoneTemperatures(
    temperatures: number[][][],
    zoneTemps?: ZoneTemperature[]
  ): void {
    if (zoneTemps) {
      for (const zt of zoneTemps) {
        temperatures[zt.position.i][zt.position.j][zt.position.k] =
          zt.temperature;
      }
    }
  }

  /**
   * Validate configuration including temperatures
   * @param config - Zonal configuration to validate
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: ZonalConfig): void {
    // Validate dimensions
    if (
      config.zoneDimensions.x <= 0 ||
      config.zoneDimensions.y <= 0 ||
      config.zoneDimensions.z <= 0
    ) {
      throw new Error("Zone dimensions must be positive");
    }

    if (
      config.numZones <= 0 ||
      config.numLayers <= 0 ||
      config.numPallets <= 0
    ) {
      throw new Error("Zone counts must be positive");
    }

    const calculatedSystemDimensions = {
      x: config.zoneDimensions.x * config.numZones,
      y: config.zoneDimensions.y * config.numLayers,
      z: config.zoneDimensions.z * config.numPallets,
    };

    if (
      Math.abs(calculatedSystemDimensions.x - config.systemDimensions.x) >
        config.tolerance.geometric ||
      Math.abs(calculatedSystemDimensions.y - config.systemDimensions.y) >
        config.tolerance.geometric ||
      Math.abs(calculatedSystemDimensions.z - config.systemDimensions.z) >
        config.tolerance.geometric
    ) {
      throw new Error(
        "System dimensions do not match zone dimensions times counts"
      );
    }

    // Validate temperature array dimensions
    if (
      !config.temperatures ||
      config.temperatures.length !== config.numZones ||
      config.temperatures[0].length !== config.numLayers ||
      config.temperatures[0][0].length !== config.numPallets
    ) {
      throw new Error(
        "Temperature array dimensions do not match zone configuration"
      );
    }

    // Validate temperature values
    for (let i = 0; i < config.numZones; i++) {
      for (let j = 0; j < config.numLayers; j++) {
        for (let k = 0; k < config.numPallets; k++) {
          const temp = config.temperatures[i][j][k];
          if (temp === undefined || temp === null) {
            throw new Error(`Missing temperature for zone (${i},${j},${k})`);
          }
          if (temp < -20 || temp > 50) {
            throw new Error(
              `Temperature ${temp}°C at position (${i},${j},${k}) out of reasonable range [-20°C, 50°C]`
            );
          }
        }
      }
    }
  }

  /**
   * Create a ZonalConfig with required temperature configuration
   */
  static createConfig(
    systemDimensions: Vector3D,
    numZones: number,
    numLayers: number,
    numPallets: number,
    options: {
      commodityPackingFactor?: number;
      tolerance?: ToleranceConfig;
      temperatures: {
        default: number;
        zones?: ZoneTemperature[];
      };
    }
  ): ZonalConfig {
    const zoneDimensions = this.calculateZoneDimensions(
      systemDimensions,
      numZones,
      numLayers,
      numPallets
    );

    // Initialize temperature array with default temperature
    const temperatures = this.initializeTemperatures(
      numZones,
      numLayers,
      numPallets,
      options.temperatures.default
    );

    // Apply specific zone temperatures if provided
    this.applyZoneTemperatures(temperatures, options.temperatures.zones);

    const config: ZonalConfig = {
      zoneDimensions,
      systemDimensions,
      numZones,
      numLayers,
      numPallets,
      tolerance: options.tolerance ?? defaultToleranceConfig,
      commodityPackingFactor: options.commodityPackingFactor ?? 0.8,
      temperatures,
    };

    this.validateConfig(config);
    return config;
  }

  /**
   * Get temperature for a specific zone
   */
  static getZoneTemperature(
    config: ZonalConfig,
    position: ZonePosition
  ): number {
    return config.temperatures[position.i][position.j][position.k];
  }
}
