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
}
