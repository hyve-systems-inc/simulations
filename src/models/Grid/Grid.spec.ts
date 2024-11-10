import { expect } from "chai";
import {
  Container,
  ThermalState,
  ProductProperties,
  Dimensions,
} from "../Container/index.js";
import { Grid, GridPosition } from "./index.js";

describe("Grid", () => {
  // Test configuration
  const TEST_CONFIG = {
    dimensions: {
      standard: { rows: 2, columns: 2 },
      large: { rows: 3, columns: 4 },
      invalid: [
        { rows: 0, columns: 2 },
        { rows: 2, columns: 0 },
        { rows: -1, columns: 2 },
        { rows: 2, columns: -1 },
      ],
    },
    container: {
      dimensions: {
        x: 0.4, // m
        y: 0.3, // m
        z: 0.25, // m
      },
      thermalState: {
        temperature: 20, // °C
        moisture: 0.85, // kg water/kg dry matter
      },
      productProperties: {
        specificHeat: 3800,
        waterActivity: 0.98,
        mass: 10,
        surfaceArea: 0.5,
        respiration: {
          baseRate: 0.01,
          temperatureCoeff: 0.1,
          referenceTemp: 5,
          respirationHeat: 2000,
        },
      },
    },
  };

  // Helper function to create test containers
  const createTestContainer = (
    temp: number = TEST_CONFIG.container.thermalState.temperature
  ): Container => {
    return new Container(
      TEST_CONFIG.container.dimensions,
      { ...TEST_CONFIG.container.thermalState, temperature: temp },
      TEST_CONFIG.container.productProperties
    );
  };

  describe("Constructor", () => {
    it("should create a valid grid manager with correct dimensions", () => {
      const manager = new Grid(TEST_CONFIG.dimensions.standard);
      const dims = manager.getDimensions();
      expect(dims).to.deep.equal(TEST_CONFIG.dimensions.standard);
    });

    TEST_CONFIG.dimensions.invalid.forEach((invalidDim, index) => {
      it(`should throw error for invalid dimensions case ${index}`, () => {
        expect(() => new Grid(invalidDim)).to.throw(
          "Layer dimensions must be positive"
        );
      });
    });
  });

  describe("Container Placement", () => {
    let manager: Grid;

    beforeEach(() => {
      manager = new Grid(TEST_CONFIG.dimensions.standard);
    });

    it("should successfully place containers in a full grid", () => {
      const containers = [
        [createTestContainer(15), createTestContainer(16)],
        [createTestContainer(17), createTestContainer(18)],
      ];

      const success = manager.placeContainers(containers);
      expect(success).to.be.true;

      // Verify each container's position and temperature
      containers.forEach((row, rowIndex) => {
        row.forEach((container, colIndex) => {
          const retrievedContainer = manager.getContainerAt({
            row: rowIndex,
            column: colIndex,
          });
          expect(retrievedContainer).to.equal(container);
          expect(retrievedContainer?.getThermalState().temperature).to.equal(
            15 + rowIndex * 2 + colIndex
          );
        });
      });
    });

    it("should handle null spaces in grid", () => {
      const containers = [
        [createTestContainer(), null],
        [null, createTestContainer()],
      ];

      const success = manager.placeContainers(containers);
      expect(success).to.be.true;

      // Verify specific positions
      expect(manager.getContainerAt({ row: 0, column: 0 })).to.not.be.null;
      expect(manager.getContainerAt({ row: 0, column: 1 })).to.be.null;
      expect(manager.getContainerAt({ row: 1, column: 0 })).to.be.null;
      expect(manager.getContainerAt({ row: 1, column: 1 })).to.not.be.null;
    });

    it("should reject layout with wrong dimensions", () => {
      const wrongSizeLayout = [[createTestContainer()]]; // 1x1 instead of 2x2
      const success = manager.placeContainers(wrongSizeLayout);
      expect(success).to.be.false;
    });

    it("should reject invalid layout formats", () => {
      const invalidLayouts = [
        [], // Empty layout
        [[]], // Empty row
        [[createTestContainer()], []], // Inconsistent row lengths
        [[createTestContainer(), createTestContainer()]], // Wrong number of rows
      ];

      invalidLayouts.forEach((layout) => {
        const success = manager.placeContainers(layout);
        expect(success).to.be.false;
      });
    });

    it("should handle layout replacement", () => {
      // Place initial layout
      const initialLayout = [
        [createTestContainer(15), createTestContainer(16)],
        [createTestContainer(17), createTestContainer(18)],
      ];
      manager.placeContainers(initialLayout);

      // Create new layout
      const newLayout = [
        [createTestContainer(25), createTestContainer(26)],
        [createTestContainer(27), createTestContainer(28)],
      ];

      const success = manager.placeContainers(newLayout);
      expect(success).to.be.true;

      // Verify new containers are in place
      newLayout.forEach((row, rowIndex) => {
        row.forEach((container, colIndex) => {
          const retrievedContainer = manager.getContainerAt({
            row: rowIndex,
            column: colIndex,
          });
          expect(retrievedContainer).to.equal(container);
          expect(retrievedContainer?.getThermalState().temperature).to.equal(
            25 + rowIndex * 2 + colIndex
          );
        });
      });
    });
  });

  describe("Container Retrieval", () => {
    let manager: Grid;
    let containers: Container[][];

    beforeEach(() => {
      manager = new Grid(TEST_CONFIG.dimensions.standard);
      containers = [
        [createTestContainer(15), createTestContainer(16)],
        [createTestContainer(17), createTestContainer(18)],
      ];
      manager.placeContainers(containers);
    });

    it("should get all containers with correct positions", () => {
      const retrievedContainers = manager.getContainers();
      expect(retrievedContainers).to.have.lengthOf(4);

      retrievedContainers.forEach(({ container, position }) => {
        const expectedContainer = containers[position.row][position.column];
        expect(container).to.equal(expectedContainer);
      });
    });

    it("should return null for out-of-bounds positions", () => {
      const invalidPositions: GridPosition[] = [
        { row: -1, column: 0 },
        { row: 0, column: -1 },
        { row: 2, column: 0 },
        { row: 0, column: 2 },
      ];

      invalidPositions.forEach((pos) => {
        expect(manager.getContainerAt(pos)).to.be.null;
      });
    });

    it("should maintain container references", () => {
      const container = containers[0][0];
      const retrievedContainer = manager.getContainerAt({ row: 0, column: 0 });

      // Update the original container's state
      container.updateTemperature(25);

      // Verify the retrieved container reflects the change
      expect(retrievedContainer?.getThermalState().temperature).to.equal(25);
    });
  });

  describe("Grid Operations", () => {
    let manager: Grid;

    beforeEach(() => {
      manager = new Grid(TEST_CONFIG.dimensions.large);
    });

    it("should report correct dimensions after initialization", () => {
      const dims = manager.getDimensions();
      expect(dims).to.deep.equal(TEST_CONFIG.dimensions.large);
    });

    it("should handle various fill patterns", () => {
      const patterns = {
        empty: Array(TEST_CONFIG.dimensions.large.rows)
          .fill(null)
          .map(() => Array(TEST_CONFIG.dimensions.large.columns).fill(null)),
        checkerboard: Array(TEST_CONFIG.dimensions.large.rows)
          .fill(null)
          .map((_, row) =>
            Array(TEST_CONFIG.dimensions.large.columns)
              .fill(null)
              .map((_, col) =>
                (row + col) % 2 === 0 ? createTestContainer() : null
              )
          ),
      };

      // Test each pattern
      Object.entries(patterns).forEach(([name, pattern]) => {
        const success = manager.placeContainers(pattern);
        expect(success, `Failed to place ${name} pattern`).to.be.true;

        const containers = manager.getContainers();
        const expectedCount = pattern.flat().filter((c) => c !== null).length;
        expect(containers).to.have.lengthOf(expectedCount);
      });
    });
  });
});
