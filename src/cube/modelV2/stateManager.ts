import * as cooling from "../physicsV2/coolingUnit.js";
import * as energy from "../physicsV2/energyConservation.js";
import * as heat from "../physicsV2/heatTransfer.js";
import * as mass from "../physicsV2/massConservation.js";
import * as metrics from "../physicsV2/performanceMetrics.js";
import * as psychro from "../physicsV2/psychrometrics.js";
import * as flow from "../physicsV2/turbulentFlow.js";

/**
 * System state interface defining state variables
 * References Section I (1.2 State Variables):
 * - Tp,i,j(t) = Product temperature
 * - wp,i,j(t) = Product moisture content
 * - Ta,i(t) = Air temperature
 * - wa,i(t) = Air humidity ratio
 */
interface SystemState {
  productTemp: number[][]; // [zone][layer] in °C
  productMoisture: number[][]; // [zone][layer] in kg water/kg dry matter
  airTemp: number[]; // [zone] in °C
  airHumidity: number[]; // [zone] in kg water/kg dry air
  TCPI: number; // Section VI: Turbulent Cooling Performance Index
  coolingPower: number; // Section V: Current cooling power in W
  t: number; // Current time in seconds
}

/**
 * System parameters interface
 * References multiple sections for physical properties and constraints
 */
interface SystemParameters {
  // Section I: Physical Domain
  zones: number; // N sequential zones
  layers: number; // M vertical layers
  containerLength: number; // L dimension
  containerWidth: number; // W dimension
  containerHeight: number; // H dimension

  // Section X: Product Properties
  productMass: number[][]; // [zone][layer] in kg
  productArea: number[][]; // [zone][layer] in m²
  specificHeat: number; // cp in J/(kg·K)
  waterActivity: number; // aw
  respirationRate: number; // rRef
  respirationTempCoeff: number; // k in 1/K
  respirationRefTemp: number; // Tref in °C
  respirationEnthalpy: number; // hResp in J/kg

  // Section II: Air properties
  airMass: number[]; // ma,i in kg
  airFlow: number; // ṁa in kg/s
  airSpecificHeat: number; // cp,air in J/(kg·K)

  // Section III: Heat Transfer Parameters
  baseHeatTransfer: number; // h0 in W/(m²·K)
  positionFactor: number[][]; // εj
  evaporativeMassTransfer: number; // hm in m/s
  surfaceWetness: number; // fw (0-1)

  // Section V: Cooling Unit Parameters
  maxCoolingPower: number; // Qcool,max in W
  ratedPower: number; // Pcool,rated in W
  coilTemp: number; // Tcoil in °C

  // Section VI: Control Parameters
  TCPITarget: number; // TCPI target value
  alpha: number; // α for turbulence enhancement

  // Section IX: System Constraints
  pressure: number; // P in Pa
  wallHeatTransfer: number[]; // Qwalls,i in W
}

/**
 * Calculate the next system state
 * References Section XI: Numerical Solution Method
 */
