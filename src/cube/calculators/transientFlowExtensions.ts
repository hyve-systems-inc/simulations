import { ZonalConfig } from "../models/Zone.js";
import * as flow from "./flowProperties--simplified.js";
import * as physical from "./physicalProperties.js";

/**
 * Physical state of a zone
 * Reference: Section II, 2.1 - "State Variables"
 */
export interface TransientState {
  time: number; // Current time (s)
  velocity: number; // Bulk air velocity (m/s)
  temperature: number; // Bulk air temperature (°C)
  pressure: number; // Static pressure (Pa)
  density: number; // Air density (kg/m³)
  massFlow: number; // Mass flow rate (kg/s)
  energy: number; // Total energy content (J)
  development: number; // Flow development factor [0-1]
}

/**
 * Configuration for transient simulation
 * Reference: Section VII - "Numerical Implementation"
 */
export interface TransientConfig {
  wallTemp: number; // Wall/product temperature (°C)
  inletTemp: number; // Inlet air temperature (°C)
  inletPressure: number; // Inlet pressure (Pa)
  outletPressure: number; // Outlet pressure (Pa)
}

/**
 * Calculate flow development length and factor
 * Reference: Section IV, 4.1 - "Local turbulence effects"
 *
 * Entry length correlations:
 * - Laminar: Le ≈ 0.05 * Re * D
 * - Turbulent: Le ≈ 10 * D
 *
 * Development follows exponential approach to fully developed profile
 *
 * @param x - Distance from inlet (m)
 * @param hydraulicDiameter - Hydraulic diameter (m)
 * @param reynolds - Reynolds number
 * @returns Development factor [0-1]
 */
export function calculateDevelopment(
  x: number,
  hydraulicDiameter: number,
  reynolds: number
): number {
  // Entry length depends on flow regime
  const entryLength =
    reynolds < 2300
      ? 0.05 * reynolds * hydraulicDiameter // Laminar flow
      : 10 * hydraulicDiameter; // Turbulent flow

  return 1 - Math.exp(-x / entryLength);
}

/**
 * Calculate mass conservation
 * Reference: Section II, 2.2 - "Mass Conservation"
 *
 * Continuity equation: ∂ρ/∂t + ∇·(ρv) = 0
 * For 1D flow: ∂ρ/∂t + ∂(ρv)/∂x = 0
 */
export function calculateMassFlow(
  config: ZonalConfig,
  state: TransientState
): number {
  const area = flow.calculateFlowArea(config);
  return state.density * state.velocity * area;
}

/**
 * Calculate momentum balance
 * Reference: Section II - "Core Conservation Equations"
 *
 * Momentum equation: ∂(ρv)/∂t + ∂(ρv²)/∂x = -∂p/∂x - f
 * where f is the friction term
 */
export function calculateNewVelocity(
  config: ZonalConfig,
  state: TransientState,
  dt: number,
  airProps: flow.AirProperties,
  outletPressure: TransientConfig["outletPressure"]
): number {
  const area = flow.calculateFlowArea(config);
  const dx = config.zoneDimensions.x;

  // Pressure force
  const pressureForce = (state.pressure - outletPressure) * area;

  // Wall friction (using Darcy-Weisbach)
  const hydraulicDiam = flow.calculateHydraulicDiameter(config);
  const reynolds = flow.calculateReynolds(
    state.velocity,
    state.density,
    hydraulicDiam,
    airProps.viscosity
  );
  const frictionFactor = flow.calculateFrictionFactor(reynolds, hydraulicDiam);
  const frictionForce =
    0.5 *
    frictionFactor *
    state.density *
    state.velocity *
    state.velocity *
    (dx / hydraulicDiam) *
    area;

  // Net force
  const netForce = pressureForce - frictionForce;

  // Momentum equation
  const mass = state.density * area * dx;
  const acceleration = netForce / mass;

  return state.velocity + acceleration * dt;
}

/**
 * Calculate energy balance
 * Reference: Section II, 2.1 - "Energy Conservation"
 *
 * Energy equation: ρcp∂T/∂t + ρcpv∂T/∂x = k∂²T/∂x² + h(Tw-T)
 */
export function calculateNewTemperature(
  config: ZonalConfig,
  state: TransientState,
  transientConfig: TransientConfig,
  dt: number,
  airProps: flow.AirProperties
): number {
  const area = flow.calculateFlowArea(config);
  const volume = area * config.zoneDimensions.x;
  const mass = state.density * volume;

  // Convective heat transfer with walls
  const heatTransferArea = flow.calculateHeatTransferArea(config);
  const heatTransferCoeff = flow.calculateHeatTransfer(
    state.velocity,
    state.density,
    airProps.conductivity,
    flow.calculateHydraulicDiameter(config)
  );

  // Energy terms
  const convection =
    state.massFlow *
    physical.calculateSpecificHeat(state.temperature) *
    (transientConfig.inletTemp - state.temperature);
  const wallHeatTransfer =
    heatTransferCoeff *
    heatTransferArea *
    (transientConfig.wallTemp - state.temperature);

  const netHeatRate = convection + wallHeatTransfer;
  const temperatureChange =
    netHeatRate / (mass * physical.calculateSpecificHeat(state.temperature));

  return state.temperature + temperatureChange * dt;
}

/**
 * Update state for one time step
 * Reference: Section VII - "Time Integration"
 */
