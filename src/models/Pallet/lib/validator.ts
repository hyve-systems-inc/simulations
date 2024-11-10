import { Dimensions } from "../../Container/index.js";
import { GridDimensions } from "../../Grid/index.js";

export interface PalletConfig {
  gridDimensions: GridDimensions;
  layerDimensions: Dimensions;
  numLayers: number;
}

/**
 * Validates pallet configuration parameters.
 * @throws Error if configuration is invalid
 */
export function validatePalletConfig(config: PalletConfig): void {
  if (config.numLayers <= 0) {
    throw new Error("Number of layers must be positive");
  }

  if (config.gridDimensions.rows <= 0 || config.gridDimensions.columns <= 0) {
    throw new Error("Grid dimensions must be positive");
  }

  if (
    config.layerDimensions.x <= 0 ||
    config.layerDimensions.y <= 0 ||
    config.layerDimensions.z <= 0
  ) {
    throw new Error("Layer dimensions must be positive");
  }
}
