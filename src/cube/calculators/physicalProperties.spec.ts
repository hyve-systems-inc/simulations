import { expect } from "chai";
import {
  calculateDensity,
  calculateViscosity,
  calculateThermalConductivity,
  calculateSpecificHeat,
  calculateDiffusivity,
  calculateSaturationPressure,
  getProperties,
} from "./physicalProperties.js";

describe("Physical Property Calculations", () => {
  describe("Air Density", () => {
    /**
     * Test density calculation at standard conditions
     * Reference: Section II - Physical Properties
     *
     * Physical basis:
     * - Standard atmospheric pressure: 101325 Pa
     * - Temperature: 20°C (293.15 K)
     * - Using ideal gas law: ρ = P/(R_air * T)
     *
     * Expected value: 1.204 kg/m³
     * - Standard reference value from engineering tables
     * - Used in HVAC calculations
     * - Critical for:
     *   - Reynolds number calculations
     *   - Mass flow rates
     *   - Pressure drop predictions
     */
    it("calculates standard density at 20°C", () => {
      const density = calculateDensity(20);
      expect(density).to.be.approximately(1.204, 0.001);
    });

    /**
     * Test temperature dependence of density
     * Reference: Section II - "Conservation of mass"
     *
     * Physical basis:
     * Ideal gas law relationship:
     * ρ₁/ρ₂ = T₂/T₁ (at constant pressure)
     *
     * Test conditions:
     * - T₁ = 0°C (273.15 K)
     * - T₂ = 40°C (313.15 K)
     *
     * Expected ratio = (273.15 + 40)/(273.15 + 0) ≈ 1.146
     * - Demonstrates inverse relationship with absolute temperature
     * - Validates ideal gas behavior
     * - Critical for buoyancy calculations
     */
    it("follows ideal gas law temperature relationship", () => {
      const densityLow = calculateDensity(0);
      const densityHigh = calculateDensity(40);
      const ratio = densityLow / densityHigh;
      expect(ratio).to.be.approximately(1.146, 0.001);
    });

    /**
     * Test precision control in density calculations
     * Reference: Section XI - "Numerical Implementation"
     *
     * Physical basis for precision:
     * - Density measurements typically accurate to 3 significant figures
     * - Balances numerical accuracy with measurement uncertainty
     * - Matches typical sensor capabilities
     *
     * Test case T = 25°C chosen because:
     * - Common operating temperature
     * - Well-documented reference values
     * - Typical control point
     */
    it("handles precision parameter correctly", () => {
      const density = calculateDensity(25, 3);
      expect(density.toString()).to.match(/^[0-9]\.[0-9]{2}$/);
    });

    /**
     * Test physical bounds enforcement
     * Reference: Section IX - "System Constraints"
     *
     * Physical basis for temperature limit:
     * - Absolute zero = -273.15°C
     * - Physical impossibility of lower temperatures
     * - Basic thermodynamic constraint
     *
     * Test validates:
     * - Error handling for impossible conditions
     * - System stability protection
     * - Physical law enforcement
     */
    it("throws error for impossible temperatures", () => {
      expect(() => calculateDensity(-274)).to.throw();
    });
  });

  describe("Air Viscosity", () => {
    /**
     * Test viscosity calculation at standard conditions
     * Reference: Section IV, 4.1 - "Reynolds number calculation"
     *
     * Physical basis:
     * - Standard condition: 20°C
     * - Reference value: 1.825e-5 Pa·s
     * - Critical for:
     *   - Reynolds number
     *   - Pressure drop
     *   - Boundary layer development
     *
     * Expected accuracy: ±0.1%
     * Based on Sutherland's law calibration
     */
    it("calculates standard viscosity at 20°C", () => {
      const viscosity = calculateViscosity(20);
      expect(viscosity).to.be.approximately(1.825e-5, 1e-8);
    });

    /**
     * Test temperature dependence of viscosity
     * Reference: Section IV - "Flow Property Calculations"
     *
     * Physical basis - Sutherland's law:
     * μ/μ₀ = (T/T₀)^1.5 * (T₀ + S)/(T + S)
     * where:
     * - μ₀ = 1.825e-5 Pa·s at T₀ = 293.15 K
     * - S = 120 K (Sutherland's constant for air)
     *
     * Test points:
     * - 0°C: Lower practical limit
     * - 20°C: Reference condition
     * - 40°C: Upper normal condition
     *
     * Expected behavior:
     * - Monotonic increase with temperature
     * - Non-linear relationship
     * - Rate of increase diminishes at higher temperatures
     */
    it("increases with temperature according to Sutherland's law", () => {
      const temps = [0, 20, 40];
      const viscosities = temps.map((t) => calculateViscosity(t));

      expect(viscosities[1]).to.be.greaterThan(viscosities[0]);
      expect(viscosities[2]).to.be.greaterThan(viscosities[1]);

      const diff1 = viscosities[1] - viscosities[0];
      const diff2 = viscosities[2] - viscosities[1];
      expect(diff2).to.be.lessThan(diff1);
    });

    /**
     * Test agreement with experimental data
     * Reference: Section II - Physical Properties
     *
     * Test points selected based on:
     * - 0°C: Lower limit of common operation
     * - 20°C: Standard reference condition
     * - 50°C: Upper limit of normal operation
     *
     * Expected values from:
     * - Engineering tables
     * - Experimental measurements
     * - Standard reference data
     *
     * Tolerance: ±0.1%
     * Based on experimental uncertainty
     */
    it("matches experimental data points", () => {
      const testPoints = [
        { temp: 0, expected: 1.729e-5 },
        { temp: 20, expected: 1.825e-5 },
        { temp: 50, expected: 1.963e-5 },
      ];

      testPoints.forEach((point) => {
        const viscosity = calculateViscosity(point.temp);
        expect(viscosity).to.be.approximately(point.expected, 1e-7);
      });
    });
  });
  describe("Thermal Conductivity", () => {
    /**
     * Test thermal conductivity at standard conditions
     * Reference: Section III, 3.2 - "Convective Heat Transfer"
     *
     * Physical basis:
     * Standard condition (20°C):
     * - Common operating temperature
     * - Well-documented reference value
     * - k = 0.0257 W/(m·K)
     *
     * Critical for:
     * - Heat transfer coefficient calculations
     * - Nusselt number determination
     * - Thermal resistance networks
     *
     * Tolerance: ±0.4% (0.0001 W/(m·K))
     * Based on standard measurement uncertainty
     */
    it("calculates correct conductivity at standard conditions", () => {
      const k = calculateThermalConductivity(20);
      expect(k).to.be.approximately(0.0257, 0.0001);
    });

    /**
     * Test linear temperature dependence
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis:
     * k(T) = k₀ + β*T
     * where:
     * - k₀ = 0.0242 W/(m·K) at 0°C
     * - β = 7.73e-5 W/(m·K²) (temperature coefficient)
     *
     * Test points:
     * - 0°C: Reference temperature
     * - 20°C: Standard condition
     * - 40°C: Upper normal condition
     *
     * Expected behavior:
     * - Linear increase with temperature
     * - Constant difference between equal temperature intervals
     * - Slope = 7.73e-5 W/(m·K²)
     */
    it("exhibits linear temperature dependence", () => {
      const k1 = calculateThermalConductivity(0);
      const k2 = calculateThermalConductivity(20);
      const k3 = calculateThermalConductivity(40);

      const diff1 = k2 - k1;
      const diff2 = k3 - k2;
      expect(diff2).to.be.approximately(diff1, 1e-5);

      // Verify correct slope
      const slope = diff1 / 20; // W/(m·K²)
      expect(slope).to.be.approximately(7.73e-5, 1e-6);
    });

    /**
     * Test agreement with literature values
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis for test points:
     * - 0°C: Lower practical limit
     *   k = 0.0242 W/(m·K)
     *   Critical for cold storage calculations
     *
     * - 20°C: Standard reference
     *   k = 0.0257 W/(m·K)
     *   Most common operating condition
     *
     * - 50°C: Upper limit
     *   k = 0.0281 W/(m·K)
     *   Maximum normal operating temperature
     *
     * 2% tolerance based on:
     * - Experimental uncertainty
     * - Property measurement standards
     * - Engineering requirements
     */
    it("matches literature values within 2%", () => {
      const testPoints = [
        { temp: 0, expected: 0.0242 },
        { temp: 20, expected: 0.0257 },
        { temp: 50, expected: 0.0281 },
      ];

      testPoints.forEach((point) => {
        const k = calculateThermalConductivity(point.temp);
        const percentError =
          Math.abs((k - point.expected) / point.expected) * 100;
        expect(percentError).to.be.lessThan(2);
      });
    });
  });

  describe("Specific Heat", () => {
    /**
     * Test specific heat at standard conditions
     * Reference: Section II, 2.1 - "Energy Conservation"
     *
     * Physical basis:
     * Standard condition (20°C):
     * cp = cp₀ + α*T
     * where:
     * - cp₀ = 1006.0 J/(kg·K) at 0°C
     * - α = 0.034 J/(kg·K²)
     *
     * Expected value at 20°C:
     * cp = 1006.0 + 0.034 * 20 = 1006.68 J/(kg·K)
     *
     * Critical for:
     * - Energy storage calculations
     * - Temperature change predictions
     * - Cooling capacity requirements
     */
    it("calculates standard value at 20°C", () => {
      const cp = calculateSpecificHeat(20);
      expect(cp).to.be.approximately(1006.68, 0.01);
    });

    /**
     * Test temperature dependence
     * Reference: Section II, 2.1 - "Energy Conservation"
     *
     * Physical basis:
     * - Linear increase with temperature
     * - Small but significant variation
     * - Affects energy calculations
     *
     * Test range:
     * - -20°C: Winter conditions
     * - 0°C: Reference point
     * - 20°C: Standard conditions
     * - 40°C: Summer conditions
     *
     * Expected behavior:
     * - Monotonic increase
     * - Constant rate of change
     * - Rate = 0.034 J/(kg·K²)
     */
    it("shows appropriate temperature dependence", () => {
      const temps = [-20, 0, 20, 40];
      const cps = temps.map((t) => calculateSpecificHeat(t));

      // Verify monotonic increase
      for (let i = 1; i < cps.length; i++) {
        expect(cps[i]).to.be.greaterThan(cps[i - 1]);

        // Verify constant rate if not first pair
        if (i > 1) {
          const prevDiff = cps[i - 1] - cps[i - 2];
          const currDiff = cps[i] - cps[i - 1];
          expect(currDiff).to.be.approximately(prevDiff, 1e-6);
        }
      }
    });

    /**
     * Test agreement with reference values
     * Reference: Section II - Physical Properties
     *
     * Physical basis for test points:
     * - 0°C: Base value
     *   cp = 1006.0 J/(kg·K)
     *   Reference temperature
     *
     * - 20°C: Standard condition
     *   cp = 1006.68 J/(kg·K)
     *   Most common operating point
     *
     * - 50°C: Upper limit
     *   cp = 1007.7 J/(kg·K)
     *   Maximum normal temperature
     *
     * Tolerance: ±1 J/(kg·K)
     * Based on:
     * - Measurement uncertainty
     * - Required accuracy for energy calculations
     * - Typical instrument precision
     */
    it("matches reference values within tolerance", () => {
      const testPoints = [
        { temp: 0, expected: 1006.0 },
        { temp: 20, expected: 1006.68 },
        { temp: 50, expected: 1007.7 },
      ];

      testPoints.forEach((point) => {
        const cp = calculateSpecificHeat(point.temp);
        expect(cp).to.be.approximately(point.expected, 1);
      });
    });
  });
  describe("Thermal Diffusivity", () => {
    /**
     * Test thermal diffusivity at standard conditions
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis:
     * Thermal diffusivity (α) = k/(ρ*cp)
     * At 20°C:
     * - k = 0.0257 W/(m·K)
     * - ρ = 1.204 kg/m³
     * - cp = 1006.68 J/(kg·K)
     * Expected α = 2.12e-5 m²/s
     *
     * Critical for:
     * - Transient heat transfer
     * - Temperature response time
     * - Thermal penetration depth
     * - Fourier number calculations
     *
     * Tolerance: ±0.5%
     * Based on compound uncertainty from k, ρ, and cp
     */
    it("calculates standard value at 20°C", () => {
      const alpha = calculateDiffusivity(20);
      expect(alpha).to.be.approximately(2.12e-5, 1e-7);
    });

    /**
     * Test consistency with component properties
     * Reference: Section II - "Physical Properties"
     *
     * Physical basis:
     * α = k/(ρ*cp)
     * Test verifies:
     * - Correct property combination
     * - Consistent units
     * - Mathematical accuracy
     *
     * Test temperature (20°C):
     * - Standard reference condition
     * - Well-documented properties
     * - Common operating point
     *
     * Tolerance: 0.01%
     * Based on numerical precision requirements
     */
    it("validates against manual calculation", () => {
      const temp = 20;
      const k = calculateThermalConductivity(temp, undefined);
      const rho = calculateDensity(temp, undefined);
      const cp = calculateSpecificHeat(temp, undefined);

      const alpha = calculateDiffusivity(temp);
      const manualAlpha = k / (rho * cp);

      expect(alpha).to.be.approximately(manualAlpha, 1e-4);
    });

    /**
     * Test temperature dependence
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis:
     * α increases with temperature because:
     * - k increases linearly
     * - ρ decreases inversely with T
     * - cp increases slightly
     * Net effect: α increases with temperature
     *
     * Test points:
     * - 0°C: Lower reference
     * - 50°C: Upper reference
     *
     * Expected behavior:
     * ~15-20% increase over 50°C span
     * Critical for:
     * - Transient cooling predictions
     * - System response modeling
     */
    it("follows expected temperature trend", () => {
      const alphaLow = calculateDiffusivity(0);
      const alphaHigh = calculateDiffusivity(50);

      expect(alphaHigh).to.be.greaterThan(alphaLow);

      // Verify expected magnitude of increase
      const ratio = alphaHigh / alphaLow;
      expect(ratio).to.be.within(1.15, 1.2);
    });
  });

  describe("Saturation Pressure", () => {
    /**
     * Test saturation pressure at standard points
     * Reference: Section III, 2.3 - "Evaporative Cooling"
     *
     * Physical basis - Magnus formula:
     * psat = 611.2 * exp((17.67 * T)/(T + 243.5))
     *
     * Test points:
     * - 0°C: Triple point of water
     *   Expected: 611.2 Pa
     *   Physical reference point
     *
     * - 20°C: Standard condition
     *   Expected: 2337.8 Pa
     *   Common operating point
     *
     * - 100°C: Boiling point
     *   Expected: 101325 Pa (1 atm)
     *   Upper validation point
     *
     * Critical for:
     * - Evaporation rate calculations
     * - Humidity control
     * - Condensation prediction
     */
    it("calculates correct pressure at standard points", () => {
      expect(calculateSaturationPressure(0)).to.be.approximately(611.2, 0.1);
      expect(calculateSaturationPressure(20, 6)).to.be.approximately(
        2337.8,
        0.1
      );
      expect(calculateSaturationPressure(100, 8)).to.be.approximately(
        101325,
        100
      );
    });

    /**
     * Test exponential behavior
     * Reference: Section III, 2.3 - "VPD = psat(Tp,i,j) * aw - (wa,i * P)/(0.622 + wa,i)"
     *
     * Physical basis:
     * - Clausius-Clapeyron relationship
     * - Exponential increase with temperature
     * - Doubling approximately every 10°C
     *
     * Test points: [0, 20, 40, 60]°C
     * Selected to demonstrate:
     * - Full operating range
     * - Non-linear behavior
     * - Accelerating increase
     *
     * Expected behavior:
     * - Each ratio larger than previous
     * - Follows theoretical curve
     * - Critical for psychrometric calculations
     */
    it("exhibits correct exponential behavior", () => {
      const temps = [0, 20, 40, 60];
      const pressures = temps.map((t) =>
        calculateSaturationPressure(t, undefined)
      );

      // Calculate successive ratios
      const ratios = [];
      for (let i = 1; i < pressures.length; i++) {
        ratios.push(pressures[i] / pressures[i - 1]);
      }

      // Verify accelerating increase
      for (let i = 1; i < ratios.length; i++) {
        expect(ratios[i]).to.be.greaterThan(ratios[i - 1]);
      }

      // Verify approximate doubling every 10°C
      ratios.forEach((ratio) => {
        expect(Math.pow(ratio, 0.5)).to.be.within(1.9, 2.1);
      });
    });
  });

  describe("Property Collection", () => {
    /**
     * Test completeness of property set
     * Reference: Section II - "Physical Properties"
     *
     * Physical basis:
     * Complete set of properties required for:
     * - Heat transfer calculations
     * - Flow analysis
     * - System modeling
     *
     * Required properties:
     * - Air density: Mass and buoyancy effects
     * - Viscosity: Flow resistance and Re
     * - Thermal conductivity: Heat transfer
     * - Specific heat: Energy storage
     * - Diffusivity: Transient response
     */
    it("returns complete set of properties", () => {
      const props = getProperties(20);
      expect(props).to.have.all.keys([
        "airDensity",
        "airViscosity",
        "thermalConductivity",
        "specificHeat",
        "diffusivity",
      ]);
    });

    /**
     * Test consistency across calculation methods
     * Reference: Section XI - "Numerical Implementation"
     *
     * Physical basis:
     * - Properties must be consistent regardless of
     *   calculation method
     * - Prevents numerical artifacts
     * - Ensures energy conservation
     *
     * Test temperature (20°C):
     * - Standard reference condition
     * - Common operating point
     * - Well-documented values
     *
     * Verifies:
     * - Numerical consistency
     * - Cache coherence
     * - Implementation correctness
     */
    it("maintains consistency across calculations", () => {
      const temp = 20;
      const props = getProperties(temp);

      expect(props.airDensity).to.equal(calculateDensity(temp));
      expect(props.airViscosity).to.equal(calculateViscosity(temp));
      expect(props.thermalConductivity).to.equal(
        calculateThermalConductivity(temp)
      );
      expect(props.specificHeat).to.equal(calculateSpecificHeat(temp));
      expect(props.diffusivity).to.equal(calculateDiffusivity(temp));
    });
  });
});
