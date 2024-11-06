import { expect } from "chai";
import * as psychrometrics from "./psychrometrics.js";

describe("psychrometrics", () => {
  describe("saturationPressure", () => {
    it("should calculate saturation pressure correctly for typical values", () => {
      // Test at standard room temperature (20°C)
      const result = psychrometrics.saturationPressure(20);

      // psat(20°C) = 610.78 * exp((17.27 * 20)/(20 + 237.3)) ≈ 2337.7 Pa
      expect(result).to.be.approximately(2337.7, 0.1);
    });

    it("should respect significant figures when provided", () => {
      const result = psychrometrics.saturationPressure(20, 4);
      expect(result).to.equal(2338);
    });

    it("should increase with temperature", () => {
      const lowTemp = psychrometrics.saturationPressure(10);
      const highTemp = psychrometrics.saturationPressure(30);
      expect(highTemp).to.be.greaterThan(lowTemp);
    });

    it("should handle freezing point", () => {
      const result = psychrometrics.saturationPressure(0);
      // psat at 0°C should be approximately 611 Pa
      expect(result).to.be.approximately(611, 1);
    });

    it("should handle negative temperatures", () => {
      const result = psychrometrics.saturationPressure(-10);
      // Should return valid pressure below freezing
      expect(result).to.be.greaterThan(0);
      expect(result).to.be.lessThan(611); // Less than freezing point pressure
    });
  });

  describe("vaporPressureDeficit", () => {
    it("should calculate VPD correctly for typical values", () => {
      const result = psychrometrics.vaporPressureDeficit(
        20, // Temperature = 20°C
        0.95, // Water activity = 0.95
        0.008 // Humidity ratio = 0.008 kg/kg
      );

      // At 20°C, psat ≈ 2337.7 Pa
      // Product vapor pressure = 2337.7 * 0.95 ≈ 2220.8 Pa
      // Air vapor pressure ≈ 1285 Pa
      // VPD ≈ 935.8 Pa
      expect(result).to.be.approximately(935.8, 1);
    });

    it("should respect significant figures when provided", () => {
      const result = psychrometrics.vaporPressureDeficit(
        20,
        0.95,
        0.008,
        101325,
        3
      );
      expect(result).to.equal(936);
    });

    it("should return zero when air and product are in equilibrium", () => {
      // Calculate humidity ratio that gives same vapor pressure as product
      const T = 20;
      const aw = 1.0;
      const psat = psychrometrics.saturationPressure(T);
      const P = 101325;
      const equilibriumWa = (0.622 * psat * aw) / (P - psat * aw);

      const result = psychrometrics.vaporPressureDeficit(
        T,
        aw,
        equilibriumWa,
        P
      );
      expect(result).to.be.approximately(0, 0.1);
    });

    it("should increase with temperature at constant RH", () => {
      const lowTemp = psychrometrics.vaporPressureDeficit(20, 0.95, 0.008);
      const highTemp = psychrometrics.vaporPressureDeficit(30, 0.95, 0.008);
      expect(highTemp).to.be.greaterThan(lowTemp);
    });

    it("should decrease with increasing humidity ratio", () => {
      const lowHumidity = psychrometrics.vaporPressureDeficit(20, 0.95, 0.008);
      const highHumidity = psychrometrics.vaporPressureDeficit(20, 0.95, 0.012);
      expect(highHumidity).to.be.lessThan(lowHumidity);
    });
  });

  describe("isHumidityValid", () => {
    it("should return true for valid humidity ratios", () => {
      expect(psychrometrics.isHumidityValid(0.008, 20)).to.be.true;
    });

    it("should return false for negative humidity ratios", () => {
      expect(psychrometrics.isHumidityValid(-0.001, 20)).to.be.false;
    });

    it("should return false for humidity ratios above saturation", () => {
      // Calculate saturation humidity ratio at 20°C
      const T = 20;
      const psat = psychrometrics.saturationPressure(T);
      const P = 101325;
      const wsat = (0.622 * psat) / (P - psat);

      expect(psychrometrics.isHumidityValid(wsat * 1.1, T)).to.be.false;
    });

    it("should return true at saturation", () => {
      // Test at saturation conditions
      const T = 20;
      const psat = psychrometrics.saturationPressure(T);
      const P = 101325;
      const wsat = (0.622 * psat) / (P - psat);

      expect(psychrometrics.isHumidityValid(wsat, T)).to.be.true;
    });
  });

  describe("saturationHumidityRatio", () => {
    it("should calculate saturation humidity ratio correctly for typical values", () => {
      const result = psychrometrics.saturationHumidityRatio(20);

      // At 20°C:
      // psat ≈ 2337.7 Pa
      // wsat = 0.622 * 2337.7/(101325 - 2337.7) ≈ 0.0147 kg/kg
      expect(result).to.be.approximately(0.0147, 0.0001);
    });

    it("should respect significant figures when provided", () => {
      const result = psychrometrics.saturationHumidityRatio(20, 101325, 3);
      expect(result).to.equal(0.0147);
    });

    it("should throw error for temperatures where psat would exceed total pressure", () => {
      expect(() => psychrometrics.saturationHumidityRatio(200)).to.throw();
    });

    it("should increase with temperature", () => {
      const lowTemp = psychrometrics.saturationHumidityRatio(10);
      const highTemp = psychrometrics.saturationHumidityRatio(30);
      expect(highTemp).to.be.greaterThan(lowTemp);
    });

    it("should decrease with increasing pressure", () => {
      const lowP = psychrometrics.saturationHumidityRatio(20, 90000);
      const highP = psychrometrics.saturationHumidityRatio(20, 110000);
      expect(highP).to.be.lessThan(lowP);
    });
  });

  describe("relativeHumidity", () => {
    it("should calculate relative humidity correctly for typical values", () => {
      const result = psychrometrics.relativeHumidity(0.008, 20);

      // At 20°C with w = 0.008 kg/kg:
      // psat ≈ 2337.7 Pa
      // RH ≈ 0.55
      expect(result).to.be.approximately(0.55, 0.01);
    });

    it("should respect significant figures when provided", () => {
      const result = psychrometrics.relativeHumidity(0.008, 20, 101325, 3);
      expect(result).to.equal(0.55);
    });

    it("should throw error for negative humidity ratio", () => {
      expect(() => psychrometrics.relativeHumidity(-0.001, 20)).to.throw();
    });

    it("should never exceed 1.0", () => {
      // Test with very high humidity ratio
      const result = psychrometrics.relativeHumidity(0.03, 20);
      expect(result).to.equal(1.0);
    });

    it("should increase with humidity ratio at constant temperature", () => {
      const lowHumidity = psychrometrics.relativeHumidity(0.005, 20);
      const highHumidity = psychrometrics.relativeHumidity(0.01, 20);
      expect(highHumidity).to.be.greaterThan(lowHumidity);
    });

    it("should decrease with temperature at constant humidity ratio", () => {
      const lowTemp = psychrometrics.relativeHumidity(0.008, 20);
      const highTemp = psychrometrics.relativeHumidity(0.008, 30);
      expect(highTemp).to.be.lessThan(lowTemp);
    });
  });
});
