/**
 * Three-dimensional vector type for dimensions
 */
export interface Vector3D {
  x: number; // meters
  y: number; // meters
  z: number; // meters
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

  // Optional configuration parameters
  tolerance?: number; // Numerical tolerance for calculations
  packingFactor?: number; // Default packing factor for produce
}

/**
 * Utility class for handling zonal dimensions and calculations
 */
export class ZonalDimensions {
  /**
   * Calculate total volume of a zone
   * @param config - Zonal configuration
   * @returns Volume in cubic meters
   */
  static calculateZoneVolume(config: ZonalConfig): number {
    return (
      config.zoneDimensions.x *
      config.zoneDimensions.y *
      config.zoneDimensions.z
    );
  }

  /**
   * Calculate total system volume
   * @param config - Zonal configuration
   * @returns Volume in cubic meters
   */
  static calculateSystemVolume(config: ZonalConfig): number {
    return (
      config.systemDimensions.x *
      config.systemDimensions.y *
      config.systemDimensions.z
    );
  }

  /**
   * Calculate cross-sectional area in flow direction
   * @param config - Zonal configuration
   * @returns Area in square meters
   */
  static calculateFlowArea(config: ZonalConfig): number {
    return config.zoneDimensions.y * config.zoneDimensions.z;
  }

  /**
   * Calculate zone dimensions from system dimensions and counts
   * @param systemDimensions - Total system dimensions
   * @param numZones - Number of zones in flow direction
   * @param numLayers - Number of vertical layers
   * @param numPallets - Number of pallets
   * @returns Calculated zone dimensions
   */
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
   * Validate configuration dimensions
   * @param config - Zonal configuration to validate
   * @throws Error if dimensions are invalid
   */
  static validateDimensions(config: ZonalConfig): void {
    // Check for positive dimensions
    if (
      config.zoneDimensions.x <= 0 ||
      config.zoneDimensions.y <= 0 ||
      config.zoneDimensions.z <= 0
    ) {
      throw new Error("Zone dimensions must be positive");
    }

    // Check for positive counts
    if (
      config.numZones <= 0 ||
      config.numLayers <= 0 ||
      config.numPallets <= 0
    ) {
      throw new Error("Zone counts must be positive");
    }

    // Check system dimensions match zone dimensions times counts
    const calculatedSystemDimensions = {
      x: config.zoneDimensions.x * config.numZones,
      y: config.zoneDimensions.y * config.numLayers,
      z: config.zoneDimensions.z * config.numPallets,
    };

    const tolerance = config.tolerance || 1e-6;

    if (
      Math.abs(calculatedSystemDimensions.x - config.systemDimensions.x) >
        tolerance ||
      Math.abs(calculatedSystemDimensions.y - config.systemDimensions.y) >
        tolerance ||
      Math.abs(calculatedSystemDimensions.z - config.systemDimensions.z) >
        tolerance
    ) {
      throw new Error(
        "System dimensions do not match zone dimensions times counts"
      );
    }
  }

  /**
   * Create a ZonalConfig from system dimensions and counts
   * @param systemDimensions - Total system dimensions
   * @param numZones - Number of zones in flow direction
   * @param numLayers - Number of vertical layers
   * @param numPallets - Number of pallets
   * @param options - Additional configuration options
   * @returns Complete zonal configuration
   */
  static createConfig(
    systemDimensions: Vector3D,
    numZones: number,
    numLayers: number,
    numPallets: number,
    options: Partial<ZonalConfig> = {}
  ): ZonalConfig {
    const zoneDimensions = this.calculateZoneDimensions(
      systemDimensions,
      numZones,
      numLayers,
      numPallets
    );

    const config: ZonalConfig = {
      zoneDimensions,
      systemDimensions,
      numZones,
      numLayers,
      numPallets,
      tolerance: options.tolerance || 1e-6,
      packingFactor: options.packingFactor || 0.8,
    };

    this.validateDimensions(config);

    return config;
  }
}
