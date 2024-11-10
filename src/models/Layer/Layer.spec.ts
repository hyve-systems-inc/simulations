import { expect } from "chai";
import {
  Container,
  Dimensions,
  ProductProperties,
} from "../Container/index.js";
import { Layer } from "./index.js";
import { GridDimensions } from "../Grid/index.js";
import { LayerFlowConditions } from "./lib/calculateLocalFlow.js";

describe("Layer", () => {
  // Test configuration
  const TEST_CONFIG = {
    dimensions: {
      grid: {
        rows: 2, // 2 containers perpendicular to flow
        columns: 3, // 3 containers along flow path
      } as GridDimensions,
      container: {
        x: 0.4, // meters
        y: 0.3, // meters
        z: 0.25, // meters
      } as Dimensions,
      layer: {
        x: 0.8, // meters (2 containers * 0.4m)
        y: 0.9, // meters (3 containers * 0.3m)
        z: 0.25, // meters (single container height)
      } as Dimensions,
    },
    products: {
      lettuce: {
        specificHeat: 3900, // J/(kg·K)
        waterActivity: 0.98, // dimensionless
        mass: 5, // kg
        surfaceArea: 0.5, // m²
        respiration: {
          baseRate: 0.01, // W/kg
          temperatureCoeff: 0.1, // 1/K
          referenceTemp: 5, // °C
          respirationHeat: 2000, // J/kg
        },
      } as ProductProperties,
    },
    flowConditions: {
      standard: {
        massFlowRate: 0.5, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
      low: {
        massFlowRate: 0.25, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
      high: {
        massFlowRate: 1.0, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
    },
    simulation: {
      timeStep: 1, // seconds
      tolerance: 0.001,
    },
  };

  // Helper function to create a container with specified temperature
  const createContainer = (temperature: number): Container => {
    return new Container(
      TEST_CONFIG.dimensions.container,
      { temperature, moisture: 0.85 },
      TEST_CONFIG.products.lettuce
    );
  };

  describe("Basic Functionality", () => {
    let layer: Layer;

    beforeEach(() => {
      layer = new Layer(
        TEST_CONFIG.dimensions.grid,
        TEST_CONFIG.dimensions.layer
      );
    });

    it("should initialize with correct dimensions", () => {
      expect(layer.crossSectionalArea).to.equal(
        TEST_CONFIG.dimensions.layer.x * TEST_CONFIG.dimensions.layer.z
      );
    });

    it("should validate layer dimensions", () => {
      expect(
        () => new Layer(TEST_CONFIG.dimensions.grid, { x: -1, y: 1, z: 1 })
      ).to.throw("Layer dimensions must be positive");
    });

    it("should handle container placement and retrieval", () => {
      const containers = [
        [createContainer(20), createContainer(20), createContainer(20)],
        [createContainer(20), createContainer(20), createContainer(20)],
      ];

      const success = layer.placeContainers(containers);
      expect(success).to.be.true;

      const retrievedContainers = layer.getContainers();
      expect(retrievedContainers).to.have.lengthOf(6);
    });
  });

  describe("Thermal Behavior", () => {
    let layer: Layer;

    beforeEach(() => {
      layer = new Layer(
        TEST_CONFIG.dimensions.grid,
        TEST_CONFIG.dimensions.layer
      );
    });

    it("should show temperature rise along flow path", () => {
      // Set up containers with uniform initial temperature
      const initialTemp = 20;
      const containers = [
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
      ];
      layer.placeContainers(containers);

      // Update thermal state
      const performance = layer.updateThermalState(
        TEST_CONFIG.flowConditions.standard,
        TEST_CONFIG.simulation.timeStep
      );

      // Get final temperatures by column
      const columnTemps = Array(TEST_CONFIG.dimensions.grid.columns)
        .fill(0)
        .map((_, col) => {
          const colContainers = layer
            .getContainers()
            .filter(({ position }) => position.column === col);
          return (
            colContainers.reduce(
              (sum, { container }) =>
                sum + container.getThermalState().temperature,
              0
            ) / colContainers.length
          );
        });

      // Temperature should increase along flow path
      for (let i = 1; i < columnTemps.length; i++) {
        expect(columnTemps[i]).to.be.greaterThan(columnTemps[i - 1]);
      }
    });

    it("should demonstrate faster cooling with higher flow rates", () => {
      // Set up containers with uniform initial temperature
      const initialTemp = 20;
      const containers = [
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
      ];

      // Test with low flow rate
      layer.placeContainers(containers);
      const lowFlowPerf = layer.updateThermalState(
        TEST_CONFIG.flowConditions.low,
        TEST_CONFIG.simulation.timeStep
      );

      // Reset containers and test with high flow rate
      layer.placeContainers(containers);
      const highFlowPerf = layer.updateThermalState(
        TEST_CONFIG.flowConditions.high,
        TEST_CONFIG.simulation.timeStep
      );

      // Higher flow rate should result in more heat transfer
      expect(Math.abs(highFlowPerf.totalHeatTransfer)).to.be.greaterThan(
        Math.abs(lowFlowPerf.totalHeatTransfer)
      );
    });

    it("should maintain row uniformity at each flow position", () => {
      // Set up containers with uniform initial temperature
      const initialTemp = 20;
      const containers = [
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
      ];
      layer.placeContainers(containers);

      // Update thermal state
      layer.updateThermalState(
        TEST_CONFIG.flowConditions.standard,
        TEST_CONFIG.simulation.timeStep
      );

      // Check temperature uniformity within each column
      for (let col = 0; col < TEST_CONFIG.dimensions.grid.columns; col++) {
        const colContainers = layer
          .getContainers()
          .filter(({ position }) => position.column === col)
          .map(({ container }) => container.getThermalState().temperature);

        const maxDiff = Math.max(...colContainers) - Math.min(...colContainers);
        expect(maxDiff).to.be.lessThan(0.5); // Temperatures within 0.5°C in same column
      }
    });
  });

  describe("Energy Conservation", () => {
    let layer: Layer;

    beforeEach(() => {
      layer = new Layer(
        TEST_CONFIG.dimensions.grid,
        TEST_CONFIG.dimensions.layer
      );
    });

    it("should conserve energy during thermal updates", () => {
      // Set up containers
      const initialTemp = 20;
      const containers = [
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
        [
          createContainer(initialTemp),
          createContainer(initialTemp),
          createContainer(initialTemp),
        ],
      ];
      layer.placeContainers(containers);

      // Calculate initial total energy
      const initialEnergy = layer
        .getContainers()
        .reduce((sum, { container }) => sum + container.getEnergyContent(), 0);

      // Update thermal state
      const performance = layer.updateThermalState(
        TEST_CONFIG.flowConditions.standard,
        TEST_CONFIG.simulation.timeStep
      );

      // Calculate final total energy
      const finalEnergy = layer
        .getContainers()
        .reduce((sum, { container }) => sum + container.getEnergyContent(), 0);

      // Energy change should match heat transfer
      const energyChange = finalEnergy - initialEnergy;
      expect(
        Math.abs(energyChange - performance.totalHeatTransfer)
      ).to.be.lessThan(
        Math.abs(initialEnergy * TEST_CONFIG.simulation.tolerance)
      );
    });
  });

  describe("Average State Calculations", () => {
    let layer: Layer;

    beforeEach(() => {
      layer = new Layer(
        TEST_CONFIG.dimensions.grid,
        TEST_CONFIG.dimensions.layer
      );
    });

    it("should calculate correct average thermal state", () => {
      const temps = [15, 16, 17, 18, 19, 20];
      const containers = [
        [
          createContainer(temps[0]),
          createContainer(temps[1]),
          createContainer(temps[2]),
        ],
        [
          createContainer(temps[3]),
          createContainer(temps[4]),
          createContainer(temps[5]),
        ],
      ];
      layer.placeContainers(containers);

      const avgState = layer.getAverageThermalState();
      const expectedTemp = temps.reduce((sum, t) => sum + t, 0) / temps.length;

      expect(avgState.temperature).to.be.approximately(
        expectedTemp,
        TEST_CONFIG.simulation.tolerance
      );
      expect(avgState.moisture).to.equal(0.85);
    });

    it("should handle empty layer average state", () => {
      const avgState = layer.getAverageThermalState();
      expect(avgState.temperature).to.equal(0);
      expect(avgState.moisture).to.equal(0);
    });
  });
});
