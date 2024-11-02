export interface IPhysicalProperties {
  /**
   * Calculate air density at given temperature
   * @param temperature - Air temperature (°C)
   * @returns Density (kg/m³)
   */
  calculateDensity(temperature: number, precision?: number | undefined): number;

  /**
   * Calculate dynamic viscosity of air
   * @param temperature - Air temperature (°C)
   * @returns Dynamic viscosity (Pa·s)
   */
  calculateViscosity(
    temperature: number,
    precision?: number | undefined
  ): number;

  /**
   * Calculate thermal conductivity of air
   * @param temperature - Air temperature (°C)
   * @returns Thermal conductivity (W/(m·K))
   */
  calculateThermalConductivity(
    temperature: number,
    precision?: number | undefined
  ): number;

  /**
   * Calculate specific heat of air
   * @param temperature - Air temperature (°C)
   * @returns Specific heat (J/(kg·K))
   */
  calculateSpecificHeat(
    temperature: number,
    precision?: number | undefined
  ): number;

  /**
   * Calculate thermal diffusivity of air
   * @param temperature - Air temperature (°C)
   * @returns Thermal diffusivity (m²/s)
   */
  calculateDiffusivity(
    temperature: number,
    precision?: number | undefined
  ): number;

  /**
   * Calculate water vapor saturation pressure
   * @param temperature - Air temperature (°C)
   * @returns Saturation pressure (Pa)
   */
  calculateSaturationPressure(
    temperature: number,
    precision?: number | undefined
  ): number;

  /**
   * Clear the property cache
   */
  clearCache(): void;
}
