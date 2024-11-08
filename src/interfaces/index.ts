/**
 * Core domain models representing physical components
 */
interface PhysicalDimensions {
  length: number; // meters
  width: number; // meters
  height: number; // meters
}

interface HydraulicProperties {
  hydraulicDiameter: number;
  crossSectionalArea: number;
  viscosity: number; // μ
  gasConstant: number; // R
  pressure: number; // Atmospheric pressure (Pa)
}

/**
 * Temperature and moisture state
 */
interface ThermalState {
  temperature: number; // °C
  moisture: number; // kg water/kg dry matter
}

/**
 * Product-specific properties
 */
interface ProductProperties {
  mass: number; // kg
  area: number;
  specificHeat: number; // J/(kg·K)
  waterActivity: number; // dimensionless (0-1)
  respiration: RespirationProperties;
}

interface RespirationProperties {
  baseRate: number; // W/kg
  temperatureCoeff: number; // 1/K
  referenceTemp: number; // °C
  enthalpy: number; // J/kg
}

/**
 * Air properties and flow characteristics
 */
interface AirProperties extends ThermalState {
  mass: number; // kg
  flow: number; // kg/s
  density: number; // kg/m³
  specificHeat: number; // J/(kg·K)
  reynoldsNumber: number; // dimensionless
}

/**
 * Heat transfer properties
 */
interface HeatTransferProperties {
  baseCoefficient: number; // W/(m²·K)
  positionFactor: number; // dimensionless
  massTransferCoeff: number; // m/s
  surfaceWetness: number; // dimensionless (0-1)
  lewisNumber: number; // dimensionless
}

/**
 * Cooling system properties
 */
interface CoolingSystem {
  maxPower: number; // W
  ratedPower: number; // W
  coilTemp: number; // °C
  dewPoint: number; // °C
  latentHeat: number; // J/kg
}

interface CoolingMetrics {
  power: number; // W (electrical power consumed)
  sensible: number; // W (positive = cooling)
  latent: number; // W (positive = cooling)
  dehumidification: number; // kg/s (positive = removing moisture)
  COP: number; // Coefficient of Performance
}

/**
 * Control system properties
 */
interface TCPIProperties {
  current: number; // dimensionless (0-1)
  target: number; // dimensionless (0-1)
  minimum: number; // dimensionless (0-1)
  turbulenceSensitivity: number; // α
  energyFactor: number; // β
  uniformitySensitivity: number; // γ
}

/**
 * Energy and mass flow tracking
 */
interface ConservationFlow {
  input: number;
  output: number;
  stored: number;
}

interface SystemFlows {
  energy: ConservationFlow; // Units: J
  moisture: ConservationFlow; // Units: kg
}

/**
 * Performance metrics
 */
interface PerformanceMetrics {
  coolingRateIndex: number; // dimensionless
  seventhEighthsCoolingTime: number | null; // seconds
  uniformityIndex: number; // dimensionless
  moistureEfficiency: number; // dimensionless
}

/**
 * Simulation configuration and state
 */
interface SimulationConfig {
  maxTime: number; // seconds
  minTime: number; // seconds
  maxSteps: number; // count
  tolerances: {
    conservation: number;
    convergence: number;
  };
  initialState: ThermalState & {
    TCPI: number;
  };
}

/**
 * Layer, Zone, and System States
 */
interface LayerState extends ThermalState {
  productProperties: ProductProperties;
  heatTransfer: HeatTransferProperties;
}

interface ZoneState {
  air: AirProperties;
  layers: LayerState[];
  cooling: CoolingMetrics;
  TCPI: TCPIProperties;
  flows: SystemFlows;
  dimensions: PhysicalDimensions;
}

interface SystemState {
  time: number;
  step: number;
  zones: ZoneState[];
  dimensions: PhysicalDimensions;
  hydraulics: HydraulicProperties;
}

/**
 * Simulation results
 */
interface SimulationResult {
  finalState: SystemState;
  history: SystemState[];
  converged: boolean;
  conservationViolated: boolean;
  metrics: PerformanceMetrics;
}

export type {
  PhysicalDimensions,
  HydraulicProperties,
  ThermalState,
  ProductProperties,
  RespirationProperties,
  AirProperties,
  HeatTransferProperties,
  CoolingSystem,
  CoolingMetrics,
  TCPIProperties,
  ConservationFlow,
  SystemFlows,
  PerformanceMetrics,
  SimulationConfig,
  LayerState,
  ZoneState,
  SystemState,
  SimulationResult,
};
