import { expect } from "chai";
import { PHYSICS_CONSTANTS } from "../../constants.js";
import {
  LayerFlowConditions,
  FlowDistribution,
  calculateLocalFlow,
} from "./calculateLocalFlow.js";

describe("calculateFlow", () => {
  describe("Basic Flow Calculations", () => {
    it("should calculate flow parameters for standard conditions", () => {
      const TEST_CONFIG = {
        crossSectionalArea: 1.0, // m²
        flowConditions: {
          massFlowRate: 0.5, // kg/s
          inletTemperature: 5, // °C
          inletHumidity: 0.007, // kg/kg
          ambientTemperature: 25, // °C
        },
        position: 0.5, // middle of flow path
      };

      const result = calculateLocalFlow(
        TEST_CONFIG.crossSectionalArea,
        TEST_CONFIG.flowConditions,
        TEST_CONFIG.position
      );

      // Calculate expected base velocity
      const expectedBaseVelocity =
        TEST_CONFIG.flowConditions.massFlowRate /
        (PHYSICS_CONSTANTS.AIR_DENSITY *
          TEST_CONFIG.crossSectionalArea *
          PHYSICS_CONSTANTS.FLOW_DISTRIBUTION_FACTOR);

      // Verify velocity is reasonable
      expect(result.velocity).to.be.above(0);
      expect(result.velocity).to.be.below(expectedBaseVelocity);

      // Verify Reynolds number is in turbulent regime
      expect(result.reynolds).to.be.at.least(2000);

      // Verify heat transfer coefficient is reasonable
      expect(result.effectiveHeatTransfer).to.be.at.least(
        PHYSICS_CONSTANTS.MIN_HEAT_TRANSFER_COEFF
      );
    });
  });

  describe("Flow Distribution", () => {
    it("should show flow variation along path length", () => {
      const TEST_CONFIG = {
        crossSectionalArea: 1.0,
        flowConditions: {
          massFlowRate: 0.5,
          inletTemperature: 5,
          inletHumidity: 0.007,
          ambientTemperature: 25,
        },
        positions: [0, 0.5, 1.0], // inlet, middle, outlet
      };

      const results = TEST_CONFIG.positions.map((pos) =>
        calculateLocalFlow(
          TEST_CONFIG.crossSectionalArea,
          TEST_CONFIG.flowConditions,
          pos
        )
      );

      // Velocity should decrease along flow path
      for (let i = 1; i < results.length; i++) {
        expect(results[i].velocity).to.be.below(results[i - 1].velocity);
      }

      // Inlet velocity should be highest
      expect(results[0].velocity).to.be.above(results[1].velocity);
      expect(results[0].velocity).to.be.above(results[2].velocity);
    });
  });

  describe("Mass Conservation", () => {
    it("should maintain approximate mass conservation across flow path", () => {
      const TEST_CONFIG = {
        crossSectionalArea: 1.0,
        flowConditions: {
          massFlowRate: 0.5,
          inletTemperature: 5,
          inletHumidity: 0.007,
          ambientTemperature: 25,
        },
        numPositions: 10,
      };

      const positions = Array.from(
        { length: TEST_CONFIG.numPositions },
        (_, i) => i / (TEST_CONFIG.numPositions - 1)
      );

      // Calculate average mass flow rate across positions
      const avgMassFlow =
        positions.reduce((sum, pos) => {
          const result = calculateLocalFlow(
            TEST_CONFIG.crossSectionalArea,
            TEST_CONFIG.flowConditions,
            pos
          );
          return (
            sum +
            result.velocity *
              PHYSICS_CONSTANTS.AIR_DENSITY *
              TEST_CONFIG.crossSectionalArea *
              PHYSICS_CONSTANTS.FLOW_DISTRIBUTION_FACTOR
          );
        }, 0) / TEST_CONFIG.numPositions;

      expect(avgMassFlow).to.be.approximately(
        TEST_CONFIG.flowConditions.massFlowRate,
        TEST_CONFIG.flowConditions.massFlowRate * 0.15
      );
    });
  });
});
