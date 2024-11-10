import { Container } from "../Container/index.js";

/**
 * Represents a position in the grid coordinate system.
 * In the physical layout:
 * - Columns increase along the direction of airflow (y-axis)
 * - Rows are perpendicular to airflow (along x-axis)
 */
export interface GridPosition {
  /** Position along x-axis (perpendicular to airflow) */
  row: number;
  /** Position along y-axis (parallel to airflow) */
  column: number;
}

/**
 * Defines the size of the grid in terms of rows and columns.
 * This determines the number of containers that can be placed
 * in each direction relative to the airflow.
 */
export interface GridDimensions {
  /** Number of container positions perpendicular to airflow */
  rows: number;
  /** Number of container positions along airflow direction */
  columns: number;
}

/**
 * Manages a 2D arrangement of containers in a cooling layer.
 * The grid coordinate system is aligned with the airflow:
 * - Columns run parallel to the airflow direction (y-axis)
 * - Rows run perpendicular to airflow (x-axis)
 * - Air flows from column 0 to column (n-1)
 */
export class Grid {
  /**
   * 2D array storing containers.
   * First index (rows) represents position perpendicular to airflow.
   * Second index (columns) represents position along airflow direction.
   */
  private matrix: (Container | null)[][];

  /**
   * Creates a new Grid with the specified dimensions.
   * @param grid - The dimensions of the grid in rows and columns
   * @throws Error if dimensions are not positive
   */
  constructor(grid: GridDimensions) {
    this.validateGrid(grid);
    this.matrix = Array(grid.rows)
      .fill(null)
      .map(() => Array(grid.columns).fill(null));
  }

  /**
   * Places containers in the grid according to the provided layout.
   * Layout must match the grid dimensions and orientation:
   * - Outer array represents rows (perpendicular to airflow)
   * - Inner arrays represent columns (along airflow)
   *
   * @param layout - 2D array of containers matching grid dimensions
   * @returns true if placement successful, false otherwise
   */
  public placeContainers(layout: (Container | null)[][]): boolean {
    if (!this.validateLayout(layout)) {
      return false;
    }

    try {
      this.matrix = layout.map((row) => [...row]);
      return true;
    } catch (error) {
      console.error("Error placing containers:", error);
      return false;
    }
  }

  /**
   * Retrieves the container at a specific grid position.
   * @param position - Grid coordinates relative to airflow
   * @returns The container at the specified position, or null if empty
   */
  public getContainerAt(position: GridPosition): Container | null {
    return this.matrix[position.row]?.[position.column] ?? null;
  }

  /**
   * Returns all containers in the grid with their positions.
   * Containers are returned in row-major order:
   * - Primary sort by position perpendicular to airflow
   * - Secondary sort by position along airflow
   *
   * @returns Array of containers and their grid positions
   */
  public getContainers(): Array<{
    container: Container;
    position: GridPosition;
  }> {
    const containers: Array<{ container: Container; position: GridPosition }> =
      [];

    this.matrix.forEach((row, rowIndex) => {
      row.forEach((container, colIndex) => {
        if (container) {
          containers.push({
            container,
            position: { row: rowIndex, column: colIndex },
          });
        }
      });
    });

    return containers;
  }

  /**
   * Returns the current dimensions of the grid.
   * @returns Object containing row and column counts
   */
  public getDimensions(): GridDimensions {
    return {
      rows: this.matrix.length,
      columns: this.matrix[0].length,
    };
  }

  /**
   * Validates grid dimensions are positive numbers.
   * @param grid - Dimensions to validate
   * @throws Error if dimensions are invalid
   */
  private validateGrid(grid: GridDimensions): void {
    if (grid.rows <= 0 || grid.columns <= 0) {
      throw new Error("Layer dimensions must be positive");
    }
  }

  /**
   * Validates that a container layout matches the grid dimensions.
   * @param layout - Layout to validate
   * @returns true if layout is valid, false otherwise
   */
  private validateLayout(layout: (Container | null)[][]): boolean {
    if (!layout.length || !layout[0].length) {
      return false;
    }

    if (
      layout.length !== this.matrix.length ||
      layout[0].length !== this.matrix[0].length
    ) {
      return false;
    }

    return layout.every((row) => row.length === layout[0].length);
  }
}
