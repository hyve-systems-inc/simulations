import { expect } from "chai";
import { calculateTimeStep } from "./time.js";
import { SystemParameters } from "../modelV2/systemEvolution.js";

describe("calculateTimeStep", () => {
  // Create a baseline set of parameters
  const createTestParams = (): SystemParameters => ({
    zones: 2,
    layers: 2,
    containerLength: 12, // meters
    containerWidth: 2.4,
    containerHeight: 2.6,

    productMass: [
      [100, 100],
      [100, 100],
    ], // kg
    productArea: [
      [5, 5],
      [5, 5],
    ], // m²
    specificHeat: 3800, // J/(kg·K)
    waterActivity: 0.95,
    respirationRate: 0.1,
    respirationTempCoeff: 0.1,
    respirationRefTemp: 10,
    respirationEnthalpy: 2000,

    airMass: [50, 50], // kg
    airFlow: 2.0, // kg/s
    airSpecificHeat: 1006,

    baseHeatTransfer: 25, // W/(m²·K)
    positionFactor: [
      [1, 0.8],
      [0.8, 0.6],
    ],
    evaporativeMassTransfer: 0.01, // m/s
    surfaceWetness: 0.8,

    maxCoolingPower: 10000,
    ratedPower: 5000,
    coilTemp: 5,

    TCPITarget: 0.9,
    alpha: 0.2,

    pressure: 101325, // Pa
    wallHeatTransfer: [100, 100],
  });

  describe("Basic Functionality", () => {
    it("should return a positive number", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      expect(dt).to.be.greaterThan(0);
    });

    it("should return a finite number", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      expect(dt).to.be.finite;
    });

    it("should be small enough for safety (< 1s for typical conditions)", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      expect(dt).to.be.lessThan(1);
    });
  });

  describe("CFL Condition Tests", () => {
    it("should scale inversely with air velocity", () => {
      const params = createTestParams();
      const baseFlow = params.airFlow;
      const baseDt = calculateTimeStep(params);

      // Double the flow rate (doubles velocity)
      params.airFlow = baseFlow * 2;
      const fasterDt = calculateTimeStep(params);

      // Should see roughly half the time step
      expect(fasterDt).to.be.approximately(baseDt / 2, baseDt * 0.1);
    });

    it("should scale with container length", () => {
      const params = createTestParams();
      const baseLength = params.containerLength;
      const baseDt = calculateTimeStep(params);

      // Double the length
      params.containerLength = baseLength * 2;
      const longerDt = calculateTimeStep(params);

      // Should see roughly double the time step
      expect(longerDt).to.be.approximately(baseDt * 2, baseDt * 0.1);
    });
  });

  describe("Thermal Diffusion Tests", () => {
    it("should scale with product mass", () => {
      const params = createTestParams();
      const baseDt = calculateTimeStep(params);

      // Double all product masses
      params.productMass = params.productMass.map((zone) =>
        zone.map((mass) => mass * 2)
      );
      const heavierDt = calculateTimeStep(params);

      // Should see larger time step
      expect(heavierDt).to.be.greaterThan(baseDt);
    });

    it("should scale inversely with heat transfer coefficient", () => {
      const params = createTestParams();
      const baseDt = calculateTimeStep(params);

      // Double heat transfer coefficient
      params.baseHeatTransfer *= 2;
      const fasterHeatDt = calculateTimeStep(params);

      // Should see smaller time step
      expect(fasterHeatDt).to.be.lessThan(baseDt);
    });
  });

  describe("Mass Flow Tests", () => {
    it("should scale with air mass", () => {
      const params = createTestParams();
      const baseDt = calculateTimeStep(params);

      // Double air masses
      params.airMass = params.airMass.map((mass) => mass * 2);
      const heavierAirDt = calculateTimeStep(params);

      // Should see larger time step
      expect(heavierAirDt).to.be.greaterThan(baseDt);
    });

    it("should scale inversely with mass transfer coefficient", () => {
      const params = createTestParams();
      const baseDt = calculateTimeStep(params);

      // Double mass transfer coefficient
      params.evaporativeMassTransfer *= 2;
      const fasterMassDt = calculateTimeStep(params);

      // Should see smaller time step
      expect(fasterMassDt).to.be.lessThan(baseDt);
    });
  });

  describe("Edge Cases", () => {
    it("should handle minimum product mass of zero safely", () => {
      const params = createTestParams();
      params.productMass = [
        [0, 0],
        [0, 0],
      ];
      expect(() => calculateTimeStep(params)).to.not.throw();
    });

    it("should handle minimum air mass of zero safely", () => {
      const params = createTestParams();
      params.airMass = [0, 0];
      expect(() => calculateTimeStep(params)).to.not.throw();
    });

    it("should handle zero flow rate safely", () => {
      const params = createTestParams();
      params.airFlow = 0;
      expect(() => calculateTimeStep(params)).to.not.throw();
    });

    it("should handle zero heat transfer coefficient safely", () => {
      const params = createTestParams();
      params.baseHeatTransfer = 0;
      expect(() => calculateTimeStep(params)).to.not.throw();
    });

    it("should handle zero evaporative mass transfer safely", () => {
      const params = createTestParams();
      params.evaporativeMassTransfer = 0;
      expect(() => calculateTimeStep(params)).to.not.throw();
    });
  });

  describe("Physical Constraints", () => {
    it("should satisfy CFL condition", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      const dx = params.containerLength / params.zones;

      // Calculate worst-case velocity
      const minDensity = params.pressure / (287.1 * (40 + 273.15)); // at 40°C
      const maxVelocity =
        params.airFlow /
        (minDensity * params.containerWidth * params.containerHeight);

      // Check CFL condition: v * dt/dx ≤ 1
      expect((maxVelocity * dt) / dx).to.be.at.most(1);
    });

    it("should satisfy Fourier condition", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      const dx = params.containerLength / params.zones;

      // Calculate thermal diffusivity
      const minMass = Math.min(...params.productMass.flat());
      const maxArea = Math.max(...params.productArea.flat());
      const thermalDiffusivity =
        (params.baseHeatTransfer * maxArea) / (minMass * params.specificHeat);

      // Check Fourier condition: α * dt/dx² ≤ 0.5
      expect((thermalDiffusivity * dt) / (dx * dx)).to.be.at.most(0.5);
    });

    it("should satisfy mass transfer stability", () => {
      const params = createTestParams();
      const dt = calculateTimeStep(params);
      const dx = params.containerLength / params.zones;

      // Check mass transfer condition: hm * dt/dx ≤ 1
      expect((params.evaporativeMassTransfer * dt) / dx).to.be.at.most(1);
    });
  });
});
