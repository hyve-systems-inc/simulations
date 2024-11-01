import { SystemState, CubeParameters, SystemMetrics } from "./cube.types.js";

/**
 * Implements a mathematical model of a refrigerated container cooling system
 * See Section I of the mathematical model for system overview
 */
export class Cube {
  private readonly params: CubeParameters;
  private readonly metrics: SystemMetrics;
  private currentState: SystemState;
  private readonly dt: number = 1; // Timestep in seconds for numerical stability (Section VII.1)
  private readonly airDensity: number = 1.225; // Air density in kg/m³ at 15°C
  private readonly airCp: number = 1006; // Air specific heat capacity in J/kg·K
  private readonly airViscosity: number = 1.81e-5; // Air dynamic viscosity in Pa·s at 15°C

  constructor(params: CubeParameters, initialState: SystemState) {
    this.params = params;
    this.currentState = { ...initialState };
    this.metrics = this.calculateSystemMetrics();
  }

  /**
   * Simulates the system evolution over a specified duration
   * Implements the time discretization scheme from Section VII.1
   * @param duration - Time to simulate in seconds
   * @returns Array of system states at each timestep
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

  /**
   * Calculates system metrics based on physical parameters
   * Implements equations from Section I.1 and VIII
   * @returns SystemMetrics object containing calculated values
   */
  private calculateSystemMetrics(): SystemMetrics {
    const {
      dimensions,
      packingProperties: pack,
      systemProperties: sys,
    } = this.params;
    const totalVolume =
      dimensions.length * dimensions.width * dimensions.height; // m³
    const productVolume = totalVolume * (1 - pack.voidFraction); // m³
    const airVolume = totalVolume * pack.voidFraction; // m³
    const averageAirVelocity = sys.mAirFlow / (this.airDensity * airVolume); // m/s

    return {
      totalVolume,
      productVolume,
      airVolume,
      productMass: productVolume * pack.bulkDensity, // kg
      heatTransferArea: totalVolume * pack.specificSurfaceArea, // m²
      averageAirVelocity,
      pressureDrop: this.calculatePressureDrop(averageAirVelocity), // Pa
    };
  }

  /**
   * Updates system state using conservation equations
   * Implements energy and mass conservation from Section II
   */
  private updateState(): void {
    const h = this.calculateHeatTransferCoefficient(); // W/m²·K

    // Calculate heat fluxes (all in Watts)
    const Qresp = this.calculateRespirationHeat(); // Section III.1
    const Qconv = this.calculateConvectiveHeat(h); // Section III.2
    const { Qevap, mevap } = this.calculateEvaporativeCooling(h); // Section III.3
    const Qcool = this.calculateCoolingEffect(); // Section V

    // Temperature changes (°C) from energy conservation (Section II.1)
    const dTp =
      ((Qresp - Qconv - Qevap) * this.dt) /
      (this.metrics.productMass * this.params.productProperties.cp);
    const dTa =
      ((Qconv - Qcool) * this.dt) / (this.calculateAirMass() * this.airCp);

    // Moisture content changes (kg water/kg matter) from mass conservation (Section II.2)
    const dwp = (-mevap * this.dt) / this.metrics.productMass;
    const dwa =
      ((mevap - this.calculateDehumidification()) * this.dt) /
      this.calculateAirMass();

    this.currentState = {
      Tp: this.currentState.Tp + dTp,
      Ta: this.currentState.Ta + dTa,
      wp: this.currentState.wp + dwp,
      wa: this.currentState.wa + dwa,
    };
  }

  /**
   * Calculates convective heat transfer coefficient
   * Implements equations from Section III.2 and IV
   * @returns Heat transfer coefficient in W/m²·K
   */
  private calculateHeatTransferCoefficient(): number {
    const Re = this.calculateReynoldsNumber();
    const Pr = (this.airCp * this.airViscosity) / 0.0257; // Prandtl number
    return (
      this.params.systemProperties.h0 *
      this.calculateTCPI() *
      Math.pow(Re, 0.8) *
      Math.pow(Pr, 1 / 3)
    );
  }

  /**
   * Calculates heat generation from product respiration
   * Implements equations from Section III.1
   * @returns Respiration heat in Watts
   */
  private calculateRespirationHeat(): number {
    const { productProperties: prop } = this.params;
    return (
      prop.rRef *
      Math.exp(prop.k * (this.currentState.Tp - prop.Tref)) *
      this.metrics.productMass
    );
  }

  /**
   * Calculates convective heat transfer between product and air
   * Implements equations from Section III.2
   * @param h - Heat transfer coefficient in W/m²·K
   * @returns Convective heat transfer rate in Watts
   */
  private calculateConvectiveHeat(h: number): number {
    return (
      h *
      this.metrics.heatTransferArea *
      (this.currentState.Tp - this.currentState.Ta)
    );
  }

  /**
   * Calculates evaporative cooling effect and mass transfer
   * Implements equations from Section III.3
   * @param h - Heat transfer coefficient in W/m²·K
   * @returns Object containing evaporative cooling rate (W) and mass transfer rate (kg/s)
   */
  private calculateEvaporativeCooling(h: number): {
    Qevap: number;
    mevap: number;
  } {
    const { productProperties: prop, systemProperties: sys } = this.params;

    // Calculate vapor pressure deficit (Pa)
    const psat = (T: number) => 610.78 * Math.exp((17.27 * T) / (T + 237.3));
    const VPD =
      psat(this.currentState.Tp) * prop.aw -
      (this.currentState.wa * sys.pressure) / (0.622 + this.currentState.wa);

    // Mass transfer coefficient (m/s) from heat and mass transfer analogy
    const hm = h / (this.airCp * 1.006);

    // Evaporation rate (kg/s)
    const mevap =
      (hm * this.metrics.heatTransferArea * VPD) /
      (461.5 * (this.currentState.Tp + 273.15));

    // Latent heat of vaporization (J/kg)
    const lambda = 2.5e6 - 2.386e3 * this.currentState.Tp;

    return {
      Qevap: mevap * lambda,
      mevap: mevap,
    };
  }

