import { PalletPerformance } from "../Pallet/lib/palletPerformance.js";

// types/CoolingUnit.ts
export interface CoolingUnitState {
  coilTemperature: number; // °C
  dewPoint: number; // °C
  currentPower: number; // W
  ratedPower: number; // W
}

export interface CoolingUnitSettings {
  targetTemperature: number; // °C
  targetHumidity: number; // kg/kg
  minCoilTemp: number; // °C
  maxPower: number; // W
  tcpiTarget: number; // dimensionless (0-1)
  controlUpdateInterval: number; // seconds
}

export interface DehumidificationResult {
  massDehumidified: number; // kg/s
  latentHeatRemoved: number; // W
  sensibleHeatRemoved: number; // W
}

// First, let's define an interface for the power supply configuration
export interface PowerSupplyConfig {
  maxPower: number; // W
  nominalVoltage: number; // V
  energyCapacity: number; // Wh
}

// lib/CoolingUnit.ts
export class CoolingUnit {
  private state: CoolingUnitState;
  private settings: CoolingUnitSettings;
  private powerSupply: PowerSupplyConfig;
  private lastUpdateTime: number;
  private tcpi: number;

  constructor(settings: CoolingUnitSettings, powerSupply: PowerSupplyConfig) {
    this.settings = settings;
    this.powerSupply = powerSupply;
    this.state = {
      coilTemperature: settings.targetTemperature,
      dewPoint: this.calculateDewPoint(
        settings.targetTemperature,
        settings.targetHumidity
      ),
      currentPower: 0,
      ratedPower: Math.min(settings.maxPower, powerSupply.maxPower), // Use lower of thermodynamic or electrical limit
    };
    this.lastUpdateTime = 0;
    this.tcpi = 1.0;
  }

  /**
   * Updates power supply configuration, adjusting current power if necessary
   * @param newConfig New power supply configuration
   * @returns true if configuration was updated successfully
   */
  public updatePowerSupply(newConfig: PowerSupplyConfig): boolean {
    try {
      this.powerSupply = newConfig;
      // Update rated power to respect both limits
      this.state.ratedPower = Math.min(
        this.settings.maxPower,
        newConfig.maxPower
      );

      // Ensure current power respects new limit
      if (this.state.currentPower > this.state.ratedPower) {
        this.state.currentPower = this.state.ratedPower;
      }

      return true;
    } catch (error) {
      console.error("Failed to update power supply configuration:", error);
      return false;
    }
  }

  /**
   * Updates cooling unit power based on TCPI and current performance
   * Implementation of Section V.3 equations
   */
  public updateCoolingPower(
    performance: PalletPerformance[],
    currentTime: number
  ): void {
    if (
      currentTime - this.lastUpdateTime <
      this.settings.controlUpdateInterval
    ) {
      return;
    }

    this.tcpi = this.calculateTCPI(performance);

    // Calculate desired power based on TCPI
    const powerScaleFactor =
      this.settings.tcpiTarget / Math.max(this.tcpi, 0.1);
    const desiredPower = this.state.ratedPower * powerScaleFactor;

    // Apply both thermodynamic and electrical limits
    this.state.currentPower = Math.min(
      this.state.ratedPower,
      Math.max(0, desiredPower)
    );

    this.updateCoilTemperature();
    this.lastUpdateTime = currentTime;
  }

  // Add method to get current power supply configuration
  public getPowerSupplyConfig(): PowerSupplyConfig {
    return { ...this.powerSupply };
  }

  /**
   * Calculates dehumidification based on Section V.2 equations:
   * mdehum = ṁair * (wa,i - wsat(Tdp)) * σ((Ta,i - Tdp)/0.2) * σ((wa,i - wsat(Tdp))/0.00005)
   */
  public calculateDehumidification(
    airTemp: number,
    airHumidity: number,
    massFlowRate: number
  ): DehumidificationResult {
    // Physical constants
    const LATENT_HEAT = 2.45e6; // J/kg
    const SPECIFIC_HEAT_AIR = 1006; // J/kg·K
    const ACTIVATION_TEMP_SCALE = 0.2; // °C
    const ACTIVATION_HUMIDITY_SCALE = 0.00005; // kg/kg
    const SIGMOID_STEEPNESS = 1;
    const DEHUMIDIFICATION_THRESHOLD = 1e-7; // kg/s

    // Sigmoid activation function
    const sigmoid = (x: number) => 0.5 * (1 + Math.tanh(SIGMOID_STEEPNESS * x));

    // Calculate saturation humidity at dew point
    const wsat = this.calculateSaturationHumidity(this.state.dewPoint);

    // Calculate humidity difference
    const humidityDiff = airHumidity - wsat;

    // Calculate activation factors
    const tempActivation = sigmoid(
      (airTemp - this.state.dewPoint) / ACTIVATION_TEMP_SCALE
    );
    const humidityActivation = sigmoid(
      humidityDiff / ACTIVATION_HUMIDITY_SCALE
    );

    // Calculate mass of water removed with threshold
    let massDehumidified =
      massFlowRate * humidityDiff * tempActivation * humidityActivation;

    // Apply threshold to avoid numerical noise
    if (Math.abs(massDehumidified) < DEHUMIDIFICATION_THRESHOLD) {
      massDehumidified = 0;
    }

    // Calculate heat removal
    const latentHeatRemoved = massDehumidified * LATENT_HEAT;
    const sensibleHeatRemoved =
      massFlowRate * SPECIFIC_HEAT_AIR * (airTemp - this.state.coilTemperature);

    return {
      massDehumidified,
      latentHeatRemoved,
      sensibleHeatRemoved,
    };
  }

  /**
   * Calculates TCPI based on Section VI.1 equations
   */
  private calculateTCPI(performance: PalletPerformance[]): number {
    if (performance.length === 0) return 1.0;

    // Calculate average cooling efficiency
    const η_cool =
      performance.reduce((sum, p) => sum + p.averageCoolingEfficiency, 0) /
      performance.length;

    // Calculate turbulence factor
    const avgTurbulence = 0.16; // This should come from flow calculations
    const E_factor = (1 + 0.1 * Math.pow(avgTurbulence, 2)) * 1.0;

    // Calculate efficiency variation
    const σ_η = Math.sqrt(
      performance.reduce(
        (sum, p) => sum + Math.pow(p.averageCoolingEfficiency - η_cool, 2),
        0
      ) / performance.length
    );

    // Calculate TCPI
    return (η_cool / E_factor) * (1 - (0.2 * σ_η) / η_cool);
  }

  private updateCoilTemperature(): void {
    // Simple linear relationship between power and coil temperature
    const powerRatio = this.state.currentPower / this.state.ratedPower;
    const tempRange =
      this.settings.targetTemperature - this.settings.minCoilTemp;
    this.state.coilTemperature =
      this.settings.targetTemperature - powerRatio * tempRange;
  }

  private calculateDewPoint(temperature: number, humidity: number): number {
    // Magnus formula for dew point calculation
    const α =
      Math.log(humidity) + (17.27 * temperature) / (237.3 + temperature);
    return (237.3 * α) / (17.27 - α);
  }

  private calculateSaturationHumidity(temperature: number): number {
    // Tetens formula for saturation vapor pressure
    const es = 610.78 * Math.exp((17.27 * temperature) / (temperature + 237.3));
    return (0.622 * es) / (101325 - es); // Convert to humidity ratio
  }

  // Getters
  public getState(): CoolingUnitState {
    return { ...this.state };
  }

  public getTCPI(): number {
    return this.tcpi;
  }
}
