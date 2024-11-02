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
   * Updates system state based on energy and mass balances
   * Implements core conservation equations from Section II of mathematical model
   */
  private updateState() {
    // Calculate heat transfer coefficient (Section III.2)
    const h = this.calculateHeatTransferCoefficient();

    // Calculate all heat flows
    // Section III.1: Heat from respiration
    const Qresp = this.calculateRespirationHeat();

    // Section III.2: Convective heat transfer
    const Qconv = this.calculateConvectiveHeat(h);

    // Section III.3: Evaporative cooling
    const { Qevap, mevap } = this.calculateEvaporativeCooling(h);

    /**
     * Product energy balance (Section II.1)
     * dE/dt = Qresp - Qconv - Qevap
     * mcp * dT/dt = Qresp - Qconv - Qevap
     */
    const productMCp =
      this.metrics.productMass * this.params.productProperties.cp;
    const dTp = ((Qresp - Qconv - Qevap) * this.dt) / productMCp;

    /**
     * Air energy balance (Section II.1)
     * Includes:
     * - Convective heat from/to product
     * - Energy from inlet air flow
     * - Energy removal by cooling unit
     *
     * ma * cp * dT/dt = ṁa * cp * (Tin - T) + Qconv - Qcool
     */
    // Air flow energy terms
    const mDotAir = this.params.systemProperties.mAirFlow;
    const Tin = this.params.systemProperties.Tdp; // Inlet air temp is dew point temp
    const Qflow = mDotAir * this.airCp * (Tin - this.currentState.Ta);

    // Cooling unit power (Section V)
    const Qcool = this.params.systemProperties.PcoolRated;

    // Air temperature change
    const airMCp = this.calculateAirMass() * this.airCp;
    const dTa = ((Qflow + Qconv - Qcool) * this.dt) / airMCp;

    /**
     * Air moisture balance (Section II.2)
     * dw/dt = (ṁevap - ṁdehum + ṁvent) / ma
     */
    const mdehum = this.calculateDehumidification();
    const airMass = this.calculateAirMass();

    // Inlet air humidity (at dew point temperature)
    const waIn = this.calculateSaturatedHumidity(
      this.params.systemProperties.Tdp
    );
    const mvent = mDotAir * (waIn - this.currentState.wa);

    const dwa = ((mevap - mdehum + mvent) * this.dt) / airMass;

    /**
     * Product moisture balance (Section II.2)
     * dw/dt = -ṁevap / mp
     */
    const dwp = (-mevap * this.dt) / this.metrics.productMass;

    // Update state variables
    this.currentState = {
      Tp: this.currentState.Tp + dTp,
      Ta: this.currentState.Ta + dTa,
      wp: this.currentState.wp + dwp,
      wa: this.currentState.wa + dwa,
    };

    const productMass = this.metrics.productMass;

    return {
      state: this.currentState,
      calculations: {
        h,
        Qresp,
        Qconv,
        Qevap,
        mevap,
        Qcool,
        dTp,
        dTa,
        dwa,
        dwp,
        airMass,
        productMass,
      },
    };
  }

  /**
   * Calculates convective heat transfer between product and air
   * Section III.2: Qconv,i,j = hi,j * Ap,i,j * (Tp,i,j - Ta,i)
   *
   * @param h Heat transfer coefficient [W/m²·K]
   * @returns Heat transfer rate [W]
   */
  private calculateConvectiveHeat(h: number): number {
    return (
      h *
      this.metrics.heatTransferArea *
      (this.currentState.Tp - this.currentState.Ta)
    );
  }

  /**
   * Calculates dehumidification in cooling unit
   * Section V.2
   *
   * @returns Dehumidification rate [kg/s]
   */
  private calculateDehumidification(): number {
    const { systemProperties: sys } = this.params;
    const wsat = this.calculateSaturatedHumidity(sys.Tdp);

    // Air flow rate times humidity difference
    return (
      this.params.systemProperties.mAirFlow * (this.currentState.wa - wsat)
    );
  }

  /**
   * Calculates saturated humidity ratio at given temperature
   * Used for psychrometric calculations
   *
   * @param T Temperature [°C]
   * @returns Saturated humidity ratio [kg water/kg dry air]
   */
  private calculateSaturatedHumidity(T: number): number {
    // Calculate saturation pressure using equation from Section III.3
    const psat = 610.78 * Math.exp((17.27 * T) / (T + 237.3));

    // Convert to humidity ratio
    return (0.622 * psat) / (this.params.systemProperties.pressure - psat);
  }

  /**
   * Calculates mass of air in system
   * @returns Air mass [kg]
   */
  private calculateAirMass(): number {
    return this.metrics.airVolume * this.airDensity;
  }

  /**
   * Calculates evaporative cooling effect and mass transfer rate.
   * Primary reference: Section III.3 of mathematical model
   * Additional references:
   * - Chilton-Colburn heat/mass transfer analogy (j_H = j_M)
   * - ASHRAE Handbook - Fundamentals (2017) Ch.6 for psychrometric properties
   * - Incropera's "Fundamentals of Heat and Mass Transfer" for transfer coefficients
   *
   * @param h - Convective heat transfer coefficient [W/(m²·K)]
   * @returns {Object} containing:
   *   - Qevap: Evaporative cooling power [W]
   *   - mevap: Mass transfer rate [kg/s]
   */
  private calculateEvaporativeCooling(h: number): {
    Qevap: number;
    mevap: number;
  } {
    const { productProperties: prop, systemProperties: sys } = this.params;

    /**
     * Saturation vapor pressure calculation
     * From Section III.3: psat(T) = 610.78 * exp((17.27 * T)/(T + 237.3))
     * @param T - Temperature [°C]
     * @returns Saturation pressure [Pa]
     */
    const psat = (T: number) => 610.78 * Math.exp((17.27 * T) / (T + 237.3));

    /**
     * Calculate vapor pressures at product surface and in air
     * From Section III.3: VPD calculation
     */
    // At product surface [Pa]
    const pwProduct = psat(this.currentState.Tp) * prop.aw;

    // In air stream [Pa]
    // Based on humid air gas laws: pw = (wa * p)/(0.622 + wa)
    const pwAir =
      (this.currentState.wa * sys.pressure) / (0.622 + this.currentState.wa);

    /**
     * Mass transfer coefficient calculation using Chilton-Colburn analogy
     * j_H = j_M -> h/(ρ·cp) * Sc^(-2/3) = hm
     */
    const Sc = 0.6; // Schmidt number for water vapor in air [-]
    // h [W/(m²·K)] / (ρ [kg/m³] * cp [J/(kg·K)]) = [m/s]
    // Then multiply by Sc^(-2/3) [-] and density ratio [kg/m³ / (kg/m³)] = [-]
    const hm =
      (h / (this.airDensity * this.airCp)) *
      Math.pow(Sc, -2 / 3) *
      (this.airDensity * 0.001); // Unit conversion factor [m/s]

    /**
     * Mass transfer calculation
     * From Section III.3: mevap = (hm * A * VPD)/(Rv * T)
     */
    const Rv = 461.5; // Gas constant for water vapor [J/(kg·K)]
    const Tabs = this.currentState.Tp + 273.15; // Absolute temperature [K]

    // Mass transfer rate calculation [kg/s]
    // hm [m/s] * Area [m²] * pressure difference [Pa] / (Rv [J/(kg·K)] * T [K])
    const mevap =
      (hm * this.metrics.heatTransferArea * (pwProduct - pwAir)) / (Rv * Tabs);

    /**
     * Latent heat calculation
     * From Section III.3: Temperature-dependent latent heat
     */
    // Watson equation for latent heat [J/kg]
    const lambda = 2.5e6 - 2.386e3 * this.currentState.Tp;

    /**
     * Total evaporative cooling power
     * From Section III.3: Qevap = mevap * λ
     */
    // mevap [kg/s] * lambda [J/kg] = Qevap [W]
    const Qevap = mevap * lambda;

    // Expected ranges for validation:
    // - hm: 0.003-0.03 [m/s] for forced convection over wet surfaces
    // - mevap: 0.01-0.1 [kg/s] for typical cooling conditions
    // - Qevap: 25-250 [kW] for this scale system

    return {
      Qevap, // [W]
      mevap, // [kg/s]
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

  // Public methods for accessing metrics and state
  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  public getCurrentState(): SystemState {
    return { ...this.currentState };
  }

  public nextState() {
    const result = this.updateState();

    return result;
  }
}
