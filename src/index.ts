import { writeFileSync } from "fs";
import { COMMODITY_PROPERTIES, Cube, PACKAGING_CONFIGS } from "./cube/cube.js";
import { significant } from "./cube/lib.js";
import dotenv from "dotenv";
import { Vector3D, ZonalDimensions } from "./cube/models/Zone.js";
dotenv.config();

const cubeInternalVolume: Vector3D = { x: 3, y: 3, z: 3 };

// Create configurations directly
const zonalConfig = ZonalDimensions.createConfig(
  cubeInternalVolume, // dimensions
  2, // numZones
  1, // numLayers
  2, // pallets per zone
  {
    commodityPackingFactor: 0.8,
    tolerance: {
      geometric: 1e-6,
      conservation: 1e-4,
      properties: 1e-3,
      control: 1e-2,
    },
    temperatures: { default: 20 },
  }
);

const coolingConfig = {
  supplyTemperature: 2,
  supplyPressure: 101_425,
  returnPressure: 100_000,
  maxAirflowRate: 0.5,
  initialTemperature: 20,
};

// Use pre-defined or custom commodity/packaging configs
const cube = new Cube(
  zonalConfig,
  COMMODITY_PROPERTIES.strawberry,
  PACKAGING_CONFIGS["strawberry-standard"],
  coolingConfig,
  cubeInternalVolume
);
writeFileSync("./output.json", JSON.stringify(cube.getState(), undefined, 2));

// Run simulation
for (let i = 0; i < Number(process.env.STEPS); i++) {
  const state = cube.step();
  console.log(
    `${significant(state.time, 3)} : ${significant(
      state.averageTemperature,
      5
    )}`
  );
}
