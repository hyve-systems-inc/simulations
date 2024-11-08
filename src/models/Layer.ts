import { Container, ThermalState } from "./Container.js";

export enum Orientation {
  LENGTHWISE_X = "LENGTHWISE_X",
  LENGTHWISE_Y = "LENGTHWISE_Y",
}

export interface Position {
  x: number;
  y: number;
}

/**
 * Represents a container's position and orientation within a layer.
 * This maps to the physical domain described in Section I.1:
 * - Each layer corresponds to "M vertical layers per pallet"
 * - Position tracks the container's location within the zone
 */
export interface ContainerPlacement {
  container: Container;
  position: Position;
  orientation: Orientation;
}

/**
 * Internal representation of a row within a layer.
 * Maps to the spatial discretization described in Section I.1
 * where each row represents part of the vertical (M) discretization.
 */
interface Row {
  y: number; // Vertical position from layer base
  z: number; // Row height
  containers: ContainerPlacement[];
}

/**
 * Represents a horizontal layer of containers within a zone.
 * Implementation of the physical domain described in Section I.1:
 * - Represents one of the M vertical layers within a zone
 * - Contains multiple containers arranged in rows
 * - Handles spatial arrangement and thermal state calculations
 */
export class Layer {
  private readonly width: number;
  private readonly length: number;
  private readonly containerSpacing: number = 0.02; // 2cm spacing between containers
  private readonly rows: Row[] = [];
  private readonly PRECISION: number = 1000; // For 3 decimal places

  constructor(width: number, length: number) {
    this.validateDimensions(width, length);
    this.width = width;
    this.length = length;
  }

  // Helper method to handle floating point calculations
  private roundToThreeDecimals(value: number): number {
    return Math.round(value * this.PRECISION) / this.PRECISION;
  }

  /**
   * Calculates row position based on the vertical stacking model.
   * Related to the vertical discretization in Section I.1 and
   * the flow distribution equations in Section IV.3:
   * εj = εmax * (1 - α*exp(-β*h/H))
   */
  private calculateRowPosition(index: number): number {
    let position = 0;
    for (let i = 0; i < index; i++) {
      if (this.rows[i]) {
        position = this.roundToThreeDecimals(
          position + this.rows[i].z + this.containerSpacing
        );
      }
    }
    return position;
  }

  public getDimensions(): { width: number; length: number } {
    return { width: this.width, length: this.length };
  }

  /**
   * Returns all container placements in the layer.
   * Used for thermal calculations as per Section II:
   * - Energy Conservation (2.1)
   * - Mass Conservation (2.2)
   * The placement information is used to determine boundary conditions
   * and heat transfer coefficients based on container positions.
   */
  public getContainers(): ContainerPlacement[] {
    return this.rows.flatMap((row) => [...row.containers]);
  }

  /**
   * Calculates container footprint based on orientation.
   * Important for flow distribution calculations in Section IV.3:
   * vi,j = v0 * g(h/H) * h(x/L)
   * where container orientation affects local flow patterns
   */
  private getContainerFootprint(
    container: Container,
    orientation: Orientation
  ): { width: number; length: number } {
    const containerDims = container.getDimensions();
    return orientation === Orientation.LENGTHWISE_X
      ? { width: containerDims.x, length: containerDims.y }
      : { width: containerDims.y, length: containerDims.x };
  }

