import { expect } from "chai";
import { Cube } from "./cube.js";
import { SystemState, SystemParameters } from "./systemEvolution.js";

describe("Cube", () => {
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

  describe("Constructor", () => {
    it("should create a new cube with valid initial state", () => {
      const state = createTestState();
      const params = createTestParams();
      const cube = new Cube(state, params);

      expect(cube.getCurrentState()).to.deep.equal(state);
      expect(cube.getParameters()).to.deep.equal(params);
    });

    it("should initialize with correct energy and moisture values", () => {
      const state = createTestState();
      const params = createTestParams();
      const cube = new Cube(state, params);

      const energyBalance = cube.getEnergyBalance();
      expect(energyBalance.energyChange).to.equal(0);

      const moistureBalance = cube.getMoistureBalance();
      expect(moistureBalance.moistureChange).to.equal(0);
    });
  });

  describe("State Evolution", () => {
    it("should advance state by one time step", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialTime = cube.getCurrentState().t;
      cube.nextDt();
      expect(cube.getCurrentState().t).to.be.greaterThan(initialTime);
    });

    it("should maintain physical consistency during evolution", () => {
      const cube = new Cube(createTestState(), createTestParams());
      for (let i = 0; i < 10; i++) {
        cube.nextDt();
        const validation = cube.validateState();
        expect(validation.isValid).to.be.true;
      }
    });

    it("should show cooling effect over time", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialTemp = cube.getCurrentState().productTemp[0][0];

      for (let i = 0; i < 10; i++) {
        cube.nextDt();
      }

      const finalTemp = cube.getCurrentState().productTemp[0][0];
      expect(finalTemp).to.be.lessThan(initialTemp);
    });
  });

  describe("Energy Monitoring", () => {
    it("should track energy changes due to cooling", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialEnergy = cube.getEnergyBalance().totalEnergy;

      cube.nextDt();

      const newBalance = cube.getEnergyBalance();
      expect(newBalance.totalEnergy).to.be.lessThan(initialEnergy);
      expect(newBalance.coolingPowerUsed).to.be.greaterThan(0);
    });

    it("should provide detailed energy flows", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const flows = cube.getEnergyFlows();

      expect(flows.energyStores).to.have.property("productEnergy");
      expect(flows.energyStores).to.have.property("airEnergy");
      expect(flows.heatFlows).to.have.property("respirationHeat");
      expect(flows.heatFlows).to.have.property("sensibleCooling");
    });

    it("should maintain energy conservation within cooling bounds", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialEnergy = cube.getEnergyBalance().totalEnergy;

      cube.nextDt();

      const newBalance = cube.getEnergyBalance();
      const energyChange = initialEnergy - newBalance.totalEnergy;
      const coolingWork =
        newBalance.coolingPowerUsed *
        (cube.getCurrentState().t - createTestState().t);

      expect(energyChange).to.be.approximately(coolingWork, coolingWork * 0.1);
    });
  });

  describe("Moisture Monitoring", () => {
    it("should track moisture changes", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialMoisture = cube.getMoistureBalance().totalMoisture;

      cube.nextDt();

      const newBalance = cube.getMoistureBalance();
      expect(newBalance.totalMoisture).to.be.lessThan(initialMoisture);
    });

    it("should calculate moisture rates for all zones", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const balance = cube.getMoistureBalance();

      expect(balance.moistureRates.productRates).to.have.lengthOf(2); // zones
      expect(balance.moistureRates.productRates[0]).to.have.lengthOf(2); // layers
      expect(balance.moistureRates.airRates).to.have.lengthOf(2); // zones
    });

    it("should maintain non-negative moisture content", () => {
      const cube = new Cube(createTestState(), createTestParams());

      for (let i = 0; i < 10; i++) {
        cube.nextDt();
        const state = cube.getCurrentState();

        // Check product moisture
        state.productMoisture.forEach((zone) => {
          zone.forEach((moisture) => {
            expect(moisture).to.be.greaterThanOrEqual(0);
          });
        });

        // Check air humidity
        state.airHumidity.forEach((humidity) => {
          expect(humidity).to.be.greaterThanOrEqual(0);
        });
      }
    });
  });

  describe("Performance Metrics", () => {
    it("should calculate valid performance metrics", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const metrics = cube.getPerformanceMetrics();

      expect(metrics.TCPI).to.be.within(0, 1);
      expect(metrics.temperatureUniformity).to.be.greaterThanOrEqual(0);
      expect(metrics.moistureUniformity).to.be.greaterThanOrEqual(0);
    });

    it("should show improved uniformity over time", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const initialMetrics = cube.getPerformanceMetrics();

      for (let i = 0; i < 10; i++) {
        cube.nextDt();
      }

      const finalMetrics = cube.getPerformanceMetrics();
      expect(finalMetrics.temperatureUniformity).to.be.lessThan(
        initialMetrics.temperatureUniformity
      );
    });
  });

  describe("State Validation", () => {
    it("should validate initial state correctly", () => {
      const cube = new Cube(createTestState(), createTestParams());
      const validation = cube.validateState();
      expect(validation.isValid).to.be.true;
      expect(validation.violations).to.be.empty;
    });

    it("should detect temperature violations", () => {
      const state = createTestState();
      state.productTemp[0][0] = 60; // Above reasonable maximum
      const cube = new Cube(state, createTestParams());

      const validation = cube.validateState();
      expect(validation.isValid).to.be.false;
      expect(validation.violations).to.have.lengthOf.greaterThan(0);
    });

    it("should detect humidity violations", () => {
      const state = createTestState();
      state.airHumidity[0] = 1.0; // Impossibly high humidity
      const cube = new Cube(state, createTestParams());

      const validation = cube.validateState();
      expect(validation.isValid).to.be.false;
      expect(validation.violations).to.have.lengthOf.greaterThan(0);
    });

    it("should detect TCPI violations", () => {
      const state = createTestState();
      state.TCPI = 1.5; // Above maximum
      const cube = new Cube(state, createTestParams());

      const validation = cube.validateState();
      expect(validation.isValid).to.be.false;
      expect(validation.violations).to.have.lengthOf.greaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero initial temperature difference", () => {
      const state = createTestState();
      state.productTemp = state.productTemp.map((zone) =>
        zone.map(() => state.airTemp[0])
      );

      const cube = new Cube(state, createTestParams());
      expect(() => cube.nextDt()).not.to.throw();
    });

    it("should handle minimum cooling power", () => {
      const state = createTestState();
      state.coolingPower = 0;

      const cube = new Cube(state, createTestParams());
      expect(() => cube.nextDt()).not.to.throw();
    });

    it("should handle maximum cooling power", () => {
      const state = createTestState();
      state.coolingPower = createTestParams().maxCoolingPower;

      const cube = new Cube(state, createTestParams());
      expect(() => cube.nextDt()).not.to.throw();
    });

    it("should handle zero air flow", () => {
      const params = createTestParams();
      params.airFlow = 0;

      const cube = new Cube(createTestState(), params);
      expect(() => cube.nextDt()).not.to.throw();
    });
  });
});
