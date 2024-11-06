import * as cooling from "../physicsV2/coolingUnit.js";
import * as energy from "../physicsV2/energyConservation.js";
import * as heat from "../physicsV2/heatTransfer.js";
import * as mass from "../physicsV2/massConservation.js";
import * as metrics from "../physicsV2/performanceMetrics.js";
import * as psychro from "../physicsV2/psychrometrics.js";
import * as flow from "../physicsV2/turbulentFlow.js";
import { calculateTimeStep } from "../physicsV2/time.js";

/**
 * System state interface defining state variables
 * References Section I (1.2 State Variables):
 * - Tp,i,j(t) = Product temperature
 * - wp,i,j(t) = Product moisture content
 * - Ta,i(t) = Air temperature
 * - wa,i(t) = Air humidity ratio
 */
export interface SystemState {
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
export interface SystemParameters {
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
 * Calculate the next system state with automatic time stepping
 * References Section XI: Numerical Solution Method (11.2 and 11.3)
 * @param state Current system state
 * @param params System parameters
 * @returns New system state
 */
export function evolveState(
  state: SystemState,
  params: SystemParameters
): SystemState {
  // Calculate appropriate time step
  const dt = calculateTimeStep(params);

  // Initialize new state
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

  let totalQsensible = 0;
  let totalQlatent = 0;

  // Process each zone
  for (let i = 0; i < params.zones; i++) {
    // Calculate air properties
    const airDensity = params.pressure / (287.1 * (state.airTemp[i] + 273.15));
    const velocity =
      params.airFlow /
      (airDensity * params.containerWidth * params.containerHeight);
    const hydraulicDiam =
      (4 * params.containerWidth * params.containerHeight) /
      (2 * (params.containerWidth + params.containerHeight));
    const viscosity = 1.81e-5; // Air viscosity at typical conditions

    // Calculate flow characteristics
    const Re = flow.reynoldsNumber(
      airDensity,
      velocity,
      hydraulicDiam,
      viscosity
    );
    const turbulenceIntensity = flow.turbulenceIntensity(Re);

    let zoneQconv = 0; // Net convective heat transfer to air
    let zoneMevap = 0; // Net evaporative mass transfer to air

    // Process each layer in the zone
    for (let j = 0; j < params.layers; j++) {
      // Enhanced heat transfer coefficient due to turbulence
      const hEff = flow.effectiveHeatTransfer(
        params.baseHeatTransfer,
        params.alpha,
        turbulenceIntensity
      );

      // Respiration heat (positive = heat generated)
      const Qresp = heat.respirationHeat(
        state.productTemp[i][j],
        params.respirationRate,
        params.respirationTempCoeff,
        params.respirationRefTemp,
        params.productMass[i][j],
        params.respirationEnthalpy,
        dt
      );

      // Convective heat transfer (positive = heat to air)
      const Qconv = heat.convectiveHeat(
        hEff,
        params.positionFactor[i][j],
        state.TCPI,
        Re,
        params.productArea[i][j],
        state.productTemp[i][j],
        state.airTemp[i]
      );

      // Vapor pressure deficit for evaporation
      const VPD = psychro.vaporPressureDeficit(
        state.productTemp[i][j],
        params.waterActivity,
        state.airHumidity[i]
      );

      // Evaporative cooling (positive = cooling of product)
      const Qevap = heat.evaporativeCooling(
        params.evaporativeMassTransfer,
        params.productArea[i][j],
        params.surfaceWetness,
        VPD,
        state.productTemp[i][j],
        2.45e6 // Latent heat of vaporization
      );

      // Product temperature rate of change
      // Qresp adds heat, Qconv and Qevap remove heat
      const dTpdt = energy.productTemperatureRate(
        Qresp,
        Qconv,
        Qevap,
        params.productMass[i][j],
        params.specificHeat
      );

      // Mass transfer calculations
      const mevap = Qevap / 2.45e6; // Evaporative mass flow rate
      const dwpdt = mass.productMoistureRate(mevap, params.productMass[i][j]);

      // Update product state
      newState.productTemp[i][j] = state.productTemp[i][j] + dTpdt * dt;
      newState.productMoisture[i][j] = state.productMoisture[i][j] + dwpdt * dt;

      // Accumulate zone totals (positive = to air)
      zoneQconv += Qconv;
      zoneMevap += mevap;
    }

    // Cooling unit calculations
    const prevZoneTemp = i > 0 ? state.airTemp[i - 1] : state.airTemp[i];

    // Sensible cooling (positive = heat removed)
    const Qsensible = cooling.sensibleCooling(
      params.airFlow,
      params.airSpecificHeat,
      state.airTemp[i],
      params.coilTemp
    );

    // Dehumidification
    const mdehum = cooling.dehumidificationRate(
      params.airFlow,
      state.airHumidity[i],
      psychro.saturationHumidityRatio(params.coilTemp),
      state.airTemp[i],
      params.coilTemp
    );

    const Qlatent = mdehum * 2.45e6; // Latent cooling
    const mvent = 0; // Assume no ventilation for now

    // Air temperature rate of change
    // zoneQconv adds heat, Qsensible and Qlatent remove heat
    const dTadt = energy.airTemperatureRate(
      params.airMass[i],
      params.airSpecificHeat,
      params.airFlow,
      prevZoneTemp,
      state.airTemp[i],
      zoneQconv,
      params.wallHeatTransfer[i],
      Qsensible + Qlatent
    );

    // Air humidity rate of change
    const dwadt = mass.airMoistureRate(
      zoneMevap,
      mdehum,
      mvent,
      params.airMass[i]
    );

    // Update air state
    newState.airTemp[i] = state.airTemp[i] + dTadt * dt;
    newState.airHumidity[i] = state.airHumidity[i] + dwadt * dt;

    // Enforce humidity constraints
    if (
      !psychro.isHumidityValid(newState.airHumidity[i], newState.airTemp[i])
    ) {
      newState.airHumidity[i] = psychro.saturationHumidityRatio(
        newState.airTemp[i]
      );
    }

    // Accumulate total cooling
    totalQsensible += Qsensible;
    totalQlatent += Qlatent;
  }

  // Update system performance metrics
  const totalCooling = totalQsensible + totalQlatent;
  newState.coolingPower = cooling.actualCoolingPower(
    params.ratedPower,
    totalCooling,
    params.maxCoolingPower,
    state.TCPI
  );

  const COP = metrics.coefficientOfPerformance(
    totalQsensible,
    totalQlatent,
    newState.coolingPower
  );

  // Update TCPI with feedback from COP
  newState.TCPI = Math.min(
    1.0,
    state.TCPI * (1 + 0.1 * (COP / params.TCPITarget - 1))
  );

  // Monitor energy flows
  energy.calculateEnergyFlows(newState, params, dt);

  return newState;
}
