import clamp from "lodash.clamp";

/**
 * Physical constants used in calculations
 */
export const CONSTANTS = {
  R_VAPOR: 461.5, // Gas constant for water vapor (J/kg·K)
  LATENT_HEAT: 2.45e6, // Latent heat of vaporization (J/kg)
  LEWIS_NUMBER: 0.845, // Lewis number for air-water vapor mixture
  AIR_PRESSURE: 101325, // Standard atmospheric pressure (Pa)
  MIN_REALISTIC_TEMP: -50, // Minimum realistic temperature (°C)
  MAX_REALISTIC_TEMP: 100, // Maximum realistic temperature (°C)
} as const;

/**
 * Instantaneous rates of heat and mass transfer for a container.
 * These represent the current rates of energy and moisture movement.
 */
export interface HeatTransferRates {
  convectiveHeatRate: number; // Rate of convective heat transfer (W)
  evaporativeHeatRate: number; // Rate of evaporative cooling (W)
  moistureTransferRate: number; // Rate of moisture transfer (kg/s)
}

/**
 * Cumulative changes in energy and moisture over a time step.
 * These represent the total transfers that occurred during dt.
 */
export interface HeatTransferChanges {
  energyChange: number; // Total energy transferred (J)
  moistureChange: number; // Total moisture transferred (kg)
}

/**
 * Represents the physical dimensions of a container in meters.
 */
export interface Dimensions {
  x: number; // meters
  y: number; // meters
  z: number; // meters
}

/**
 * Represents the thermal state of a container's contents.
 * Based on the state variables defined in Section I.2 of the mathematical model.
 */
export interface ThermalState {
  temperature: number; // °C
  moisture: number; // kg water/kg dry matter  [wp,i,j(t) in model]
}

/**
 * Represents the physical and thermal properties of the product stored in the container.
 * Parameters defined in Section X.1 of the mathematical model.
 */
export interface ProductProperties {
  specificHeat: number; // J/(kg·K) [cp in model]
  waterActivity: number; // dimensionless (0-1) [aw in model]
  mass: number; // kg [mp,i,j in model]
  surfaceArea: number; // m² [Ap,i,j in model]
  respiration: {
    baseRate: number; // W/kg [rRef in model]
    temperatureCoeff: number; // 1/K [k in model]
    referenceTemp: number; // °C [Tref in model]
    respirationHeat: number; // J/kg [hResp in model]
  };
}

export class Container {
  private dimensions: Dimensions;
  private thermalState: ThermalState;
  private productProperties: ProductProperties;

  constructor(
    dimensions: Dimensions,
    initialThermalState: ThermalState,
    productProps: ProductProperties
  ) {
    this.validateDimensions(dimensions);
    this.validateThermalState(initialThermalState);
    this.validateProductProperties(productProps);

    this.dimensions = dimensions;
    this.thermalState = initialThermalState;
    this.productProperties = productProps;
  }

  // Getters with defensive copies to maintain immutability
  public getDimensions(): Dimensions {
    return { ...this.dimensions };
  }

  public getThermalState(): ThermalState {
    return { ...this.thermalState };
  }

  public getProductProperties(): ProductProperties {
    return { ...this.productProperties };
  }

  /**
   * Calculates the total volume of the container.
   * Basic geometric calculation: V = L × W × H
   */
  public getVolume(): number {
    return this.dimensions.x * this.dimensions.y * this.dimensions.z;
  }

  /**
   * Updates the product temperature, enforcing realistic physical constraints.
   * Relates to temperature state variable Tp,i,j(t) in Section I.2.
   * Bounds based on Section IX.1 Physical Bounds.
   */
  public updateTemperature(newTemp: number): void {
    if (newTemp < -50 || newTemp > 100) {
      throw new Error("Temperature out of realistic range (-50°C to 100°C)");
    }
    this.thermalState.temperature = newTemp;
  }

  /**
   * Updates the product moisture content, enforcing physical constraints.
   * Relates to moisture content state variable wp,i,j(t) in Section I.2.
   * Bounds based on Section IX.1 Physical Bounds: 0 ≤ wp,i,j ≤ wp,initial
   */
  public updateMoisture(newMoisture: number): void {
    if (newMoisture < 0 || newMoisture > 1) {
      throw new Error("Moisture content must be between 0 and 1 kg/kg");
    }
    this.thermalState.moisture = newMoisture;
  }

