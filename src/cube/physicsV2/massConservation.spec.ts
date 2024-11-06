import { expect } from "chai";
import * as massConservation from "./massConservation.js";

describe("massConservation", () => {
  describe("productMoistureRate", () => {
    it("should calculate moisture rate correctly for typical values", () => {
      const result = massConservation.productMoistureRate(
        0.001, // mevap = 0.001 kg/s evaporation rate
        50 // productMass = 50 kg
      );

      // dwp/dt = -0.001/50 = -0.00002 kg/kg·s
      expect(result).to.be.approximately(-0.00002, 1e-6);
    });

    it("should respect significant figures when provided", () => {
      const result = massConservation.productMoistureRate(0.001, 50, 3);
      expect(result).to.equal(-0.00002);
    });

    it("should return zero for no evaporation", () => {
      const result = massConservation.productMoistureRate(0, 50);
      expect(result).to.equal(0);
    });

    it("should scale inversely with product mass", () => {
      const lowMass = massConservation.productMoistureRate(0.001, 25);
      const highMass = massConservation.productMoistureRate(0.001, 50);
      expect(Math.abs(lowMass)).to.be.approximately(
        2 * Math.abs(highMass),
        1e-6
      );
    });

    it("should scale linearly with evaporation rate", () => {
      const lowEvap = massConservation.productMoistureRate(0.001, 50);
      const highEvap = massConservation.productMoistureRate(0.002, 50);
      expect(Math.abs(highEvap)).to.be.approximately(
        2 * Math.abs(lowEvap),
        1e-6
      );
    });

    it("should handle very small evaporation rates", () => {
      const result = massConservation.productMoistureRate(1e-6, 50);
      expect(result).to.be.approximately(-2e-8, 1e-9);
    });

    it("should handle very large product masses", () => {
      const result = massConservation.productMoistureRate(0.001, 5000);
      expect(result).to.be.approximately(-2e-7, 1e-8);
    });
  });

  describe("airMoistureRate", () => {
    it("should calculate air moisture rate correctly for typical values", () => {
      const result = massConservation.airMoistureRate(
        0.001, // mevap = 0.001 kg/s evaporation rate
        0.0008, // mdehum = 0.0008 kg/s dehumidification rate
        0.0002, // mvent = 0.0002 kg/s ventilation moisture rate
        100 // airMass = 100 kg
      );

      // dwa/dt = (0.001 - 0.0008 + 0.0002)/100 = 4e-6 kg/kg·s
      expect(result).to.be.approximately(4e-6, 1e-7);
    });

    it("should respect significant figures when provided", () => {
      const result = massConservation.airMoistureRate(
        0.001,
        0.0008,
        0.0002,
        100,
        3
      );
      expect(result).to.equal(0.000004);
    });

    it("should handle balanced mass flows", () => {
      // When mevap = mdehum and mvent = 0
      const result = massConservation.airMoistureRate(0.001, 0.001, 0, 100);
      expect(result).to.equal(0);
    });

    it("should be positive when sources exceed sinks", () => {
      const result = massConservation.airMoistureRate(0.002, 0.001, 0, 100);
      expect(result).to.be.greaterThan(0);
    });

    it("should be negative when sinks exceed sources", () => {
      const result = massConservation.airMoistureRate(0.001, 0.002, 0, 100);
      expect(result).to.be.lessThan(0);
    });

    it("should scale inversely with air mass", () => {
      const lowMass = massConservation.airMoistureRate(
        0.001,
        0.0008,
        0.0002,
        50
      );
      const highMass = massConservation.airMoistureRate(
        0.001,
        0.0008,
        0.0002,
        100
      );
      expect(lowMass).to.be.approximately(2 * highMass, 1e-7);
    });

    it("should handle very small mass transfer rates", () => {
      const result = massConservation.airMoistureRate(1e-6, 8e-7, 2e-7, 100);
      expect(result).to.be.approximately(4e-9, 1e-10);
    });

    it("should handle very large air masses", () => {
      const result = massConservation.airMoistureRate(
        0.001,
        0.0008,
        0.0002,
        10000
      );
      expect(result).to.be.approximately(4e-8, 1e-9);
    });

    it("should maintain correct signs for all source/sink combinations", () => {
      // Test various combinations of positive and zero values
      const cases = [
        {
          mevap: 0.001,
          mdehum: 0,
          mvent: 0,
          expected: "positive",
        },
        {
          mevap: 0,
          mdehum: 0.001,
          mvent: 0,
          expected: "negative",
        },
        {
          mevap: 0,
          mdehum: 0,
          mvent: 0.001,
          expected: "positive",
        },
        {
          mevap: 0.001,
          mdehum: 0.001,
          mvent: 0.001,
          expected: "positive",
        },
      ];

      cases.forEach((testCase) => {
        const result = massConservation.airMoistureRate(
          testCase.mevap,
          testCase.mdehum,
          testCase.mvent,
          100
        );
        if (testCase.expected === "positive") {
          expect(result).to.be.greaterThan(0);
        } else {
          expect(result).to.be.lessThan(0);
        }
      });
    });
  });
});
