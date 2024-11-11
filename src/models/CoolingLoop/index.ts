import { PHYSICS_CONSTANTS } from "../constants.js";
import { CoolingUnit, CoolingUnitState } from "../CoolingUnit/index.js";
import { LayerFlowConditions } from "../Layer/lib/calculateLocalFlow.js";
import { Pallet } from "../Pallet/index.js";
import { PalletPerformance } from "../Pallet/lib/palletPerformance.js";

// types/CoolingLoop.ts
export interface FlowState {
  temperature: number;
  humidity: number;
  flowRate: number;
}

export interface FlowPosition {
  vertical: number; // Height position (0-1)
  horizontal: number; // Position along flow path (0-1)
  lateral: number; // Position across width (0-1)
}

export interface FlowDistributionResult {
  effectiveFlowRate: number;
  turbulenceIntensity: number;
}

export interface FlowModelConfig {
  alpha: number; // Flow reduction factor
  beta: number; // Vertical decay coefficient
}

export interface CoolingLoopConfig {
  ratedPower: number; // W
  minCoilTemp: number; // °C
  targetTemperature: number; // °C
  targetHumidity: number; // kg/kg
  baseFlowRate: number; // kg/s
  flowModelConfig: FlowModelConfig;
}
export interface CoolingLoopPerformance {
  loopIndex: number; // Identifies which loop (0 or 1)
  palletPerformances: PalletPerformance[]; // Performance of each pallet in sequence
  totalHeatTransfer: number; // Total heat removed from all pallets (W)
  supplyAirState: FlowState; // Air conditions at cooling unit output
  returnAirState: FlowState; // Air conditions returning to cooling unit
  coolingUnitState: CoolingUnitState; // Current state of the cooling unit
}

export type FlowDistributionCalculator = (
  baseFlow: FlowState,
  position: FlowPosition,
  config: FlowModelConfig
) => FlowDistributionResult;

// CoolingLoop.ts
export class CoolingLoop {
  private coolingUnit: CoolingUnit;
  private pallets: Pallet[];
  private supplyAirState: FlowState;
  private returnAirState: FlowState;
  private config: CoolingLoopConfig;
  private readonly calculateFlowDistribution: FlowDistributionCalculator;

  constructor(
    config: CoolingLoopConfig,
    pallets: Pallet[],
    calculateFlowDistribution: FlowDistributionCalculator
  ) {
    this.config = config;
    this.pallets = pallets;
    this.calculateFlowDistribution = calculateFlowDistribution;

    this.coolingUnit = new CoolingUnit(
      {
        targetTemperature: config.targetTemperature,
        targetHumidity: config.targetHumidity,
        minCoilTemp: config.minCoilTemp,
        maxPower: config.ratedPower,
        tcpiTarget: 0.95,
        controlUpdateInterval: 60,
      },
      {
        maxPower: 5000, // W
        nominalVoltage: 48, // V
        energyCapacity: 33000, // Wh
      }
    );

    const initialAirState: FlowState = {
      temperature: config.targetTemperature,
      humidity: config.targetHumidity,
      flowRate: config.baseFlowRate,
    };

    this.supplyAirState = { ...initialAirState };
    this.returnAirState = { ...initialAirState };
  }

  /**
   * Updates the thermal state of this cooling loop and its pallets
   */
  public update(timeStep: number, loopIndex: number): CoolingLoopPerformance {
    // Process return air through cooling unit
    const dehumResult = this.coolingUnit.calculateDehumidification(
      this.returnAirState.temperature,
      this.returnAirState.humidity,
      this.returnAirState.flowRate
    );

    // Update supply air conditions
    this.supplyAirState = {
      temperature:
        this.returnAirState.temperature -
        dehumResult.sensibleHeatRemoved /
          (this.returnAirState.flowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR),
      humidity:
        this.returnAirState.humidity -
        dehumResult.massDehumidified / this.returnAirState.flowRate,
      flowRate: this.config.baseFlowRate,
    };

    // Update pallets in sequence
    const palletPerformances: PalletPerformance[] = [];
    let currentAirState = { ...this.supplyAirState };

    for (let i = 0; i < this.pallets.length; i++) {
      const flowConditions = this.createFlowConditions(currentAirState, i);
      const performance = this.pallets[i].updateThermalState(
        flowConditions,
        timeStep
      );
      palletPerformances.push(performance);

      currentAirState = this.calculateAirStateAfterPallet(
        currentAirState,
        performance
      );
    }

    // Update return air state
    this.returnAirState = currentAirState;

    // Update cooling unit control
    this.coolingUnit.updateCoolingPower(palletPerformances, timeStep);

    const totalHeatTransfer = palletPerformances.reduce(
      (sum, perf) => sum + perf.totalHeatTransfer,
      0
    );

    return {
      loopIndex,
      palletPerformances,
      totalHeatTransfer,
      supplyAirState: { ...this.supplyAirState },
      returnAirState: { ...this.returnAirState },
      coolingUnitState: this.coolingUnit.getState(),
    };
  }

  /**
   * Creates flow conditions for a pallet based on its position
   */
  private createFlowConditions(
    airState: FlowState,
    positionIndex: number
  ): LayerFlowConditions {
    const flowPosition: FlowPosition = {
      vertical: positionIndex / (this.pallets.length - 1),
      horizontal: positionIndex / (this.pallets.length - 1),
      lateral: 0.5, // Center of the flow path
    };

    const flowResult = this.calculateFlowDistribution(
      airState,
      flowPosition,
      this.config.flowModelConfig
    );

    return {
      massFlowRate: flowResult.effectiveFlowRate,
      inletTemperature: airState.temperature,
      inletHumidity: airState.humidity,
      ambientTemperature: this.config.targetTemperature,
      turbulenceIntensity: flowResult.turbulenceIntensity,
    };
  }

  /**
   * Calculates air state after passing through a pallet
   */
  private calculateAirStateAfterPallet(
    inletState: FlowState,
    performance: PalletPerformance
  ): FlowState {
    const energyToAir = -performance.totalHeatTransfer;
    const deltaT =
      energyToAir / (inletState.flowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR);

    return {
      temperature: inletState.temperature + deltaT,
      humidity: inletState.humidity, // Update based on your moisture transfer model
      flowRate: inletState.flowRate,
    };
  }

  // Getters
  public getSupplyAirState(): FlowState {
    return { ...this.supplyAirState };
  }

  public getReturnAirState(): FlowState {
    return { ...this.returnAirState };
  }

  public getCoolingUnitState(): CoolingUnitState {
    return this.coolingUnit.getState();
  }

  public getPallets(): Pallet[] {
    return [...this.pallets];
  }
}

// Example basic flow distribution calculator
export const calculateBasicFlowDistribution = (
  baseFlow: FlowState,
  position: FlowPosition,
  config: FlowModelConfig
): FlowDistributionResult => {
  const verticalEfficiency =
    PHYSICS_CONSTANTS.MAX_FLOW_EFFICIENCY *
    (1 - config.alpha * Math.exp(-config.beta * position.vertical));

  const effectiveFlowRate = baseFlow.flowRate * verticalEfficiency;

  const reynolds =
    (PHYSICS_CONSTANTS.AIR_DENSITY *
      effectiveFlowRate *
      PHYSICS_CONSTANTS.HYDRAULIC_DIAMETER) /
    PHYSICS_CONSTANTS.AIR_VISCOSITY;

  const turbulenceIntensity =
    PHYSICS_CONSTANTS.TURBULENCE_COEFFICIENT * Math.pow(reynolds, -1 / 8);

  return {
    effectiveFlowRate,
    turbulenceIntensity,
  };
};