  /**
   * Calculates heat generation from product respiration.
   * Implementation of Section III.1 Respiration Heat equations:
   * R(T) = rRef * exp(k * (Tp,i,j - Tref))
   * Qresp,i,j = R(T) * mp,i,j * hResp
   *
   * @returns Heat generation rate in Watts (J/s)
   */
  public calculateRespirationHeat(): number {
    const { baseRate, temperatureCoeff, referenceTemp, respirationHeat } =
      this.productProperties.respiration;

    // Calculate temperature-dependent respiration rate
    const tempDiff = this.thermalState.temperature - referenceTemp;
    const respirationRate = baseRate * Math.exp(temperatureCoeff * tempDiff);

    // Calculate total heat generation
    return respirationRate * this.productProperties.mass * respirationHeat;
  }

  /**
   * Calculates convective and evaporative heat transfer between the container and surrounding air.
   * Implements equations from Section III.2 and III.3 of the mathematical model:
   * - Convective heat: Qconv,i,j = hi,j * Ap,i,j * (Tp,i,j - Ta,i)
   * - Moisture transfer: mevap,i,j = (hm,i,j * Ap,i,j * fw * VPD)/(461.5 * (Tp,i,j + 273.15))
   * - Evaporative heat: Qevap,i,j = mevap,i,j * λ
   *
   * @param airTemp - Air temperature in °C. Must be between -50°C and 100°C.
   * @param airRelativeHumidity - Air relative humidity as a decimal between 0 and 1.
   *                             Represents the ratio of partial vapor pressure to saturation vapor pressure.
   * @param heatTransferCoeff - Convective heat transfer coefficient in W/(m²·K).
   *                           Typically ranges from 10-50 W/(m²·K) for forced convection.
   *
   * @returns {HeatTransferResult} Object containing:
   *          - convectiveHeat: Rate of convective heat transfer in Watts (positive = heating the product)
   *          - evaporativeHeat: Rate of evaporative heat transfer in Watts (positive = evaporative cooling)
   *          - moistureChange: Rate of moisture transfer in kg/s (positive = evaporation from product)
   *
   * @throws {Error} If airRelativeHumidity is outside the range [0,1]
   * @throws {Error} If heatTransferCoeff is negative
   *
   * @example
   * const result = container.calculateHeatTransfer(
   *   5,    // 5°C air temperature
   *   0.8,  // 80% relative humidity
   *   25    // 25 W/(m²·K) heat transfer coefficient
   * );
   */
  public calculateHeatTransferRates(
    airTemp: number,
    airRelativeHumidity: number,
    heatTransferCoeff: number
  ): HeatTransferRates {
    // Input validation
    if (airRelativeHumidity < 0 || airRelativeHumidity > 1) {
      throw new Error("Air relative humidity must be between 0 and 1");
    }
    if (heatTransferCoeff < 0) {
      throw new Error("Heat transfer coefficient cannot be negative");
    }
    // Get current product state
    const productTemp = this.thermalState.temperature;
    const productWaterActivity = this.productProperties.waterActivity;

    // Calculate vapor pressures using relative humidity/water activity
    const productSatVaporPressure =
      this.calculateSaturatedVaporPressure(productTemp);
    const airSatVaporPressure = this.calculateSaturatedVaporPressure(airTemp);

    const productVaporPressure = productSatVaporPressure * productWaterActivity;
    const airVaporPressure = airSatVaporPressure * airRelativeHumidity;

    // Calculate vapor pressure deficit (product to air gradient)
    const VPD = productVaporPressure - airVaporPressure;

    // Calculate convective heat transfer
    const surfaceArea = this.productProperties.surfaceArea;
    const convectiveHeatRate =
      heatTransferCoeff * surfaceArea * (productTemp - airTemp);

    // Calculate mass transfer coefficient using Lewis analogy
    const massTransferCoeff =
      heatTransferCoeff /
      (this.productProperties.specificHeat *
        Math.pow(CONSTANTS.LEWIS_NUMBER, 2 / 3));

    // Calculate moisture transfer (positive = evaporation)
    const moistureTransferRate =
      (massTransferCoeff * surfaceArea * VPD) /
      (CONSTANTS.R_VAPOR * (productTemp + 273.15));

    // Calculate evaporative heat transfer
    const evaporativeHeatRate = moistureTransferRate * CONSTANTS.LATENT_HEAT;

    return {
      convectiveHeatRate,
      evaporativeHeatRate,
      moistureTransferRate,
    };
  }

