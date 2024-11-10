import { PHYSICS_CONSTANTS } from "../constants.js";
import { CoolingUnit, CoolingUnitState } from "../CoolingUnit/index.js";
import { LayerFlowConditions } from "../Layer/lib/calculateLocalFlow.js";
import { Pallet } from "../Pallet/index.js";
import { PalletPerformance } from "../Pallet/lib/palletPerformance.js";
import { PalletConfig } from "../Pallet/lib/validator.js";

// types/FreightContainer.ts
export interface FreightContainerConfig {
  dimensions: {
    length: number; // meters
    width: number; // meters
    height: number; // meters
  };
  refrigerationLoops: {
    ratedPower: number; // W per loop
    minCoilTemp: number; // °C
    targetTemperature: number; // °C
    targetHumidity: number; // kg/kg
    baseFlowRate: number; // kg/s per loop
  };
}

interface RefrigerationLoop {
  coolingUnit: CoolingUnit;
  pallets: [Pallet, Pallet]; // Exactly 2 pallets per loop
  supplyAirState: {
    temperature: number;
    humidity: number;
    flowRate: number;
  };
  returnAirState: {
    temperature: number;
    humidity: number;
    flowRate: number;
  };
}

// FreightContainer.ts
export class FreightContainer {
  private loops: [RefrigerationLoop, RefrigerationLoop]; // Exactly 2 loops
  private config: FreightContainerConfig;

  constructor(config: FreightContainerConfig) {
    this.validateConfig(config);
    this.config = config;

    // Initialize both refrigeration loops
    this.loops = [
      this.createRefrigerationLoop(0), // Upper row
      this.createRefrigerationLoop(1), // Lower row
    ];
  }

  /**
   * Updates the thermal state of the entire container
   * Each loop operates independently on its row of pallets
   */
  public updateContainerState(timeStep: number): ContainerPerformance {
    const loopPerformances = this.loops.map((loop, index) =>
      this.updateRefrigerationLoop(loop, index, timeStep)
    );

    return {
      loopPerformances,
      totalHeatTransfer: loopPerformances.reduce(
        (sum, perf) => sum + perf.totalHeatTransfer,
        0
      ),
      averageTemperature: this.calculateAverageTemperature(),
      coolingLoopStates: this.loops.map((loop) => loop.coolingUnit.getState()),
    };
  }

  /**
   * Updates a single refrigeration loop and its associated pallets
   * Air flows from supply -> first pallet -> second pallet -> return
   */
  private updateRefrigerationLoop(
    loop: RefrigerationLoop,
    loopIndex: number,
    timeStep: number
  ): LoopPerformance {
    // Process return air through cooling unit
    const dehumResult = loop.coolingUnit.calculateDehumidification(
      loop.returnAirState.temperature,
      loop.returnAirState.humidity,
      loop.returnAirState.flowRate
    );

    // Update supply air conditions
    loop.supplyAirState = {
      temperature:
        loop.returnAirState.temperature -
        dehumResult.sensibleHeatRemoved /
          (loop.returnAirState.flowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR),
      humidity:
        loop.returnAirState.humidity -
        dehumResult.massDehumidified / loop.returnAirState.flowRate,
      flowRate: this.config.refrigerationLoops.baseFlowRate,
    };

    // Update first pallet (supply side)
    const firstPalletFlow = this.createFlowConditions(loop.supplyAirState, 0);
    const firstPalletPerf = loop.pallets[0].updateThermalState(
      firstPalletFlow,
      timeStep
    );

    // Calculate intermediate air conditions after first pallet
    const intermediateAirState = this.calculateAirStateAfterPallet(
      loop.supplyAirState,
      firstPalletPerf
    );

    // Update second pallet (return side)
    const secondPalletFlow = this.createFlowConditions(intermediateAirState, 1);
    const secondPalletPerf = loop.pallets[1].updateThermalState(
      secondPalletFlow,
      timeStep
    );

    // Update return air conditions
    loop.returnAirState = this.calculateAirStateAfterPallet(
      intermediateAirState,
      secondPalletPerf
    );

    // Update cooling unit control based on both pallet performances
    loop.coolingUnit.updateCoolingPower(
      [firstPalletPerf, secondPalletPerf],
      timeStep
    );

    return {
      loopIndex,
      palletPerformances: [firstPalletPerf, secondPalletPerf],
      totalHeatTransfer:
        firstPalletPerf.totalHeatTransfer + secondPalletPerf.totalHeatTransfer,
      supplyAirState: { ...loop.supplyAirState },
      returnAirState: { ...loop.returnAirState },
      coolingUnitState: loop.coolingUnit.getState(),
    };
  }

