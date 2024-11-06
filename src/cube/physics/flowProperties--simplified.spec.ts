import { expect } from "chai";
import {
  FLOW_CONSTANTS,
  calculateHydraulicDiameter,
  calculateVelocity,
  calculateReynolds,
  calculateTurbulence,
  calculateHeatTransfer,
  calculateFlowProperties,
  calculatePressureDrop,
  calculateFlowArea,
  calculateFrictionFactor,
  calculateHeatTransferArea,
} from "./flowProperties--simplified.js";
import { ZonalConfig, ZonalDimensions } from "../models/Zone.js";

describe("Flow Properties Calculations", () => {
  // Standard test configuration based on typical container dimensions
  const testZonalConfig: ZonalConfig = {
    ...ZonalDimensions.createConfig({ x: 3, y: 3, z: 3 }, 4, 6, 4, {
      commodityPackingFactor: 0.8,
      temperatures: { default: 20 },
    }),
    containerFillFactor: 0.8,
  };

  // Standard air properties at 20°C
  const standardAirProps = {
    density: 1.2, // kg/m³
    viscosity: 1.81e-5, // Pa·s
    conductivity: 0.026, // W/(m·K)
    prandtl: 0.71, // dimensionless
  };

  describe("Hydraulic Diameter", () => {
    /**
     * Test hydraulic diameter calculation for rectangular duct
     * Reference: Section IV, 4.1 - "Local Turbulence"
     *
     * Physical basis:
     * Dh = 4A/P where:
     * - A = flow area = (y * z) * (1 - packing factor)
     * - P = wetted perimeter = 2(y + z)
     *
     * For 0.5m × 0.75m duct with 0.8 packing factor:
     * - A = 0.5 * 0.75 * (1 - 0.8) = 0.075 m²
     * - P = 2 * (0.5 + 0.75) = 2.5 m
     * - Dh = 4 * 0.075 / 2.5 = 0.12 m
     *
     * Critical for:
     * - Reynolds number calculation
     * - Heat transfer coefficients
     * - Flow resistance determination
     */
    it("calculates correct hydraulic diameter for rectangular duct", () => {
      const crossSection =
        testZonalConfig.zoneDimensions.y * testZonalConfig.zoneDimensions.z;
      const flowArea =
        crossSection * (1 - testZonalConfig.commodityPackingFactor);
      const perimeter =
        2 *
        (testZonalConfig.zoneDimensions.y + testZonalConfig.zoneDimensions.z);
      const expectedDh = (4 * flowArea) / perimeter;

      const result = calculateHydraulicDiameter(testZonalConfig);
      expect(result).to.be.approximately(
        expectedDh,
        testZonalConfig.tolerance.geometric
      );
      expect(result).to.be.approximately(0.12, 0.001); // Verify actual value
    });

    /**
     * Test geometric scaling of hydraulic diameter
     * Reference: Section IV - "Flow distribution patterns"
     *
     * Physical basis:
     * - Hydraulic diameter scales linearly with duct dimensions
     * - For similar rectangles, Dh scales with dimension ratio
     *
     * Test case:
     * - Original: 0.5m × 0.75m
     * - Scaled: 1.0m × 1.5m (2x scale)
     * - Should result in 2x hydraulic diameter
     */
    it("maintains correct geometric scaling", () => {
      const scaledConfig = {
        ...testZonalConfig,
        zoneDimensions: {
          x: testZonalConfig.zoneDimensions.x * 2,
          y: testZonalConfig.zoneDimensions.y * 2,
          z: testZonalConfig.zoneDimensions.z * 2,
        },
      };

      const standardDh = calculateHydraulicDiameter(testZonalConfig);
      const scaledDh = calculateHydraulicDiameter(scaledConfig);

      // For similar rectangles, Dh scales linearly
      expect(scaledDh / standardDh).to.be.approximately(
        2.0,
        testZonalConfig.tolerance.geometric
      );
    });

    /**
     * Test packing factor influence on hydraulic diameter
     * Reference: Section IV - "Flow Distribution"
     *
     * Physical basis:
     * Dh = 4A/P where:
     * A = (y * z) * (1 - packingFactor)
     * P = 2(y + z) = constant
     *
     * For different packing factors pf1 and pf2:
     * Dh1 = 4(yz)(1-pf1)/[2(y+z)]
     * Dh2 = 4(yz)(1-pf2)/[2(y+z)]
     *
     * Ratio = Dh1/Dh2 = (1-pf1)/(1-pf2)
     * NOT the square root as previously thought
     *
     * Example:
     * pf1 = 0.6, pf2 = 0.9
     * Ratio = (1-0.6)/(1-0.9) = 0.4/0.1 = 4.0
     */
    it("responds correctly to packing density", () => {
      const looseConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.6,
      };
      const denseConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.9,
      };

      const looseDh = calculateHydraulicDiameter(looseConfig);
      const denseDh = calculateHydraulicDiameter(denseConfig);

      // Verify loose packing has larger hydraulic diameter
      expect(looseDh).to.be.greaterThan(denseDh);

      // The ratio should be exactly (1-pf1)/(1-pf2)
      // Since Dh is directly proportional to (1-packingFactor)
      const expectedRatio = (1 - 0.6) / (1 - 0.9); // = 0.4/0.1 = 4.0
      const actualRatio = looseDh / denseDh;
      expect(actualRatio).to.be.approximately(
        expectedRatio,
        testZonalConfig.tolerance.geometric
      );
    });

    /**
     * Test boundary conditions
     * Reference: Section IX - "System Constraints"
     *
     * Physical basis:
     * - Packing factor must be < 1 (some flow area required)
     * - Dimensions must be positive
     * - Results must be physically meaningful
     */
    it("handles boundary conditions appropriately", () => {
      // Test with minimum practical packing (0.1)
      const minPackingConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.1,
      };
      expect(calculateHydraulicDiameter(minPackingConfig)).to.be.finite;

      // Test with maximum practical packing (0.95)
      const maxPackingConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.95,
      };
      expect(calculateHydraulicDiameter(maxPackingConfig)).to.be.finite;

      // Verify result is positive
      expect(calculateHydraulicDiameter(testZonalConfig)).to.be.greaterThan(0);
    });
  });

  describe("Flow Velocity", () => {
    /**
     * Test velocity calculation from mass flow rate
     * Reference: Section II, 2.2 - "Air Energy Balance"
     *
     * Physical basis:
     * Mass conservation: ṁ = ρvA
     * Rearranged to: v = ṁ/(ρA)
     *
     * Test conditions:
     * - ṁ = 1.2 kg/s
     * - ρ = 1.2 kg/m³
     * - A = 1.0 m²
     *
     * Expected:
     * v = 1.2/(1.2*1.0) = 1.0 m/s
     *
     * Critical for:
     * - Heat transfer calculations
     * - Pressure drop determination
     * - Reynolds number evaluation
     */
    it("calculates correct velocity from mass flow rate", () => {
      const area = 1.0; // m²
      const massFlow = 1.2; // kg/s
      const velocity = calculateVelocity(
        massFlow,
        standardAirProps.density,
        area
      );
      expect(velocity).to.be.approximately(1.0, 0.001);
    });
  });

  describe("Reynolds Number", () => {
    /**
     * Test Reynolds number calculation
     * Reference: Section IV, 4.1 - "Re_local = (ρ * v * Dh)/μ"
     *
     * Physical basis:
     * Re = ρvD/μ where:
     * - ρ = 1.2 kg/m³ (density)
     * - v = 2.0 m/s (velocity)
     * - D = 0.2 m (hydraulic diameter)
     * - μ = 1.81e-5 Pa·s (viscosity)
     *
     * Expected:
     * Re = (1.2 * 2.0 * 0.2)/(1.81e-5) ≈ 26519
     *
     * Critical for:
     * - Flow regime determination
     * - Heat transfer correlation selection
     * - Turbulence modeling
     */
    it("calculates correct Reynolds number for typical conditions", () => {
      const Re = calculateReynolds(2.0, 1.2, 0.2, 1.81e-5);
      expect(Re).to.be.approximately(26519, 1);
    });

    /**
     * Test Reynolds number scaling with velocity
     * Reference: Section IV - "Turbulent Flow Effects"
     *
     * Physical basis:
     * - Linear relationship with velocity
     * - Direct proportionality
     * - Re₂/Re₁ = v₂/v₁
     *
     * Test validates:
     * - Linear scaling behavior
     * - Dimensional consistency
     * - Physical law compliance
     */
    it("exhibits correct linear scaling with velocity", () => {
      const Re1 = calculateReynolds(1.0, 1.2, 0.2, 1.81e-5);
      const Re2 = calculateReynolds(2.0, 1.2, 0.2, 1.81e-5);
      expect(Re2 / Re1).to.be.approximately(2.0, 0.001);
    });

    /**
     * Test flow regime identification
     * Reference: Section IV - "Flow Regime Transitions"
     *
     * Physical basis:
     * Flow regimes:
     * - Laminar: Re < 2300
     * - Transitional: 2300 < Re < 4000
     * - Turbulent: Re > 4000
     *
     * Critical for:
     * - Heat transfer correlation selection
     * - Pressure drop calculations
     * - Mixing predictions
     */
    it("correctly identifies flow regimes", () => {
      // Test laminar flow (Re < 2300)
      const ReLaminar = calculateReynolds(0.1, 1.2, 0.2, 1.81e-5);
      expect(ReLaminar).to.be.lessThan(2300);

      // Test turbulent flow (Re > 4000)
      const ReTurbulent = calculateReynolds(2.0, 1.2, 0.2, 1.81e-5);
      expect(ReTurbulent).to.be.greaterThan(4000);
    });
  });

  /**
   * Test suite for turbulence intensity calculations
   * Reference: Section IV, 4.1
   */
  describe("Turbulence Intensity", () => {
    /**
     * Test turbulence intensity calculation
     * Reference: Section IV, 4.1 - "I = 0.16 * (Re_local)^(-1/8)"
     *
     * Physical basis:
     * - Empirical correlation for duct flow
     * - Decreases with increasing Reynolds number
     * - Critical for mixing and heat transfer
     *
     * Test validation:
     * For Re = 25000:
     * I = 0.16 * (25000)^(-1/8)
     * I = 0.16 * (25000)^(-0.125)
     * I ≈ 0.0451 (4.51%)
     *
     */
    it("calculates correct turbulence intensity for typical flow", () => {
      const Re = 25000;
      const expected = 0.16 * Math.pow(Re, -0.125);
      const I = calculateTurbulence(Re);
      expect(I).to.be.approximately(expected, 0.0001);
    });

    /**
     * Test turbulence intensity trend
     * Reference: Section IV, 4.1
     *
     * Physical basis:
     * - Turbulence decreases with increasing Reynolds number
     * - Follows power law relationship
     * - Limited by minimum value
     */
    it("shows correct trend with Reynolds number", () => {
      const Re1 = 10000;
      const Re2 = 20000;

      const I1 = calculateTurbulence(Re1);
      const I2 = calculateTurbulence(Re2);

      expect(I2).to.be.lessThan(I1);
    });
  });

  describe("Heat Transfer Coefficient", () => {
    /**
     * Test heat transfer coefficient calculation
     * Reference: Section III, 3.2 - "Convective Heat Transfer"
     *
     * Physical basis:
     * Dittus-Boelter correlation:
     * Nu = 0.023 * Re^0.8 * Pr^0.4
     * h = Nu * k/D
     *
     * Test conditions:
     * - Re = 25000
     * - Pr = 0.71
     * - k = 0.026 W/(m·K)
     * - D = 0.2 m
     */
    it("calculates correct heat transfer coefficient", () => {
      const h = calculateHeatTransfer(25000, 0.71, 0.026, 0.2);
      // Manual calculation of expected value
      const Nu = 0.023 * Math.pow(25000, 0.8) * Math.pow(0.71, 0.4);
      const expected = (Nu * 0.026) / 0.2;
      expect(h).to.be.approximately(expected, 0.1);
    });

    /**
     * Test Reynolds number dependence
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis:
     * - h ∝ Re^0.8 (turbulent flow)
     * - Key relationship for forced convection
     * - Critical for cooling performance
     *
     * Test validates:
     * - Power law relationship
     * - Physical correlation
     * - Model consistency
     */
    it("shows correct Reynolds number dependence", () => {
      const h1 = calculateHeatTransfer(25000, 0.71, 0.026, 0.2);
      const h2 = calculateHeatTransfer(50000, 0.71, 0.026, 0.2);
      const ratio = h2 / h1;
      const expected = Math.pow(2, 0.8); // (Re2/Re1)^0.8
      expect(ratio).to.be.approximately(expected, 0.01);
    });
  });

  describe("Pressure Drop", () => {
    /**
     * Test pressure drop calculation
     * Reference: Section IV - "Flow distribution patterns across container"
     *
     * Physical basis:
     * ΔP = f * (ρv²/2) where:
     * - f = BASE_RESISTANCE * (1 + packingFactor)
     * - ρv²/2 = dynamic pressure
     *
     * Test conditions:
     * - v = 2.0 m/s
     * - ρ = 1.2 kg/m³
     * - packingFactor = 0.8
     *
     * Critical for:
     * - Fan power requirements
     * - Flow distribution
     * - System efficiency
     */
    it("calculates correct pressure drop for typical conditions", () => {
      const velocity = 2.0;
      const density = 1.2;
      const dp = calculatePressureDrop(velocity, density, testZonalConfig);

      // Manual calculation
      const dynamicPressure = 0.5 * density * Math.pow(velocity, 2);
      const resistanceFactor =
        FLOW_CONSTANTS.BASE_RESISTANCE *
        (1 + testZonalConfig.commodityPackingFactor);
      const expected = resistanceFactor * dynamicPressure;

      expect(dp).to.be.approximately(expected, 0.1);
    });

    /**
     * Test velocity scaling of pressure drop
     * Reference: Section IV - "Flow Resistance"
     *
     * Physical basis:
     * - Quadratic relationship with velocity
     * - ΔP ∝ v²
     * - Fundamental fluid dynamics principle
     *
     * Test validates:
     * - Quadratic scaling
     * - Energy conservation
     * - Physical behavior
     */
    it("exhibits quadratic scaling with velocity", () => {
      const v1 = 1.0;
      const v2 = 2.0;
      const density = 1.2;

      const dp1 = calculatePressureDrop(v1, density, testZonalConfig);
      const dp2 = calculatePressureDrop(v2, density, testZonalConfig);

      // Pressure drop should scale with velocity squared
      expect(dp2 / dp1).to.be.approximately(4.0, 0.01);
    });

    /**
     * Test packing factor influence
     * Reference: Section IV - "Pack_factor = BASE_FACTOR * height_effect * compression"
     *
     * Physical basis:
     * - Higher packing increases resistance
     * - Linear relationship with (1 + packingFactor)
     * - Models produce arrangement effects
     *
     * Test validates:
     * - Packing factor sensitivity
     * - Linear scaling
     * - Physical consistency
     */
    it("responds correctly to packing factor", () => {
      const velocity = 2.0;
      const density = 1.2;
      const looseConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.6,
      };
      const denseConfig: ZonalConfig = {
        ...testZonalConfig,
        commodityPackingFactor: 0.9,
      };

      const dpLoose = calculatePressureDrop(velocity, density, looseConfig);
      const dpDense = calculatePressureDrop(velocity, density, denseConfig);

      const expectedRatio = (1 + 0.9) / (1 + 0.6);
      expect(dpDense / dpLoose).to.be.approximately(expectedRatio, 0.01);
    });
  });

  describe("Flow Area", () => {
    /**
     * Test flow area calculation
     * Reference: Section IV - "Flow distribution patterns across container"
     *
     * Physical basis:
     * A_flow = A_total * (1 - packingFactor)
     *
     * Test conditions:
     * - 1x1m cross section
     * - 0.8 packing factor
     * Expected: 0.2 m²
     *
     * Critical for:
     * - Velocity calculations
     * - Mass flow distribution
     * - Pressure drop estimation
     */
    it("calculates correct flow area", () => {
      const area = calculateFlowArea(testZonalConfig);
      const expected =
        testZonalConfig.zoneDimensions.y *
        testZonalConfig.zoneDimensions.z *
        (1 - testZonalConfig.commodityPackingFactor);
      expect(area).to.be.approximately(expected, 0.001);
    });

    /**
     * Test geometric scaling of flow area
     * Reference: Section IV - "Flow Distribution"
     *
     * Physical basis:
     * - Flow area = y*z * (1 - packingFactor)
     * - Base dimensions: y = 0.5m, z = 0.75m
     * - Base area = 0.5 * 0.75 * (1-0.8) = 0.075m²
     *
     * Test case - double dimensions:
     * - Scaled y = 1.0m, z = 1.5m
     * - Scaled area = 1.0 * 1.5 * (1-0.8) = 0.3m²
     * - Expected ratio = (1.0 * 1.5)/(0.5 * 0.75) = 4.0
     */
    it("scales correctly with dimensions", () => {
      const scaledConfig = {
        ...testZonalConfig,
        zoneDimensions: {
          x: testZonalConfig.zoneDimensions.x, // x dimension doesn't affect flow area
          y: testZonalConfig.zoneDimensions.y * 2, // Double height
          z: testZonalConfig.zoneDimensions.z * 2, // Double width
        },
      };

      const baseArea = calculateFlowArea(testZonalConfig);
      const scaledArea = calculateFlowArea(scaledConfig);

      // Verify base area calculation
      const expectedBaseArea =
        testZonalConfig.zoneDimensions.y *
        testZonalConfig.zoneDimensions.z *
        (1 - testZonalConfig.commodityPackingFactor);
      expect(baseArea).to.be.approximately(
        expectedBaseArea,
        testZonalConfig.tolerance.geometric
      );

      // Verify scaled area calculation
      const expectedScaledArea =
        scaledConfig.zoneDimensions.y *
        scaledConfig.zoneDimensions.z *
        (1 - scaledConfig.commodityPackingFactor);
      expect(scaledArea).to.be.approximately(
        expectedScaledArea,
        testZonalConfig.tolerance.geometric
      );

      // Verify scaling ratio
      const expectedRatio =
        (scaledConfig.zoneDimensions.y * scaledConfig.zoneDimensions.z) /
        (testZonalConfig.zoneDimensions.y * testZonalConfig.zoneDimensions.z);
      expect(scaledArea / baseArea).to.be.approximately(
        expectedRatio,
        testZonalConfig.tolerance.geometric
      );
      expect(scaledArea / baseArea).to.be.approximately(
        4.0,
        testZonalConfig.tolerance.geometric
      );
    });
  });

  describe("Friction Factor", () => {
    /**
     * Test friction factor calculation
     * Reference: Section IV - "Flow Resistance"
     *
     * Physical basis:
     * - Laminar: f = 64/Re (Re < 2300)
     * - Turbulent smooth: f = 0.316/Re^0.25
     * - Turbulent rough: Colebrook-White equation
     *
     * Critical for:
     * - Pressure drop prediction
     * - Energy loss calculation
     * - Flow resistance modeling
     */
    it("calculates correct friction factor for different regimes", () => {
      // Laminar flow
      const fLaminar = calculateFrictionFactor(1000, 0.2);
      expect(fLaminar).to.be.approximately(64 / 1000, 0.001);

      // Turbulent flow (smooth pipe)
      const fTurbulent = calculateFrictionFactor(50000, 0.2);
      expect(fTurbulent).to.be.approximately(
        0.316 * Math.pow(50000, -0.25),
        0.001
      );
    });

    /**
     * Test roughness effects
     * Reference: Section IV - "Flow Resistance"
     *
     * Physical basis:
     * - Increased roughness increases friction
     * - Effect more pronounced at high Re
     * - Transitions from smooth to fully rough
     *
     * Test validates:
     * - Roughness sensitivity
     * - Physical behavior
     * - Regime transitions
     */
    it("shows correct roughness dependence", () => {
      const Re = 1e5;
      const diameter = 0.2;

      const fSmooth = calculateFrictionFactor(Re, diameter, 1e-6);
      const fRough = calculateFrictionFactor(Re, diameter, 1e-3);

      expect(fRough).to.be.greaterThan(fSmooth);
    });
  });

  describe("Heat Transfer Area", () => {
    /**
     * Test heat transfer area calculation
     * Reference: Section III, 3.2 - "Convective Heat Transfer"
     *
     * Physical basis:
     * Total area = wall area + produce surface area
     * - Wall area = perimeter * length
     * - Produce area = volume * packingFactor * specificSurfaceArea
     *
     * Critical for:
     * - Heat transfer rates
     * - Cooling capacity
     * - System performance
     */
    it("calculates correct total heat transfer area", () => {
      const area = calculateHeatTransferArea(testZonalConfig);

      // Manual calculation
      const wallArea =
        2 *
        (testZonalConfig.zoneDimensions.y + testZonalConfig.zoneDimensions.z) *
        testZonalConfig.zoneDimensions.x;
      const volume =
        testZonalConfig.zoneDimensions.x *
        testZonalConfig.zoneDimensions.y *
        testZonalConfig.zoneDimensions.z;
      const produceArea = volume * testZonalConfig.commodityPackingFactor! * 50;
      const expected = wallArea + produceArea;

      expect(area).to.be.approximately(expected, 0.1);
    });

    /**
     * Test scaling behavior of heat transfer area
     * Reference: Section III - "Heat Transfer Mechanisms"
     *
     * Physical basis:
     * Total area = Wall area + Produce surface area where:
     * - Wall area = 2(yx + zx) = perimeter * length
     * - Produce area = V * packingFactor * specificSurfaceArea
     *
     * Base case (0.75m × 0.5m × 0.75m):
     * - Wall area = 2(0.5*0.75 + 0.75*0.75) = 2.25 m²
     * - Volume = 0.75 * 0.5 * 0.75 = 0.28125 m³
     * - Produce area = 0.28125 * 0.8 * 50 = 11.25 m²
     * - Total = 13.5 m²
     *
     * Double case (1.5m × 1.0m × 1.5m):
     * - Wall area = 2(1.0*1.5 + 1.5*1.5) = 9.0 m²
     * - Volume = 1.5 * 1.0 * 1.5 = 2.25 m³
     * - Produce area = 2.25 * 0.8 * 50 = 90 m²
     * - Total = 99 m²
     *
     * Ratio ≈ 7.33 (not exactly 8 due to different scaling of wall vs produce area)
     */
    it("exhibits correct dimensional scaling", () => {
      const doubleConfig = {
        ...testZonalConfig,
        zoneDimensions: {
          x: testZonalConfig.zoneDimensions.x * 2,
          y: testZonalConfig.zoneDimensions.y * 2,
          z: testZonalConfig.zoneDimensions.z * 2,
        },
      };

      // Calculate base areas
      const baseArea = calculateHeatTransferArea(testZonalConfig);

      // Calculate expected base components
      const baseWallArea =
        2 *
        (testZonalConfig.zoneDimensions.y * testZonalConfig.zoneDimensions.x +
          testZonalConfig.zoneDimensions.z * testZonalConfig.zoneDimensions.x);
      const baseVolume =
        testZonalConfig.zoneDimensions.x *
        testZonalConfig.zoneDimensions.y *
        testZonalConfig.zoneDimensions.z;
      const specificSurfaceArea = 50; // m²/m³, from implementation
      const baseProduceArea =
        baseVolume *
        testZonalConfig.commodityPackingFactor *
        specificSurfaceArea;
      const expectedBaseArea = baseWallArea + baseProduceArea;

      // Verify base area calculation
      expect(baseArea).to.be.approximately(
        expectedBaseArea,
        testZonalConfig.tolerance.geometric
      );

      // Calculate doubled area
      const doubleArea = calculateHeatTransferArea(doubleConfig);

      // Calculate expected scaling ratio
      const doubleWallArea = baseWallArea * 4; // Wall area scales with length²
      const doubleVolume = baseVolume * 8; // Volume scales with length³
      const doubleProduceArea =
        doubleVolume *
        doubleConfig.commodityPackingFactor *
        specificSurfaceArea;
      const expectedDoubleArea = doubleWallArea + doubleProduceArea;
      const expectedRatio = expectedDoubleArea / expectedBaseArea;

      // Verify scaling ratio
      expect(doubleArea / baseArea).to.be.approximately(
        expectedRatio,
        testZonalConfig.tolerance.geometric
      );

      // Additional validation checks
      expect(doubleArea).to.be.greaterThan(baseArea);

      // Verify produce area dominates
      const produceAreaRatio = baseProduceArea / baseWallArea;
      expect(produceAreaRatio).to.be.greaterThan(1);
    });
  });
});