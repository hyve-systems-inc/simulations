import { Position } from "./Position.js";
import { ZonalConfig } from "./Zone.js";
import * as flow from "../calculators/flowProperties.js";
import * as physical from "../calculators/physicalProperties.js";

/**
 * System state manager for handling time evolution of the cooling system
 * Reference: Section XI - "Numerical Solution Method"
 */
export class SystemStateManager {
  private currentTime: number = 0;
  private timeStep: number = 0;
  private states: Map<string, ZonalState> = new Map();
  private conservationErrors: ConservationErrors = {
    energy: 0,
    mass: 0,
  };

  /**
   * Create a new system state manager
   * @param config - System configuration parameters
   * @param initialStates - Initial state for each zone
   */
  constructor(
    private readonly config: ZonalConfig,
    initialStates?: Map<string, ZonalState>
  ) {
    if (initialStates) {
      this.states = new Map(initialStates);
    }
    this.timeStep = this.calculateTimeStep();
  }

  /**
   * Calculate appropriate time step based on stability criteria
   * Reference: Section XI, 11.2 - "Step 1: Initialize"
   * @returns Time step in seconds
   */
  private calculateTimeStep(): number {
    // Get a reference state for property calculations
    const refState = this.getAverageState();
    const refPos = new Position(0, 0, 0);
    const props = physical.getProperties(refState.airTemp);

    // Calculate characteristic times
    // 1. Convective time scale: L/(10 * v)
    const convectiveTime =
      this.config.zoneDimensions.x /
      (10 *
        flow.calculateVelocityProfile(refPos, refState.airTemp, this.config)
          .axial);

    // 2. Thermal time scale: mp * cp/(10 * h * A)
    // Approximate h using Reynolds number correlation
    const re = flow.calculateReynoldsNumber(refState, refPos, this.config);
    const h =
      (0.023 * props.thermalConductivity * Math.pow(re, 0.8)) /
      flow.calculateHydraulicDiameter(refPos, this.config);
    const thermalTime =
      (props.airDensity * props.specificHeat) /
      (10 * h * flow.calculateProduceSurfaceArea(refPos, this.config));

    // 3. Mass flow time scale: ma/(10 * ṁa)
    const zoneVolume =
      this.config.zoneDimensions.x *
      this.config.zoneDimensions.y *
      this.config.zoneDimensions.z;
    const massFlowTime =
      (props.airDensity * zoneVolume) /
      (10 * props.airDensity * flow.calculateFlowArea(refPos, this.config));

    // Take minimum time step for stability
    return Math.min(convectiveTime, thermalTime, massFlowTime);
  }

  /**
   * Advance system state by one time step
   * Reference: Section XI, 11.2 - "Step 2: Time Integration"
   * @returns Updated system state
   */
  public evolveState(): void {
    // Store previous state for conservation checks
    const previousStates = new Map(this.states);

    // 1. Calculate auxiliary variables for each zone
    const auxiliaryVars = this.calculateAuxiliaryVariables();

    // 2. Calculate heat and mass flows
    const flows = this.calculateFlows(auxiliaryVars);

    // 3. Update state variables using Forward Euler
    this.updateStates(flows);

    // 4. Apply constraints
    this.applyConstraints();

    // 5. Check conservation
    this.checkConservation(previousStates);

    // Advance time
    this.currentTime += this.timeStep;
  }

  /**
   * Calculate auxiliary variables for all zones
   * Reference: Section XI, 11.2 - "Step 2.1"
   */
  private calculateAuxiliaryVariables(): Map<string, AuxiliaryVariables> {
    const auxVars = new Map<string, AuxiliaryVariables>();

    for (let i = 0; i < this.config.numZones; i++) {
      for (let j = 0; j < this.config.numLayers; j++) {
        for (let k = 0; k < this.config.numPallets; k++) {
          const pos = new Position(i, j, k);
          const state = this.getState(pos);

          const re = flow.calculateReynoldsNumber(state, pos, this.config);
          const turbulence = flow.calculateTurbulenceIntensity(re);
          const distribution = flow.calculateFlowDistribution(
            pos,
            turbulence,
            this.config
          );

          auxVars.set(pos.toString(), {
            reynoldsNumber: re,
            turbulenceIntensity: turbulence,
            flowDistribution: distribution,
          });
        }
      }
    }

    return auxVars;
  }