  /**
   * Creates flow conditions for a pallet based on its position
   * Position 0 = supply side, Position 1 = return side
   */
  private createFlowConditions(
    airState: { temperature: number; humidity: number; flowRate: number },
    position: 0 | 1
  ): LayerFlowConditions {
    // Apply any position-specific flow adjustments
    const flowAdjustment = position === 0 ? 1.0 : 0.95; // Example: slightly reduced flow at return side

    return {
      massFlowRate: airState.flowRate * flowAdjustment,
      inletTemperature: airState.temperature,
      inletHumidity: airState.humidity,
      ambientTemperature: this.config.refrigerationLoops.targetTemperature,
    };
  }

  /**
   * Calculates air state after passing through a pallet
   */
  private calculateAirStateAfterPallet(
    inletState: { temperature: number; humidity: number; flowRate: number },
    performance: PalletPerformance
  ): { temperature: number; humidity: number; flowRate: number } {
    const energyToAir = -performance.totalHeatTransfer;
    const deltaT =
      energyToAir / (inletState.flowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR);

    return {
      temperature: inletState.temperature + deltaT,
      humidity: inletState.humidity, // Update based on your moisture transfer model
      flowRate: inletState.flowRate,
    };
  }

  private createRefrigerationLoop(loopIndex: number): RefrigerationLoop {
    const coolingUnit = new CoolingUnit({
      targetTemperature: this.config.refrigerationLoops.targetTemperature,
      targetHumidity: this.config.refrigerationLoops.targetHumidity,
      minCoilTemp: this.config.refrigerationLoops.minCoilTemp,
      maxPower: this.config.refrigerationLoops.ratedPower,
      tcpiTarget: 0.95,
      controlUpdateInterval: 60,
    });

    const initialAirState = {
      temperature: this.config.refrigerationLoops.targetTemperature,
      humidity: this.config.refrigerationLoops.targetHumidity,
      flowRate: this.config.refrigerationLoops.baseFlowRate,
    };

    return {
      coolingUnit,
      pallets: [
        new Pallet(this.createPalletConfig()),
        new Pallet(this.createPalletConfig()),
      ],
      supplyAirState: { ...initialAirState },
      returnAirState: { ...initialAirState },
    };
  }

  private calculateAverageTemperature(): number {
    let totalTemp = 0;
    let count = 0;

    this.loops.forEach((loop) => {
      loop.pallets.forEach((pallet) => {
        totalTemp += pallet.getAverageThermalState().temperature;
        count++;
      });
    });

    return totalTemp / count;
  }

  private validateConfig(config: FreightContainerConfig): void {
    // Add validation specific to your requirements
  }

  private createPalletConfig(): PalletConfig {
    // Create appropriate pallet configuration
    return {
      // ... pallet configuration details
    };
  }
}

interface LoopPerformance {
  loopIndex: number;
  palletPerformances: PalletPerformance[];
  totalHeatTransfer: number;
  supplyAirState: {
    temperature: number;
    humidity: number;
    flowRate: number;
  };
  returnAirState: {
    temperature: number;
    humidity: number;
    flowRate: number;
  };
  coolingUnitState: CoolingUnitState;
}

interface ContainerPerformance {
  loopPerformances: LoopPerformance[];
  totalHeatTransfer: number;
  averageTemperature: number;
  coolingLoopStates: CoolingUnitState[];
}
