import { expect } from "chai";
import * as coolingUnit from "./coolingUnit.js";

describe("coolingUnit", () => {
  describe("sensibleCooling", () => {
    it("should calculate sensible cooling correctly for typical values", () => {
      const result = coolingUnit.sensibleCooling(
        2.0, // massFlow = 2.0 kg/s
        1006, // cpAir = 1006 J/(kg·K) for air
        25, // TaIn = 25°C inlet air
        5 // Tcoil = 5°C coil temperature
      );

      // Qsensible = 2.0 * 1006 * (25 - 5) = 40240 W
      expect(result).to.be.approximately(40240, 1);
    });

    it("should respect significant figures when provided", () => {
      const result = coolingUnit.sensibleCooling(2.0, 1006, 25, 5, 4);
      expect(result).to.equal(40240);
    });

    it("should be zero when temperatures are equal", () => {
      const result = coolingUnit.sensibleCooling(2.0, 1006, 15, 15);
      expect(result).to.equal(0);
    });

    it("should scale linearly with mass flow", () => {
      const lowFlow = coolingUnit.sensibleCooling(1.0, 1006, 25, 5);
      const highFlow = coolingUnit.sensibleCooling(2.0, 1006, 25, 5);
      expect(highFlow).to.be.approximately(2 * lowFlow, 1);
    });

    it("should scale linearly with temperature difference", () => {
      const smallDelta = coolingUnit.sensibleCooling(2.0, 1006, 15, 5);
      const largeDelta = coolingUnit.sensibleCooling(2.0, 1006, 25, 5);
      expect(largeDelta).to.be.approximately(2.5 * smallDelta, 1);
    });

    it("should handle very small temperature differences", () => {
      const result = coolingUnit.sensibleCooling(2.0, 1006, 5.1, 5.0);
      expect(result).to.be.approximately(201.2, 0.1);
    });

    it("should handle very large temperature differences", () => {
      const result = coolingUnit.sensibleCooling(2.0, 1006, 45, 5);
      expect(result).to.be.approximately(80480, 1);
    });
  });

  describe("dehumidificationRate", () => {
    it("should calculate dehumidification rate correctly for typical values", () => {
      const result = coolingUnit.dehumidificationRate(
        2.0, // massFlow = 2.0 kg/s
        0.01, // wa = 0.010 kg/kg inlet humidity ratio
        0.006, // wsatDp = 0.006 kg/kg saturation at dew point
        20, // Ta = 20°C air temperature
        15 // Tdp = 15°C dew point temperature
      );

      // Calculate sigma terms and final rate
      // Result should be approximately 0.008 kg/s
      expect(result).to.be.approximately(0.008, 0.001);
    });

    it("should respect significant figures when provided", () => {
      const result = coolingUnit.dehumidificationRate(
        2.0,
        0.01,
        0.006,
        20,
        15,
        4
      );
      expect(result).to.be.approximately(0.008, 0.0001);
    });

    it("should be zero when humidity equals saturation", () => {
      const result = coolingUnit.dehumidificationRate(
        2.0,
        0.006,
        0.006,
        20,
        15
      );
      expect(result).to.be.approximately(0, 1e-6);
    });

    it("should be zero when air temperature equals dew point", () => {
      const result = coolingUnit.dehumidificationRate(2.0, 0.01, 0.006, 15, 15);
      expect(result).to.be.approximately(0, 1e-6);
    });

    it("should scale with mass flow rate", () => {
      const lowFlow = coolingUnit.dehumidificationRate(
        1.0,
        0.01,
        0.006,
        20,
        15
      );
      const highFlow = coolingUnit.dehumidificationRate(
        2.0,
        0.01,
        0.006,
        20,
        15
      );
      expect(highFlow).to.be.approximately(2 * lowFlow, 0.001);
    });

    it("should increase with humidity difference", () => {
      const smallDiff = coolingUnit.dehumidificationRate(
        2.0,
        0.008,
        0.006,
        20,
        15
      );
      const largeDiff = coolingUnit.dehumidificationRate(
        2.0,
        0.01,
        0.006,
        20,
        15
      );
      expect(largeDiff).to.be.greaterThan(smallDiff);
    });

    it("should handle very small humidity differences", () => {
      const result = coolingUnit.dehumidificationRate(
        2.0,
        0.0061,
        0.006,
        20,
        15
      );
      expect(result).to.be.approximately(0, 0.001);
    });
  });

  describe("actualCoolingPower", () => {
    it("should calculate actual cooling power correctly for typical values", () => {
      const result = coolingUnit.actualCoolingPower(
        5000, // Prated = 5000 W rated power
        8000, // Qcool = 8000 W cooling load
        10000, // Qmax = 10000 W maximum cooling
        0.9 // TCPI = 0.9 performance index
      );

      // Pactual = 5000 * (8000/10000)^(1/0.9) ≈ 3845 W
      expect(result).to.be.approximately(3845, 1);
    });

    it("should respect significant figures when provided", () => {
      const result = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.9, 4);
      expect(result).to.equal(3845);
    });

    it("should equal rated power at maximum cooling with TCPI = 1", () => {
      const result = coolingUnit.actualCoolingPower(5000, 10000, 10000, 1.0);
      expect(result).to.be.approximately(5000, 1);
    });

    it("should be zero at zero cooling", () => {
      const result = coolingUnit.actualCoolingPower(5000, 0, 10000, 0.9);
      expect(result).to.equal(0);
    });

    it("should increase with cooling load", () => {
      const lowLoad = coolingUnit.actualCoolingPower(5000, 4000, 10000, 0.9);
      const highLoad = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.9);
      expect(highLoad).to.be.greaterThan(lowLoad);
    });

    it("should decrease with increasing TCPI", () => {
      const lowTCPI = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.8);
      const highTCPI = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.9);
      expect(highTCPI).to.be.lessThan(lowTCPI);
    });

    it("should scale linearly with rated power", () => {
      const lowPower = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.9);
      const highPower = coolingUnit.actualCoolingPower(10000, 8000, 10000, 0.9);
      expect(highPower).to.be.approximately(2 * lowPower, 1);
    });

    it("should handle very small cooling loads", () => {
      const result = coolingUnit.actualCoolingPower(5000, 100, 10000, 0.9);
      expect(result).to.be.lessThan(100);
      expect(result).to.be.greaterThan(0);
    });

    it("should handle TCPI near 1", () => {
      const result = coolingUnit.actualCoolingPower(5000, 8000, 10000, 0.99);
      expect(result).to.be.approximately(3940, 10);
    });
  });
});