  /**
   * Updates container state based on energy and mass balance
   * Implementation of conservation equations from Section II.1 and II.2:
   * mp,i,j * cp * dTp,i,j/dt = Qresp,i,j - Qconv,i,j - Qevap,i,j
   * dwp,i,j/dt = -mevap,i,j/mp,i,j
   */
  public updateState(
    energyChange: number, // Net energy change in Joules
    moistureChange: number // Net moisture change in kg
  ): void {
    // Calculate temperature change
    const mass = this.productProperties.mass;
    const specificHeat = this.productProperties.specificHeat;
    const deltaTemp = energyChange / (mass * specificHeat);

    // Calculate new temperature
    const newTemp = this.thermalState.temperature + deltaTemp;

    // Calculate moisture content change
    const deltaMoisture = moistureChange / mass;
    const newMoisture = this.thermalState.moisture + deltaMoisture;

    // Update state with constraints
    this.updateTemperature(
      clamp(newTemp, CONSTANTS.MIN_REALISTIC_TEMP, CONSTANTS.MAX_REALISTIC_TEMP)
    );

    this.updateMoisture(clamp(newMoisture, 0, 1));
  }

  /**
   * Calculates the net energy change over a time step
   * Combines all heat transfer mechanisms from Section III:
   * - Respiration Heat (3.1)
   * - Convective Heat Transfer (3.2)
   * - Evaporative Cooling (3.3)
   */
  public calculateNetEnergyChange(
    dt: number,
    airTemp: number,
    airHumidity: number,
    heatTransferCoeff: number
  ): HeatTransferChanges {
    // Calculate respiration heat
    const respirationHeat = this.calculateRespirationHeat() * dt;

    // Calculate convective and evaporative effects
    const heatTransfer = this.calculateHeatTransferRates(
      airTemp,
      airHumidity,
      heatTransferCoeff
    );

    // Calculate net energy change
    const energyChange =
      respirationHeat -
      (heatTransfer.convectiveHeatRate + heatTransfer.evaporativeHeatRate) * dt;

    // Calculate net moisture change
    const moistureChange = -heatTransfer.moistureTransferRate * dt;

    return { energyChange, moistureChange };
  }

  /**
   * Gets the current energy content of the container
   * Used for conservation validation
   */
  public getEnergyContent(): number {
    const mass = this.productProperties.mass;
    const specificHeat = this.productProperties.specificHeat;
    return mass * specificHeat * (this.thermalState.temperature + 273.15);
  }

  /**
   * Gets the current moisture content in kg
   * Used for conservation validation
   */
  public getMoistureContent(): number {
    return this.productProperties.mass * this.thermalState.moisture;
  }

  /**
   * Validates container dimensions according to physical constraints.
   * Basic physical requirement: all dimensions must be positive.
   */
  private validateDimensions(dimensions: Dimensions): void {
    if (dimensions.x <= 0 || dimensions.y <= 0 || dimensions.z <= 0) {
      throw new Error("All dimensions must be positive");
    }
  }

  /**
   * Validates thermal state according to Section IX.1 Physical Bounds:
   * Temperature constraints based on realistic operating conditions
   * Moisture content constraints: 0 ≤ wp,i,j ≤ wp,initial
   */
  private validateThermalState(state: ThermalState): void {
    if (state.temperature < -50 || state.temperature > 100) {
      throw new Error(
        "Initial temperature out of realistic range (-50°C to 100°C)"
      );
    }
    if (state.moisture < 0 || state.moisture > 1) {
      throw new Error("Initial moisture content must be between 0 and 1 kg/kg");
    }
  }

  /**
   * Validates product properties according to physical constraints from Section X.1:
   * - Specific heat must be positive (thermodynamic requirement)
   * - Water activity must be between 0 and 1 (physical definition)
   * - Mass must be positive (physical requirement)
   * - Surface area must be positive (physical requirement)
   */
  private validateProductProperties(props: ProductProperties): void {
    if (props.specificHeat <= 0) {
      throw new Error("Specific heat must be positive");
    }
    if (props.waterActivity < 0 || props.waterActivity > 1) {
      throw new Error("Water activity must be between 0 and 1");
    }
    if (props.mass <= 0) {
      throw new Error("Mass must be positive");
    }
    if (props.surfaceArea <= 0) {
      throw new Error("Surface area must be positive");
    }
  }

  /**
   * Calculates saturated vapor pressure using the Magnus formula
   * Implementation of equation in Section III.3:
   * psat(T) = 610.78 * exp((17.27 * T)/(T + 237.3))
   */
  private calculateSaturatedVaporPressure(tempC: number): number {
    return 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  }
}
