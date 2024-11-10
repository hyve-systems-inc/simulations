// import { ThermalState } from "./Container.js";
// import { Layer, ContainerPlacement } from "./Layer.js";

// /**
//  * Describes the location of a container within the pallet structure
//  * Maps to the physical domain described in Section I.1:
//  * - Container position within N sequential zones and M vertical layers
//  */
// export interface ContainerLocation {
//   layerIndex: number; // Vertical layer index (M in docs)
//   rowIndex: number; // Row within layer
//   containerIndex: number; // Position within row
// }

// /**
//  * Represents a pallet containing multiple vertical layers of containers.
//  * Implementation based on Section I.1 Physical Domain:
//  * - Handles N sequential zones along airflow path
//  * - Manages M vertical layers per pallet
//  * - Tracks P pallets per zone
//  */
// export class Pallet {
//   private readonly layers: Layer[] = [];

//   constructor(
//     private readonly width: number, // meters
//     private readonly length: number, // meters
//     private readonly maxLayers: number // Maximum vertical layers (M in docs)
//   ) {
//     this.validateDimensions(width, length);
//     if (maxLayers <= 0) {
//       throw new Error("Maximum layers must be positive");
//     }
//   }

//   /**
//    * Add a new layer to the pallet.
//    * Implements vertical discretization from Section I.1 and
//    * affects flow distribution described in Section IV.3:
//    * εj = εmax * (1 - α*exp(-β*h/H))
//    */
//   public addLayer(layer: Layer): boolean {
//     // Validate layer dimensions match pallet base
//     const layerDims = layer.getDimensions();
//     if (layerDims.width !== this.width || layerDims.length !== this.length) {
//       throw new Error("Layer dimensions must match pallet base dimensions");
//     }

//     // Check against maximum layers constraint from Section IX.2
//     if (this.layers.length >= this.maxLayers) {
//       return false;
//     }

//     this.layers.push(layer);
//     return true;
//   }

//   /**
//    * Get all layers in the pallet.
//    * Used for thermal calculations from Section II:
//    * - Energy Conservation (2.1)
//    * - Mass Conservation (2.2)
//    */
//   public getLayers(): Layer[] {
//     return [...this.layers];
//   }

//   public getLayer(index: number): Layer | undefined {
//     return this.layers[index];
//   }

//   /**
//    * Update temperature of a specific container
//    * Implements temperature constraints from Section IX.1:
//    * Tdp ≤ Ta,i ≤ Text
//    */
//   public updateContainerTemperature(
//     location: ContainerLocation,
//     newTemp: number
//   ): boolean {
//     const container = this.getContainerAt(location);
//     if (!container) {
//       return false;
//     }

//     try {
//       container.container.updateTemperature(newTemp);
//       return true;
//     } catch (error) {
//       console.error(`Error updating temperature: ${error}`);
//       return false;
//     }
//   }

//   /**
//    * Update temperatures for multiple containers
//    * Used for implementing temperature control as per Section VI
//    */
//   public updateContainerTemperatures(
//     updates: Array<{ location: ContainerLocation; newTemp: number }>
//   ): boolean[] {
//     return updates.map((update) =>
//       this.updateContainerTemperature(update.location, update.newTemp)
//     );
//   }

//   /**
//    * Update all container temperatures by a delta
//    * Relates to Turbulent Cooling Performance Index (TCPI)
//    * calculations in Section VI.1
//    */
//   public updateAllTemperatures(deltaTempC: number): number {
//     let successCount = 0;

//     this.getAllContainers().forEach((placement) => {
//       try {
//         const currentTemp = placement.container.getThermalState().temperature;
//         placement.container.updateTemperature(currentTemp + deltaTempC);
//         successCount++;
//       } catch (error) {
//         console.error(`Error updating temperature: ${error}`);
//       }
//     });

//     return successCount;
//   }

//   /**
//    * Get thermal state of a specific container
//    * Maps to state variables defined in Section I.2:
//    * - Tp,i,j(t) = Product temperature (°C)
//    * - wp,i,j(t) = Product moisture content
//    */
//   public getContainerThermalState(
//     location: ContainerLocation
//   ): ThermalState | undefined {
//     const container = this.getContainerAt(location);
//     return container?.container.getThermalState();
//   }