  /**
   * Adds a new row to the layer.
   * Implements part of the vertical discretization described in Section I.1
   * and affects the flow distribution described in Section IV.3:
   * εj = εmax * (1 - α*exp(-β*h/H))
   */
  public addRow(index: number, z: number): boolean {
    if (index < 0) {
      throw new Error("Row index must be non-negative");
    }

    if (z <= 0) {
      throw new Error("Row height must be positive");
    }

    const yPosition = this.calculateRowPosition(index);

    // Check if adding this row would exceed layer length
    if (this.roundToThreeDecimals(yPosition + z) > this.length) {
      return false;
    }

    // Insert row at specified index
    this.rows[index] = {
      y: yPosition,
      z: this.roundToThreeDecimals(z),
      containers: [],
    };

    // Recalculate positions for all subsequent rows
    for (let i = index + 1; i < this.rows.length; i++) {
      if (this.rows[i]) {
        this.rows[i].y = this.calculateRowPosition(i);
      }
    }

    return true;
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getRow(index: number): { y: number; z: number } | null {
    const row = this.rows[index];
    return row
      ? {
          y: this.roundToThreeDecimals(row.y),
          z: this.roundToThreeDecimals(row.z),
        }
      : null;
  }

  /**
   * Adds a container to a specified row.
   * Position affects thermal calculations as per Section III:
   * - Convective Heat Transfer (3.2)
   * - Local Turbulence (4.1)
   * - Heat Transfer Enhancement (4.2)
   */
  public addContainerToRow(
    rowIndex: number,
    container: Container,
    orientation: Orientation
  ): boolean {
    const row = this.rows[rowIndex];
    if (!row) {
      throw new Error(`Row ${rowIndex} does not exist`);
    }

    const footprint = this.getContainerFootprint(container, orientation);

    if (footprint.length > row.z) {
      return false;
    }

    let currentX = 0;
    for (const placement of row.containers) {
      const existingFootprint = this.getContainerFootprint(
        placement.container,
        placement.orientation
      );
      currentX = this.roundToThreeDecimals(
        currentX + existingFootprint.width + this.containerSpacing
      );
    }

    if (this.roundToThreeDecimals(currentX + footprint.width) > this.width) {
      return false;
    }

    row.containers.push({
      container,
      position: {
        x: this.roundToThreeDecimals(currentX),
        y: this.roundToThreeDecimals(row.y),
      },
      orientation,
    });

    return true;
  }

  /**
   * Calculates total area occupied by containers.
   * Used in cooling uniformity calculations as per Section VIII.1:
   * CRIi,j = (Tp,i,j - Ta,i)/(Tp,initial - Ta,supply)
   * where container arrangement affects local heat transfer coefficients
   */
  public getOccupiedArea(): number {
    return this.roundToThreeDecimals(
      this.getContainers().reduce((total, placement) => {
        const footprint = this.getContainerFootprint(
          placement.container,
          placement.orientation
        );
        return total + footprint.width * footprint.length;
      }, 0)
    );
  }

  /**
   * Calculates space utilization percentage.
   * Related to performance metrics in Section VIII:
   * - Cooling Uniformity (8.1)
   * - Energy Efficiency (8.2)
   * where packing density affects overall system performance
   */
  public getSpaceUtilization(): number {
    return this.roundToThreeDecimals(
      (this.getOccupiedArea() / (this.width * this.length)) * 100
    );
  }

  /**
   * Calculates average thermal state for the layer.
   * Implementation corresponds to state variables in Section I.2:
   * Tp,i,j(t) = Product temperature (°C)
   * wp,i,j(t) = Product moisture content (kg water/kg dry matter)
   *
   * Used in energy conservation equations from Section II.1:
   * mp,i,j * cp * dTp,i,j/dt = Qresp,i,j - Qconv,i,j - Qevap,i,j
   *
   * And mass conservation from Section II.2:
   * dwp,i,j/dt = -mevap,i,j/mp,i,j
   */
  public getAverageThermalState(): ThermalState {
    const containers = this.getContainers();
    if (containers.length === 0) {
      return { temperature: 0, moisture: 0 };
    }

    const totalStates = containers.reduce(
      (acc, placement) => {
        const state = placement.container.getThermalState();
        return {
          temperature: acc.temperature + state.temperature,
          moisture: acc.moisture + state.moisture,
        };
      },
      { temperature: 0, moisture: 0 }
    );

    return {
      temperature: this.roundToThreeDecimals(
        totalStates.temperature / containers.length
      ),
      moisture: this.roundToThreeDecimals(
        totalStates.moisture / containers.length
      ),
    };
  }

  private validateDimensions(width: number, length: number): void {
    if (width <= 0 || length <= 0) {
      throw new Error("Layer dimensions must be positive");
    }
  }
}
