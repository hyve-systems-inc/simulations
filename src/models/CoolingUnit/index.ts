import { LayerPerformance } from "../Layer/lib/calculatePerformance.js";

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

// lib/CoolingUnit.ts
export class CoolingUnit {
  private state: CoolingUnitState;
  private settings: CoolingUnitSettings;
  private lastUpdateTime: number;
  private tcpi: number;

  constructor(settings: CoolingUnitSettings) {
    this.settings = settings;
    this.state = {
      coilTemperature: settings.targetTemperature,
      dewPoint: this.calculateDewPoint(
        settings.targetTemperature,
        settings.targetHumidity
      ),
      currentPower: 0,
      ratedPower: settings.maxPower,
    };
    this.lastUpdateTime = 0;
    this.tcpi = 1.0;
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
    // Sigmoid activation function
    const sigmoid = (x: number) => 0.5 * (1 + Math.tanh(8 * x));

    // Calculate saturation humidity at dew point
    const wsat = this.calculateSaturationHumidity(this.state.dewPoint);

    // Calculate dehumidification activation
    const tempActivation = sigmoid((airTemp - this.state.dewPoint) / 0.2);
    const humidityActivation = sigmoid((airHumidity - wsat) / 0.00005);

    // Calculate mass of water removed
    const massDehumidified =
      massFlowRate * (airHumidity - wsat) * tempActivation * humidityActivation;

    // Calculate heat removal
    const latentHeatRemoved = massDehumidified * 2.45e6; // Latent heat of vaporization
    const sensibleHeatRemoved =
      massFlowRate * 1006 * (airTemp - this.state.coilTemperature);

    return {
      massDehumidified,
      latentHeatRemoved,
      sensibleHeatRemoved,
    };
  }

  /**
   * Updates cooling unit power based on TCPI and current performance
   * Implementation of Section V.3 equations
   */
  public updateCoolingPower(
    performance: LayerPerformance[],
    currentTime: number
  ): void {
    // Only update at specified intervals
    if (
      currentTime - this.lastUpdateTime <
      this.settings.controlUpdateInterval
    ) {
      return;
    }

    // Calculate new TCPI based on cooling performance
    this.tcpi = this.calculateTCPI(performance);

    // Adjust power based on TCPI ratio
    const powerRatio = this.tcpi / this.settings.tcpiTarget;
    this.state.currentPower = Math.min(
      this.state.ratedPower,
      this.state.ratedPower * powerRatio
    );

    // Update coil temperature based on power
    this.updateCoilTemperature();

    this.lastUpdateTime = currentTime;
  }

  /**
   * Calculates TCPI based on Section VI.1 equations
   */
  private calculateTCPI(performance: LayerPerformance[]): number {
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
