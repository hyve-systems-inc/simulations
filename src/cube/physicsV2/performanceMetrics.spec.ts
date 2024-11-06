import { expect } from "chai";
import * as performanceMetrics from "./performanceMetrics.js";

describe("performanceMetrics", () => {
  describe("coolingRateIndex", () => {
    it("should calculate CRI correctly for typical values", () => {
      const result = performanceMetrics.coolingRateIndex(
        15, // Tp = 15°C (current product temp)
        5, // Ta = 5°C (current air temp)
        25, // TpInitial = 25°C (initial product temp)
        0 // TaSupply = 0°C (supply air temp)
      );

      // CRI = (15 - 5)/(25 - 0) = 10/25 = 0.4
      expect(result).to.be.approximately(0.4, 0.001);
    });

    it("should respect significant figures when provided", () => {
      const result = performanceMetrics.coolingRateIndex(15, 5, 25, 0, 3);
      expect(result).to.equal(0.4);
    });

    it("should return 1 for no cooling progress", () => {
      const result = performanceMetrics.coolingRateIndex(
        25, // Tp = TpInitial (no cooling)
        5,
        25,
        0
      );
      expect(result).to.equal(1);
    });

    it("should return 0 when product reaches air temperature", () => {
      const result = performanceMetrics.coolingRateIndex(
        5, // Tp = Ta (fully cooled)
        5,
        25,
        0
      );
      expect(result).to.equal(0);
    });

    it("should handle negative temperature differences", () => {
      const result = performanceMetrics.coolingRateIndex(
        2, // Tp below Ta
        5,
        25,
        0
      );
      expect(result).to.be.lessThan(0);
    });
  });

  describe("uniformityIndex", () => {
    it("should calculate UI correctly for typical values", () => {
      const SECT = [120, 130, 125, 115, 135]; // Seven-eighths cooling times in minutes
      const result = performanceMetrics.uniformityIndex(SECT);

      // mean = 125
      // variance = 50
      // std dev = 7.071
      // UI = 7.071/125 = 0.0566
      expect(result).to.be.approximately(0.0566, 0.0001);
    });

    it("should respect significant figures when provided", () => {
      const SECT = [120, 130, 125, 115, 135];
      const result = performanceMetrics.uniformityIndex(SECT, 3);
      expect(result).to.equal(0.0566);
    });

    it("should return 0 for perfectly uniform cooling", () => {
      const SECT = [120, 120, 120, 120, 120];
      const result = performanceMetrics.uniformityIndex(SECT);
      expect(result).to.equal(0);
    });

    it("should increase with greater cooling time variation", () => {
      const uniformSECT = [120, 125, 120, 125, 120];
      const nonuniformSECT = [100, 150, 110, 140, 120];

      const uniformResult = performanceMetrics.uniformityIndex(uniformSECT);
      const nonuniformResult =
        performanceMetrics.uniformityIndex(nonuniformSECT);

      expect(nonuniformResult).to.be.greaterThan(uniformResult);
    });

    it("should handle single value array", () => {
      const SECT = [120];
      const result = performanceMetrics.uniformityIndex(SECT);
      expect(result).to.equal(0);
    });

    it("should work with floating point cooling times", () => {
      const SECT = [120.5, 121.3, 119.8, 120.2];
      const result = performanceMetrics.uniformityIndex(SECT);
      expect(result).to.be.approximately(0.00512, 0.0001);
    });
  });

  describe("coefficientOfPerformance", () => {
    it("should calculate COP correctly for typical values", () => {
      const result = performanceMetrics.coefficientOfPerformance(
        8000, // Qsensible = 8000 W
        2000, // Qlatent = 2000 W
        4000 // power = 4000 W
      );

      // COP = (8000 + 2000)/4000 = 2.5
      expect(result).to.equal(2.5);
    });

    it("should respect significant figures when provided", () => {
      const result = performanceMetrics.coefficientOfPerformance(
        8000,
        2000,
        4000,
        3
      );
      expect(result).to.equal(2.5);
    });

    it("should handle zero latent cooling", () => {
      const result = performanceMetrics.coefficientOfPerformance(8000, 0, 4000);
      expect(result).to.equal(2.0);
    });

    it("should handle zero sensible cooling", () => {
      const result = performanceMetrics.coefficientOfPerformance(0, 2000, 4000);
      expect(result).to.equal(0.5);
    });

    it("should increase with decreasing power input at constant cooling", () => {
      const highPower = performanceMetrics.coefficientOfPerformance(
        8000,
        2000,
        4000
      );
      const lowPower = performanceMetrics.coefficientOfPerformance(
        8000,
        2000,
        2000
      );
      expect(lowPower).to.be.greaterThan(highPower);
    });

    it("should increase with increasing cooling at constant power", () => {
      const lowCooling = performanceMetrics.coefficientOfPerformance(
        8000,
        2000,
        4000
      );
      const highCooling = performanceMetrics.coefficientOfPerformance(
        16000,
        4000,
        4000
      );
      expect(highCooling).to.be.greaterThan(lowCooling);
    });

    it("should handle very large cooling loads", () => {
      const result = performanceMetrics.coefficientOfPerformance(1e6, 2e5, 4e5);
      expect(result).to.be.approximately(3.0, 0.001);
    });

    it("should handle very small cooling loads", () => {
      const result = performanceMetrics.coefficientOfPerformance(100, 20, 40);
      expect(result).to.be.approximately(3.0, 0.001);
    });
  });
});
