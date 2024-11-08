import { expect } from "chai";
import {
  Container,
  Dimensions,
  ThermalState,
  ProductProperties,
} from "./Container.js";
import { Layer, Orientation } from "./Layer.js";
import { Pallet, ContainerLocation } from "./Pallet.js";

describe("Pallet", () => {
  // Test fixtures
  let standardDimensions: Dimensions;
  let standardThermalState: ThermalState;
  let standardProductProperties: ProductProperties;
  let containerFixture: Container;
  let layerFixture: Layer;
  let pallet: Pallet;

  beforeEach(() => {
    // Set up standard container properties
    standardDimensions = {
      x: 0.6, // 60cm length
      y: 0.4, // 40cm width
      z: 0.3, // 30cm height
    };

    standardThermalState = {
      temperature: 20, // 20°C
      moisture: 0.5, // 0.5 kg water/kg dry matter
    };

    standardProductProperties = {
      specificHeat: 3600,
      waterActivity: 0.95,
      mass: 100,
      surfaceArea: 1.5,
      respiration: {
        baseRate: 0.01,
        temperatureCoeff: 0.1,
        referenceTemp: 20,
        respirationHeat: 2000,
      },
    };

    // Create standard container
    containerFixture = new Container(
      standardDimensions,
      standardThermalState,
      standardProductProperties
    );

    // Create standard layer
    layerFixture = new Layer(1.2, 1.0); // 48" x 40" = 1.2m x 1.0m

    // Create standard pallet
    pallet = new Pallet(1.2, 1.0, 5);
  });

  describe("Constructor", () => {
    it("should create a valid pallet with correct dimensions", () => {
      const testPallet = new Pallet(1.2, 1.0, 5);
      expect(testPallet).to.be.instanceOf(Pallet);
    });

    it("should throw error for negative dimensions", () => {
      expect(() => new Pallet(-1.2, 1.0, 5)).to.throw(
        "Invalid pallet dimensions"
      );
      expect(() => new Pallet(1.2, -1.0, 5)).to.throw(
        "Invalid pallet dimensions"
      );
    });

    it("should throw error for zero dimensions", () => {
      expect(() => new Pallet(0, 1.0, 5)).to.throw("Invalid pallet dimensions");
      expect(() => new Pallet(1.2, 0, 5)).to.throw("Invalid pallet dimensions");
    });

    it("should throw error for invalid maximum layers", () => {
      expect(() => new Pallet(1.2, 1.0, 0)).to.throw(
        "Maximum layers must be positive"
      );
      expect(() => new Pallet(1.2, 1.0, -1)).to.throw(
        "Maximum layers must be positive"
      );
    });
  });

  describe("Layer Management", () => {
    it("should add layer successfully", () => {
      const success = pallet.addLayer(layerFixture);
      expect(success).to.be.true;
      expect(pallet.getLayers()).to.have.lengthOf(1);
    });

    it("should fail to add layer with mismatched dimensions", () => {
      const wrongSizeLayer = new Layer(1.0, 1.0);
      expect(() => pallet.addLayer(wrongSizeLayer)).to.throw(
        "Layer dimensions must match pallet base dimensions"
      );
    });

    it("should fail to add layer beyond maximum capacity", () => {
      const maxLayers = 3;
      const smallPallet = new Pallet(1.2, 1.0, maxLayers);

      for (let i = 0; i < maxLayers; i++) {
        expect(smallPallet.addLayer(layerFixture)).to.be.true;
      }

      expect(smallPallet.addLayer(layerFixture)).to.be.false;
      expect(smallPallet.getLayers()).to.have.lengthOf(maxLayers);
    });

    it("should get specific layer by index", () => {
      pallet.addLayer(layerFixture);
      const retrievedLayer = pallet.getLayer(0);
      expect(retrievedLayer).to.deep.equal(layerFixture);
    });

    it("should return undefined for non-existent layer index", () => {
      expect(pallet.getLayer(0)).to.be.undefined;
    });
  });

  describe("Temperature Control", () => {
    beforeEach(() => {
      // Create a fresh layer for each test
      const layer = new Layer(1.2, 1.0);

      // Add rows
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);

      // Add one container to each row (maximum that will fit)
      const container1 = new Container(
        standardDimensions,
        { ...standardThermalState },
        { ...standardProductProperties }
      );
      const container2 = new Container(
        standardDimensions,
        { ...standardThermalState },
        { ...standardProductProperties }
      );

      // These additions should succeed
      const success1 = layer.addContainerToRow(
        0,
        container1,
        Orientation.LENGTHWISE_X
      );
      const success2 = layer.addContainerToRow(
        1,
        container2,
        Orientation.LENGTHWISE_X
      );

      expect(success1).to.be.true;
      expect(success2).to.be.true;

      pallet.addLayer(layer);
    });

    it("should update single container temperature", () => {
      const location: ContainerLocation = {
        layerIndex: 0,
        rowIndex: 0,
        containerIndex: 0,
      };
      const newTemp = 15;

      const success = pallet.updateContainerTemperature(location, newTemp);
      expect(success).to.be.true;

      const updatedState = pallet.getContainerThermalState(location);
      expect(updatedState?.temperature).to.equal(newTemp);
    });

    it("should fail to update non-existent container", () => {
      const badLocation: ContainerLocation = {
        layerIndex: 99,
        rowIndex: 0,
        containerIndex: 0,
      };

      const success = pallet.updateContainerTemperature(badLocation, 15);
      expect(success).to.be.false;
    });

    it("should update multiple container temperatures", () => {
      const updates = [
        {
          location: { layerIndex: 0, rowIndex: 0, containerIndex: 0 },
          newTemp: 15,
        },
        {
          location: { layerIndex: 0, rowIndex: 0, containerIndex: 1 },
          newTemp: 16,
        },
      ];

      const results = pallet.updateContainerTemperatures(updates);
      expect(results).to.deep.equal([true, true]);

      // Verify each container's temperature individually
      updates.forEach((update) => {
        const state = pallet.getContainerThermalState(update.location);
        expect(state?.temperature).to.equal(update.newTemp);
      });
    });

    it("should update all container temperatures", () => {
      const deltaTemp = 5;
      const initialTemp = standardThermalState.temperature;
      const expectedTemp = initialTemp + deltaTemp;

      const updatedCount = pallet.updateAllTemperatures(deltaTemp);
      expect(updatedCount).to.equal(2); // Only 2 containers (1 per row)

      const states = pallet.getAllContainerStates();
      expect(states).to.have.lengthOf(2);
      states.forEach((state) => {
        expect(state.state.temperature).to.equal(expectedTemp);
      });
    });
  });

  describe("Thermal State Monitoring", () => {
    beforeEach(() => {
      // Set up layers with containers at different temperatures
      const layer1 = new Layer(1.2, 1.0);
      const layer2 = new Layer(1.2, 1.0);

      // Create containers with different temperatures
      const container1 = new Container(
        standardDimensions,
        { ...standardThermalState, temperature: 15 },
        standardProductProperties
      );

      const container2 = new Container(
        standardDimensions,
        { ...standardThermalState, temperature: 25 },
        standardProductProperties
      );

      layer1.addRow(0, 0.4);
      layer1.addContainerToRow(0, container1, Orientation.LENGTHWISE_X);

      layer2.addRow(0, 0.4);
      layer2.addContainerToRow(0, container2, Orientation.LENGTHWISE_X);

      pallet.addLayer(layer1);
      pallet.addLayer(layer2);
    });

    it("should calculate average thermal state correctly", () => {
      const avgState = pallet.getAverageThermalState();
      expect(avgState.temperature).to.equal(20); // (15 + 25) / 2
      expect(avgState.moisture).to.equal(0.5);
    });

    it("should calculate temperature statistics correctly", () => {
      const stats = pallet.getTemperatureStats();
      expect(stats.min).to.equal(15);
      expect(stats.max).to.equal(25);
      expect(stats.average).to.equal(20);
      expect(stats.standardDeviation).to.be.closeTo(5, 0.001);
    });

    it("should return correct temperature profile", () => {
      const profile = pallet.getTemperatureProfile();
      expect(profile).to.deep.equal([15, 25]);
    });

    it("should calculate total respiration heat correctly", () => {
      const totalHeat = pallet.calculateTotalRespirationHeat();
      expect(totalHeat).to.be.greaterThan(0);

      // Calculate expected heat for verification
      const container1Heat =
        standardProductProperties.respiration.baseRate *
        Math.exp(
          standardProductProperties.respiration.temperatureCoeff *
            (15 - standardProductProperties.respiration.referenceTemp)
        ) *
        standardProductProperties.mass *
        standardProductProperties.respiration.respirationHeat;

      const container2Heat =
        standardProductProperties.respiration.baseRate *
        Math.exp(
          standardProductProperties.respiration.temperatureCoeff *
            (25 - standardProductProperties.respiration.referenceTemp)
        ) *
        standardProductProperties.mass *
        standardProductProperties.respiration.respirationHeat;

      const expectedTotalHeat = container1Heat + container2Heat;
      expect(totalHeat).to.be.closeTo(expectedTotalHeat, 0.001);
    });
  });

  describe("Container State Retrieval", () => {
    beforeEach(() => {
      layerFixture.addRow(0, 0.4);
      layerFixture.addContainerToRow(
        0,
        containerFixture,
        Orientation.LENGTHWISE_X
      );
      pallet.addLayer(layerFixture);
    });

    it("should get thermal state of existing container", () => {
      const location: ContainerLocation = {
        layerIndex: 0,
        rowIndex: 0,
        containerIndex: 0,
      };

      const state = pallet.getContainerThermalState(location);
      expect(state).to.deep.equal(standardThermalState);
    });

    it("should return undefined for non-existent container", () => {
      const badLocation: ContainerLocation = {
        layerIndex: 99,
        rowIndex: 0,
        containerIndex: 0,
      };

      const state = pallet.getContainerThermalState(badLocation);
      expect(state).to.be.undefined;
    });

    it("should get all container states correctly", () => {
      const states = pallet.getAllContainerStates();
      expect(states).to.have.lengthOf(1);

      const firstState = states[0];
      expect(firstState.state).to.deep.equal(standardThermalState);
      expect(firstState.location).to.deep.equal({
        layerIndex: 0,
        rowIndex: 0,
        containerIndex: 0,
      });
    });
  });
});