//   /**
//    * Get detailed thermal information for all containers
//    * Used for calculating performance metrics from Section VIII:
//    * - Cooling Uniformity (8.1)
//    * - Energy Efficiency (8.2)
//    * - Product Quality (8.3)
//    */
//   public getAllContainerStates(): Array<{
//     location: ContainerLocation;
//     state: ThermalState;
//     respirationHeat: number;
//   }> {
//     const states: Array<{
//       location: ContainerLocation;
//       state: ThermalState;
//       respirationHeat: number;
//     }> = [];

//     this.layers.forEach((layer, layerIndex) => {
//       const containers = layer.getContainers();
//       containers.forEach((placement, containerIndex) => {
//         states.push({
//           location: {
//             layerIndex,
//             rowIndex: Math.floor(containerIndex / 2),
//             containerIndex: containerIndex % 2,
//           },
//           state: placement.container.getThermalState(),
//           respirationHeat: placement.container.calculateRespirationHeat(),
//         });
//       });
//     });

//     return states;
//   }

//   /**
//    * Get temperature statistics for cooling uniformity analysis
//    * Implements Cooling Uniformity Index from Section VIII.1:
//    * UI = std_dev(SECT)/mean(SECT)
//    */
//   public getTemperatureStats(): {
//     min: number;
//     max: number;
//     average: number;
//     standardDeviation: number;
//   } {
//     const temperatures = this.getAllContainers().map(
//       (placement) => placement.container.getThermalState().temperature
//     );

//     if (temperatures.length === 0) {
//       return { min: 0, max: 0, average: 0, standardDeviation: 0 };
//     }

//     const min = Math.min(...temperatures);
//     const max = Math.max(...temperatures);
//     const average =
//       temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length;

//     const variance =
//       temperatures.reduce((sum, temp) => sum + Math.pow(temp - average, 2), 0) /
//       temperatures.length;

//     return {
//       min,
//       max,
//       average,
//       standardDeviation: Math.sqrt(variance),
//     };
//   }

//   /**
//    * Calculate average thermal state across all containers
//    * Implementation of state variables from Section I.2 and
//    * energy conservation equations from Section II.1
//    */
//   public getAverageThermalState(): ThermalState {
//     if (this.layers.length === 0) {
//       return { temperature: 0, moisture: 0 };
//     }

//     const layerStates = this.layers.map((layer) =>
//       layer.getAverageThermalState()
//     );

//     const totalStates = layerStates.reduce(
//       (acc, state) => ({
//         temperature: acc.temperature + state.temperature,
//         moisture: acc.moisture + state.moisture,
//       }),
//       { temperature: 0, moisture: 0 }
//     );

//     return {
//       temperature: totalStates.temperature / layerStates.length,
//       moisture: totalStates.moisture / layerStates.length,
//     };
//   }

//   /**
//    * Calculate total respiration heat for the pallet
//    * Implementation of Section III.1 Respiration Heat equations:
//    * R(T) = rRef * exp(k * (Tp,i,j - Tref))
//    * Qresp,i,j = R(T) * mp,i,j * hResp
//    */
//   public calculateTotalRespirationHeat(): number {
//     return this.getAllContainers().reduce(
//       (total, placement) =>
//         total + placement.container.calculateRespirationHeat(),
//       0
//     );
//   }

//   /**
//    * Get the temperature profile across vertical layers
//    * Used for analyzing cooling uniformity as per Section VIII.1:
//    * CRIi,j = (Tp,i,j - Ta,i)/(Tp,initial - Ta,supply)
//    */
//   public getTemperatureProfile(): number[] {
//     return this.layers.map((layer) => {
//       const state = layer.getAverageThermalState();
//       return state.temperature;
//     });
//   }

//   /**
//    * Helper method to get all containers in the pallet
//    * Used for bulk operations and calculations
//    */
//   private getAllContainers(): ContainerPlacement[] {
//     return this.layers.flatMap((layer) => layer.getContainers());
//   }

//   /**
//    * Helper method to get a specific container by location
//    * Maps to the physical domain coordinates from Section I.1
//    */
//   private getContainerAt(
//     location: ContainerLocation
//   ): ContainerPlacement | undefined {
//     const layer = this.layers[location.layerIndex];
//     if (!layer) return undefined;

//     const containers = layer.getContainers();
//     const targetIndex = location.rowIndex * 2 + location.containerIndex;
//     return containers[targetIndex];
//   }

//   /**
//    * Validate pallet dimensions according to physical constraints
//    * Based on System Constraints from Section IX.1
//    */
//   private validateDimensions(width: number, length: number): void {
//     if (width <= 0 || length <= 0) {
//       throw new Error("Invalid pallet dimensions");
//     }
//   }
// }
