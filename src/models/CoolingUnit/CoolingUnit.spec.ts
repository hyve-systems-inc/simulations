import { expect } from "chai";
import {
  CoolingUnit,
  CoolingUnitSettings,
  PowerSupplyConfig,
} from "./index.js";
import { PalletPerformance } from "../Pallet/lib/palletPerformance.js";

describe("CoolingUnit", () => {
  // Test configuration
  const TEST_CONFIG = {
    settings: {
      standard: {
        targetTemperature: 5, // °C
        targetHumidity: 0.007, // kg/kg
        minCoilTemp: 0, // °C
        maxPower: 3000, // W (thermodynamic limit)
        tcpiTarget: 0.95, // dimensionless
        controlUpdateInterval: 60, // seconds
      } as CoolingUnitSettings,
    },
    powerSupply: {
      highPower: {
        maxPower: 10000, // W
        nominalVoltage: 48, // V
        energyCapacity: 50000, // Wh
      },
      standard: {
        maxPower: 5000, // W
        nominalVoltage: 48, // V
        energyCapacity: 33000, // Wh
      },
      lowPower: {
        maxPower: 2000, // W
        nominalVoltage: 48, // V
        energyCapacity: 20000, // Wh
      },
    },
    airConditions: {
      standard: {
        temperature: 20, // °C
        humidity: 0.012, // kg/kg
        massFlowRate: 0.5, // kg/s
      },
      humid: {
        temperature: 25, // °C
        humidity: 0.018, // kg/kg
        massFlowRate: 0.5, // kg/s
      },
      dry: {
        temperature: 15, // °C
        humidity: 0.006, // kg/kg
        massFlowRate: 0.5, // kg/s
      },
    },
    performance: {
      excellent: {
        averageCoolingEfficiency: 0.95,
        uniformityIndex: 0.05,
        totalHeatTransfer: -1000,
        averageTemperature: 7,
        temperatureVariation: 0.5,
        layerPerformance: [],
      } as PalletPerformance,
      poor: {
        averageCoolingEfficiency: 0.6,
        uniformityIndex: 0.15,
        totalHeatTransfer: -500,
        averageTemperature: 12,
        temperatureVariation: 2.0,
        layerPerformance: [],
      } as PalletPerformance,
    },
    simulation: {
      timeSteps: {
        short: 30, // seconds
        standard: 60, // seconds
        long: 120, // seconds
      },
      tolerances: {
        MASS_FLOW: 1e-6, // kg/s - threshold for dehumidification
        LATENT_HEAT: 10, // W - reasonable for small moisture differences
        SENSIBLE_HEAT: 10, // W - reasonable for small temperature differences
        TEMPERATURE: 0.01, // °C
      },
    },
  };

  describe("Constructor and Initialization", () => {
    it("should initialize with correct default state", () => {
      const unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
      const state = unit.getState();

      expect(state.coilTemperature).to.equal(
        TEST_CONFIG.settings.standard.targetTemperature
      );
      expect(state.currentPower).to.equal(0);
      expect(state.ratedPower).to.equal(TEST_CONFIG.settings.standard.maxPower);
      expect(unit.getTCPI()).to.equal(1.0);
    });

    it("should calculate initial dew point correctly", () => {
      const unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
      const state = unit.getState();

      expect(state.dewPoint).to.be.lessThan(
        TEST_CONFIG.settings.standard.targetTemperature
      );
      expect(state.dewPoint).to.be.greaterThan(-10);
    });

    it("should initialize with correct power supply configuration", () => {
      const unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
      const config = unit.getPowerSupplyConfig();

      expect(config).to.deep.equal(TEST_CONFIG.powerSupply.standard);
    });
  });

  describe("Dehumidification Calculations", () => {
    let unit: CoolingUnit;

    const REALISTIC_CONDITIONS = {
      hot_humid: {
        temperature: 30, // °C
        humidity: 0.018, // kg/kg
        massFlowRate: 0.17, // kg/s
        description: "Hot and humid conditions",
      },
      standard: {
        temperature: 20, // °C
        humidity: 0.012, // kg/kg
        massFlowRate: 0.17, // kg/s
        description: "Standard conditions",
      },
      cool_dry: {
        temperature: 15, // °C
        humidity: 0.008, // kg/kg
        massFlowRate: 0.17, // kg/s
        description: "Cool and dry conditions",
      },
    };

    // Helper functions to calculate expected ranges
    const calculateMaxCoolingCapacity = (
      settings: CoolingUnitSettings,
      powerSupply: PowerSupplyConfig
    ) => {
      // Limited by both thermodynamic and electrical power limits
      return Math.min(settings.maxPower, powerSupply.maxPower);
    };

    const calculateMaxDehumidificationRate = (
      airHumidity: number,
      massFlowRate: number,
      settings: CoolingUnitSettings
    ) => {
      // Maximum theoretical moisture removal based on incoming conditions
      // and target temperature/humidity
      const maxHumidityDiff = airHumidity - settings.targetHumidity;
      return massFlowRate * maxHumidityDiff;
    };

    const calculateExpectedRanges = (
      conditions: (typeof REALISTIC_CONDITIONS)[keyof typeof REALISTIC_CONDITIONS],
      settings: CoolingUnitSettings,
      powerSupply: PowerSupplyConfig
    ) => {
      const maxCooling = calculateMaxCoolingCapacity(settings, powerSupply);
      const maxDehumidification = calculateMaxDehumidificationRate(
        conditions.humidity,
        conditions.massFlowRate,
        settings
      );

      return {
        cooling: {
          min: maxCooling * 0.1, // Expect at least 10% of max capacity
          max: maxCooling * 1.1, // Allow slight overhead for calculation variance
        },
        dehumidification: {
          min: maxDehumidification * 0.1, // Expect at least 10% of theoretical max
          max: maxDehumidification, // Cannot exceed theoretical maximum
        },
        specificCooling: {
          min: (maxCooling * 0.1) / conditions.massFlowRate,
          max: maxCooling / conditions.massFlowRate,
        },
      };
    };

    beforeEach(() => {
      unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
    });

    it("should calculate realistic dehumidification rates", () => {
      Object.entries(REALISTIC_CONDITIONS).forEach(([_, params]) => {
        const expectedRanges = calculateExpectedRanges(
          params,
          TEST_CONFIG.settings.standard,
          TEST_CONFIG.powerSupply.standard
        );

        const result = unit.calculateDehumidification(
          params.temperature,
          params.humidity,
          params.massFlowRate
        );

        expect(
          result.massDehumidified,
          `${params.description} - mass removal`
        ).to.be.within(
          expectedRanges.dehumidification.min,
          expectedRanges.dehumidification.max
        );

        // Verify latent heat is consistent with mass removed
        const expectedLatentHeat = result.massDehumidified * 2.45e6;
        expect(
          result.latentHeatRemoved,
          `${params.description} - latent heat`
        ).to.be.approximately(expectedLatentHeat, expectedLatentHeat * 0.001); // 0.1% tolerance
      });
    });

    it("should show appropriate heat removal ratios", () => {
      Object.entries(REALISTIC_CONDITIONS).forEach(([_, params]) => {
        const expectedRanges = calculateExpectedRanges(
          params,
          TEST_CONFIG.settings.standard,
          TEST_CONFIG.powerSupply.standard
        );

        const result = unit.calculateDehumidification(
          params.temperature,
          params.humidity,
          params.massFlowRate
        );

        const totalHeat = result.latentHeatRemoved + result.sensibleHeatRemoved;

        expect(totalHeat, `${params.description} - total cooling`).to.be.within(
          expectedRanges.cooling.min,
          expectedRanges.cooling.max
        );

        // Verify total cooling doesn't exceed power limits
        expect(totalHeat).to.be.at.most(
          calculateMaxCoolingCapacity(
            TEST_CONFIG.settings.standard,
            TEST_CONFIG.powerSupply.standard
          )
        );
      });
    });

    it("should maintain energy conservation", () => {
      const result = unit.calculateDehumidification(
        REALISTIC_CONDITIONS.standard.temperature,
        REALISTIC_CONDITIONS.standard.humidity,
        REALISTIC_CONDITIONS.standard.massFlowRate
      );

      console.log(result);

      const expectedRanges = calculateExpectedRanges(
        REALISTIC_CONDITIONS.standard,
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );

      const totalHeat = result.latentHeatRemoved + result.sensibleHeatRemoved;
      const specificCooling =
        totalHeat / REALISTIC_CONDITIONS.standard.massFlowRate;

      expect(specificCooling).to.be.within(
        expectedRanges.specificCooling.min,
        expectedRanges.specificCooling.max
      );
    });
  });

  describe("Power Control", () => {
    let unit: CoolingUnit;

    beforeEach(() => {
      unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
    });

    it("should adjust power based on cooling performance", () => {
      unit.updateCoolingPower(
        [TEST_CONFIG.performance.excellent],
        TEST_CONFIG.simulation.timeSteps.standard
      );
      const lowPower = unit.getState().currentPower;

      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard * 2
      );
      const highPower = unit.getState().currentPower;

      expect(highPower).to.be.greaterThan(lowPower);
      expect(highPower).to.be.at.most(TEST_CONFIG.settings.standard.maxPower);
    });

    it("should maintain power during control interval", () => {
      unit.updateCoolingPower(
        [TEST_CONFIG.performance.excellent],
        TEST_CONFIG.simulation.timeSteps.standard
      );
      const initialPower = unit.getState().currentPower;

      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard +
          TEST_CONFIG.simulation.timeSteps.short
      );

      expect(unit.getState().currentPower).to.equal(initialPower);
    });
  });

  describe("Temperature Control", () => {
    let unit: CoolingUnit;

    beforeEach(() => {
      unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
    });

    it("should adjust coil temperature based on power", () => {
      const initialState = unit.getState();
      const initialTemp = initialState.coilTemperature;

      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard
      );

      const finalState = unit.getState();
      expect(finalState.coilTemperature).to.be.lessThan(initialTemp);
      expect(finalState.coilTemperature).to.be.greaterThanOrEqual(
        TEST_CONFIG.settings.standard.minCoilTemp
      );
    });
  });

  describe("Power Supply Configuration", () => {
    let unit: CoolingUnit;

    beforeEach(() => {
      unit = new CoolingUnit(
        TEST_CONFIG.settings.standard,
        TEST_CONFIG.powerSupply.standard
      );
    });

    it("should handle power supply upgrade", () => {
      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard
      );
      const initialPower = unit.getState().currentPower;

      const success = unit.updatePowerSupply(TEST_CONFIG.powerSupply.highPower);
      expect(success).to.be.true;

      const newConfig = unit.getPowerSupplyConfig();
      expect(newConfig).to.deep.equal(TEST_CONFIG.powerSupply.highPower);

      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard * 2
      );
      const newPower = unit.getState().currentPower;
      expect(newPower).to.be.at.most(TEST_CONFIG.settings.standard.maxPower);
    });

    it("should handle power supply downgrade", () => {
      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard
      );

      const success = unit.updatePowerSupply(TEST_CONFIG.powerSupply.lowPower);
      expect(success).to.be.true;

      expect(unit.getState().currentPower).to.be.at.most(
        TEST_CONFIG.powerSupply.lowPower.maxPower
      );

      unit.updateCoolingPower(
        [TEST_CONFIG.performance.poor],
        TEST_CONFIG.simulation.timeSteps.standard * 2
      );
      expect(unit.getState().currentPower).to.be.at.most(
        TEST_CONFIG.powerSupply.lowPower.maxPower
      );
    });

    it("should maintain cooling control through power supply changes", () => {
      const testSequence = [
        {
          config: TEST_CONFIG.powerSupply.highPower,
          performance: TEST_CONFIG.performance.excellent,
        },
        {
          config: TEST_CONFIG.powerSupply.lowPower,
          performance: TEST_CONFIG.performance.poor,
        },
        {
          config: TEST_CONFIG.powerSupply.standard,
          performance: TEST_CONFIG.performance.excellent,
        },
      ];

      testSequence.forEach((step, index) => {
        unit.updatePowerSupply(step.config);
        unit.updateCoolingPower(
          [step.performance],
          TEST_CONFIG.simulation.timeSteps.standard * (index + 1)
        );

        const state = unit.getState();
        const effectiveLimit = Math.min(
          step.config.maxPower,
          TEST_CONFIG.settings.standard.maxPower
        );
        expect(state.currentPower).to.be.at.most(effectiveLimit);
      });
    });
  });
});
