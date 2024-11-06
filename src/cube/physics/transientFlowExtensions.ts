import {
  COMMODITY_PROPERTIES,
  CommodityProperties,
  PACKAGING_CONFIGS,
  PackagingConfig,
} from "../cube.js";
import { Position } from "../models/Position.js";
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

  // Development rate varies with Reynolds number
  let developmentRate: number;

  if (reynolds < 2300) {
    // Laminar: development rate inversely proportional to Re
    // Scale down development rate to get proper progression
    developmentRate = 0.5 * (2300 / reynolds);
  } else {
    // Turbulent: use turbulence intensity correlation
    const turbulenceIntensity = 0.16 * Math.pow(reynolds, -0.125);
    developmentRate = 0.5 / turbulenceIntensity;
  }

  // Ensure smooth development progression
  return Math.min(1.0, 1 - Math.exp((-developmentRate * x) / entryLength));
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
 * Interpolate pressure based on position in flow direction
 * Reference: Section IV - "Flow Distribution"
 *
 * Physical basis:
 * - Pressure varies linearly from inlet to outlet
 * - Only depends on position in flow direction (i)
 * - Uses Position class methods for readability and consistency
 */
export function interpolatePressure(
  transientConfig: TransientConfig,
  position: Position,
  config: ZonalConfig
): number {
  if (position.isInlet()) {
    return transientConfig.inletPressure;
  }
  if (position.isOutlet(config)) {
    return transientConfig.outletPressure;
  }

  // Linear pressure drop along flow path
  const { flowPosition } = position.getRelativePosition(config);
  return (
    transientConfig.inletPressure -
    flowPosition *
      (transientConfig.inletPressure - transientConfig.outletPressure)
  );
}

/**
 * Calculate pressure force for velocity update
 * Reference: Section IV - "Momentum equation: ∂(ρv)/∂t + ∂(ρv²)/∂x = -∂p/∂x - f"
 */
export function calculatePressureForce(
  position: Position,
  config: ZonalConfig,
  transientConfig: TransientConfig
): number {
  // Calculate pressure at current and next position
  const currentPressure = interpolatePressure(
    transientConfig,
    position,
    config
  );

  // Get next position in flow direction
  const nextPosition = new Position(position.i + 1, position.j, position.k);
  const nextPressure = position.isOutlet(config)
    ? transientConfig.outletPressure
    : interpolatePressure(transientConfig, nextPosition, config);

  // Calculate pressure difference across the zone
  const pressureDiff = currentPressure - nextPressure;

  // Calculate force from pressure difference (F = ΔP × A)
  const area = flow.calculateFlowArea(config);
  return pressureDiff * area;
}

/**
 * Calculate new velocity based on forces
 * Reference: Section IV - "Momentum equation: ∂(ρv)/∂t + ∂(ρv²)/∂x = -∂p/∂x - f"
 */
export function calculateNewVelocity(
  config: ZonalConfig,
  state: TransientState,
  position: Position,
  dt: number,
  airProps: flow.AirProperties,
  transientConfig: TransientConfig
): number {
  if (dt <= 0) {
    console.warn("Invalid time step:", dt);
  }

  const area = flow.calculateFlowArea(config);
  const hydraulicDiam = flow.calculateHydraulicDiameter(config);

  // Pressure gradient term
  const dpdx = calculatePressureGradient(position, config, transientConfig);
  const pressureForce = dpdx * area; // Force = pressure gradient * flow area

  // Reynolds number for friction factor
  const reynolds = flow.calculateReynolds(
    state.velocity,
    state.density,
    hydraulicDiam,
    airProps.viscosity
  );

  // Calculate friction factor
  const frictionFactor = flow.calculateFrictionFactor(
    Math.abs(reynolds),
    hydraulicDiam
  );

  // Friction force using correct Darcy-Weisbach formulation
  const frictionForce =
    (frictionFactor *
      state.density *
      area * // Use flow area here
      state.velocity *
      Math.abs(state.velocity)) /
    (2 * hydraulicDiam);

  // Net force produces acceleration
  const acceleration = (pressureForce + frictionForce) / (state.density * area);

  // Update velocity
  const newVelocity = state.velocity + acceleration * dt;

  return newVelocity;
}