  /**
   * Calculate heat and mass flows for all zones
   * Reference: Section XI, 11.2 - "Step 2.2"
   */
  private calculateFlows(
    auxVars: Map<string, AuxiliaryVariables>
  ): Map<string, FlowRates> {
    const flows = new Map<string, FlowRates>();

    for (let i = 0; i < this.config.numZones; i++) {
      for (let j = 0; j < this.config.numLayers; j++) {
        for (let k = 0; k < this.config.numPallets; k++) {
          const pos = new Position(i, j, k);
          const state = this.getState(pos);
          const aux = auxVars.get(pos.toString())!;

          // Calculate respiration heat
          const qResp = this.calculateRespirationHeat(state);

          // Calculate convective heat transfer
          const qConv = this.calculateConvectiveHeat(state, pos, aux);

          // Calculate evaporative mass transfer
          const mEvap = this.calculateEvaporativeMass(state, pos, aux);

          // Calculate evaporative cooling
          const qEvap = mEvap * 2.5e6; // Approximate latent heat of vaporization

          flows.set(pos.toString(), {
            qResp,
            qConv,
            qEvap,
            mEvap,
          });
        }
      }
    }

    return flows;
  }

  /**
   * Update state variables using Forward Euler method
   * Reference: Section XI, 11.2 - "Step 2.3"
   */
  private updateStates(flows: Map<string, FlowRates>): void {
    for (let i = 0; i < this.config.numZones; i++) {
      for (let j = 0; j < this.config.numLayers; j++) {
        for (let k = 0; k < this.config.numPallets; k++) {
          const pos = new Position(i, j, k);
          const state = this.getState(pos);
          const flow = flows.get(pos.toString())!;
          const props = physical.getProperties(state.airTemp);

          // Update product temperature
          // dTp/dt = (Qresp - Qconv - Qevap)/(mp * cp)
          const dTp =
            (flow.qResp - flow.qConv - flow.qEvap) /
            (props.airDensity * props.specificHeat);

          // Update air temperature
          // dTa/dt = (ṁa * cp,air * (Ta,i-1 - Ta,i) + Qconv - Qcool)/(ma * cp,air)
          const prevState =
            i > 0 ? this.getState(new Position(i - 1, j, k)) : state;
          const dTa =
            (props.airDensity *
              props.specificHeat *
              (prevState.airTemp - state.airTemp) +
              flow.qConv) /
            (props.airDensity * props.specificHeat);

          // Update product moisture
          // dwp/dt = -mevap/mp
          const dWp = -flow.mEvap / (props.airDensity * this.getZoneVolume());

          // Update air humidity
          // dwa/dt = (mevap - mdehum + mvent)/ma
          const dWa = flow.mEvap / (props.airDensity * this.getZoneVolume());

          // Apply Euler integration
          const newState: ZonalState = {
            productTemp: state.productTemp + dTp * this.timeStep,
            productMoisture: state.productMoisture + dWp * this.timeStep,
            airTemp: state.airTemp + dTa * this.timeStep,
            airHumidity: state.airHumidity + dWa * this.timeStep,
            velocity: state.velocity,
          };

          this.states.set(pos.toString(), newState);
        }
      }
    }
  }

  /**
   * Apply physical constraints to state variables
   * Reference: Section XI, 11.2 - "Step 2.4"
   */
  private applyConstraints(): void {
    for (const [key, state] of this.states) {
      const airTemp = state.airTemp;

      // Calculate saturation humidity at current temperature
      const psat = physical.calculateSaturationPressure(airTemp);
      const wsat = (0.622 * psat) / (101325 - psat);

      // Apply constraints
      const constrainedState: ZonalState = {
        ...state,
        airHumidity: Math.min(state.airHumidity, wsat),
        productMoisture: Math.max(0, state.productMoisture),
        airTemp: Math.max(-30, Math.min(50, state.airTemp)),
      };

      this.states.set(key, constrainedState);
    }
  }

