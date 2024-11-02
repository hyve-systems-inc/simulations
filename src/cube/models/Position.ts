import { ZonalConfig } from "./Zone.js";

/**
 * Position class for tracking location within the cooling system
 * Reference: Section 1.1
 */
export class Position {
  /**
   * Create a new position
   * @param i - Zone index in flow direction (0 to numZones-1)
   * @param j - Layer index in vertical direction (0 to numLayers-1)
   * @param k - Pallet index in lateral direction (0 to numPallets-1)
   */
  constructor(
    public readonly i: number,
    public readonly j: number,
    public readonly k: number
  ) {}

  /**
   * Check if position represents an edge location
   * @param config - System configuration with dimension information
   * @returns True if position is at any edge
   */
  isEdge(config: ZonalConfig): boolean {
    return (
      this.isFlowEdge(config) ||
      this.isVerticalEdge(config) ||
      this.isLateralEdge(config)
    );
  }

  /**
   * Check if position is at flow direction edge (inlet or outlet)
   * @param config - System configuration
   * @returns True if at inlet or outlet
   */
  isFlowEdge(config: ZonalConfig): boolean {
    return this.i === 0 || this.i === config.numZones - 1;
  }

  /**
   * Check if position is at vertical edge (top or bottom)
   * @param config - System configuration
   * @returns True if at top or bottom layer
   */
  isVerticalEdge(config: ZonalConfig): boolean {
    return this.j === 0 || this.j === config.numLayers - 1;
  }

  /**
   * Check if position is at lateral edge (sides)
   * @param config - System configuration
   * @returns True if at lateral edge
   */
  isLateralEdge(config: ZonalConfig): boolean {
    return this.k === 0 || this.k === config.numPallets - 1;
  }

  /**
   * Check if position is at inlet
   * @returns True if at inlet (i = 0)
   */
  isInlet(): boolean {
    return this.i === 0;
  }

  /**
   * Check if position is at outlet
   * @param config - System configuration
   * @returns True if at outlet
   */
  isOutlet(config: ZonalConfig): boolean {
    return this.i === config.numZones - 1;
  }

  /**
   * Check if position is at bottom layer
   * @returns True if at bottom (j = 0)
   */
  isBottom(): boolean {
    return this.j === 0;
  }

  /**
   * Check if position is at top layer
   * @param config - System configuration
   * @returns True if at top layer
   */
  isTop(config: ZonalConfig): boolean {
    return this.j === config.numLayers - 1;
  }

  /**
   * Get adjacent positions within bounds
   * @param config - System configuration
   * @returns Array of valid adjacent positions
   */
  getAdjacentPositions(config: ZonalConfig): Position[] {
    const adjacent: Position[] = [];

    // Check all possible adjacent positions
    const possiblePositions = [
      // Flow direction
      new Position(this.i - 1, this.j, this.k),
      new Position(this.i + 1, this.j, this.k),
      // Vertical direction
      new Position(this.i, this.j - 1, this.k),
      new Position(this.i, this.j + 1, this.k),
      // Lateral direction
      new Position(this.i, this.j, this.k - 1),
      new Position(this.i, this.j, this.k + 1),
    ];

    // Filter for valid positions
    return possiblePositions.filter((pos) => this.isValidPosition(pos, config));
  }

  /**
   * Check if a position is valid within the system bounds
   * @param pos - Position to check
   * @param config - System configuration
   * @returns True if position is valid
   */
  private isValidPosition(pos: Position, config: ZonalConfig): boolean {
    return (
      pos.i >= 0 &&
      pos.i < config.numZones &&
      pos.j >= 0 &&
      pos.j < config.numLayers &&
      pos.k >= 0 &&
      pos.k < config.numPallets
    );
  }

  /**
   * Get relative position within the system (0 to 1 in each dimension)
   * @param config - System configuration
   * @returns Object with relative positions
   */
  getRelativePosition(config: ZonalConfig): {
    flowPosition: number;
    heightPosition: number;
    lateralPosition: number;
  } {
    return {
      flowPosition: (this.i + 0.5) / config.numZones,
      heightPosition: (this.j + 0.5) / config.numLayers,
      lateralPosition: (this.k + 0.5) / config.numPallets,
    };
  }

  /**
   * Create string representation of position
   * @returns Position as string "(i,j,k)"
   */
  toString(): string {
    return `(${this.i},${this.j},${this.k})`;
  }

  /**
   * Check if two positions are equal
   * @param other - Position to compare with
   * @returns True if positions are equal
   */
  equals(other: Position): boolean {
    return this.i === other.i && this.j === other.j && this.k === other.k;
  }

  /**
   * Calculate Manhattan distance to another position
   * @param other - Position to calculate distance to
   * @returns Manhattan distance between positions
   */
  distanceTo(other: Position): number {
    return (
      Math.abs(this.i - other.i) +
      Math.abs(this.j - other.j) +
      Math.abs(this.k - other.k)
    );
  }
}