export function evolveState(
  state: SystemState,
  params: SystemParameters,
  dt: number
): SystemState {
  // Initialize new state following Section 11.2
  const newState: SystemState = {
    productTemp: Array(params.zones)
      .fill(0)
      .map(() => Array(params.layers).fill(0)),
    productMoisture: Array(params.zones)
      .fill(0)
      .map(() => Array(params.layers).fill(0)),
    airTemp: Array(params.zones).fill(0),
    airHumidity: Array(params.zones).fill(0),
    TCPI: state.TCPI,
    coolingPower: state.coolingPower,
    t: state.t + dt,
  };

  // Process each zone
  for (let i = 0; i < params.zones; i++) {
    // Calculate air properties - Section IV
    const airDensity = params.pressure / (287.1 * (state.airTemp[i] + 273.15));
    const velocity =
      params.airFlow /
      (airDensity * params.containerWidth * params.containerHeight);
    const hydraulicDiam =
      (4 * params.containerWidth * params.containerHeight) /
      (2 * (params.containerWidth + params.containerHeight));
    const viscosity = 1.81e-5;

    // Section IV (4.1): Calculate turbulent flow characteristics
    const Re = flow.reynoldsNumber(
      airDensity,
      velocity,
      hydraulicDiam,
      viscosity
    );
    const turbulenceIntensity = flow.turbulenceIntensity(Re);

    // Process each layer
    let totalQconv = 0;
    let totalMevap = 0;

    for (let j = 0; j < params.layers; j++) {
      // Section IV (4.2): Heat transfer enhancement
      const hEff = flow.effectiveHeatTransfer(
        params.baseHeatTransfer,
        params.alpha,
        turbulenceIntensity
      );

      // Section III (3.1): Respiration heat
      const Qresp = heat.respirationHeat(
        state.productTemp[i][j],
        params.respirationRate,
        params.respirationTempCoeff,
        params.respirationRefTemp,
        params.productMass[i][j],
        params.respirationEnthalpy
      );

      // Section III (3.2): Convective heat transfer
      const Qconv = heat.convectiveHeat(
        hEff,
        params.positionFactor[i][j],
        state.TCPI,
        Re,
        params.productArea[i][j],
        state.productTemp[i][j],
        state.airTemp[i]
      );

      // Section III (3.3): Evaporative cooling
      const VPD = psychro.vaporPressureDeficit(
        state.productTemp[i][j],
        params.waterActivity,
        state.airHumidity[i]
      );

      const Qevap = heat.evaporativeCooling(
        params.evaporativeMassTransfer,
        params.productArea[i][j],
        params.surfaceWetness,
        VPD,
        state.productTemp[i][j],
        2.45e6 // λ: Latent heat of vaporization
      );

      // Section II (2.1): Product energy balance
      const dTpdt = energy.productTemperatureRate(
        Qresp,
        Qconv,
        Qevap,
        params.productMass[i][j],
        params.specificHeat
      );

      // Section II (2.2): Product mass conservation
      const mevap = Qevap / 2.45e6;
      const dwpdt = mass.productMoistureRate(mevap, params.productMass[i][j]);

      // Update state following Section 11.2 Step 3
      newState.productTemp[i][j] = state.productTemp[i][j] + dTpdt * dt;
      newState.productMoisture[i][j] = state.productMoisture[i][j] + dwpdt * dt;

      totalQconv += Qconv;
      totalMevap += mevap;
    }

    // Section V (5.1-5.2): Cooling unit calculations
    const Qsensible = cooling.sensibleCooling(
      params.airFlow,
      params.airSpecificHeat,
      state.airTemp[i],
      params.coilTemp
    );

    const mdehum = cooling.dehumidificationRate(
      params.airFlow,
      state.airHumidity[i],
      psychro.saturationHumidityRatio(params.coilTemp),
      state.airTemp[i],
      params.coilTemp
    );

    const Qlatent = mdehum * 2.45e6;
    const mvent = 0;

    // Section II (2.1): Air energy balance
    const prevZoneTemp = i > 0 ? state.airTemp[i - 1] : state.airTemp[i];
    const dTadt = energy.airTemperatureRate(
      params.airMass[i],
      params.airSpecificHeat,
      params.airFlow,
      prevZoneTemp,
      state.airTemp[i],
      totalQconv,
      params.wallHeatTransfer[i],
      Qsensible + Qlatent
    );

    // Section II (2.2): Air moisture balance
    const dwadt = mass.airMoistureRate(
      totalMevap,
      mdehum,
      mvent,
      params.airMass[i]
    );

    // Update state with physical constraints (Section IX)
    newState.airTemp[i] = state.airTemp[i] + dTadt * dt;
    newState.airHumidity[i] = state.airHumidity[i] + dwadt * dt;

    // Section IX (9.1): Physical bounds
    if (
      !psychro.isHumidityValid(newState.airHumidity[i], newState.airTemp[i])
    ) {
      newState.airHumidity[i] = psychro.saturationHumidityRatio(
        newState.airTemp[i]
      );
    }
  }

  // Section V (5.3): Total cooling effect
  const totalCooling = params.zones * (Qsensible + Qlatent);
  newState.coolingPower = cooling.actualCoolingPower(
    params.ratedPower,
    totalCooling,
    params.maxCoolingPower,
    state.TCPI
  );

  // Section VI (6.1-6.2): Control system updates
  const COP = metrics.coefficientOfPerformance(
    Qsensible,
    Qlatent,
    newState.coolingPower
  );
  newState.TCPI = Math.min(
    1.0,
    state.TCPI * (1 + 0.1 * (COP / params.TCPITarget - 1))
  );

  return newState;
}