/**
 * Calculate pressure gradient at a given position within the container.
 *
 * @param {Position} position - The current position within the container.
 * @param {ZonalConfig} config - Configuration data for the container zones.
 * @param {TransientConfig} transientConfig - Time-varying configuration, such as inlet and outlet pressures.
 *
 * @returns {number} Pressure gradient in Pa/m at the specified position.
 *
 * This function calculates the pressure gradient between two points across the zone at the given position.
 * It assumes a linear pressure drop from the inlet to the outlet along the container length.
 *
 * Reference: Section IV - "Flow distribution patterns across container"
 */
export function calculatePressureGradient(
  position: Position,
  config: ZonalConfig,
  transientConfig: TransientConfig
): number {
  const totalPressureDrop =
    transientConfig.inletPressure - transientConfig.outletPressure;
  const radialZoneIndex = position.getRadialZone(config);
  const axialZoneIndex = position.getAxialZone(config);
  const radialFactor = (radialZoneIndex + 1) / config.numLayers;
  const axialFactor = axialZoneIndex / config.numZones;
  const zoneStartPressure =
    transientConfig.inletPressure -
    radialFactor * axialFactor * totalPressureDrop;
  const zoneEndPressure =
    transientConfig.inletPressure -
    ((position.i + 1 + radialFactor) / (config.numZones - 1)) *
      totalPressureDrop;
  const dpdx = (zoneStartPressure - zoneEndPressure) / config.zoneDimensions.x;
  return dpdx;
}

export function calculateNewTemperature(
  config: ZonalConfig,
  state: TransientState,
  transientConfig: TransientConfig,
  position: Position,
  dt: number,
  airProps: flow.AirProperties,
  commodity: CommodityProperties,
  packaging: PackagingConfig
): number {
  // Geometry calculations
  const area = flow.calculateFlowArea(config);
  const volume = area * config.zoneDimensions.x;

  // Product thermal mass calculations
  const productVolume = volume * config.containerFillFactor!;
  const productMass = commodity.density * productVolume;
  const productThermalMass = productMass * commodity.specificHeat;

  // Air thermal mass calculations
  const airVolume = volume * (1 - config.containerFillFactor!);
  const airMass = state.density * airVolume;
  const airSpecificHeat = physical.calculateSpecificHeat(state.temperature);
  const airThermalMass = airMass * airSpecificHeat;

  // Box thermal mass calculations
  const baseWallArea = flow.calculateHeatTransferArea(config);
  let effectiveWallArea = baseWallArea;

  // Adjust wall area based on position
  if (position.isFlowEdge(config)) {
    effectiveWallArea *= 1.2; // 20% more wall contact at inlet/outlet
  }
  if (position.isVerticalEdge(config)) {
    effectiveWallArea *= 1.15; // 15% more wall contact at top/bottom
  }
  if (position.isLateralEdge(config)) {
    effectiveWallArea *= 1.15; // 15% more wall contact at sides
  }

  const boxMass =
    effectiveWallArea *
    packaging.boxWallThickness *
    packaging.boxMaterialDensity;
  const boxThermalMass = boxMass * packaging.boxSpecificHeat;

  // Total thermal mass
  const totalThermalMass = productThermalMass + airThermalMass + boxThermalMass;

  // Heat transfer coefficient calculations
  const hydraulicDiameter = flow.calculateHydraulicDiameter(config);
  const reynolds = flow.calculateReynolds(
    state.velocity,
    state.density,
    hydraulicDiameter,
    airProps.viscosity
  );
  const heatTransferCoeff = flow.calculateHeatTransfer(
    reynolds,
    airProps.prandtl,
    airProps.conductivity,
    hydraulicDiameter
  );

  // Flow development factor affects heat transfer
  const development = calculateDevelopment(
    position.i * config.zoneDimensions.x,
    hydraulicDiameter,
    reynolds
  );
  const developedHeatTransferCoeff =
    heatTransferCoeff * (0.8 + 0.2 * development);

  // Determine upstream temperature for convection
  let upstreamTemp = transientConfig.inletTemp;
  if (position.i > 0) {
    // Use inlet temperature only for first zone, otherwise assume previous zone temp
    upstreamTemp = state.temperature; // This should come from previous zone in practice
  }

  // Vertical temperature stratification factor
  const stratificationFactor = 1.0 + 0.1 * (position.j / config.numLayers);
  const effectiveWallTemp = transientConfig.wallTemp * stratificationFactor;

  // Energy terms calculations

  // 1. Convective heat transfer with air
  const convection =
    state.massFlow * airSpecificHeat * (upstreamTemp - state.temperature);

  // 2. Wall heat transfer (adjusted for position and development)
  const wallHeatTransfer =
    developedHeatTransferCoeff *
    effectiveWallArea *
    (effectiveWallTemp - state.temperature);

  // 3. Respiration heat (adjusted for local conditions)
  const respirationHeat =
    productMass *
    commodity.respirationRate.referenceRate *
    Math.exp(
      commodity.respirationRate.temperatureSensitivity *
        (state.temperature - commodity.respirationRate.referenceTemperature)
    );

  // 4. Evaporative cooling calculations
  const psat =
    610.78 *
    Math.exp((17.27 * state.temperature) / (state.temperature + 237.3));

  // Vapor pressure deficit considers wall effects
  const surfaceFactor = position.isEdge(config) ? 1.2 : 1.0;
  const VPD =
    (psat * commodity.moistureContent.waterActivity -
      state.pressure / (0.622 + state.pressure)) *
    surfaceFactor;

  // Mass transfer coefficient from heat-mass transfer analogy
  const hm = developedHeatTransferCoeff / (airProps.density * airSpecificHeat);

  // Evaporation rate adjusted for position
  const edgeFactor = position.isEdge(config) ? 1.1 : 1.0;
  const mevap =
    (hm *
      effectiveWallArea *
      commodity.moistureContent.wetnessFactor *
      VPD *
      edgeFactor) /
    (461.5 * (state.temperature + 273.15));

  const lambda = 2.5e6; // Latent heat of vaporization
  const evaporativeCooling = mevap * lambda;

  // Net heat rate includes all position-specific adjustments
  const netHeatRate =
    (convection + wallHeatTransfer + respirationHeat - evaporativeCooling) *
    stratificationFactor;

  // Temperature change calculation
  const temperatureChange = (netHeatRate * dt) / totalThermalMass;

  // Let physics determine the temperature
  return state.temperature + temperatureChange;
}

