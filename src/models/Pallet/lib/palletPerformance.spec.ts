import { expect } from "chai";
import {
  calculateAverage,
  calculateTemperatureVariation,
  calculateUniformityIndex,
  calculatePalletPerformance,
  createEmptyPerformance,
  PRECISION,
} from "./palletPerformance.js";
import { LayerPerformance } from "../../Layer/lib/calculatePerformance.js";
import { precise } from "../../../lib.js";

describe("Pallet Performance Calculator", () => {
  const TEST_CONFIG = {
    averages: {
      empty: {
        values: [],
        expected: 0,
        explanation: "Empty array returns 0 by definition",
      },
      single: {
        values: [5],
        expected: precise(5, PRECISION.TEMPERATURE),
        explanation: "Single value average equals the value itself: 5/1 = 5",
      },
      multiple: {
        values: [1, 2, 3, 4, 5],
        expected: precise(3, PRECISION.TEMPERATURE),
        explanation: "Sum(1,2,3,4,5) = 15, n = 5, average = 15/5 = 3",
      },
      negative: {
        values: [-2, 0, 2],
        expected: precise(0, PRECISION.TEMPERATURE),
        explanation: "Sum(-2,0,2) = 0, n = 3, average = 0/3 = 0",
      },
      decimal: {
        values: [1.5, 2.5, 3.5],
        expected: precise(2.5, PRECISION.TEMPERATURE),
        explanation: "Sum(1.5,2.5,3.5) = 7.5, n = 3, average = 7.5/3 = 2.5",
      },
    },
    variations: {
      uniform: {
        temps: [20, 20, 20, 20],
        avgTemp: 20,
        expected: precise(0, PRECISION.TEMPERATURE),
        explanation: `
              Standard Deviation calculation for uniform temperatures:
              1. Mean (μ) = 20
              2. Differences from mean = [0, 0, 0, 0]
              3. Squared differences = [0, 0, 0, 0]
              4. Average of squared differences = 0
              5. Square root = √0 = 0`,
      },
      nonUniform: {
        temps: [18, 20, 22],
        avgTemp: 20,
        expected: precise(1.633, PRECISION.TEMPERATURE),
        explanation: `
              Standard Deviation calculation:
              1. Mean (μ) = 20
              2. Differences from mean = [-2, 0, 2]
              3. Squared differences = [4, 0, 4]
              4. Sum of squared differences = 8
              5. Average of squared differences = 8/3 ≈ 2.667
              6. Square root = √2.667 ≈ 1.633`,
      },
      negative: {
        temps: [-2, 0, 2],
        avgTemp: 0,
        expected: precise(1.633, PRECISION.TEMPERATURE),
        explanation: `
              Standard Deviation calculation (same pattern as non-uniform case):
              1. Mean (μ) = 0
              2. Differences from mean = [-2, 0, 2]
              3. Squared differences = [4, 0, 4]
              4. Sum of squared differences = 8
              5. Average of squared differences = 8/3 ≈ 2.667
              6. Square root = √2.667 ≈ 1.633`,
      },
      floatingPoint: {
        temps: [19.1, 20.2, 21.3],
        avgTemp: 20.2,
        expected: precise(0.898, PRECISION.TEMPERATURE),
        explanation: `
              Standard Deviation calculation with floating points:
              1. Mean (μ) = 20.2
              2. Differences from mean = [-1.1, 0, 1.1]
              3. Squared differences = [1.21, 0, 1.21]
              4. Sum of squared differences = 2.42
              5. Average of squared differences = 2.42/3 ≈ 0.807
              6. Square root = √0.807 ≈ 0.898`,
      },
    },
    uniformityIndex: {
      zeroAverage: {
        variation: 5,
        avgTemp: 0,
        expected: precise(0, PRECISION.UNIFORMITY),
        explanation:
          "When average temperature is 0, uniformity index is defined as 0 to avoid division by zero",
      },
      normal: {
        variation: 2,
        avgTemp: 20,
        expected: precise(0.1, PRECISION.UNIFORMITY),
        explanation: "Uniformity Index = variation/|avgTemp| = 2/20 = 0.1",
      },
      small: {
        variation: 0.1,
        avgTemp: 20,
        expected: precise(0.005, PRECISION.UNIFORMITY),
        explanation: "Uniformity Index = variation/|avgTemp| = 0.1/20 = 0.005",
      },
    },
    palletPerformance: {
      singleLayer: {
        efficiency: precise(0.8, PRECISION.EFFICIENCY),
        temperature: precise(20, PRECISION.TEMPERATURE),
        heatTransfer: precise(-100, PRECISION.ENERGY),
      },
      multipleLayers: {
        layers: [
          { efficiency: 0.8, temp: 18.123, heat: -100 },
          { efficiency: 0.7, temp: 20.456, heat: -90 },
          { efficiency: 0.6, temp: 22.789, heat: -80 },
        ],
        expectedAvgEfficiency: precise(0.7, PRECISION.EFFICIENCY),
        expectedAvgTemp: precise(20.456, PRECISION.TEMPERATURE),
        expectedTempVariation: precise(1.905, PRECISION.TEMPERATURE),
        expectedUniformityIndex: precise(0.0931, PRECISION.UNIFORMITY),
        totalHeatTransfer: precise(-270, PRECISION.ENERGY),
        explanation: `
              Complete pallet calculations:
              1. Average Efficiency = (0.8 + 0.7 + 0.6)/3 = 0.7
              2. Average Temperature = (18.123 + 20.456 + 22.789)/3 = 20.456
              3. Temperature Variation:
                 - Differences from mean = [-2.333, 0, 2.333]
                 - Squared differences = [5.443, 0, 5.443]
                 - Average = 10.886/3 ≈ 3.629
                 - Standard deviation = √3.629 ≈ 1.905
              4. Uniformity Index = 1.905/20.456 ≈ 0.093
              5. Total Heat Transfer = sum(-100, -90, -80) = -270`,
      },
    },
  };

  // Helper function for creating mock layer performance
  const createMockLayerPerformance = (
    efficiency: number,
    temp: number,
    heatTransfer: number
  ): LayerPerformance => ({
    averageCoolingEfficiency: precise(efficiency, PRECISION.EFFICIENCY),
    uniformityIndex: 0,
    totalHeatTransfer: precise(heatTransfer, PRECISION.ENERGY),
    averageTemperature: precise(temp, PRECISION.TEMPERATURE),
    temperatureVariation: 0,
    rowTemperatures: [],
  });

  describe("calculateAverage", () => {
    Object.entries(TEST_CONFIG.averages).forEach(([scenario, config]) => {
      it(`should calculate average for ${scenario} case`, () => {
        const result = calculateAverage(config.values);
        expect(result).to.equal(config.expected);
      });
    });
  });

  describe("calculateTemperatureVariation", () => {
    Object.entries(TEST_CONFIG.variations).forEach(([scenario, config]) => {
      it(`should calculate variation for ${scenario} temperatures`, () => {
        const result = calculateTemperatureVariation(
          config.temps,
          config.avgTemp
        );
        expect(result).to.equal(config.expected);
      });
    });
  });

  describe("calculateUniformityIndex", () => {
    Object.entries(TEST_CONFIG.uniformityIndex).forEach(
      ([scenario, config]) => {
        it(`should calculate uniformity index for ${scenario} case`, () => {
          const result = calculateUniformityIndex(
            config.variation,
            config.avgTemp
          );
          expect(result).to.equal(config.expected);
        });
      }
    );
  });

  describe("calculatePalletPerformance", () => {
    it("should handle empty layer performance array", () => {
      const result = calculatePalletPerformance([], 0);
      expect(result).to.deep.equal(createEmptyPerformance());
    });

    it("should calculate metrics for single layer", () => {
      const config = TEST_CONFIG.palletPerformance.singleLayer;
      const layerPerf = [
        createMockLayerPerformance(
          config.efficiency,
          config.temperature,
          config.heatTransfer
        ),
      ];

      const result = calculatePalletPerformance(layerPerf, config.heatTransfer);

      expect(result.averageCoolingEfficiency).to.equal(config.efficiency);
      expect(result.averageTemperature).to.equal(config.temperature);
      expect(result.totalHeatTransfer).to.equal(config.heatTransfer);
    });

    it("should calculate metrics for multiple layers", () => {
      const config = TEST_CONFIG.palletPerformance.multipleLayers;
      const layerPerf = config.layers.map((layer) =>
        createMockLayerPerformance(layer.efficiency, layer.temp, layer.heat)
      );

      const result = calculatePalletPerformance(
        layerPerf,
        config.totalHeatTransfer
      );

      expect(result.averageCoolingEfficiency).to.equal(
        config.expectedAvgEfficiency
      );
      expect(result.averageTemperature).to.equal(config.expectedAvgTemp);
      expect(result.temperatureVariation).to.equal(
        config.expectedTempVariation
      );
      expect(result.uniformityIndex).to.equal(config.expectedUniformityIndex);
      expect(result.totalHeatTransfer).to.equal(config.totalHeatTransfer);
    });
  });
});
