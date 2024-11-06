import { expect } from "chai";
import {
  evolveState,
  SystemState,
  SystemParameters,
} from "./systemEvolution.js";
import { calculateTotalEnergy } from "../physicsV2/energyConservation.js";
import { calculateTotalMoisture } from "../physicsV2/psychrometrics.js";

describe("evolveState", () => {
  // Test fixture setup
  const createTestState = (): SystemState => ({
    productTemp: [
      [20, 20],
      [20, 20],
    ],
    productMoisture: [
      [0.8, 0.8],
      [0.8, 0.8],
    ],
    airTemp: [15, 15],
    airHumidity: [0.008, 0.008],
    TCPI: 0.9,
    coolingPower: 5000,
    t: 0,
  });

  const createTestParams = (): SystemParameters => ({
    zones: 2,
    layers: 2,
    containerLength: 12,
    containerWidth: 2.4,
    containerHeight: 2.6,
    productMass: [
      [100, 100],
      [100, 100],
    ],
    productArea: [
      [5, 5],
      [5, 5],
    ],
    specificHeat: 3800,
    waterActivity: 0.95,
    respirationRate: 0.1,
    respirationTempCoeff: 0.1,
    respirationRefTemp: 10,
    respirationEnthalpy: 250,
    airMass: [50, 50],
    airFlow: 2.0,
    airSpecificHeat: 1006,
    baseHeatTransfer: 25,
    positionFactor: [
      [1, 0.8],
      [0.8, 0.6],
    ],
    evaporativeMassTransfer: 0.01,
    surfaceWetness: 0.8,
    maxCoolingPower: 10000,
    ratedPower: 5000,
    coilTemp: 5,
    TCPITarget: 0.9,
    alpha: 0.2,
    pressure: 101325,
    wallHeatTransfer: [100, 100],
  });

  // Section II: Core Conservation Equations
  describe("Conservation Laws", () => {
    it("should conserve energy within cooling power bounds", () => {
      const state = createTestState();
      const params = createTestParams();
      const initialEnergy = calculateTotalEnergy(state, params);
      const newState = evolveState(state, params);
      const finalEnergy = calculateTotalEnergy(newState, params);

      const energyChange = initialEnergy - finalEnergy;
      const expectedCooling = newState.coolingPower * (newState.t - state.t);
      const tolerance = expectedCooling * 0.05; // 5% tolerance

      expect(energyChange).to.be.approximately(expectedCooling, tolerance);
    });

    it("should conserve total moisture accounting for dehumidification", () => {
      const state = createTestState();
      const params = createTestParams();
      const initialMoisture = calculateTotalMoisture(state, params);
      const newState = evolveState(state, params);
      const finalMoisture = calculateTotalMoisture(newState, params);

      // Allow small numerical errors but catch significant deviations
      expect(finalMoisture).to.be.approximately(
        initialMoisture,
        initialMoisture * 0.01
      );
    });
  });

  // Section III: Heat Transfer Mechanisms
  describe("Heat Transfer", () => {
    it("should properly account for respiration heat", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Verify temperature rise from respiration against documented formula
      const expectedRespRate =
        params.respirationRate *
        Math.exp(
          params.respirationTempCoeff *
            (state.productTemp[0][0] - params.respirationRefTemp)
        );

      expect(newState.productTemp[0][0]).to.be.greaterThan(
        state.productTemp[0][0] - expectedRespRate * (newState.t - state.t)
      );
    });

    it("should implement convective heat transfer correctly", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Test temperature difference driving convection
      for (let i = 0; i < params.zones; i++) {
        for (let j = 0; j < params.layers; j++) {
          const dT = newState.productTemp[i][j] - newState.airTemp[i];
          const prevDT = state.productTemp[i][j] - state.airTemp[i];
          expect(Math.abs(dT)).to.be.lessThan(Math.abs(prevDT));
        }
      }
    });

    it("should calculate evaporative cooling based on VPD", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Check moisture loss corresponds to cooling
      for (let i = 0; i < params.zones; i++) {
        for (let j = 0; j < params.layers; j++) {
          const moistureLoss =
            state.productMoisture[i][j] - newState.productMoisture[i][j];
          expect(moistureLoss).to.be.greaterThan(0);
          expect(newState.productTemp[i][j]).to.be.lessThan(
            state.productTemp[i][j]
          );
        }
      }
    });
  });

  // Section IV: Turbulent Flow Effects
  describe("Turbulent Flow Effects", () => {
    it("should enhance heat transfer with increased turbulence", () => {
      const state = createTestState();
      const params = createTestParams();
      const baselineParams = { ...params };

      // Increase flow rate to increase turbulence
      params.airFlow *= 2;

      const baselineState = evolveState(state, baselineParams);
      const turbulentState = evolveState(state, params);

      // Compare cooling rates
      const baselineCooling =
        state.productTemp[0][0] - baselineState.productTemp[0][0];
      const turbulentCooling =
        state.productTemp[0][0] - turbulentState.productTemp[0][0];

      expect(turbulentCooling).to.be.greaterThan(baselineCooling);
    });

    it("should maintain correct flow distribution patterns", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Check temperature gradient follows flow pattern
      for (let i = 1; i < params.zones; i++) {
        expect(newState.airTemp[i]).to.be.greaterThan(newState.airTemp[i - 1]);
      }
    });
  });

  // Section V: Cooling Unit Model
  describe("Cooling Unit Performance", () => {
    it("should maintain cooling power within rated limits", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      expect(newState.coolingPower).to.be.at.most(params.maxCoolingPower);
      expect(newState.coolingPower).to.be.at.most(params.ratedPower);
    });

    it("should balance sensible and latent cooling", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Verify both temperature and humidity reduction
      expect(newState.airTemp[0]).to.be.lessThan(state.airTemp[0]);
      expect(newState.airHumidity[0]).to.be.lessThan(state.airHumidity[0]);
    });
  });

  // Section VI: Control System
  describe("TCPI Control System", () => {
    it("should adjust TCPI based on performance", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      expect(newState.TCPI).to.be.within(0, 1);
      expect(newState.TCPI).to.not.equal(state.TCPI);
    });

    it("should modulate cooling based on TCPI", () => {
      const state = createTestState();
      const params = createTestParams();

      // Test with different initial TCPI values
      const lowTCPIState = { ...state, TCPI: 0.5 };
      const highTCPIState = { ...state, TCPI: 0.9 };

      const lowTCPIResult = evolveState(lowTCPIState, params);
      const highTCPIResult = evolveState(highTCPIState, params);

      expect(highTCPIResult.coolingPower).to.be.greaterThan(
        lowTCPIResult.coolingPower
      );
    });
  });

  // Section IX: System Constraints
  describe("Physical Constraints", () => {
    it("should maintain air humidity within physical bounds", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      for (let i = 0; i < params.zones; i++) {
        const wsatMax = 0.02; // Approximate maximum at reasonable temperatures
        expect(newState.airHumidity[i]).to.be.within(0, wsatMax);
      }
    });

    it("should maintain product moisture within physical bounds", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      for (let i = 0; i < params.zones; i++) {
        for (let j = 0; j < params.layers; j++) {
          expect(newState.productMoisture[i][j]).to.be.within(
            0,
            state.productMoisture[i][j]
          );
        }
      }
    });

    it("should maintain temperatures within reasonable bounds", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      for (let i = 0; i < params.zones; i++) {
        expect(newState.airTemp[i]).to.be.above(params.coilTemp);
        expect(newState.airTemp[i]).to.be.below(50); // Reasonable maximum temperature

        for (let j = 0; j < params.layers; j++) {
          expect(newState.productTemp[i][j]).to.be.above(params.coilTemp);
          expect(newState.productTemp[i][j]).to.be.below(50);
        }
      }
    });
  });

  // Section VIII: Performance Metrics
  describe("Performance Metrics", () => {
    it("should achieve reasonable COP values", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Calculate actual COP
      const totalCooling =
        params.airFlow *
        params.airSpecificHeat *
        (state.airTemp[0] - newState.airTemp[0]);
      const COP = totalCooling / newState.coolingPower;

      expect(COP).to.be.within(1, 5); // Typical range for refrigeration
    });

    it("should show uniform cooling within zones", () => {
      const state = createTestState();
      const params = createTestParams();
      const newState = evolveState(state, params);

      // Calculate temperature spread within each zone
      for (let i = 0; i < params.zones; i++) {
        const temps = newState.productTemp[i];
        const spread = Math.max(...temps) - Math.min(...temps);
        expect(spread).to.be.below(5); // Maximum 5°C variation within zone
      }
    });
  });

  // Numerical Implementation (Section XI)
  describe("Numerical Stability", () => {
    it("should maintain stable integration over multiple steps", () => {
      const state = createTestState();
      const params = createTestParams();
      let currentState = state;

      // Run for 10 steps
      for (let i = 0; i < 10; i++) {
        const newState = evolveState(currentState, params);
        expect(newState.t).to.be.greaterThan(currentState.t);
        expect(Number.isFinite(newState.coolingPower)).to.be.true;
        expect(Number.isFinite(newState.TCPI)).to.be.true;
        currentState = newState;
      }
    });

    it("should handle extreme initial conditions", () => {
      const state = createTestState();
      const params = createTestParams();

      // Test with high initial temperatures
      state.productTemp = state.productTemp.map((zone) => zone.map(() => 40));
      state.airTemp = state.airTemp.map(() => 40);

      expect(() => evolveState(state, params)).to.not.throw();
    });
  });
});
