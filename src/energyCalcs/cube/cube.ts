import { SystemState, CubeParameters, SystemMetrics } from "./cube.types.js";

export class Cube {
  private readonly params: CubeParameters;
  private readonly metrics: SystemMetrics;
  private currentState: SystemState;
  private readonly dt: number = 60; // Time step in seconds

  constructor(params: CubeParameters, initialState: SystemState) {
    this.params = params;
    this.currentState = { ...initialState };
    this.metrics = this.calculateSystemMetrics();
  }

  /**
   * Simulates the cooling process for a specified duration
   * @param duration Duration in seconds
   * @returns Array of system states over time
   */
  public simulate(duration: number): SystemState[] {
    const timeSteps = Math.floor(duration / this.dt);
    const states: SystemState[] = [{ ...this.currentState }];

    for (let step = 0; step < timeSteps; step++) {
      this.updateState();
      states.push({ ...this.currentState });
    }

    return states;
  }

  private calculateSystemMetrics(): SystemMetrics {
    const {
      dimensions,
      packingProperties,
      systemProperties: sys,
    } = this.params;
    const totalVolume =
      dimensions.length * dimensions.width * dimensions.height;
    const productVolume = totalVolume * (1 - packingProperties.voidFraction);
    const airVolume = totalVolume * packingProperties.voidFraction;
    const averageAirVelocity = sys.mAirFlow / (1.225 * airVolume);

    return {
      totalVolume,
      productVolume,
      airVolume,
      productMass: productVolume * packingProperties.bulkDensity,
      heatTransferArea: totalVolume * packingProperties.specificSurfaceArea,
      averageAirVelocity,
      //   pressureDrop: this.calculatePressureDrop(),
    };
  }

  private updateState(): void {
    const { productProperties: prop, systemProperties: sys } = this.params;

    // Calculate heat transfer coefficients
    const TCPI = this.calculateTCPI();
    const h = sys.h0 * TCPI * this.calculateReynoldsEffect();

    // Calculate respiration heat
    const Qresp = this.calculateRespirationHeat();

    // Calculate convective heat transfer
    const Qconv = this.calculateConvectiveHeat(h);

    // Calculate evaporative cooling
    const { Qevap, mevap } = this.calculateEvaporativeCooling(h);

    // Calculate cooling unit effect
    const Qcool = this.calculateCoolingEffect();

    // Update product temperature
    const dTp =
      ((Qresp - Qconv - Qevap) / (this.metrics.productMass * prop.cp)) *
      this.dt;

    // Update air temperature
    const dTa =
      ((Qconv - Qcool) / (this.calculateAirMass() * this.calculateAirCp())) *
      this.dt;

    // Update moisture contents
    const dwp = (-mevap / this.metrics.productMass) * this.dt;
    const dwa = this.calculateAirMoistureChange(mevap) * this.dt;

    // Apply changes
    this.currentState = {
      Tp: this.currentState.Tp + dTp,
      Ta: this.currentState.Ta + dTa,
      wp: this.currentState.wp + dwp,
      wa: this.currentState.wa + dwa,
    };
  }

  private calculateTCPI(): number {
    const { controlParams: ctrl } = this.params;
    const turbIntensity = this.calculateTurbulenceIntensity();
    const coolingEfficiency = this.calculateCoolingEfficiency();
    const energyFactor = 1 + ctrl.beta * Math.pow(turbIntensity, 2);

    return (
      (coolingEfficiency / energyFactor) *
      (1 - ctrl.gamma * this.calculateCoolingVariance())
    );
  }

  private calculateRespirationHeat(): number {
    const { productProperties: prop } = this.params;
    const R = prop.rRef * Math.exp(prop.k * (this.currentState.Tp - prop.Tref));
    return R * this.metrics.productMass;
  }

  private calculateConvectiveHeat(h: number): number {
    return (
      h *
      this.metrics.heatTransferArea *
      (this.currentState.Tp - this.currentState.Ta)
    );
  }

  private calculateEvaporativeCooling(h: number): {
    Qevap: number;
    mevap: number;
  } {
    const { productProperties: prop, systemProperties: sys } = this.params;

    // Saturated vapor pressure calculation (Magnus formula)
    const psat = (T: number) => 610.78 * Math.exp((17.27 * T) / (T + 237.3));

    const VPD =
      psat(this.currentState.Tp) * prop.aw -
      (this.currentState.wa * sys.pressure) / (0.622 + this.currentState.wa);

    // Mass transfer coefficient (Lewis relation)
    const hm = h / (this.calculateAirCp() * 1.006);

    const mevap =
      (hm * this.metrics.heatTransferArea * VPD) /
      (461.5 * (this.currentState.Tp + 273.15));

    const latentHeat = this.calculateLatentHeat();
    const Qevap = mevap * latentHeat;

    return { Qevap, mevap };
  }

