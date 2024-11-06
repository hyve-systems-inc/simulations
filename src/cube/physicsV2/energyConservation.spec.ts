import { expect } from "chai";
import * as energyConservation from "./energyConservation.js";

describe("energyConservation", () => {
  describe("productTemperatureRate", () => {
    it("should calculate temperature rate correctly for typical values", () => {
      const result = energyConservation.productTemperatureRate(
        100, // Qresp = 100 W respiration heat
        500, // Qconv = 500 W convective cooling
        200, // Qevap = 200 W evaporative cooling
        50, // mass = 50 kg
        3800 // cp = 3800 J/(kg·K) typical for produce
      );

      // dT/dt = (100 - 500 - 200)/(50 * 3800) = -0.00316 K/s
      expect(result).to.be.approximately(-0.00316, 0.0001);
    });

    it("should respect significant figures when provided", () => {
      const result = energyConservation.productTemperatureRate(
        100,
        500,
        200,
        50,
        3800,
        4
      );
      expect(result).to.equal(-0.003158);
    });

    it("should be zero when heat flows balance", () => {
      const result = energyConservation.productTemperatureRate(
        800, // Qresp matches cooling
        500, // Qconv
        300, // Qevap
        50,
        3800
      );
      expect(result).to.be.approximately(0, 1e-10);
    });

    it("should be positive when heating exceeds cooling", () => {
      const result = energyConservation.productTemperatureRate(
        1000, // Qresp > Qconv + Qevap
        500,
        200,
        50,
        3800
      );
      expect(result).to.be.greaterThan(0);
    });

    it("should be negative when cooling exceeds heating", () => {
      const result = energyConservation.productTemperatureRate(
        100, // Qresp < Qconv + Qevap
        500,
        200,
        50,
        3800
      );
      expect(result).to.be.lessThan(0);
    });

    it("should scale inversely with mass", () => {
      const lowMass = energyConservation.productTemperatureRate(
        100,
        500,
        200,
        25,
        3800
      );
      const highMass = energyConservation.productTemperatureRate(
        100,
        500,
        200,
        50,
        3800
      );
      expect(Math.abs(lowMass)).to.be.approximately(
        2 * Math.abs(highMass),
        1e-6
      );
    });

    it("should scale inversely with specific heat", () => {
      const lowCp = energyConservation.productTemperatureRate(
        100,
        500,
        200,
        50,
        1900
      );
      const highCp = energyConservation.productTemperatureRate(
        100,
        500,
        200,
        50,
        3800
      );
      expect(Math.abs(lowCp)).to.be.approximately(2 * Math.abs(highCp), 1e-6);
    });

    it("should handle very small heat flows", () => {
      const result = energyConservation.productTemperatureRate(
        0.1,
        0.5,
        0.2,
        50,
        3800
      );
      expect(result).to.be.approximately(-3.16e-6, 1e-7);
    });

    it("should handle very large heat flows", () => {
      const result = energyConservation.productTemperatureRate(
        1000,
        5000,
        2000,
        50,
        3800
      );
      expect(result).to.be.approximately(-0.0316, 0.001);
    });
  });

  describe("airTemperatureRate", () => {
    it("should calculate air temperature rate correctly for typical values", () => {
      const result = energyConservation.airTemperatureRate(
        100, // massAir = 100 kg
        1006, // cpAir = 1006 J/(kg·K)
        2, // massFlow = 2 kg/s
        25, // TaIn = 25°C
        20, // TaOut = 20°C
        500, // QproductAir = 500 W
        100, // Qwalls = 100 W heat gain
        1000 // Qcool = 1000 W cooling
      );

      // dTa/dt = (2 * 1006 * (25-20) + 500 + 100 - 1000)/(100 * 1006)
      // = (10060 + 500 + 100 - 1000)/(100600) ≈ 0.0096 K/s
      expect(result).to.be.approximately(0.0096, 0.0001);
    });

    it("should respect significant figures when provided", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        25,
        20,
        500,
        100,
        1000,
        4
      );
      expect(result).to.equal(0.009562);
    });

    it("should be zero when heat flows balance", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        20,
        20, // No temperature difference
        0,
        0,
        0 // No additional heat flows
      );
      expect(result).to.be.approximately(0, 1e-10);
    });

    it("should be positive when heating exceeds cooling", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        25,
        20,
        1000,
        200, // More heating
        500 // Less cooling
      );
      expect(result).to.be.greaterThan(0);
    });

    it("should be negative when cooling exceeds heating", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        25,
        20,
        500,
        100, // Less heating
        2000 // More cooling
      );
      expect(result).to.be.lessThan(0);
    });

    it("should scale with mass flow rate", () => {
      const lowFlow = energyConservation.airTemperatureRate(
        100,
        1006,
        1,
        25,
        20,
        500,
        100,
        1000
      );
      const highFlow = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        25,
        20,
        500,
        100,
        1000
      );
      expect(highFlow).to.be.greaterThan(lowFlow);
    });

    it("should scale inversely with air mass", () => {
      const lowMass = energyConservation.airTemperatureRate(
        50,
        1006,
        2,
        25,
        20,
        500,
        100,
        1000
      );
      const highMass = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        25,
        20,
        500,
        100,
        1000
      );
      expect(Math.abs(lowMass)).to.be.approximately(
        2 * Math.abs(highMass),
        1e-6
      );
    });

    it("should handle zero temperature difference", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        2,
        20,
        20, // Same temperature
        500,
        100,
        1000
      );
      expect(result).to.be.approximately(-0.004, 0.0001);
    });

    it("should handle very small heat flows", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        0.02,
        25,
        20,
        5,
        1,
        10
      );
      expect(result).to.be.approximately(0.000096, 1e-6);
    });

    it("should handle very large heat flows", () => {
      const result = energyConservation.airTemperatureRate(
        100,
        1006,
        20,
        25,
        20,
        5000,
        1000,
        10000
      );
      expect(result).to.be.approximately(0.096, 0.001);
    });
  });
});
