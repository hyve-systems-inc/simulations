import { expect } from "chai";
import { Pallet } from "./index.js";
import {
  Container,
  Dimensions,
  ProductProperties,
  ThermalState,
} from "../Container/index.js";
import { GridDimensions } from "../Grid/index.js";
import { LayerFlowConditions } from "../Layer/lib/calculateLocalFlow.js";
import { PalletConfig } from "./lib/validator.js";

describe("Pallet", () => {
  // Test configuration
  const TEST_CONFIG = {
    dimensions: {
      grid: {
        standard: {
          rows: 2,
          columns: 3,
        } as GridDimensions,
        large: {
          rows: 4,
          columns: 6,
        } as GridDimensions,
      },
      container: {
        standard: {
          x: 0.4, // meters
          y: 0.3, // meters
          z: 0.25, // meters
        } as Dimensions,
      },
      layer: {
        standard: {
          x: 0.8, // 2 containers * 0.4m
          y: 0.9, // 3 containers * 0.3m
          z: 0.25, // single container height
        } as Dimensions,
        large: {
          x: 1.6, // 4 containers * 0.4m
          y: 1.8, // 6 containers * 0.3m
          z: 0.25, // single container height
        } as Dimensions,
      },
    },
    product: {
      standard: {
        specificHeat: 3900, // J/(kg·K)
        waterActivity: 0.98,
        mass: 5, // kg
        surfaceArea: 0.5, // m²
        respiration: {
          baseRate: 0.01,
          temperatureCoeff: 0.1,
          referenceTemp: 5,
          respirationHeat: 2000,
        },
      } as ProductProperties,
    },
    thermal: {
      states: {
        ambient: {
          temperature: 20,
          moisture: 0.85,
        } as ThermalState,
        warm: {
          temperature: 25,
          moisture: 0.85,
        } as ThermalState,
        cool: {
          temperature: 15,
          moisture: 0.85,
        } as ThermalState,
      },
    },
    flow: {
      standard: {
        massFlowRate: 0.5, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
      high: {
        massFlowRate: 1.0,
        inletTemperature: 2,
        inletHumidity: 0.007,
        ambientTemperature: 25,
      } as LayerFlowConditions,
      low: {
        massFlowRate: 0.25,
        inletTemperature: 2,
        inletHumidity: 0.007,
        ambientTemperature: 25,
      } as LayerFlowConditions,
    },
    simulation: {
      timeStep: 1, // seconds
      tolerance: 0.001,
      minLayers: 2,
      standardLayers: 4,
      maxLayers: 8,
    },
  };

  // Helper functions
  const createStandardConfig = (
    numLayers: number = TEST_CONFIG.simulation.standardLayers
  ): PalletConfig => ({
    gridDimensions: TEST_CONFIG.dimensions.grid.standard,
    layerDimensions: TEST_CONFIG.dimensions.layer.standard,
    numLayers,
  });

  const createContainer = (
    state: ThermalState = TEST_CONFIG.thermal.states.ambient
  ): Container => {
    return new Container(
      TEST_CONFIG.dimensions.container.standard,
      state,
      TEST_CONFIG.product.standard
    );
  };

  const createContainerLayer = (
    rows: number,
    columns: number,
    state: ThermalState = TEST_CONFIG.thermal.states.ambient
  ): (Container | null)[][] => {
    return Array(rows)
      .fill(null)
      .map(() =>
        Array(columns)
          .fill(null)
          .map(() => createContainer(state))
      );
  };

  describe("Constructor", () => {
    it("should create a valid pallet with minimum layers", () => {
      const config = createStandardConfig(TEST_CONFIG.simulation.minLayers);
      const pallet = new Pallet(config);
      expect(pallet).to.be.instanceOf(Pallet);
    });

    it("should create a valid pallet with maximum layers", () => {
      const config = createStandardConfig(TEST_CONFIG.simulation.maxLayers);
      const pallet = new Pallet(config);
      expect(pallet).to.be.instanceOf(Pallet);
    });

    it("should throw error for invalid number of layers", () => {
      const invalidConfig = createStandardConfig(0);
      expect(() => new Pallet(invalidConfig)).to.throw(
        "Number of layers must be positive"
      );
    });

    it("should throw error for invalid grid dimensions", () => {
      const invalidConfig = {
        ...createStandardConfig(),
        gridDimensions: { rows: 0, columns: 0 },
      };
      expect(() => new Pallet(invalidConfig)).to.throw(
        "Grid dimensions must be positive"
      );
    });

    it("should throw error for invalid layer dimensions", () => {
      const invalidConfig = {
        ...createStandardConfig(),
        layerDimensions: { x: 0, y: 0, z: 0 },
      };
      expect(() => new Pallet(invalidConfig)).to.throw(
        "Layer dimensions must be positive"
      );
    });
  });

  describe("Container Placement", () => {
    let pallet: Pallet;

    beforeEach(() => {
      pallet = new Pallet(createStandardConfig());
    });

    it("should successfully place containers in valid layer", () => {
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns
      );
      const success = pallet.placeContainersInLayer(0, containers);
      expect(success).to.be.true;
    });

    it("should reject container placement in invalid layer", () => {
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns
      );
      const success = pallet.placeContainersInLayer(-1, containers);
      expect(success).to.be.false;
    });

    it("should reject container layout with wrong dimensions", () => {
      const wrongSizeLayout = createContainerLayer(1, 1);
      const success = pallet.placeContainersInLayer(0, wrongSizeLayout);
      expect(success).to.be.false;
    });

    it("should handle placement in all layers", () => {
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns
      );

      const config = createStandardConfig();
      const allSuccess = Array(config.numLayers)
        .fill(null)
        .every((_, i) => pallet.placeContainersInLayer(i, containers));

      expect(allSuccess).to.be.true;
    });
  });

  describe("Thermal State Updates", () => {
    let pallet: Pallet;

    beforeEach(() => {
      pallet = new Pallet(createStandardConfig());
      // Fill all layers with containers
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns,
        TEST_CONFIG.thermal.states.warm
      );
      for (let i = 0; i < TEST_CONFIG.simulation.standardLayers; i++) {
        pallet.placeContainersInLayer(i, containers);
      }
    });

    it("should show cooling progression with standard flow", () => {
      const initialState = pallet.getAverageThermalState();
      const performance = pallet.updateThermalState(
        TEST_CONFIG.flow.standard,
        TEST_CONFIG.simulation.timeStep
      );

      const finalState = pallet.getAverageThermalState();
      expect(finalState.temperature).to.be.lessThan(initialState.temperature);
    });

    it("should show faster cooling with higher flow rate", () => {
      // Create two identical pallets
      const palletLowFlow = new Pallet(createStandardConfig());
      const palletHighFlow = new Pallet(createStandardConfig());

      // Fill both pallets with identical containers
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns,
        TEST_CONFIG.thermal.states.warm
      );

      for (let i = 0; i < TEST_CONFIG.simulation.standardLayers; i++) {
        palletLowFlow.placeContainersInLayer(i, containers);
        palletHighFlow.placeContainersInLayer(i, containers);
      }

      // Update thermal states with different flow rates
      const lowFlowPerf = palletLowFlow.updateThermalState(
        TEST_CONFIG.flow.low,
        TEST_CONFIG.simulation.timeStep
      );
      const highFlowPerf = palletHighFlow.updateThermalState(
        TEST_CONFIG.flow.high,
        TEST_CONFIG.simulation.timeStep
      );

      expect(Math.abs(highFlowPerf.totalHeatTransfer)).to.be.greaterThan(
        Math.abs(lowFlowPerf.totalHeatTransfer)
      );
    });

    it("should show temperature variation across layers", () => {
      // Capture initial state
      const initialState = pallet.getAverageThermalState();

      // Perform update
      const performance = pallet.updateThermalState(
        TEST_CONFIG.flow.standard,
        TEST_CONFIG.simulation.timeStep
      );

      // Get temperatures after update
      const temperatures = performance.layerPerformance.map(
        (layer) => layer.averageTemperature
      );

      // Verify we have temperature variation
      const tempVariation =
        Math.max(...temperatures) - Math.min(...temperatures);
      expect(tempVariation).to.be.greaterThan(0);

      // Verify temperatures are between inlet and initial temperatures
      temperatures.forEach((temp) => {
        expect(temp).to.be.at.most(initialState.temperature);
        expect(temp).to.be.at.least(TEST_CONFIG.flow.standard.inletTemperature);
      });

      // Verify some cooling has occurred
      const finalAverageTemp = pallet.getAverageThermalState().temperature;
      expect(finalAverageTemp).to.be.below(initialState.temperature);
    });

    it("should track performance metrics", () => {
      const performance = pallet.updateThermalState(
        TEST_CONFIG.flow.standard,
        TEST_CONFIG.simulation.timeStep
      );

      const lastPerformance = pallet.getLastPerformance();
      expect(lastPerformance).to.deep.equal(performance);

      // Verify performance metrics are reasonable
      expect(performance.averageCoolingEfficiency).to.be.within(0, 1);
      expect(performance.uniformityIndex).to.be.greaterThan(0);
      expect(performance.totalHeatTransfer).to.be.lessThan(0); // Cooling
      expect(performance.layerPerformance).to.have.lengthOf(
        TEST_CONFIG.simulation.standardLayers
      );
    });
  });

  describe("Average State Calculations", () => {
    let pallet: Pallet;

    beforeEach(() => {
      pallet = new Pallet(createStandardConfig());
    });

    it("should calculate correct average state for uniform temperatures", () => {
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns,
        TEST_CONFIG.thermal.states.ambient
      );

      // Fill all layers with identical containers
      for (let i = 0; i < TEST_CONFIG.simulation.standardLayers; i++) {
        pallet.placeContainersInLayer(i, containers);
      }

      const avgState = pallet.getAverageThermalState();
      expect(avgState.temperature).to.equal(
        TEST_CONFIG.thermal.states.ambient.temperature
      );
      expect(avgState.moisture).to.equal(
        TEST_CONFIG.thermal.states.ambient.moisture
      );
    });

    it("should calculate correct average state for temperature gradient", () => {
      // Create temperature gradient across layers
      for (let i = 0; i < TEST_CONFIG.simulation.standardLayers; i++) {
        const layerTemp =
          TEST_CONFIG.thermal.states.ambient.temperature + i * 2;
        const containers = createContainerLayer(
          TEST_CONFIG.dimensions.grid.standard.rows,
          TEST_CONFIG.dimensions.grid.standard.columns,
          { ...TEST_CONFIG.thermal.states.ambient, temperature: layerTemp }
        );
        pallet.placeContainersInLayer(i, containers);
      }

      const avgState = pallet.getAverageThermalState();
      const expectedTemp =
        TEST_CONFIG.thermal.states.ambient.temperature +
        ((TEST_CONFIG.simulation.standardLayers - 1) * 2) / 2;

      expect(avgState.temperature).to.be.approximately(
        expectedTemp,
        TEST_CONFIG.simulation.tolerance
      );
    });

    it("should handle empty pallet", () => {
      const avgState = pallet.getAverageThermalState();
      expect(avgState.temperature).to.equal(0);
      expect(avgState.moisture).to.equal(0);
    });
  });

  describe("Energy Conservation", () => {
    let pallet: Pallet;

    beforeEach(() => {
      pallet = new Pallet(createStandardConfig());
      const containers = createContainerLayer(
        TEST_CONFIG.dimensions.grid.standard.rows,
        TEST_CONFIG.dimensions.grid.standard.columns,
        TEST_CONFIG.thermal.states.warm
      );
      for (let i = 0; i < TEST_CONFIG.simulation.standardLayers; i++) {
        pallet.placeContainersInLayer(i, containers);
      }
    });

    it("should maintain reasonable energy balance during cooling", () => {
      const initialState = pallet.getAverageThermalState();
      let totalHeatTransfer = 0;
      const numSteps = 10;

      for (let i = 0; i < numSteps; i++) {
        const performance = pallet.updateThermalState(
          TEST_CONFIG.flow.standard,
          TEST_CONFIG.simulation.timeStep
        );
        totalHeatTransfer += performance.totalHeatTransfer;
      }

      const finalState = pallet.getAverageThermalState();
      const actualDeltaT = finalState.temperature - initialState.temperature;

      // Verify the direction of temperature change matches heat transfer
      if (totalHeatTransfer < 0) {
        expect(actualDeltaT).to.be.lessThan(0);
      } else {
        expect(actualDeltaT).to.be.greaterThan(0);
      }

      // Verify the magnitude of temperature change is reasonable
      const maxPossibleDeltaT = Math.abs(
        initialState.temperature - TEST_CONFIG.flow.standard.inletTemperature
      );
      expect(Math.abs(actualDeltaT)).to.be.lessThan(maxPossibleDeltaT);

      // Verify the performance tracking
      const lastPerformance = pallet.getLastPerformance();
      expect(lastPerformance?.totalHeatTransfer).to.not.equal(0);
    });
  });
});