  private calculateCoolingEffect(): number {
    const { systemProperties: sys } = this.params;
    const mair = this.calculateAirMass();
    const cp = this.calculateAirCp();

    const Qsensible = mair * cp * (this.currentState.Ta - sys.Tdp);

    // Dehumidification effect
    const wsat = this.calculateSaturatedHumidity(sys.Tdp);
    const sigma = (x: number) => 0.5 * (1 + Math.tanh(8 * x));

    const mdehum =
      mair *
      (this.currentState.wa - wsat) *
      sigma((this.currentState.Ta - sys.Tdp) / 0.2) *
      sigma((this.currentState.wa - wsat) / 0.00005);

    const Qlatent = mdehum * this.calculateLatentHeat();

    return Math.min(sys.PcoolRated, Qsensible + Qlatent);
  }

  // Helper methods
  private calculateAirMass(): number {
    return this.metrics.airVolume * 1.225; // Approximate air density at 15°C
  }

  private calculateAirCp(): number {
    return 1006; // J/kg·K for dry air
  }

  private calculateLatentHeat(): number {
    return 2500000; // J/kg at 0°C (approximate)
  }

  private calculateReynoldsEffect(): number {
    const Re =
      (this.metrics.averageAirVelocity *
        this.params.packingProperties.characteristicDimension *
        1.225) /
      1.81e-5; // Air viscosity at 15°C
    return Math.pow(Re, 0.8);
  }

  private calculateTurbulenceIntensity(): number {
    const Re = this.calculateReynoldsEffect();
    return 0.16 * Math.pow(Re, -0.125);
  }

  private calculateCoolingEfficiency(): number {
    const NTU = this.calculateNTU();
    return 1 - Math.exp(-NTU);
  }

  private calculateNTU(): number {
    const { systemProperties: sys } = this.params;
    return (
      (sys.h0 * this.metrics.heatTransferArea) /
      (sys.mAirFlow * this.calculateAirCp())
    );
  }

  private calculateCoolingVariance(): number {
    // Simplified variance calculation based on temperature distribution
    return (
      Math.abs(this.currentState.Tp - this.currentState.Ta) /
      Math.max(1, this.currentState.Tp)
    );
  }

  //   private calculateAverageAirVelocity(): number {
  //     const { systemProperties: sys } = this.params;
  //     return sys.mAirFlow / (1.225 * this.metrics.airVolume);
  //   }

  //   private calculatePressureDrop(): number {
  //     const velocity = this.calculateAverageAirVelocity();
  //     const { packingProperties: pack } = this.params;

  //     // Ergun equation for pressure drop in packed beds
  //     const mu = 1.81e-5; // Air viscosity
  //     const rho = 1.225; // Air density

  //     return (
  //       ((150 *
  //         mu *
  //         (1 - pack.voidFraction) *
  //         (1 - pack.voidFraction) *
  //         velocity) /
  //         (pack.characteristicDimension *
  //           pack.characteristicDimension *
  //           pack.voidFraction *
  //           pack.voidFraction *
  //           pack.voidFraction) +
  //         (1.75 * rho * (1 - pack.voidFraction) * velocity * velocity) /
  //           (pack.characteristicDimension *
  //             pack.voidFraction *
  //             pack.voidFraction *
  //             pack.voidFraction)) *
  //       this.params.dimensions.height
  //     );
  //   }

  private calculateSaturatedHumidity(T: number): number {
    // Simplified calculation of saturated humidity ratio
    const psat = 610.78 * Math.exp((17.27 * T) / (T + 237.3));
    return (0.622 * psat) / (this.params.systemProperties.pressure - psat);
  }

  private calculateAirMoistureChange(mevap: number): number {
    const { systemProperties: sys } = this.params;
    const wsat = this.calculateSaturatedHumidity(sys.Tdp);

    // Net moisture change considering evaporation and dehumidification
    return (
      (mevap - sys.mAirFlow * (this.currentState.wa - wsat)) /
      this.calculateAirMass()
    );
  }
}