/**
 * Update state for one time step
 * Reference: Section VII - "Time Integration"
 */
export function updateTransientState(
  config: ZonalConfig,
  state: TransientState,
  transientConfig: TransientConfig,
  position: Position,
  dt: number,
  airProps: flow.AirProperties
): TransientState {
  // Update primary variables
  const newVelocity = calculateNewVelocity(
    config,
    state,
    position,
    dt,
    airProps,
    transientConfig
  );
  const newTemp = calculateNewTemperature(
    config,
    state,
    transientConfig,
    position,
    dt,
    airProps,
    COMMODITY_PROPERTIES.strawberry,
    PACKAGING_CONFIGS["strawberry-standard"]
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
 * Reference: Section XI - "Time step selection:
 * dt = min(
 *   L/(10 * v),           # Convective time scale
 *   mp * cp/(10 * h * A), # Thermal time scale
 *   ma/(10 * ṁa)         # Mass flow time scale
 * )"
 */
export function calculateTimeStep(
  state: TransientState,
  config: ZonalConfig
): number {
  const dx = config.zoneDimensions.x;
  const area = flow.calculateFlowArea(config);

  // Calculate physics-based time scales

  // 1. Convective time scale
  const convectivedt = dx / (10 * Math.max(Math.abs(state.velocity), 1e-6));

  // 2. Diffusive time scale based on thermal properties
  const { diffusivity } = physical.calculateDiffusivity(state.temperature);
  const thermaldt = Math.pow(dx, 2) / (20 * Math.max(diffusivity, 1e-6));

  // 3. Mass flow time scale
  const massFlowdt =
    (state.density * area * dx) /
    (10 * Math.max(Math.abs(state.massFlow), 1e-6));

  // Use smallest time scale as limiting factor
  const dt = Math.min(convectivedt, thermaldt, massFlowdt);

  if (dt <= 0) {
    throw new Error(`Invalid time step calculated: ${dt}. 
      velocity: ${state.velocity}, 
      massFlow: ${state.massFlow}, 
      density: ${state.density}`);
  }

  return dt;
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