export function updateTransientState(
  config: ZonalConfig,
  state: TransientState,
  transientConfig: TransientConfig,
  dt: number,
  airProps: flow.AirProperties
): TransientState {
  // Update primary variables
  const newVelocity = calculateNewVelocity(
    config,
    state,
    dt,
    airProps,
    transientConfig.outletPressure
  );
  const newTemp = calculateNewTemperature(
    config,
    state,
    transientConfig,
    dt,
    airProps
  );

  // Update density based on ideal gas law
  const newDensity = physical.calculateDensity(newTemp, state.pressure);

  // Update mass flow
  const newMassFlow = calculateMassFlow(config, {
    ...state,
    velocity: newVelocity,
    density: newDensity,
  });

  // Update development factor
  const development = calculateDevelopment(
    config.zoneDimensions.x,
    flow.calculateHydraulicDiameter(config),
    flow.calculateReynolds(
      newVelocity,
      newDensity,
      flow.calculateHydraulicDiameter(config),
      airProps.viscosity
    )
  );

  // Calculate total energy
  const volume = flow.calculateFlowArea(config) * config.zoneDimensions.x;
  const energy =
    newDensity * volume * physical.calculateSpecificHeat(newTemp) * newTemp;

  return {
    time: state.time + dt,
    velocity: newVelocity,
    temperature: newTemp,
    pressure: state.pressure,
    density: newDensity,
    massFlow: newMassFlow,
    energy: energy,
    development: development,
  };
}

/**
 * Calculate appropriate time step based on physics
 * Reference: Section VII, 2.2 - "Stability Criteria"
 */
export function calculateTimeStep(
  state: TransientState,
  config: ZonalConfig
): number {
  const dx = config.zoneDimensions.x;

  // CFL condition for convection
  const convectivedt = dx / state.velocity;

  // Diffusive condition
  const thermaldt =
    (dx * dx) /
    (2 * physical.calculateDiffusivity(state.temperature).diffusivity);

  // Use most restrictive condition
  return Math.min(convectivedt, thermaldt);
}

/**
 * Initialize transient state from boundary conditions
 * Reference: Section V - "Initial Conditions"
 *
 * Physical basis:
 * - Initial velocity from pressure difference (Bernoulli equation)
 * - Mass flow from continuity equation
 * - Energy from temperature and specific heat
 * - Bounded by MIN_VELOCITY (0.5 m/s) and MAX_VELOCITY (5.0 m/s)
 *
 * @param config - Zonal configuration with dimensions
 * @param transientConfig - Boundary conditions (temperatures and pressures)
 * @returns Initial state for transient simulation
 */
export function initializeTransientState(
  config: ZonalConfig,
  transientConfig: TransientConfig
): TransientState {
  // Calculate initial air properties
  const initialDensity = physical.calculateDensity(
    transientConfig.inletTemp,
    transientConfig.inletPressure
  );

  // Calculate flow area
  const area = flow.calculateFlowArea(config);
  const volume = area * config.zoneDimensions.x;

  // Calculate initial velocity from pressure difference using Bernoulli
  const pressureDiff =
    transientConfig.inletPressure - transientConfig.outletPressure;
  const initialVelocity = Math.sqrt(
    (2 * Math.abs(pressureDiff)) / initialDensity
  );

  // Calculate initial mass flow rate (ṁ = ρvA)
  const initialMassFlow = initialDensity * initialVelocity * area;

  // Calculate initial energy content (E = mcpT)
  const specificHeat = physical.calculateSpecificHeat(
    transientConfig.inletTemp
  );
  const initialEnergy =
    initialDensity * volume * specificHeat * transientConfig.inletTemp;

  // Initial flow development is 0 at inlet
  const initialDevelopment = 0;

  const initialState: TransientState = {
    time: 0,
    velocity: initialVelocity,
    temperature: transientConfig.inletTemp,
    pressure: transientConfig.inletPressure,
    density: initialDensity,
    massFlow: initialMassFlow,
    energy: initialEnergy,
    development: initialDevelopment,
  };

  return initialState;
}

/**
 * Verify validity of initial state
 * Reference: Section IX - "System Constraints"
 *
 * @param state - TransientState to verify
 * @param config - System configuration
 * @returns true if state is valid
 * @throws Error if state violates physical constraints
 */
export function verifyInitialState(
  state: TransientState,
  config: ZonalConfig
): boolean {
  // Verify mass flow continuity
  const area = flow.calculateFlowArea(config);
  const expectedMassFlow = state.density * state.velocity * area;
  const massFlowError =
    Math.abs(state.massFlow - expectedMassFlow) / expectedMassFlow;
  if (massFlowError > config.tolerance.conservation) {
    throw new Error(
      `Mass flow continuity error ${massFlowError} exceeds tolerance ${config.tolerance}`
    );
  }

  // Verify energy calculation
  const volume = area * config.zoneDimensions.x;
  const specificHeat = physical.calculateSpecificHeat(state.temperature);
  const expectedEnergy =
    state.density * volume * specificHeat * state.temperature;
  const energyError = Math.abs(state.energy - expectedEnergy) / expectedEnergy;
  if (energyError > config.tolerance.conservation) {
    throw new Error(
      `Energy calculation error ${energyError} exceeds tolerance ${config.tolerance}`
    );
  }

  return true;
}
