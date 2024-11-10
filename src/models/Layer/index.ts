import { Container, ThermalState, Dimensions } from "../Container/index.js";
import { Grid, GridDimensions, GridPosition } from "../Grid/index.js";
import { PHYSICS_CONSTANTS } from "../constants.js";
import {
  calculateLocalFlow,
  LayerFlowConditions,
} from "./lib/calculateLocalFlow.js";
import {
  calculatePerformance,
  ContainerState,
  LayerPerformance,
} from "./lib/calculatePerformance.js";

/**
 * Represents a single layer of containers in a cooling system.
 * Implements the core conservation equations from Section II of the mathematical model.
 * Manages the spatial arrangement, flow conditions, and thermal state updates for a group of containers.
 */
export class Layer {
  private gridManager: Grid;
  /** Tracks the total energy transfer from the last state update */
  public lastUpdateEnergy: number = 0;
  /** Cross-sectional area perpendicular to flow direction (m²) */
  public crossSectionalArea: number;

  /**
   * Creates a new Layer instance.
   * @param gridDimensions - The row and column count for container arrangement
   * @param layerDimensions - Physical dimensions of the layer
   */
  constructor(gridDimensions: GridDimensions, layerDimensions: Dimensions) {
    this.validateDimensions(layerDimensions);
    this.gridManager = new Grid(gridDimensions);
    // Cross-sectional area perpendicular to flow (x * z as flow is along y)
    this.crossSectionalArea = layerDimensions.x * layerDimensions.z;
  }

  /**
   * Updates the thermal state of all containers in the layer.
   * Implements the energy and mass conservation equations from Section II of the mathematical model:
   * - Product Energy Balance (Section II.1)
   * - Air Energy Balance (Section II.2)
   *
   * @param conditions - Current flow conditions including mass flow rate and inlet conditions
   * @param timeStep - Time step for numerical integration (seconds)
   * @returns Performance metrics for the layer
   */
  public updateThermalState(
    conditions: LayerFlowConditions,
    timeStep: number
  ): LayerPerformance {
    let totalEnergyTransfer = 0;
    const containerStates: ContainerState[] = [];
    const containers = this.gridManager.getContainers();

    // Get grid dimensions for flow path calculation
    const { columns } = this.gridManager.getDimensions();

    // Initialize air conditions at inlet
    let currentAirTemp = conditions.inletTemperature;
    let currentAirHumidity = conditions.inletHumidity;

    // Process containers following the flow path (column by column)
    for (let col = 0; col < columns; col++) {
      // Calculate relative position along flow path (0 at inlet, 1 at outlet)
      const relativePosition = col / (columns - 1 || 1);

      // Get containers in current column, sorted by row
      const columnContainers = containers
        .filter(({ position }) => position.column === col)
        .sort((a, b) => a.position.row - b.position.row);

      // Calculate local flow conditions using Section III equations
      const localFlow = calculateLocalFlow(
        this.crossSectionalArea,
        conditions,
        relativePosition
      );

      // Process each container in the column
      for (const { container, position } of columnContainers) {
        const initialTemp = container.getThermalState().temperature;

        // Calculate heat and mass transfer rates (Section III.2 and III.3)
        const heatTransfer = container.calculateHeatTransferRates(
          currentAirTemp,
          currentAirHumidity,
          localFlow.effectiveHeatTransfer
        );

        // Calculate net energy and moisture changes over time step
        const changes = container.calculateNetEnergyChange(
          timeStep,
          currentAirTemp,
          currentAirHumidity,
          localFlow.effectiveHeatTransfer
        );

        // Update container state
        container.updateState(changes.energyChange, changes.moistureChange);
        totalEnergyTransfer += changes.energyChange;

        // Update air temperature using energy balance (Section II.1)
        const energyToAir = -(changes.energyChange / timeStep);
        const deltaT =
          energyToAir /
          (conditions.massFlowRate * PHYSICS_CONSTANTS.SPECIFIC_HEAT_AIR);
        currentAirTemp += deltaT;

        // Update air humidity using mass balance (Section II.2)
        const moistureToAir = -changes.moistureChange / timeStep;
        currentAirHumidity += moistureToAir / conditions.massFlowRate;

        // Record container state for performance calculations
        containerStates.push({
          position,
          heatTransfer,
          initialTemp,
          finalTemp: container.getThermalState().temperature,
        });
      }
    }

    this.lastUpdateEnergy = totalEnergyTransfer;

    // Calculate performance metrics (Section VIII)
    return calculatePerformance(
      conditions,
      containerStates,
      totalEnergyTransfer
    );
  }

  /**
   * Places containers in the layer according to the provided layout.
   * @param layout - 2D array of containers matching the grid dimensions
   * @returns Success of the placement operation
   */
  public placeContainers(layout: (Container | null)[][]): boolean {
    return this.gridManager.placeContainers(layout);
  }

  /**
   * Retrieves a container at the specified grid position.
   * @param position - Grid coordinates of the desired container
   * @returns The container at the specified position, or null if none exists
   */
  public getContainerAt(position: GridPosition): Container | null {
    return this.gridManager.getContainerAt(position);
  }

  /**
   * Retrieves all containers in the layer with their positions.
   * @returns Array of containers and their grid positions
   */
  public getContainers(): Array<{
    container: Container;
    position: GridPosition;
  }> {
    return this.gridManager.getContainers();
  }

  /**
   * Calculates the average thermal state across all containers in the layer.
   * Used for monitoring overall layer conditions and performance metrics.
   * @returns Average temperature and moisture content
   */
  public getAverageThermalState(): ThermalState {
    const containers = this.gridManager.getContainers();
    if (containers.length === 0) {
      return { temperature: 0, moisture: 0 };
    }

    const totalStates = containers.reduce(
      (acc, { container }) => {
        const state = container.getThermalState();
        return {
          temperature: acc.temperature + state.temperature,
          moisture: acc.moisture + state.moisture,
        };
      },
      { temperature: 0, moisture: 0 }
    );

    return {
      temperature: totalStates.temperature / containers.length,
      moisture: totalStates.moisture / containers.length,
    };
  }

  /**
   * Validates the physical dimensions of the layer.
   * Ensures dimensions are positive and reasonable.
   * @param dimensions - Physical dimensions to validate
   * @throws Error if dimensions are invalid
   */
  private validateDimensions(dimensions: Dimensions): void {
    if (dimensions.x <= 0 || dimensions.y <= 0 || dimensions.z <= 0) {
      throw new Error("Layer dimensions must be positive");
    }
  }
}