  /**
   * Check conservation of mass and energy
   * Reference: Section XI, 11.4 - "Error Handling"
   */
  private checkConservation(previousStates: Map<string, ZonalState>): void {
    let totalMassDiff = 0;
    let totalEnergyDiff = 0;
    const props = physical.getProperties(this.getAverageState().airTemp);

    for (const [key, currentState] of this.states) {
      const prevState = previousStates.get(key)!;
      const volume = this.getZoneVolume();

      // Mass conservation
      const massDiff =
        props.airDensity *
        volume *
        (currentState.airHumidity - prevState.airHumidity);
      totalMassDiff += Math.abs(massDiff);

      // Energy conservation
      const energyDiff =
        props.airDensity *
        volume *
        props.specificHeat *
        (currentState.airTemp -
          prevState.airTemp +
          (currentState.productTemp - prevState.productTemp));
      totalEnergyDiff += Math.abs(energyDiff);
    }

    this.conservationErrors = {
      mass: totalMassDiff,
      energy: totalEnergyDiff,
    };

    // Check for excessive errors
    const tolerance = 1e-6;
    if (totalMassDiff > tolerance || totalEnergyDiff > tolerance) {
      console.warn(
        `Conservation errors exceeded tolerance: Mass=${totalMassDiff}, Energy=${totalEnergyDiff}`
      );
    }
  }

  // Helper methods

  private getState(position: Position): ZonalState {
    const state = this.states.get(position.toString());
    if (!state) {
      throw new Error(`No state found for position ${position.toString()}`);
    }
    return state;
  }

  private getZoneVolume(): number {
    return (
      this.config.zoneDimensions.x *
      this.config.zoneDimensions.y *
      this.config.zoneDimensions.z
    );
  }

  private getAverageState(): ZonalState {
    let sumTemp = 0;
    let sumHumidity = 0;
    let count = 0;

    for (const state of this.states.values()) {
      sumTemp += state.airTemp;
      sumHumidity += state.airHumidity;
      count++;
    }

    return {
      airTemp: sumTemp / count,
      airHumidity: sumHumidity / count,
      productTemp: sumTemp / count,
      productMoisture: sumHumidity / count,
      velocity: 1.0, // Default velocity
    };
  }

  // Heat and mass transfer calculations

  private calculateRespirationHeat(state: ZonalState): number {
    const rRef = 1e-4; // Reference respiration rate (W/kg)
    const k = 0.1; // Temperature sensitivity
    const Tref = 20; // Reference temperature
    return rRef * Math.exp(k * (state.productTemp - Tref));
  }

  private calculateConvectiveHeat(
    state: ZonalState,
    position: Position,
    aux: AuxiliaryVariables
  ): number {
    const props = physical.getProperties(state.airTemp);
    const h =
      (0.023 * props.thermalConductivity * Math.pow(aux.reynoldsNumber, 0.8)) /
      flow.calculateHydraulicDiameter(position, this.config);

    return (
      h *
      flow.calculateProduceSurfaceArea(position, this.config) *
      (state.productTemp - state.airTemp)
    );
  }

  private calculateEvaporativeMass(
    state: ZonalState,
    position: Position,
    aux: AuxiliaryVariables
  ): number {
    const aw = 0.98; // Water activity
    const props = physical.getProperties(state.airTemp);

    // Vapor pressure deficit calculation
    const psat = physical.calculateSaturationPressure(state.productTemp);
    const VPD =
      psat * aw - (state.airHumidity * 101325) / (0.622 + state.airHumidity);

    // Mass transfer coefficient from heat-mass transfer analogy
    const hm =
      (0.023 * props.diffusivity * Math.pow(aux.reynoldsNumber, 0.8)) /
      flow.calculateHydraulicDiameter(position, this.config);

    return (
      (hm * flow.calculateProduceSurfaceArea(position, this.config) * VPD) /
      (461.5 * (state.productTemp + 273.15))
    );
  }

  // Getters for system state

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getTimeStep(): number {
    return this.timeStep;
  }

  public getStates(): Map<string, ZonalState> {
    return new Map(this.states);
  }

  public getConservationErrors(): ConservationErrors {
    return { ...this.conservationErrors };
  }
}

interface AuxiliaryVariables {
  reynoldsNumber: number;
  turbulenceIntensity: number;
  flowDistribution: number;
}
interface FlowRates {
  qResp: number; // Respiration heat (W)
  qConv: number; // Convective heat transfer (W)
  qEvap: number; // Evaporative cooling (W)
  mEvap: number; // Evaporative mass transfer (kg/s)
}

interface ConservationErrors {
  mass: number; // Total mass conservation error (kg)
  energy: number; // Total energy conservation error (J)
}

export interface SystemStateSnapshot {
  time: number;
  states: Map<string, ZonalState>;
  conservationErrors: ConservationErrors;
}

/**
 * State variables for a zone
 */
export interface ZonalState {
  productTemp: number; // °C
  productMoisture: number; // kg water/kg dry matter
  airTemp: number; // °C
  airHumidity: number; // kg water/kg dry air
  velocity: number; // m/s
}
