/**
 * Represents the instantaneous state of the cooling system
 */
export interface SystemState {
  /** Product temperature in degrees Celsius (°C) */
  Tp: number;

  /** Product moisture content ratio (kg water/kg dry matter)
   * Typical range: 0.5-0.95 for fresh produce */
  wp: number;

  /** Air temperature in degrees Celsius (°C) */
  Ta: number;

  /** Air humidity ratio (kg water/kg dry air)
   * Typical range: 0.001-0.015 */
  wa: number;
}

/**
 * Configuration parameters for the cooling system
 */
export interface CubeParameters {
  /** Physical dimensions of the cooling space */
  dimensions: {
    /** Length of the cooling space in meters (m) */
    length: number;

    /** Width of the cooling space in meters (m) */
    width: number;

    /** Height of the cooling space in meters (m) */
    height: number;
  };

  /** Packing configuration */
  packingProperties: {
    /** Void fraction - ratio of air space to total volume (dimensionless)
     * Typical range: 0.3-0.5 for packed produce
     * Higher values indicate more air space */
    voidFraction: number;

    /** Bulk density of the packed product in kg/m³
     * Typical range: 200-600 kg/m³ for strawberries
     * Accounts for both product and void spaces */
    bulkDensity: number;

    /** Specific surface area in m²/m³
     * Surface area of product per unit volume of cooling space
     * Typical range: 50-150 m²/m³ for packed produce */
    specificSurfaceArea: number;

    /** Characteristic dimension of product in meters (m)
     * e.g., average diameter of individual strawberries
     * Used for Reynolds number calculations */
    characteristicDimension: number;

    /** Tortuosity factor (dimensionless)
     * Represents how twisted the air path is through the packed bed
     * Typical range: 1.5-3.0 */
    tortuosity: number;
  };

  /** Physical properties of the product being cooled */
  productProperties: {
    /** Specific heat capacity in Joules per kilogram-Kelvin (J/kg·K)
     * Typical range for fresh produce: 3500-4200 J/kg·K */
    cp: number;

    /** Initial moisture content ratio (kg water/kg dry matter)
     * Typical range for fresh produce: 0.80-0.95 */
    wpInitial: number;

    /** Reference respiration rate in Watts per kilogram (W/kg)
     * Measured at reference temperature
     * Typical range: 0.001-0.01 W/kg */
    rRef: number;

    /** Respiration temperature coefficient (dimensionless)
     * Represents the exponential increase in respiration with temperature
     * Typical range: 0.05-0.15 */
    k: number;

    /** Reference temperature for respiration rate in degrees Celsius (°C)
     * Usually 20°C */
    Tref: number;

    /** Water activity (dimensionless)
     * Ratio of vapor pressure of water in product to pure water
     * Range: 0-1, typically 0.95-0.99 for fresh produce */
    aw: number;

    /** True density of product in kg/m³
     * Density of the product material itself, not bulk density
     * Typical range: 900-1050 kg/m³ for strawberries */
    trueDensity: number;
  };

  /** Properties of the cooling system */
  systemProperties: {
    /** Base heat transfer coefficient in Watts per square meter-Kelvin (W/m²·K)
     * Typical range: 10-30 W/m²·K */
    h0: number;

    /** Mass flow rate of air in kilograms per second (kg/s)
     * Typical range: 0.5-2.0 kg/s per cubic meter of cooling space */
    mAirFlow: number;

    /** Rated cooling power in Watts (W)
     * Total cooling capacity of the refrigeration system */
    PcoolRated: number;

    /** Dew point temperature in degrees Celsius (°C)
     * Temperature at which water vapor starts condensing
     * Typical range: 0-4°C for fresh produce storage */
    Tdp: number;

    /** Air pressure in Pascals (Pa)
     * Typically atmospheric pressure (101325 Pa) */
    pressure: number;
  };

  /** Control system tuning parameters */
  controlParams: {
    /** TCPI turbulence sensitivity factor (dimensionless)
     * Affects how much turbulence influences heat transfer
     * Typical range: 0.1-0.3 */
    alpha: number;

    /** TCPI energy factor coefficient (dimensionless)
     * Influences energy efficiency calculation
     * Typical range: 0.2-0.4 */
    beta: number;

    /** TCPI variance penalty factor (dimensionless)
     * Controls trade-off between cooling speed and uniformity
     * Typical range: 0.1-0.2 */
    gamma: number;

    /** Target Turbulent Cooling Performance Index (dimensionless)
     * Optimal cooling performance target
     * Range: 0-1, typically 0.8-0.95 */
    TCPITarget: number;
  };
}

/**
 * Calculated system metrics based on packing parameters
 */
export interface SystemMetrics {
  /** Total volume of the cooling space in cubic meters (m³) */
  totalVolume: number;

  /** Volume occupied by product in cubic meters (m³) */
  productVolume: number;

  /** Volume available for air flow in cubic meters (m³) */
  airVolume: number;

  /** Total mass of product in kilograms (kg) */
  productMass: number;

  /** Total surface area available for heat transfer in square meters (m²) */
  heatTransferArea: number;

  /** Average air velocity through the packed bed in meters per second (m/s) */
  averageAirVelocity: number;

  /** Pressure drop across the packed bed in Pascals (Pa) */
  // pressureDrop: number;
}
