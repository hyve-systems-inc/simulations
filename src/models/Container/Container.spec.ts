import { expect } from "chai";
import {
  Container,
  Dimensions,
  ThermalState,
  ProductProperties,
} from "./index.js";

export const constructContainerTestProps = () => ({
  // Set up valid test data before each test
  dimensions: {
    x: 2.0, // 2 meters
    y: 1.5, // 1.5 meters
    z: 2.2, // 2.2 meters
  },

  thermalState: {
    temperature: 20, // 20°C
    moisture: 0.5, // 0.5 kg water/kg dry matter
  },

  productProperties: {
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
  },
});

describe("Container", () => {
  // Test fixtures
  let dimensions: Dimensions;
  let thermalState: ThermalState;
  let productProperties: ProductProperties;

  beforeEach(() => {
    // Set up valid test data before each test
    const testProps = constructContainerTestProps();
    dimensions = testProps.dimensions;
    thermalState = testProps.thermalState;
    productProperties = testProps.productProperties;
  });

  describe("Constructor", () => {
    it("should create a valid container with correct properties", () => {
      const container = new Container(
        dimensions,
        thermalState,
        productProperties
      );
      expect(container.getDimensions()).to.deep.equal(dimensions);
      expect(container.getThermalState()).to.deep.equal(thermalState);
      expect(container.getProductProperties()).to.deep.equal(productProperties);
    });

    it("should throw error for negative dimensions", () => {
      const indimensions = { ...dimensions, x: -1 };
      expect(
        () => new Container(indimensions, thermalState, productProperties)
      ).to.throw("All dimensions must be positive");
    });

    it("should throw error for zero dimensions", () => {
      const indimensions = { ...dimensions, y: 0 };
      expect(
        () => new Container(indimensions, thermalState, productProperties)
      ).to.throw("All dimensions must be positive");
    });

    it("should throw error for invalid temperature range", () => {
      const inthermalState = { ...thermalState, temperature: -60 };
      expect(
        () => new Container(dimensions, inthermalState, productProperties)
      ).to.throw("Initial temperature out of realistic range");
    });

    it("should throw error for invalid moisture content", () => {
      const inthermalState = { ...thermalState, moisture: 1.5 };
      expect(
        () => new Container(dimensions, inthermalState, productProperties)
      ).to.throw("Initial moisture content must be between 0 and 1");
    });

    it("should throw error for invalid product properties", () => {
      const invalidProductProps = {
        ...productProperties,
        specificHeat: -100,
      };
      expect(
        () => new Container(dimensions, thermalState, invalidProductProps)
      ).to.throw("Specific heat must be positive");
    });
  });

  describe("Getters", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(dimensions, thermalState, productProperties);
    });

    it("should return correct dimensions", () => {
      const containerDimensions = container.getDimensions();
      expect(containerDimensions).to.deep.equal(dimensions);
      // Verify immutability
      containerDimensions.x = 999;
      expect(container.getDimensions()).to.deep.equal(dimensions);
    });

    it("should return correct thermal state", () => {
      const containerThermalState = container.getThermalState();
      expect(containerThermalState).to.deep.equal(thermalState);
      // Verify immutability
      containerThermalState.temperature = 999;
      expect(container.getThermalState()).to.deep.equal(thermalState);
    });

    it("should return correct product properties", () => {
      const properties = container.getProductProperties();
      expect(properties).to.deep.equal(productProperties);
      // Verify immutability
      properties.mass = 999;
      expect(container.getProductProperties()).to.deep.equal(productProperties);
    });

    it("should calculate correct volume", () => {
      const expectedVolume = dimensions.x * dimensions.y * dimensions.z;
      expect(container.getVolume()).to.equal(expectedVolume);
    });
  });

  describe("State Updates", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(dimensions, thermalState, productProperties);
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
});

