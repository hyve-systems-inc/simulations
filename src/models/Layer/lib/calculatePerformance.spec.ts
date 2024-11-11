import { expect } from "chai";
import { GridPosition } from "../../Grid/index.js";
import { HeatTransferRates } from "../../Container/index.js";
import { LayerFlowConditions } from "./calculateLocalFlow.js";
import {
  ContainerState,
  calculatePerformance,
} from "./calculatePerformance.js";
import { PHYSICS_CONSTANTS } from "../../constants.js";

describe("calculatePerformance", () => {
  // Helper functions for test data creation
  const createHeatTransferRates = (
    convective: number = 0,
    evaporative: number = 0,
    moisture: number = 0
  ): HeatTransferRates => ({
    convectiveHeatRate: convective,
    evaporativeHeatRate: evaporative,
    moistureTransferRate: moisture,
  });

  const createContainerState = (
    position: GridPosition,
    initialTemp: number,
    finalTemp: number,
    heatTransfer: HeatTransferRates = createHeatTransferRates()
  ): ContainerState => ({
    position,
    initialTemp,
    finalTemp,
    heatTransfer,
  });

  // Helper function to calculate expected values
  const calculateExpectedValues = (finalTemps: number[]) => {
    if (finalTemps.length === 0) {
      return {
        avgTemp: 0,
        tempVariation: 0,
        uniformityIndex: 0,
      };
    }

    const avgTemp =
      finalTemps.reduce((sum, temp) => sum + temp, 0) / finalTemps.length;
    const squaredDiffs = finalTemps.map((temp) => Math.pow(temp - avgTemp, 2));
    const variance =
      squaredDiffs.reduce((sum, diff) => sum + diff, 0) / finalTemps.length;
    const tempVariation = Math.sqrt(variance);
    const uniformityIndex = avgTemp !== 0 ? tempVariation / avgTemp : 0;

    return {
      avgTemp,
      tempVariation,
      uniformityIndex,
    };
  };

  const createMockFlowConditions = (
    massFlowRate: number = 1,
    inletTemp: number = 5,
    inletHumidity: number = 0.5,
    ambientTemp: number = 25
  ): LayerFlowConditions => {
    // Calculate turbulence intensity using Section IV.1 equations
    const reynolds =
      (PHYSICS_CONSTANTS.AIR_DENSITY *
        massFlowRate *
        PHYSICS_CONSTANTS.HYDRAULIC_DIAMETER) /
      PHYSICS_CONSTANTS.AIR_VISCOSITY;

    const turbulenceIntensity =
      PHYSICS_CONSTANTS.TURBULENCE_COEFFICIENT *
      Math.pow(Math.max(reynolds, 2000), -1 / 8);

    return {
      massFlowRate,
      inletTemperature: inletTemp,
      inletHumidity,
      ambientTemperature: ambientTemp,
      turbulenceIntensity,
    };
  };

  describe("Basic Functionality", () => {
    it("should handle empty state array", () => {
      const result = calculatePerformance(null, [], 0);
      const expected = calculateExpectedValues([]);

      expect(result.averageCoolingEfficiency).to.equal(0);
      expect(result.uniformityIndex).to.equal(expected.uniformityIndex);
      expect(result.totalHeatTransfer).to.equal(0);
      expect(result.averageTemperature).to.equal(expected.avgTemp);
      expect(result.temperatureVariation).to.equal(expected.tempVariation);
      expect(result.rowTemperatures).to.deep.equal([]);
    });

    it("should calculate basic metrics for a single container", () => {
      const TEST_CONFIG = {
        initialTemp: 25,
        finalTemp: 20,
        inletTemp: 5,
        totalHeatTransfer: -500,
      };

      const state = createContainerState(
        { row: 0, column: 0 },
        TEST_CONFIG.initialTemp,
        TEST_CONFIG.finalTemp
      );

      const flowConditions: LayerFlowConditions = createMockFlowConditions();

      const expected = calculateExpectedValues([TEST_CONFIG.finalTemp]);

      const result = calculatePerformance(
        flowConditions,
        [state],
        TEST_CONFIG.totalHeatTransfer
      );

      expect(result.averageTemperature).to.equal(expected.avgTemp);
      expect(result.temperatureVariation).to.equal(expected.tempVariation);
      expect(result.totalHeatTransfer).to.equal(TEST_CONFIG.totalHeatTransfer);
    });
  });

  describe("Cooling Efficiency Calculations", () => {
    it("should calculate correct cooling efficiency", () => {
      const TEST_CONFIG = {
        initialTemp: 25,
        finalTemps: [15, 20],
        inletTemp: 5,
        totalHeatTransfer: -1000,
      };

      const flowConditions: LayerFlowConditions = createMockFlowConditions();

      const states = TEST_CONFIG.finalTemps.map((finalTemp, index) =>
        createContainerState(
          { row: 0, column: index },
          TEST_CONFIG.initialTemp,
          finalTemp
        )
      );

      const maxPossibleCooling =
        TEST_CONFIG.initialTemp - TEST_CONFIG.inletTemp;
      const expectedEfficiencies = TEST_CONFIG.finalTemps.map(
        (finalTemp) =>
          (TEST_CONFIG.initialTemp - finalTemp) / maxPossibleCooling
      );
      const expectedAvgEfficiency =
        expectedEfficiencies.reduce((sum, eff) => sum + eff, 0) /
        expectedEfficiencies.length;

      const result = calculatePerformance(
        flowConditions,
        states,
        TEST_CONFIG.totalHeatTransfer
      );
      expect(result.averageCoolingEfficiency).to.be.approximately(
        expectedAvgEfficiency,
        0.001
      );
    });
  });

  describe("Temperature Uniformity Calculations", () => {
    it("should handle uniform temperatures", () => {
      const TEST_CONFIG = {
        initialTemp: 20,
        finalTemp: 15,
        totalHeatTransfer: -1000,
      };

      const states = [
        createContainerState(
          { row: 0, column: 0 },
          TEST_CONFIG.initialTemp,
          TEST_CONFIG.finalTemp
        ),
        createContainerState(
          { row: 0, column: 1 },
          TEST_CONFIG.initialTemp,
          TEST_CONFIG.finalTemp
        ),
        createContainerState(
          { row: 1, column: 0 },
          TEST_CONFIG.initialTemp,
          TEST_CONFIG.finalTemp
        ),
      ];

      const expected = calculateExpectedValues([
        TEST_CONFIG.finalTemp,
        TEST_CONFIG.finalTemp,
        TEST_CONFIG.finalTemp,
      ]);

      const result = calculatePerformance(
        null,
        states,
        TEST_CONFIG.totalHeatTransfer
      );
      expect(result.temperatureVariation).to.equal(expected.tempVariation);
      expect(result.uniformityIndex).to.equal(expected.uniformityIndex);
    });

    it("should calculate correct uniformity index for varying temperatures", () => {
      const TEST_CONFIG = {
        initialTemp: 20,
        finalTemps: [15, 17, 19, 21],
        totalHeatTransfer: -1000,
      };

      const states = TEST_CONFIG.finalTemps.map((temp, index) =>
        createContainerState(
          { row: Math.floor(index / 2), column: index % 2 },
          TEST_CONFIG.initialTemp,
          temp
        )
      );

      const expected = calculateExpectedValues(TEST_CONFIG.finalTemps);

      const result = calculatePerformance(
        null,
        states,
        TEST_CONFIG.totalHeatTransfer
      );
      expect(result.averageTemperature).to.equal(expected.avgTemp);
      expect(result.temperatureVariation).to.be.approximately(
        expected.tempVariation,
        0.001
      );
      expect(result.uniformityIndex).to.be.approximately(
        expected.uniformityIndex,
        0.001
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle extreme temperature variations", () => {
      const TEST_CONFIG = {
        initialTemp: 100,
        finalTemps: [90, -10],
        totalHeatTransfer: -2000,
      };

      const states = TEST_CONFIG.finalTemps.map((temp, index) =>
        createContainerState(
          { row: 0, column: index },
          TEST_CONFIG.initialTemp,
          temp
        )
      );

      const expected = calculateExpectedValues(TEST_CONFIG.finalTemps);

      const result = calculatePerformance(
        null,
        states,
        TEST_CONFIG.totalHeatTransfer
      );
      expect(result.averageTemperature).to.equal(expected.avgTemp);
      expect(result.temperatureVariation).to.be.approximately(
        expected.tempVariation,
        0.001
      );
      expect(result.uniformityIndex).to.be.approximately(
        expected.uniformityIndex,
        0.001
      );
    });
  });
});
