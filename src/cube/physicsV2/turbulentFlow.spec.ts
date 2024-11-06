import { expect } from "chai";
import * as turbulentFlow from "./turbulentFlow.js";

describe("turbulentFlow", () => {
  describe("reynoldsNumber", () => {
    it("should calculate Reynolds number correctly for typical values", () => {
      const result = turbulentFlow.reynoldsNumber(
        1.225, // density = 1.225 kg/m³ (air at standard conditions)
        2, // velocity = 2 m/s
        0.1, // hydraulic diameter = 0.1 m
        1.81e-5 // viscosity = 1.81e-5 kg/(m·s) (air at standard conditions)
      );

      // Re = (1.225 * 2 * 0.1) / (1.81e-5) ≈ 13536
      expect(result).to.be.approximately(13536, 1);
    });

    it("should return zero for zero velocity", () => {
      const result = turbulentFlow.reynoldsNumber(
        1.225, // density
        0, // velocity = 0
        0.1, // hydraulic diameter
        1.81e-5 // viscosity
      );
      expect(result).to.equal(0);
    });

    it("should respect significant figures when provided", () => {
      const result = turbulentFlow.reynoldsNumber(
        1.225,
        2,
        0.1,
        1.81e-5,
        3 // sigFigs
      );
      expect(result).to.equal(13500);
    });

    it("should scale linearly with velocity", () => {
      const lowVel = turbulentFlow.reynoldsNumber(1.225, 2, 0.1, 1.81e-5);
      const highVel = turbulentFlow.reynoldsNumber(1.225, 4, 0.1, 1.81e-5);
      expect(highVel).to.be.approximately(2 * lowVel, 1);
    });
  });

  describe("turbulenceIntensity", () => {
    it("should calculate turbulence intensity correctly for typical values", () => {
      const result = turbulentFlow.turbulenceIntensity(10000);

      // I = 0.16 * (10000)^(-1/8) ≈ 0.0517
      expect(result).to.be.approximately(0.0517, 0.0001);
    });

    it("should respect significant figures when provided", () => {
      const result = turbulentFlow.turbulenceIntensity(10000, 3);
      expect(result).to.equal(0.0517);
    });

    it("should decrease with increasing Reynolds number", () => {
      const lowRe = turbulentFlow.turbulenceIntensity(5000);
      const highRe = turbulentFlow.turbulenceIntensity(10000);
      expect(highRe).to.be.lessThan(lowRe);
    });

    it("should have correct behavior at extreme Reynolds numbers", () => {
      const lowRe = turbulentFlow.turbulenceIntensity(4000);
      const highRe = turbulentFlow.turbulenceIntensity(100000);
      expect(lowRe).to.be.greaterThan(0.05);
      expect(highRe).to.be.lessThan(0.05);
    });
  });

  describe("effectiveHeatTransfer", () => {
    it("should calculate effective heat transfer coefficient around mean value", () => {
      // Test multiple times due to random component
      for (let i = 0; i < 100; i++) {
        const result = turbulentFlow.effectiveHeatTransfer(
          25, // hMean = 25 W/(m²·K)
          0.2, // alpha = 0.2
          0.05 // I = 0.05
        );

        // Result should be within ±20% of mean value
        // (Based on α = 0.2 and typical N(0,1) values)
        expect(result).to.be.within(20, 30);
      }
    });

    it("should return mean value when alpha is zero", () => {
      const result = turbulentFlow.effectiveHeatTransfer(
        25, // hMean
        0, // alpha = 0
        0.05 // I
      );
      expect(result).to.equal(25);
    });

    it("should respect significant figures when provided", () => {
      const result = turbulentFlow.effectiveHeatTransfer(
        25,
        0,
        0.05,
        3 // sigFigs
      );
      expect(result).to.equal(25.0);
    });

    it("should scale linearly with mean heat transfer coefficient", () => {
      // Use alpha = 0 to remove random component for this test
      const low = turbulentFlow.effectiveHeatTransfer(25, 0, 0.05);
      const high = turbulentFlow.effectiveHeatTransfer(50, 0, 0.05);
      expect(high).to.equal(2 * low);
    });

    it("should have larger variation with larger alpha", () => {
      let smallAlphaVariance = 0;
      let largeAlphaVariance = 0;
      const iterations = 1000;
      const hMean = 25;

      // Calculate variance for small alpha
      let values = [];
      for (let i = 0; i < iterations; i++) {
        values.push(turbulentFlow.effectiveHeatTransfer(hMean, 0.1, 0.05));
      }
      const smallAlphaMean = values.reduce((a, b) => a + b) / iterations;
      smallAlphaVariance =
        values.reduce((a, b) => a + Math.pow(b - smallAlphaMean, 2), 0) /
        iterations;

      // Calculate variance for large alpha
      values = [];
      for (let i = 0; i < iterations; i++) {
        values.push(turbulentFlow.effectiveHeatTransfer(hMean, 0.3, 0.05));
      }
      const largeAlphaMean = values.reduce((a, b) => a + b) / iterations;
      largeAlphaVariance =
        values.reduce((a, b) => a + Math.pow(b - largeAlphaMean, 2), 0) /
        iterations;

      expect(largeAlphaVariance).to.be.greaterThan(smallAlphaVariance);
    });
  });
});