describe("Container Physics", () => {
  // Test fixtures
  let dimensions: Dimensions;
  let thermalState: ThermalState;
  let productProperties: ProductProperties;
  let container: Container;

  beforeEach(() => {
    // Set up valid test data before each test
    const testProps = constructContainerTestProps();
    dimensions = testProps.dimensions;
    thermalState = testProps.thermalState;
    productProperties = testProps.productProperties;

    container = new Container(dimensions, thermalState, productProperties);
  });

  describe("Respiration Heat Calculation", () => {
    let container: Container;

    beforeEach(() => {
      container = new Container(dimensions, thermalState, productProperties);
    });

    it("should calculate correct respiration heat at reference temperature", () => {
      // At reference temperature, exp term = 1
      const expectedHeat =
        productProperties.respiration.baseRate *
        productProperties.mass *
        productProperties.respiration.respirationHeat;
      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });

    it("should calculate increased respiration heat above reference temperature", () => {
      const higherTemp = productProperties.respiration.referenceTemp + 10;
      container.updateTemperature(higherTemp);

      const tempDiff = higherTemp - productProperties.respiration.referenceTemp;
      const expectedHeat =
        productProperties.respiration.baseRate *
        Math.exp(productProperties.respiration.temperatureCoeff * tempDiff) *
        productProperties.mass *
        productProperties.respiration.respirationHeat;

      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });

    it("should calculate decreased respiration heat below reference temperature", () => {
      const lowerTemp = productProperties.respiration.referenceTemp - 10;
      container.updateTemperature(lowerTemp);

      const tempDiff = lowerTemp - productProperties.respiration.referenceTemp;
      const expectedHeat =
        productProperties.respiration.baseRate *
        Math.exp(productProperties.respiration.temperatureCoeff * tempDiff) *
        productProperties.mass *
        productProperties.respiration.respirationHeat;

      expect(container.calculateRespirationHeat()).to.be.closeTo(
        expectedHeat,
        0.001
      );
    });
  });

  describe("Heat Transfer Calculations", () => {
    it("should calculate convective heat transfer correctly", () => {
      const airTemp = 5; // 5°C
      const airHumidity = 0.8;
      const heatTransferCoeff = 25; // 25 W/m²·K

      const result = container.calculateHeatTransferRates(
        airTemp,
        airHumidity,
        heatTransferCoeff
      );

      // Expected convective heat = h * A * ΔT
      const expectedConvective =
        heatTransferCoeff *
        productProperties.surfaceArea *
        (thermalState.temperature - airTemp);

      expect(result.convectiveHeatRate).to.be.closeTo(expectedConvective, 0.1);
    });

    it("should calculate evaporative cooling correctly", () => {
      const airTemp = 20; // Same as product temp
      const airHumidity = 0.3; // Low humidity to ensure evaporation
      const heatTransferCoeff = 25;

      // Create a container with higher water activity to ensure evaporation
      const highMoistureState = {
        temperature: 20,
        moisture: 0.95,
      };

      const container = new Container(dimensions, highMoistureState, {
        ...productProperties,
        waterActivity: 0.98, // Higher water activity
      });

      const result = container.calculateHeatTransferRates(
        airTemp,
        airHumidity,
        heatTransferCoeff
      );

      // Should have positive evaporation rate due to water activity gradient
      expect(result.moistureTransferRate).to.be.greaterThan(0);
      expect(result.evaporativeHeatRate).to.be.greaterThan(0);

      // Additional verification of magnitudes
      expect(result.evaporativeHeatRate).to.equal(
        result.moistureTransferRate * 2.45e6 // Latent heat of vaporization
      );
    });

    // New test for vapor pressure gradient
    it("should calculate correct evaporation direction based on vapor pressure gradient", () => {
      // Test case 1: Environment favors evaporation
      const dryAirResult = container.calculateHeatTransferRates(
        20, // Same temperature
        0.3, // Low humidity
        25
      );
      expect(dryAirResult.moistureTransferRate).to.be.greaterThan(0);

      // Test case 2: Environment favors condensation
      const humidAirResult = container.calculateHeatTransferRates(
        20, // Same temperature
        0.99, // Very high humidity
        25
      );
      expect(humidAirResult.moistureTransferRate).to.be.lessThan(0);

      // Test case 3: No moisture transfer at equilibrium
      const equilibriumResult = container.calculateHeatTransferRates(
        20, // Same temperature
        0.95, // Matches product water activity
        25
      );
      expect(Math.abs(equilibriumResult.moistureTransferRate)).to.be.closeTo(
        0,
        0.0001
      );
    });

    it("should handle zero heat transfer coefficient", () => {
      const result = container.calculateHeatTransferRates(5, 0.8, 0);
      expect(result.convectiveHeatRate).to.equal(0);
      expect(result.evaporativeHeatRate).to.equal(0);
      expect(result.moistureTransferRate).to.equal(0);
    });
  });

  describe("State Updates", () => {
    it("should update temperature correctly based on energy input", () => {
      const dt = 1; // 1 second
      const energyChange = 3600; // 1 degree worth of energy
      const moistureChange = 0;

      const initialTemp = container.getThermalState().temperature;
      container.updateState(energyChange, moistureChange);

      // ΔT = Q/(m*cp)
      const expectedTemp =
        initialTemp +
        energyChange /
          (productProperties.mass * productProperties.specificHeat);

      expect(container.getThermalState().temperature).to.be.closeTo(
        expectedTemp,
        0.001
      );
    });

    it("should update moisture content correctly", () => {
      const dt = 1;
      const energyChange = 0;
      const moistureChange = -0.1; // 100g water loss

      const initialMoisture = container.getThermalState().moisture;
      container.updateState(energyChange, moistureChange);

      // Δw = Δm/m
      const expectedMoisture =
        initialMoisture + moistureChange / productProperties.mass;

      expect(container.getThermalState().moisture).to.be.closeTo(
        expectedMoisture,
        0.001
      );
    });

    it("should enforce temperature bounds", () => {
      const largeEnergyChange = 1e6; // Very large energy input
      const moistureChange = 0;

      container.updateState(largeEnergyChange, moistureChange);
      expect(container.getThermalState().temperature).to.be.lessThanOrEqual(
        100
      );

      container.updateState(-largeEnergyChange, moistureChange);
      expect(container.getThermalState().temperature).to.be.greaterThanOrEqual(
        -50
      );
    });

    it("should enforce moisture content bounds", () => {
      const energyChange = 0;

      // Test upper bound
      container.updateState(energyChange, 100);
      expect(container.getThermalState().moisture).to.be.lessThanOrEqual(1.0);

      // Test lower bound
      container.updateState(energyChange, -100);
      expect(container.getThermalState().moisture).to.be.greaterThanOrEqual(0);
    });
  });

  describe("Net Energy Change", () => {
    it("should combine all heat transfer mechanisms", () => {
      const dt = 1;
      const airTemp = 5;
      const airHumidity = 0.8;
      const heatTransferCoeff = 25;

      const { energyChange, moistureChange } =
        container.calculateNetEnergyChange(
          dt,
          airTemp,
          airHumidity,
          heatTransferCoeff
        );

      // Should include respiration, convection, and evaporation
      const respirationHeat = container.calculateRespirationHeat() * dt;
      const heatTransfer = container.calculateHeatTransferRates(
        airTemp,
        airHumidity,
        heatTransferCoeff
      );

      const expectedEnergyChange =
        respirationHeat -
        (heatTransfer.convectiveHeatRate + heatTransfer.evaporativeHeatRate) *
          dt;

      expect(energyChange).to.be.closeTo(expectedEnergyChange, 0.1);
      expect(moistureChange).to.be.closeTo(
        -heatTransfer.moistureTransferRate * dt,
        0.001
      );
    });

    it("should respect energy conservation", () => {
      const dt = 1;
      const airTemp = 5;
      const airHumidity = 0.8;
      const heatTransferCoeff = 25;

      const initialEnergy = container.getEnergyContent();
      const initialMoisture = container.getMoistureContent();

      const { energyChange, moistureChange } =
        container.calculateNetEnergyChange(
          dt,
          airTemp,
          airHumidity,
          heatTransferCoeff
        );

      container.updateState(energyChange, moistureChange);

      const finalEnergy = container.getEnergyContent();
      const finalMoisture = container.getMoistureContent();

      // Check energy conservation
      expect(finalEnergy - initialEnergy).to.be.closeTo(energyChange, 0.1);

      // Check mass conservation
      expect(finalMoisture - initialMoisture).to.be.closeTo(
        moistureChange,
        0.001
      );
    });
  });

  describe("Content Calculations", () => {
    it("should calculate energy content correctly", () => {
      const expectedEnergy =
        productProperties.mass *
        productProperties.specificHeat *
        (thermalState.temperature + 273.15); // Convert to Kelvin

      expect(container.getEnergyContent()).to.be.closeTo(expectedEnergy, 0.1);
    });

    it("should calculate moisture content correctly", () => {
      const expectedMoisture = productProperties.mass * thermalState.moisture;

      expect(container.getMoistureContent()).to.be.closeTo(
        expectedMoisture,
        0.001
      );
    });

    it("should track energy content changes", () => {
      const initialEnergy = container.getEnergyContent();

      // Add some energy
      container.updateState(1000, 0);

      const finalEnergy = container.getEnergyContent();
      expect(finalEnergy - initialEnergy).to.be.closeTo(1000, 0.1);
    });

    it("should track moisture content changes", () => {
      const initialMoisture = container.getMoistureContent();

      // Remove some moisture
      container.updateState(0, -0.1);

      const finalMoisture = container.getMoistureContent();
      expect(finalMoisture - initialMoisture).to.be.closeTo(-0.1, 0.001);
    });
  });
});
