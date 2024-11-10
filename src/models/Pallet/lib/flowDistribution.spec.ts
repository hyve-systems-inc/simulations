import { expect } from "chai";
import { LayerFlowConditions } from "../../Layer/lib/calculateLocalFlow.js";
import { PHYSICS_CONSTANTS } from "../../constants.js";
import {
  calculateVerticalEfficiency,
  adjustFlowConditions,
} from "./flowDistribution.js";

describe("Flow Distribution", () => {
  // Test configuration
  const TEST_CONFIG = {
    baseConditions: {
      standard: {
        massFlowRate: 0.5, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg dry air
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
      high: {
        massFlowRate: 1.0, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg dry air
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
      low: {
        massFlowRate: 0.25, // kg/s
        inletTemperature: 2, // °C
        inletHumidity: 0.007, // kg/kg dry air
        ambientTemperature: 25, // °C
      } as LayerFlowConditions,
    },
    flowParameters: {
      alpha: 0.2, // Flow reduction factor
      beta: 3.0, // Vertical decay coefficient
    },
    heights: {
      bottom: 0,
      quarter: 0.25,
      middle: 0.5,
      threeQuarters: 0.75,
      top: 1.0,
    },
    airConditions: {
      temperature: {
        cold: 2,
        ambient: 20,
        hot: 35,
      },
      humidity: {
        dry: 0.005,
        moderate: 0.01,
        humid: 0.015,
      },
    },
    tolerance: 0.0001,
  };

  describe("Vertical Efficiency", () => {
    it("should calculate correct efficiency at key positions", () => {
      Object.entries(TEST_CONFIG.heights).forEach(([_, height]) => {
        const efficiency = calculateVerticalEfficiency(
          height,
          TEST_CONFIG.flowParameters.alpha,
          TEST_CONFIG.flowParameters.beta
        );

        // Calculate expected efficiency using the model equation
        const expectedEfficiency =
          PHYSICS_CONSTANTS.MAX_FLOW_EFFICIENCY *
          (1 -
            TEST_CONFIG.flowParameters.alpha *
              Math.exp(-TEST_CONFIG.flowParameters.beta * height));

        expect(efficiency).to.be.approximately(
          expectedEfficiency,
          TEST_CONFIG.tolerance
        );
      });
    });

    it("should show increasing efficiency with height", () => {
      const efficiencies = Object.values(TEST_CONFIG.heights).map((height) =>
        calculateVerticalEfficiency(
          height,
          TEST_CONFIG.flowParameters.alpha,
          TEST_CONFIG.flowParameters.beta
        )
      );

      // Check that efficiency increases monotonically
      for (let i = 1; i < efficiencies.length; i++) {
        expect(efficiencies[i]).to.be.greaterThan(efficiencies[i - 1]);
      }
    });

    it("should respect maximum efficiency bound", () => {
      const topEfficiency = calculateVerticalEfficiency(
        TEST_CONFIG.heights.top,
        TEST_CONFIG.flowParameters.alpha,
        TEST_CONFIG.flowParameters.beta
      );

      expect(topEfficiency).to.be.at.most(
        PHYSICS_CONSTANTS.MAX_FLOW_EFFICIENCY
      );
    });
  });

  describe("Flow Conditions Adjustment", () => {
    it("should properly adjust mass flow rate with height", () => {
      const baseConditions = TEST_CONFIG.baseConditions.standard;
      const currentTemp = TEST_CONFIG.airConditions.temperature.ambient;
      const currentHumidity = TEST_CONFIG.airConditions.humidity.moderate;

      Object.entries(TEST_CONFIG.heights).forEach(([_, height]) => {
        const adjustedConditions = adjustFlowConditions(
          baseConditions,
          height,
          currentTemp,
          currentHumidity,
          TEST_CONFIG.flowParameters.alpha,
          TEST_CONFIG.flowParameters.beta
        );

        const expectedEfficiency = calculateVerticalEfficiency(
          height,
          TEST_CONFIG.flowParameters.alpha,
          TEST_CONFIG.flowParameters.beta
        );

        const expectedMassFlow =
          baseConditions.massFlowRate * expectedEfficiency;

        expect(adjustedConditions.massFlowRate).to.be.approximately(
          expectedMassFlow,
          TEST_CONFIG.tolerance
        );
      });
    });

    it("should maintain temperature and humidity continuity", () => {
      const baseConditions = TEST_CONFIG.baseConditions.standard;
      const heights = Object.values(TEST_CONFIG.heights);

      // Test various temperature and humidity combinations
      Object.values(TEST_CONFIG.airConditions.temperature).forEach((temp) => {
        Object.values(TEST_CONFIG.airConditions.humidity).forEach(
          (humidity) => {
            heights.forEach((height) => {
              const adjustedConditions = adjustFlowConditions(
                baseConditions,
                height,
                temp,
                humidity
              );

              // Verify that input conditions are preserved
              expect(adjustedConditions.inletTemperature).to.equal(temp);
              expect(adjustedConditions.inletHumidity).to.equal(humidity);
            });
          }
        );
      });
    });

    it("should handle extreme flow rates", () => {
      const heights = Object.values(TEST_CONFIG.heights);
      const currentTemp = TEST_CONFIG.airConditions.temperature.ambient;
      const currentHumidity = TEST_CONFIG.airConditions.humidity.moderate;

      // Test both high and low flow rates
      [TEST_CONFIG.baseConditions.high, TEST_CONFIG.baseConditions.low].forEach(
        (baseConditions) => {
          heights.forEach((height) => {
            const adjustedConditions = adjustFlowConditions(
              baseConditions,
              height,
              currentTemp,
              currentHumidity
            );

            // Verify flow rate is scaled but maintains direction
            expect(adjustedConditions.massFlowRate).to.be.greaterThan(0);
            expect(adjustedConditions.massFlowRate).to.be.at.most(
              baseConditions.massFlowRate
            );
          });
        }
      );
    });

    it("should preserve ambient temperature reference", () => {
      const baseConditions = TEST_CONFIG.baseConditions.standard;
      const heights = Object.values(TEST_CONFIG.heights);

      heights.forEach((height) => {
        const adjustedConditions = adjustFlowConditions(
          baseConditions,
          height,
          TEST_CONFIG.airConditions.temperature.ambient,
          TEST_CONFIG.airConditions.humidity.moderate
        );

        expect(adjustedConditions.ambientTemperature).to.equal(
          baseConditions.ambientTemperature
        );
      });
    });
  });

  describe("Conservation Principles", () => {
    it("should conserve total mass flow across all layers", () => {
      const baseConditions = TEST_CONFIG.baseConditions.standard;
      const numLayers = 10;
      const layerHeight = 1 / numLayers;

      // Calculate total mass flow through all layers
      let totalMassFlow = 0;
      for (let i = 0; i < numLayers; i++) {
        const height = (i + 0.5) * layerHeight;
        const conditions = adjustFlowConditions(
          baseConditions,
          height,
          TEST_CONFIG.airConditions.temperature.ambient,
          TEST_CONFIG.airConditions.humidity.moderate
        );
        totalMassFlow += conditions.massFlowRate;
      }

      // Average mass flow should be close to base mass flow
      const averageMassFlow = totalMassFlow / numLayers;
      expect(averageMassFlow).to.be.approximately(
        baseConditions.massFlowRate,
        baseConditions.massFlowRate * 0.15
      );
    });
  });
});
