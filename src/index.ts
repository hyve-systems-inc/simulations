import { randomWithinTolerance } from "./lib.js";
import {
  Container,
  Dimensions,
  ThermalState,
  ProductProperties,
} from "./models/Container.js";
import { Layer, Orientation } from "./models/Layer.js";
import { Pallet } from "./models/Pallet.js";

interface ContainerProps {
  dimensions: Dimensions;
  thermalState: ThermalState;
  productProperties: ProductProperties;
}

const cilantroProps: ContainerProps = {
  dimensions: {
    x: 0.35, // 35cm length
    y: 0.25, // 25cm width
    z: 0.2, // 20cm height
  },
  thermalState: {
    temperature: 20,
    moisture: 0.85, // Higher moisture content for fresh herbs
  },
  productProperties: {
    specificHeat: 3900, // J/(kg·K) - typical for leafy greens
    waterActivity: 0.98, // High water activity for fresh herbs
    mass: 5, // 5kg per box
    surfaceArea: 0.5, // m² - surface area for heat transfer
    respiration: {
      baseRate: 0.03, // Higher respiration rate for fresh herbs
      temperatureCoeff: 0.12,
      referenceTemp: 5, // 5°C reference temp for fresh herbs
      respirationHeat: 2200,
    },
  },
};

/**
 * Creates a pallet of cilantro boxes with specified configuration
 */
function createPallet(
  layerCount: number = 5,
  boxesPerRow: number = 3,
  rowsPerLayer: number = 2,
  containerProps: ContainerProps
): Pallet | undefined {
  const { dimensions, thermalState, productProperties } = containerProps;
  try {
    // Create standard pallet (48" x 40")
    const pallet = new Pallet(1.2, 1.0, layerCount);

    // Add layers
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
      const layer = new Layer(1.2, 1.0);

      // Add rows to layer
      for (let rowIndex = 0; rowIndex < rowsPerLayer; rowIndex++) {
        const success = layer.addRow(rowIndex, 0.25); // 25cm row height
        if (!success) {
          console.error(`Failed to add row ${rowIndex} to layer ${layerIndex}`);
          return undefined;
        }

        // Add boxes to row
        for (let boxIndex = 0; boxIndex < boxesPerRow; boxIndex++) {
          const box = new Container(
            dimensions,
            {
              ...thermalState,
              temperature: randomWithinTolerance(thermalState.temperature, 1),
            },
            productProperties
          );
          const success = layer.addContainerToRow(
            rowIndex,
            box,
            Orientation.LENGTHWISE_X
          );
          if (!success) {
            console.error(
              `Failed to add box ${boxIndex} to row ${rowIndex} in layer ${layerIndex}`
            );
            return undefined;
          }
        }
      }

      const success = pallet.addLayer(layer);
      if (!success) {
        console.error(`Failed to add layer ${layerIndex} to pallet`);
        return undefined;
      }
    }

    return pallet;
  } catch (error) {
    console.error("Error creating pallet:", error);
    return undefined;
  }
}

/**
 * Utility to print the current state of a pallet
 */
function debugPallet(pallet: Pallet) {
  const layers = pallet.getLayers();
  console.log("\nCilantro Pallet State:");
  console.log(`Total Layers: ${layers.length}`);

  // Calculate total mass
  let totalMass = 0;

  layers.forEach((layer, layerIndex) => {
    console.log(`\nLayer ${layerIndex + 1}:`);
    const containers = layer.getContainers();
    console.log(`Boxes in layer: ${containers.length}`);

    containers.forEach((container, containerIndex) => {
      const state = container.container.getThermalState();
      const properties = container.container.getProductProperties();
      totalMass += properties.mass;

      console.log(`Box ${containerIndex + 1}:`);
      console.log(
        `  Position: (${container.position.x.toFixed(
          2
        )}m, ${container.position.y.toFixed(2)}m)`
      );
      console.log(`  Temperature: ${state.temperature.toFixed(1)}°C`);
      console.log(`  Moisture Content: ${(state.moisture * 100).toFixed(1)}%`);
    });
  });

  console.log("\nPallet Summary:");
  console.log(`Total Boxes: ${pallet.getAllContainerStates().length}`);
  console.log(`Total Mass: ${totalMass.toFixed(1)} kg`);

  // Get temperature statistics
  const tempStats = pallet.getTemperatureStats();
  console.log("\nTemperature Statistics:");
  console.log(`  Average: ${tempStats.average.toFixed(1)}°C`);
  console.log(
    `  Range: ${tempStats.min.toFixed(1)}°C to ${tempStats.max.toFixed(1)}°C`
  );

  // Calculate total respiration heat
  const totalHeat = pallet.calculateTotalRespirationHeat();
  console.log(`\nTotal Respiration Heat: ${totalHeat.toFixed(1)} W`);
}

// Example usage:
const cilandroPallet = createPallet(5, 3, 2, cilantroProps);
if (cilandroPallet) {
  console.log("Successfully created pallet");
  debugPallet(cilandroPallet);
} else {
  console.log("Failed to create pallet");
}

export { createPallet, debugPallet };
