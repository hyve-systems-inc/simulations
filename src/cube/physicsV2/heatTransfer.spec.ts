import { expect } from "chai";
import * as heatTransfer from "./heatTransfer.js";

describe("heatTransfer", () => {
  describe("respirationHeat", () => {
    it("should calculate respiration heat correctly for typical values", () => {
      // Test with typical values for fresh produce
      const result = heatTransfer.respirationHeat(
        20, // T = 20°C
        0.1, // rRef = 0.1 W/kg
        0.1, // k = 0.1 1/K
        10, // Tref = 10°C
        100, // mass = 100 kg
        2000, // hResp = 2000 J/kg
        0.1 // dT == 0.1s
      );

      // At 20°C (10°C above reference), with k=0.1:
      // R = 0.1 * exp(0.1 * 10) ≈ 0.271
      // Qresp = 0.271 * 100 * 2000 ≈ 54200
      expect(result).to.be.approximately(54200, 1);
    });

    it("should return zero heat for zero mass", () => {
      const result = heatTransfer.respirationHeat(
        20, // T
        0.1, // rRef
        0.1, // k
        10, // Tref
        0, // mass = 0
        2000, // hResp = 2000 J/kg
        0.1 // dT == 0.1s // hResp
      );
      expect(result).to.equal(0);
    });

    it("should respect significant figures when provided", () => {
      const result = heatTransfer.respirationHeat(
        20, // T
        0.1, // rRef
        0.1, // k
        10, // Tref
        100, // mass
        2000, // hResp = 2000 J/kg
        0.1, // dT == 0.1s
        3 // sigFigs
      );
      expect(result).to.equal(54200);
    });

    it("should increase with temperature above reference", () => {
      const lowerTemp = heatTransfer.respirationHeat(
        15,
        0.1,
        0.1,
        10,
        100,
        2000, // hResp = 2000 J/kg
        0.1 // dT == 0.1s
      );
      const higherTemp = heatTransfer.respirationHeat(
        25,
        0.1,
        0.1,
        10,
        100,
        2000, // hResp = 2000 J/kg
        0.1 // dT == 0.1s
      );
      expect(higherTemp).to.be.greaterThan(lowerTemp);
    });
  });

  describe("convectiveHeat", () => {
    it("should calculate convective heat transfer correctly for typical values", () => {
      const result = heatTransfer.convectiveHeat(
        25, // h0 = 25 W/(m²·K)
        0.8, // epsilon = 0.8
        0.9, // TCPI = 0.9
        5000, // Re = 5000
        2, // area = 2 m²
        25, // Tp = 25°C
        15 // Ta = 15°C
      );

      // With Re = 5000, fRe = 1
      // h = 25 * 0.8 * 0.9 * 1 = 18
      // Q = 18 * 2 * (25 - 15) = 360
      expect(result).to.be.approximately(360, 1);
    });

    it("should return zero heat transfer when temperatures are equal", () => {
      const result = heatTransfer.convectiveHeat(
        25, // h0
        0.8, // epsilon
        0.9, // TCPI
        5000, // Re
        2, // area
        20, // Tp = Ta
        20 // Ta = Tp
      );
      expect(result).to.equal(0);
    });

    it("should return negative heat transfer when air is warmer than product", () => {
      const result = heatTransfer.convectiveHeat(
        25, // h0
        0.8, // epsilon
        0.9, // TCPI
        5000, // Re
        2, // area
        15, // Tp
        25 // Ta > Tp
      );
      expect(result).to.be.lessThan(0);
    });

    it("should increase with Reynolds number", () => {
      const lowRe = heatTransfer.convectiveHeat(25, 0.8, 0.9, 5000, 2, 25, 15);
      const highRe = heatTransfer.convectiveHeat(
        25,
        0.8,
        0.9,
        10000,
        2,
        25,
        15
      );
      expect(highRe).to.be.greaterThan(lowRe);
    });
  });

  describe("evaporativeCooling", () => {
    it("should calculate evaporative cooling correctly for typical values", () => {
      const result = heatTransfer.evaporativeCooling(
        0.01, // hm = 0.01 m/s
        2, // area = 2 m²
        0.8, // fw = 0.8
        1000, // VPD = 1000 Pa
        20, // T = 20°C
        2.45e6 // lambda = 2.45e6 J/kg
      );

      // mevap = (0.01 * 2 * 0.8 * 1000)/(461.5 * (20 + 273.15)) ≈ 0.000148
      // Qevap = 0.000148 * 2.45e6 ≈ 362.6
      expect(result).to.be.approximately(362.6, 1);
    });

    it("should return zero cooling for zero surface wetness", () => {
      const result = heatTransfer.evaporativeCooling(
        0.01, // hm
        2, // area
        0, // fw = 0
        1000, // VPD
        20, // T
        2.45e6 // lambda
      );
      expect(result).to.equal(0);
    });

    it("should return zero cooling for zero vapor pressure deficit", () => {
      const result = heatTransfer.evaporativeCooling(
        0.01, // hm
        2, // area
        0.8, // fw
        0, // VPD = 0
        20, // T
        2.45e6 // lambda
      );
      expect(result).to.equal(0);
    });

    it("should increase with vapor pressure deficit", () => {
      const lowVPD = heatTransfer.evaporativeCooling(
        0.01,
        2,
        0.8,
        1000,
        20,
        2.45e6
      );
      const highVPD = heatTransfer.evaporativeCooling(
        0.01,
        2,
        0.8,
        2000,
        20,
        2.45e6
      );
      expect(highVPD).to.be.greaterThan(lowVPD);
    });

    it("should respect significant figures when provided", () => {
      const result = heatTransfer.evaporativeCooling(
        0.01, // hm
        2, // area
        0.8, // fw
        1000, // VPD
        20, // T
        2.45e6, // lambda
        3 // sigFigs
      );
      expect(result).to.equal(363);
    });
  });
});
