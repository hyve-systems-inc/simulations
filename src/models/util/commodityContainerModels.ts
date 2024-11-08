import { Dimensions, ProductProperties, ThermalState } from "../Container.js";

export interface ContainerProps {
  dimensions: Dimensions;
  thermalState: ThermalState;
  productProperties: ProductProperties;
}

export const Cilantro: ContainerProps = {
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
