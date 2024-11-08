import { expect } from "chai";
import {
  Container,
  Dimensions,
  ThermalState,
  ProductProperties,
} from "./Container.js";

describe("Container", () => {
  // Test fixtures
  let validDimensions: Dimensions;
  let validThermalState: ThermalState;
  let validProductProperties: ProductProperties;

  beforeEach(() => {
    // Set up valid test data before each test
    validDimensions = {
      x: 2.0, // 2 meters
      y: 1.5, // 1.5 meters
      z: 2.2, // 2.2 meters
    };

    validThermalState = {
      temperature: 20, // 20°C
      moisture: 0.5, // 0.5 kg water/kg dry matter
    };

    validProductProperties = {
      specificHeat: 3600, // 3600 J/(kg·K)
      waterActivity: 0.95, // 0.95 (dimensionless)
      mass: 1000, // 1000 kg
      surfaceArea: 15, // 15 m²
      respiration: {
        baseRate: 0.01, // 0.01 W/kg
        temperatureCoeff: 0.1, // 0.1 1/K
        referenceTemp: 20, // 20°C
        respirationHeat: 2000, // 2000 J/kg
      },
    };
  });

  describe("Constructor", () => {
    it("should create a valid container with correct properties", () => {
      const container = new Container(
        validDimensions,
        validThermalState,
        validProductProperties
      );
      expect(container.getDimensions()).to.deep.equal(validDimensions);
      expect(container.getThermalState()).to.deep.equal(validThermalState);
      expect(container.getProductProperties()).to.deep.equal(
        validProductProperties
      );
    });

    it("should throw error for negative dimensions", () => {
      const invalidDimensions = { ...validDimensions, x: -1 };
      expect(
        () =>
          new Container(
            invalidDimensions,
            validThermalState,
            validProductProperties
          )
      ).to.throw("All dimensions must be positive");
    });

    it("should throw error for zero dimensions", () => {
      const invalidDimensions = { ...validDimensions, y: 0 };
      expect(
        () =>
          new Container(
            invalidDimensions,
            validThermalState,
            validProductProperties
          )
      ).to.throw("All dimensions must be positive");
    });

    it("should throw error for invalid temperature range", () => {
      const invalidThermalState = { ...validThermalState, temperature: -60 };
      expect(
        () =>
          new Container(
            validDimensions,
            invalidThermalState,
            validProductProperties
          )
      ).to.throw("Initial temperature out of realistic range");
    });

    it("should throw error for invalid moisture content", () => {
      const invalidThermalState = { ...validThermalState, moisture: 1.5 };
      expect(
        () =>
          new Container(
            validDimensions,
            invalidThermalState,
            validProductProperties
          )
      ).to.throw("Initial moisture content must be between 0 and 1");
    });

    it("should throw error for invalid product properties", () => {
      const invalidProductProps = {
        ...validProductProperties,
        specificHeat: -100,
      };
      expect(
        () =>
          new Container(validDimensions, validThermalState, invalidProductProps)
      ).to.throw("Specific heat must be positive");
    });
  });

  describe("Getters", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(
        validDimensions,
        validThermalState,
        validProductProperties
      );
    });

    it("should return correct dimensions", () => {
      const dimensions = container.getDimensions();
      expect(dimensions).to.deep.equal(validDimensions);
      // Verify immutability
      dimensions.x = 999;
      expect(container.getDimensions()).to.deep.equal(validDimensions);
    });

    it("should return correct thermal state", () => {
      const thermalState = container.getThermalState();
      expect(thermalState).to.deep.equal(validThermalState);
      // Verify immutability
      thermalState.temperature = 999;
      expect(container.getThermalState()).to.deep.equal(validThermalState);
    });

    it("should return correct product properties", () => {
      const properties = container.getProductProperties();
      expect(properties).to.deep.equal(validProductProperties);
      // Verify immutability
      properties.mass = 999;
      expect(container.getProductProperties()).to.deep.equal(
        validProductProperties
      );
    });

    it("should calculate correct volume", () => {
      const expectedVolume =
        validDimensions.x * validDimensions.y * validDimensions.z;
      expect(container.getVolume()).to.equal(expectedVolume);
    });
  });

  describe("State Updates", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(
        validDimensions,
        validThermalState,
        validProductProperties
      );
    });

    it("should update temperature within valid range", () => {
      const newTemp = 15;
      container.updateTemperature(newTemp);
      expect(container.getThermalState().temperature).to.equal(newTemp);
    });

    it("should throw error for temperature update outside valid range", () => {
      expect(() => container.updateTemperature(-51)).to.throw(
        "Temperature out of realistic range"
      );
      expect(() => container.updateTemperature(101)).to.throw(
        "Temperature out of realistic range"
      );
    });

    it("should update moisture within valid range", () => {
      const newMoisture = 0.7;
      container.updateMoisture(newMoisture);
      expect(container.getThermalState().moisture).to.equal(newMoisture);
    });

    it("should throw error for moisture update outside valid range", () => {
      expect(() => container.updateMoisture(-0.1)).to.throw(
        "Moisture content must be between 0 and 1"
      );
      expect(() => container.updateMoisture(1.1)).to.throw(
        "Moisture content must be between 0 and 1"
      );
    });
  });

  describe("Respiration Heat Calculation", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(
        validDimensions,
        validThermalState,
        validProductProperties
      );
    });

    it("should calculate correct respiration heat at reference temperature", () => {
      // At reference temperature, exp term = 1
      const expectedHeat =
        validProductProperties.respiration.baseRate *
        validProductProperties.mass *
        validProductProperties.respiration.respirationHeat;
      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });

    it("should calculate increased respiration heat above reference temperature", () => {
      const higherTemp = validProductProperties.respiration.referenceTemp + 10;
      container.updateTemperature(higherTemp);

      const tempDiff =
        higherTemp - validProductProperties.respiration.referenceTemp;
      const expectedHeat =
        validProductProperties.respiration.baseRate *
        Math.exp(
          validProductProperties.respiration.temperatureCoeff * tempDiff
        ) *
        validProductProperties.mass *
        validProductProperties.respiration.respirationHeat;

      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });

    it("should calculate decreased respiration heat below reference temperature", () => {
      const lowerTemp = validProductProperties.respiration.referenceTemp - 10;
      container.updateTemperature(lowerTemp);

      const tempDiff =
        lowerTemp - validProductProperties.respiration.referenceTemp;
      const expectedHeat =
        validProductProperties.respiration.baseRate *
        Math.exp(
          validProductProperties.respiration.temperatureCoeff * tempDiff
        ) *
        validProductProperties.mass *
        validProductProperties.respiration.respirationHeat;

      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });
  });
});
