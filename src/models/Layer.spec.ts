import { expect } from "chai";
import { Layer, Orientation } from "./Layer.js";
import {
  Container,
  Dimensions,
  ThermalState,
  ProductProperties,
} from "./Container.js";

describe("Layer", () => {
  let standardDimensions: Dimensions;
  let standardThermalState: ThermalState;
  let standardProductProperties: ProductProperties;
  let containerFixture: Container;
  let layer: Layer;

  beforeEach(() => {
    standardDimensions = {
      x: 0.6, // 60cm
      y: 0.4, // 40cm
      z: 0.3, // 30cm
    };

    standardThermalState = {
      temperature: 20,
      moisture: 0.5,
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

    containerFixture = new Container(
      standardDimensions,
      standardThermalState,
      standardProductProperties
    );

    layer = new Layer(2.0, 1.5);
  });

  describe("Row Management", () => {
    it("should add a row successfully", () => {
      const success = layer.addRow(0, 0.4);
      expect(success).to.be.true;
      expect(layer.getRowCount()).to.equal(1);
    });

    it("should fail to add a row that exceeds layer length", () => {
      const success = layer.addRow(0, 2.0);
      expect(success).to.be.false;
      expect(layer.getRowCount()).to.equal(0);
    });

    it("should calculate row positions correctly", () => {
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);

      const row0 = layer.getRow(0);
      const row1 = layer.getRow(1);

      expect(row0?.y).to.equal(0);
      expect(row1?.y).to.equal(0.42); // 0.4 + 0.02 spacing
    });

    it("should allow adding rows at specific indices", () => {
      layer.addRow(0, 0.4);
      layer.addRow(2, 0.4);
      layer.addRow(1, 0.4);

      expect(layer.getRowCount()).to.equal(3);

      const row1 = layer.getRow(1);
      expect(row1?.y).to.equal(0.42); // 0.4 + 0.02 spacing
    });
  });

  describe("Container Placement", () => {
    it("should add container to row successfully", () => {
      layer.addRow(0, 0.4);
      const success = layer.addContainerToRow(
        0,
        containerFixture,
        Orientation.LENGTHWISE_X
      );

      expect(success).to.be.true;
      expect(layer.getContainers()).to.have.lengthOf(1);
    });

    it("should fail to add container to non-existent row", () => {
      expect(() =>
        layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X)
      ).to.throw("Row 0 does not exist");
    });

    it("should fail to add container that exceeds row height", () => {
      layer.addRow(0, 0.3);
      const success = layer.addContainerToRow(
        0,
        containerFixture,
        Orientation.LENGTHWISE_X
      );

      expect(success).to.be.false;
      expect(layer.getContainers()).to.have.lengthOf(0);
    });

    it("should respect container spacing", () => {
      layer.addRow(0, 0.4);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);
      const success = layer.addContainerToRow(
        0,
        containerFixture,
        Orientation.LENGTHWISE_X
      );

      expect(success).to.be.true;

      const containers = layer.getContainers();
      expect(
        containers[1].position.x - (containers[0].position.x + 0.6)
      ).to.be.closeTo(0.02, 0.001); // Check spacing
    });

    it("should fail to add container that exceeds row width", () => {
      layer.addRow(0, 0.4);
      // Add containers until we run out of width
      let added = 0;
      while (
        layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X)
      ) {
        added++;
      }

      // Calculate expected number of containers that should fit
      const expectedFit = Math.floor((2.0 + 0.02) / (0.6 + 0.02));
      expect(added).to.equal(expectedFit);
    });
  });
  describe("Space Utilization", () => {
    it("should calculate occupied area correctly for single container", () => {
      // Add a row and place one container
      layer.addRow(0, 0.4);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);

      const expectedArea = standardDimensions.x * standardDimensions.y; // 0.6 * 0.4 = 0.24 m²
      expect(layer.getOccupiedArea()).to.be.closeTo(expectedArea, 0.001);
    });

    it("should calculate occupied area correctly for multiple containers", () => {
      // Add two rows
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);

      // Add two containers to first row
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);

      // Add one container to second row
      layer.addContainerToRow(1, containerFixture, Orientation.LENGTHWISE_X);

      const expectedArea = 3 * (standardDimensions.x * standardDimensions.y); // 3 * (0.6 * 0.4) = 0.72 m²
      expect(layer.getOccupiedArea()).to.be.closeTo(expectedArea, 0.001);
    });

    it("should calculate occupied area correctly with mixed orientations", () => {
      // Add a row
      layer.addRow(0, 0.6); // Taller row to accommodate Y orientation

      // Add containers with different orientations
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_Y);

      const expectedArea = 2 * (standardDimensions.x * standardDimensions.y); // Same area regardless of orientation
      expect(layer.getOccupiedArea()).to.be.closeTo(expectedArea, 0.001);
    });

    it("should calculate space utilization percentage correctly", () => {
      // Add two rows
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);

      // Add two containers per row
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(1, containerFixture, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(1, containerFixture, Orientation.LENGTHWISE_X);

      const containerArea = 4 * (standardDimensions.x * standardDimensions.y);
      const layerArea = 2.0 * 1.5; // Layer dimensions
      const expectedUtilization = (containerArea / layerArea) * 100;

      expect(layer.getSpaceUtilization()).to.be.closeTo(
        expectedUtilization,
        0.001
      );
    });

    it("should return 0% utilization for empty layer", () => {
      expect(layer.getSpaceUtilization()).to.equal(0);
    });

    it("should maintain correct utilization after adding empty row", () => {
      layer.addRow(0, 0.4);
      expect(layer.getSpaceUtilization()).to.equal(0);
    });
  });

  describe("Thermal State", () => {
    it("should calculate average thermal state correctly for multiple containers", () => {
      // Create containers with different temperatures
      const container1 = new Container(
        standardDimensions,
        { temperature: 20, moisture: 0.5 },
        standardProductProperties
      );

      const container2 = new Container(
        standardDimensions,
        { temperature: 30, moisture: 0.7 },
        standardProductProperties
      );

      const container3 = new Container(
        standardDimensions,
        { temperature: 25, moisture: 0.6 },
        standardProductProperties
      );

      // Add two rows
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);

      // Add containers to rows
      layer.addContainerToRow(0, container1, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(0, container2, Orientation.LENGTHWISE_X);
      layer.addContainerToRow(1, container3, Orientation.LENGTHWISE_X);

      const avgState = layer.getAverageThermalState();
      expect(avgState.temperature).to.equal(25); // (20 + 30 + 25) / 3
      expect(avgState.moisture).to.be.closeTo(0.6, 0.001); // (0.5 + 0.7 + 0.6) / 3
    });

    it("should calculate average thermal state correctly for single container", () => {
      layer.addRow(0, 0.4);
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);

      const avgState = layer.getAverageThermalState();
      expect(avgState.temperature).to.equal(standardThermalState.temperature);
      expect(avgState.moisture).to.equal(standardThermalState.moisture);
    });

    it("should handle empty layer thermal state", () => {
      const state = layer.getAverageThermalState();
      expect(state.temperature).to.equal(0);
      expect(state.moisture).to.equal(0);
    });

    it("should handle thermal state with empty rows", () => {
      layer.addRow(0, 0.4);
      layer.addRow(1, 0.4);
      // Only add container to first row
      layer.addContainerToRow(0, containerFixture, Orientation.LENGTHWISE_X);

      const avgState = layer.getAverageThermalState();
      expect(avgState.temperature).to.equal(standardThermalState.temperature);
      expect(avgState.moisture).to.equal(standardThermalState.moisture);
    });
  });
});