  /**
   * Calculates dehumidification rate in cooling unit
   * Implements equations from Section V.2
   * @returns Dehumidification rate in kg/s
   */
  private calculateDehumidification(): number {
    const { systemProperties: sys } = this.params;
    const wsat = this.calculateSaturatedHumidity(sys.Tdp);

    // Sigmoid function for smooth transition
    const sigma = (x: number) => 0.5 * (1 + Math.tanh(8 * x));

    return (
      this.calculateAirMass() *
      (this.currentState.wa - wsat) *
      sigma((this.currentState.Ta - sys.Tdp) / 0.2) *
      sigma((this.currentState.wa - wsat) / 0.00005)
    );
  }

  /**
   * Calculates total cooling effect including sensible and latent cooling
   * Implements equations from Section V.3
   * @returns Total cooling power in Watts
   */
  private calculateCoolingEffect(): number {
    const { systemProperties: sys } = this.params;
    const airMass = this.calculateAirMass();

    // Sensible cooling (W)
    const Qsensible = airMass * this.airCp * (this.currentState.Ta - sys.Tdp);

    // Latent cooling from dehumidification (W)
    const mdehum = this.calculateDehumidification();
    const Qlatent = mdehum * 2.5e6;

    return Math.min(sys.PcoolRated, Qsensible + Qlatent);
  }

  /**
   * Calculates pressure drop across packed bed
   * Implements Ergun equation from Section IV.3
   * @param airVelocity - Air velocity in m/s
   * @returns Pressure drop in Pa
   */
  private calculatePressureDrop(airVelocity: number): number {
    const { packingProperties: pack } = this.params;

    const viscousTerm =
      (150 *
        this.airViscosity *
        Math.pow(1 - pack.voidFraction, 2) *
        airVelocity) /
      (Math.pow(pack.characteristicDimension, 2) *
        Math.pow(pack.voidFraction, 3));

    const inertiaTerm =
      (1.75 *
        this.airDensity *
        (1 - pack.voidFraction) *
        Math.pow(airVelocity, 2)) /
      (pack.characteristicDimension * Math.pow(pack.voidFraction, 3));

    return (viscousTerm + inertiaTerm) * this.params.dimensions.height;
  }

  /**
   * Calculates Reynolds number for flow characterization
   * Implements equation from Section IV.1
   * @returns Reynolds number (dimensionless)
   */
  private calculateReynoldsNumber(): number {
    return (
      (this.metrics.averageAirVelocity *
        this.params.packingProperties.characteristicDimension *
        this.airDensity) /
      this.airViscosity
    );
  }

  /**
   * Calculates Turbulent Cooling Performance Index
   * Implements equations from Section VI.1
   * @returns TCPI value (dimensionless)
   */
  private calculateTCPI(): number {
    const { controlParams: ctrl } = this.params;
    const turbIntensity = this.calculateTurbulenceIntensity();
    const eta = this.calculateCoolingEfficiency();

    return (
      (eta / (1 + ctrl.beta * Math.pow(turbIntensity, 2))) *
      (1 - ctrl.gamma * this.calculateCoolingVariance())
    );
  }

  /**
   * Calculates turbulence intensity
   * Implements equation from Section IV.1
   * @returns Turbulence intensity (dimensionless)
   */
  private calculateTurbulenceIntensity(): number {
    const Re = this.calculateReynoldsNumber();
    return 0.16 * Math.pow(Re, -0.125);
  }

  /**
   * Calculates cooling efficiency
   * Implements equation from Section VI.1
   * @returns Cooling efficiency (dimensionless)
   */
  private calculateCoolingEfficiency(): number {
    return 1 - Math.exp(-this.calculateNTU());
  }

  /**
   * Calculates Number of Transfer Units
   * Referenced in Section VI.1
   * @returns NTU value (dimensionless)
   */
  private calculateNTU(): number {
    const { systemProperties: sys } = this.params;
    return (
      (sys.h0 * this.metrics.heatTransferArea) / (sys.mAirFlow * this.airCp)
    );
  }

  /**
   * Calculates cooling variance for TCPI calculation
   * Part of Section VI.1
   * @returns Cooling variance (dimensionless)
   */
  private calculateCoolingVariance(): number {
    return (
      Math.abs(this.currentState.Tp - this.currentState.Ta) /
      Math.max(1, this.currentState.Tp)
    );
  }

  /**
   * Calculates saturated humidity ratio
   * Used in Section V.2 calculations
   * @param T - Temperature in °C
   * @returns Saturated humidity ratio in kg water/kg dry air
   */
  private calculateSaturatedHumidity(T: number): number {
    const psat = 610.78 * Math.exp((17.27 * T) / (T + 237.3));
    return (0.622 * psat) / (this.params.systemProperties.pressure - psat);
  }

  /**
   * Calculates mass of air in system
   * @returns Air mass in kg
   */
  private calculateAirMass(): number {
    return this.metrics.airVolume * this.airDensity;
  }

  // Public methods for accessing metrics and state
  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  public getCurrentState(): SystemState {
    return { ...this.currentState };
  }

  public nextState(): SystemState {
    this.updateState();
    return this.currentState;
  }
}
