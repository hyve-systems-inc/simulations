import { expect } from "chai";
import { Position } from "../models/Position.js";
import { ZonalConfig } from "../models/Zone.js";
import * as flow from "./flowProperties.js";
import { significant } from "../lib.js";
import { ZonalState } from "../models/SystemState.js";

// Flow-related constants from original FLOW_CONSTANTS
// Reference: Section IV - "Turbulent Flow Effects"
const FLOW_CONSTANTS = {
  DISTRIBUTION: {
    MAX_EFFECTIVENESS: 1.0, // εmax: maximum flow distribution
    WALL_FACTOR: 0.3, // α: wall effect reduction
    HEIGHT_FACTOR: 2.0, // β: height effect rate
  },
  TURBULENCE: {
    BASE_INTENSITY_COEFF: 0.16, // Empirical coefficient for turbulence intensity
    OBSTACLE_FACTOR: 1.2, // Enhancement due to produce obstacles
    DISTRIBUTION_FACTOR: 0.2, // Flow distribution enhancement factor
  },
  VELOCITY: {
    MIN_VELOCITY: 0.1, // Minimum for effective forced convection (m/s)
    MAX_VELOCITY: 5.0, // Maximum for product safety (m/s)
    PROFILE_FACTOR: 0.1, // Secondary flow magnitude factor
  },
  PACKING: {
    BASE_FACTOR: 0.8, // Typical packing density for produce
    HEIGHT_EFFECT: 0.1, // Vertical variation factor
    COMPRESSION_FACTOR: 0.05, // Compression effect per layer
    EDGE_REDUCTION: 0.9, // Packing reduction at edges
  },
  GEOMETRY: {
    SPECIFIC_SURFACE_AREA: 50, // Typical produce surface area (m²/m³)
    EDGE_RESTRICTION: 1.2, // Flow restriction enhancement at edges
  },
} as const;

// Extract commonly used constants
const { PROFILE_FACTOR, MIN_VELOCITY, MAX_VELOCITY } = FLOW_CONSTANTS.VELOCITY;

const { BASE_FACTOR, EDGE_REDUCTION } = FLOW_CONSTANTS.PACKING;

const { BASE_INTENSITY_COEFF, OBSTACLE_FACTOR, DISTRIBUTION_FACTOR } =
  FLOW_CONSTANTS.TURBULENCE;

const { EDGE_RESTRICTION } = FLOW_CONSTANTS.GEOMETRY;

describe("Flow Property Calculations", () => {
  // Common test configuration
  const testConfig: ZonalConfig = {
    zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
    systemDimensions: { x: 3.0, y: 2.0, z: 2.0 },
    numZones: 3,
    numLayers: 2,
    numPallets: 2,
    tolerance: 1e-6,
    packingFactor: 0.8,
  };

  // Common test state
  const testState: ZonalState = {
    productTemp: 20,
    productMoisture: 0.8,
    airTemp: 15,
    airHumidity: 0.6,
    velocity: 2.0,
  };

  /**
   * Test complete velocity profile
   * Reference: Section IV, 4.3
   * "vi,j = v0 * g(h/H) * h(x/L)"
   */
  it("combines all velocity effects correctly", () => {
    const config = {
      zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
      systemDimensions: { x: 5.0, y: 3.0, z: 2.0 },
      numZones: 5,
      numLayers: 5,
      numPallets: 2,
      tolerance: 1e-6,
      packingFactor: 0.8,
    };

    const baseVelocity = 2.0;

    // Check inlet velocity
    const inletPos = new Position(0, 2, 1);
    const inletVel = flow.calculateAxialVelocityProfile(
      inletPos,
      baseVelocity,
      config
    );
    expect(inletVel).to.be.approximately(baseVelocity, 0.5);

    // Check vertical distribution
    const bottomVel = flow.calculateAxialVelocityProfile(
      new Position(2, 0, 1),
      baseVelocity,
      config
    );
    const centerVel = flow.calculateAxialVelocityProfile(
      new Position(2, 2, 1),
      baseVelocity,
      config
    );
    expect(centerVel).to.be.greaterThan(bottomVel);

    // Check streamwise development
    const positions = Array.from({ length: config.numZones }, (_, i) =>
      flow.calculateAxialVelocityProfile(
        new Position(i, 2, 1),
        baseVelocity,
        config
      )
    );

    // Verify development trend
    for (let i = 1; i < positions.length; i++) {
      const developmentRate =
        Math.abs(positions[i] - positions[i - 1]) / baseVelocity;
      expect(developmentRate).to.be.lessThan(0.2); // Maximum 20% change per zone
    }
  });

  describe("Turbulence Intensity", () => {
    /**
     * Test turbulence intensity scaling with Reynolds number
     * Reference: Section IV, 4.1 - "I = 0.16 * (Re_local)^(-1/8)"
     *
     * Physical basis for test Reynolds numbers:
     * - Re = 10000: Early turbulent regime
     *   Typical for startup conditions or low flow regions
     *   Expected I ≈ 0.16 * (10000)^(-1/8) * 1.2 ≈ 0.059
     *
     * - Re = 20000: Developed turbulent flow
     *   Common operating condition
     *   Expected I ≈ 0.16 * (20000)^(-1/8) * 1.2 ≈ 0.052
     *
     * Intensity decreases with Re^(-1/8) because:
     * - Larger Re stabilizes mean flow
     * - Turbulent fluctuations become relatively smaller
     * - Empirically validated for pipe and duct flows
     */
    it("decreases with increasing Reynolds number", () => {
      const re1 = 10000;
      const re2 = 20000;

      const i1 = flow.calculateTurbulenceIntensity(re1);
      const i2 = flow.calculateTurbulenceIntensity(re2);

      expect(i2).to.be.lessThan(i1);

      // Check scaling relationship
      const ratio = i1 / i2;
      const expectedRatio = Math.pow(2, 1 / 8); // re2/re1 = 2
      expect(ratio).to.be.approximately(expectedRatio, 0.01);
    });

    /**
     * Test absolute turbulence intensity values
     * Reference: Section IV, 4.1
     *
     * Physical basis:
     * - Base correlation I = 0.16 * Re^(-1/8) from pipe flow studies
     * - OBSTACLE_FACTOR = 1.2 accounts for:
     *   - Additional turbulence from produce obstacles
     *   - Flow separation and reattachment
     *   - Enhanced mixing in packed bed regions
     *
     * Test Re = 20000 chosen because:
     * - Well-developed turbulent flow
     * - Common operating condition
     * - Extensive validation data available
     *
     * Expected intensity around 5% (0.05) typical for:
     * - Forced convection cooling
     * - Internal duct flows with obstacles
     * - Similar industrial air handling systems
     */
    it("follows expected scaling law", () => {
      const re = 20000;
      const intensity = flow.calculateTurbulenceIntensity(re, 7);

      const expected = significant(0.16 * Math.pow(re, -1 / 8) * 1.2, 7);
      expect(intensity).to.be.approximately(expected, 1e-6);
      expect(intensity).to.be.within(0.04, 0.06);
    });
  });

  describe("Hydraulic Diameter", () => {
    /**
     * Test hydraulic diameter variation with position
     * Reference: Section IV, 4.1
     *
     * Physical basis for edge effects:
     * - Center position (1,1,1):
     *   - Full packing density
     *   - Maximum flow restriction
     *   - Smaller effective flow area
     *
     * - Edge position (0,0,0):
     *   - Reduced packing density (edge effect = 0.9)
     *   - Wall effects increase free flow area
     *   - Bypass flow channels
     *
     * Expected difference:
     * - Edge Dh typically 10-20% larger due to:
     *   - Lower local packing factor
     *   - Reduced produce surface area
     *   - Wall channeling effects
     */
    it("is larger for edge positions", () => {
      const centerPos = new Position(1, 1, 1);
      const edgePos = new Position(0, 0, 0);

      const centerDh = flow.calculateHydraulicDiameter(centerPos, testConfig);
      const edgeDh = flow.calculateHydraulicDiameter(edgePos, testConfig);

      expect(edgeDh).to.be.greaterThan(centerDh);

      // Check for typical magnitude of edge effect
      const ratio = edgeDh / centerDh;
      expect(ratio).to.be.within(1.1, 1.2);
    });

    /**
     * Test hydraulic diameter scaling with system size
     * Reference: Section IV, 4.1 - Geometric scaling
     *
     * Physical basis for scaling test:
     * - Dh = 4A/P where:
     *   A = cross-sectional area
     *   P = wetted perimeter
     *
     * - For similar geometric configurations:
     *   - Area scales with square of linear dimension
     *   - Perimeter scales linearly
     *   - Therefore Dh scales linearly with size
     *
     * Test uses 2x scaling because:
     * - Large enough to show clear scaling effects
     * - Within practical range for cooling systems
     * - Maintains realistic produce packing geometry
     */
    it("scales with zone dimensions", () => {
      const position = new Position(1, 1, 1);
      const largerConfig = {
        ...testConfig,
        zoneDimensions: { x: 2.0, y: 2.0, z: 2.0 },
        systemDimensions: { x: 6.0, y: 4.0, z: 4.0 },
      };

      const dh1 = flow.calculateHydraulicDiameter(position, testConfig);
      const dh2 = flow.calculateHydraulicDiameter(position, largerConfig);

      // Allow 10% tolerance for edge effects and non-linear terms
      expect(dh2).to.be.approximately(2 * dh1, 0.1 * dh1);
    });

    /**
     * Test hydraulic diameter range validation
     * Reference: Section IV, 4.1
     *
     * Physical basis for expected range:
     * - Minimum: 0.1m
     *   - Based on minimum practical spacing for produce
     *   - Ensures adequate flow channels
     *   - Prevents excessive pressure drop
     *
     * - Maximum: 1.0m
     *   - Limited by container dimensions
     *   - Maintains effective heat transfer
     *   - Ensures adequate air distribution
     */
    it("maintains physical bounds", () => {
      const position = new Position(1, 1, 1);
      const dh = flow.calculateHydraulicDiameter(position, testConfig);

      expect(dh).to.be.within(0.1, 1.0);
    });
  });

  describe("Velocity Profile", () => {
    /**
     * Test completeness and relative magnitudes of velocity components
     * Reference: Section IV, 4.3 - "Flow distribution patterns across container"
     *
     * Physical basis for velocity components:
     * - Axial (primary flow direction):
     *   - Largest component (typically 80-90% of total)
     *   - Driven by fan pressure
     *   - Range 0.5-5.0 m/s based on:
     *     - Minimum: Heat transfer requirements (Nu ∝ Re^0.8)
     *     - Maximum: Product damage and energy considerations
     *
     * - Vertical (secondary flow):
     *   - 10-20% of axial velocity
     *   - Driven by:
     *     - Buoyancy effects (ΔT ≈ 5-10°C)
     *     - Flow redistribution
     *     - Container geometry
     *
     * - Lateral (tertiary flow):
     *   - Smallest component (<10% of axial)
     *   - Results from:
     *     - Non-uniform resistance
     *     - Edge effects
     *     - Packing irregularities
     */
    it("calculates all velocity components", () => {
      const position = new Position(1, 1, 1);
      const profile = flow.calculateVelocityProfile(
        position,
        testState.airTemp,
        testConfig
      );

      expect(profile).to.have.all.keys(["axial", "vertical", "lateral"]);

      // Check relative magnitudes
      expect(profile.axial).to.be.greaterThan(profile.vertical);
      expect(profile.vertical).to.be.greaterThan(profile.lateral);

      // Check specific ratios
      const verticalRatio = profile.vertical / profile.axial;
      const lateralRatio = profile.lateral / profile.axial;
      expect(verticalRatio).to.be.within(0.1, 0.2); // 10-20% of axial
      expect(lateralRatio).to.be.within(0.02, 0.1); // 2-10% of axial
    });

    /**
     * Test velocity bound enforcement
     * Reference: Section IV - FLOW_CONSTANTS
     *
     * Physical basis for velocity bounds:
     * - Minimum (0.1 m/s):
     *   - Ensures forced convection dominance (Gr/Re² < 0.1)
     *   - Maintains turbulent flow (Re > 4000 for typical Dh)
     *   - Provides minimum required heat transfer coefficient
     *     (h ≈ 5-10 W/m²K at 0.1 m/s)
     *
     * - Maximum (5.0 m/s):
     *   - Prevents produce damage (impact force ∝ v²)
     *   - Limits pressure drop (ΔP ∝ v²)
     *   - Controls fan power consumption (P ∝ v³)
     *   - Avoids excessive moisture loss (mass transfer ∝ v⁰·⁸)
     *
     * Vertical/lateral bounds based on:
     * - Conservation of mass
     * - Container geometry constraints
     * - Observed secondary flow patterns
     */
    it("respects velocity bounds", () => {
      const position = new Position(1, 1, 1);
      const profile = flow.calculateVelocityProfile(
        position,
        testState.airTemp,
        testConfig
      );

      // Primary flow bounds
      expect(profile.axial).to.be.within(0.1, 5.0);

      // Secondary flow bounds (based on axial component)
      const maxSecondary = profile.axial * 0.2; // Max 20% of axial
      expect(Math.abs(profile.vertical)).to.be.below(maxSecondary);
      expect(Math.abs(profile.lateral)).to.be.below(maxSecondary);
    });

    /**
     * Test vertical velocity distribution pattern
     * Reference: Section IV, 4.3 - "vi,j = v0 * g(h/H) * h(x/L)"
     *
     * Physical basis for vertical profile:
     * - Parabolic distribution due to:
     *   - Wall friction effects
     *   - Conservation of mass
     *   - Momentum diffusion
     *
     * Expected profile characteristics:
     * - Zero velocity at walls (no-slip condition)
     * - Maximum velocity at mid-height
     * - Symmetric about centerline
     *
     * Test positions:
     * - Bottom (j=0): Wall effects dominate
     * - Middle (j=1): Maximum velocity expected
     * - Top (j=max): Wall effects dominate
     *
     * Profile shape follows modified Poiseuille flow:
     * v(y) = vmax * 4y/H * (1 - y/H)
     * where y/H is normalized height
     */
    it("shows expected vertical distribution", () => {
      const bottomPos = new Position(1, 0, 1);
      const middlePos = new Position(1, 1, 1);
      const topPos = new Position(1, testConfig.numLayers - 1, 1);

      const bottomProfile = flow.calculateVelocityProfile(
        bottomPos,
        testState.airTemp,
        testConfig
      );
      const middleProfile = flow.calculateVelocityProfile(
        middlePos,
        testState.airTemp,
        testConfig
      );
      const topProfile = flow.calculateVelocityProfile(
        topPos,
        testState.airTemp,
        testConfig
      );

      // Verify parabolic profile
      expect(middleProfile.vertical).to.be.greaterThan(bottomProfile.vertical);
      expect(middleProfile.vertical).to.be.greaterThan(topProfile.vertical);

      // Check symmetry (within numerical tolerance)
      expect(Math.abs(bottomProfile.vertical)).to.be.approximately(
        Math.abs(topProfile.vertical),
        1e-6
      );

      // Verify maximum at center follows parabolic law
      const yNorm = 0.5; // normalized height at center
      const expectedRatio = 4 * yNorm * (1 - yNorm); // from parabolic law
      const actualRatio =
        middleProfile.vertical / (testState.velocity * PROFILE_FACTOR);
      expect(actualRatio).to.be.approximately(expectedRatio, 0.01);
    });
  });

  describe("Flow Distribution", () => {
    /**
     * Test vertical variation in flow distribution
     * Reference: Section IV, 4.3 - "εj = εmax * (1 - α*exp(-β*h/H))"
     *
     * Physical basis for height variation:
     * - Bottom layer (j=0):
     *   - Higher flow resistance from:
     *     - Product weight compression
     *     - Condensate accumulation
     *     - Boundary layer development
     *   - Expected distribution factor: 0.7-0.8 × maximum
     *
     * - Middle layer:
     *   - Optimal flow conditions
     *   - Fully developed flow pattern
     *   - Minimal wall effects
     *   - Expected distribution factor: 0.9-1.0 × maximum
     *
     * - Top layer:
     *   - Enhanced flow due to:
     *     - Lower compression
     *     - Free surface effects
     *     - Thermal plume influence
     *   - Expected distribution factor: 0.8-0.9 × maximum
     *
     * Progressive increase with height due to:
     * - Decreasing bulk density
     * - Reduced compression
     * - Thermal buoyancy effects
     */
    it("varies with height", () => {
      const positions = [
        new Position(1, 0, 1), // Bottom
        new Position(1, 1, 1), // Middle
        new Position(1, testConfig.numLayers - 1, 1), // Top
      ];

      const distributions = positions.map((pos) =>
        flow.calculateFlowDistribution(pos, testConfig)
      );

      // Verify progressive increase with height
      expect(distributions[1]).to.be.greaterThan(distributions[0]);
      expect(distributions[2]).to.be.greaterThan(distributions[1]);

      // Check relative magnitudes
      const bottomRatio = distributions[0] / distributions[1];
      const topRatio = distributions[2] / distributions[1];
      expect(bottomRatio).to.be.within(0.7, 0.8); // Bottom layer reduction
      expect(topRatio).to.be.within(1.1, 1.2); // Top layer enhancement
    });

    /**
     * Test flow distribution equation
     * Reference: Section IV, 4.3
     * "εj = εmax * (1 - α*exp(-β*h/H))"
     */
    it("calculates correct flow distribution", () => {
      const config = {
        zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
        systemDimensions: { x: 3.0, y: 3.0, z: 2.0 },
        numZones: 3,
        numLayers: 5,
        numPallets: 2,
        tolerance: 1e-6,
        packingFactor: 0.8,
      };

      // Check bottom wall effect
      const bottomPos = new Position(1, 0, 1);
      const bottomDist = flow.calculateFlowDistribution(bottomPos, config);
      expect(bottomDist).to.be.lessThan(
        FLOW_CONSTANTS.DISTRIBUTION.MAX_EFFECTIVENESS
      );

      // Check center maximum
      const centerPos = new Position(1, 2, 1);
      const centerDist = flow.calculateFlowDistribution(centerPos, config);
      expect(centerDist).to.be.approximately(
        FLOW_CONSTANTS.DISTRIBUTION.MAX_EFFECTIVENESS,
        0.1
      );
    });

    /**
     * Test edge effects on flow distribution
     * Reference: Section IV, 4.3 - "Flow distribution patterns across container"
     *
     * Physical basis for edge effects:
     * - Center position (1,1,1):
     *   - Uniform flow resistance
     *   - Optimal packing
     *   - Fully developed flow
     *   - Maximum distribution factor
     *
     * - Edge position (0,1,0):
     *   - Wall effects:
     *     - Increased friction
     *     - Flow channeling
     *     - Reduced mixing
     *   - Lower local resistance:
     *     - Reduced packing density
     *     - Larger void fraction
     *   - Expected reduction: 20-30%
     *
     * Impact on cooling performance:
     * - Non-uniform cooling rates
     * - Temperature gradients
     * - Reduced system efficiency
     */
    it("is lower at edges", () => {
      const centerPos = new Position(1, 1, 1);
      const edgePos = new Position(0, 1, 0);

      const centerDist = flow.calculateFlowDistribution(centerPos, testConfig);
      const edgeDist = flow.calculateFlowDistribution(edgePos, testConfig);

      expect(edgeDist).to.be.lessThan(centerDist);

      // Check magnitude of edge effect
      const edgeRatio = edgeDist / centerDist;
      expect(edgeRatio).to.be.within(0.7, 0.8); // 20-30% reduction at edges
    });

    /**
     * Test overall distribution range
     * Reference: Section IV, 4.3
     *
     * Physical basis for distribution bounds:
     * - Minimum (0.4):
     *   - Worst case corners/edges
     *   - Maximum allowable maldistribution
     *   - Based on minimum cooling requirement
     *   - Corresponds to ~2x nominal cooling time
     *
     * - Maximum (1.0):
     *   - Normalized to optimal conditions
     *   - Center zones, high turbulence
     *   - Theoretical perfect distribution
     *
     * Practical significance:
     * - Uniformity Index calculation
     * - Cooling time prediction
     * - System performance evaluation
     * - Control system tuning
     */
    it("maintains physical bounds", () => {
      const positions = [
        new Position(0, 0, 0), // Corner (worst case)
        new Position(1, 1, 1), // Center (best case)
      ];

      const distributions = positions.map((pos) =>
        flow.calculateFlowDistribution(pos, testConfig)
      );

      // Check bounds
      distributions.forEach((dist) => {
        expect(dist).to.be.within(0.4, 1.0);
      });

      // Verify center has better distribution than corner
      expect(distributions[1]).to.be.greaterThan(distributions[0]);
    });
  });

  describe("Packing Factor", () => {
    /**
     * Test vertical variation in packing density
     * Reference: Section IV - "Pack_factor = BASE_FACTOR * height_effect * compression * edge_effect"
     *
     * Physical basis for height variation:
     * - Bottom layer (j=0):
     *   - Maximum compression from product weight
     *   - Initial packing factor: 0.8 (BASE_FACTOR)
     *   - Compression effect: +5% per layer from above
     *   - Expected total: 0.85-0.90
     *
     * - Top layer (j=max):
     *   - No compression from above
     *   - 10% reduction from settling space
     *   - Potential for movement/redistribution
     *   - Expected total: 0.70-0.75
     *
     * Compression mechanism:
     * - Static load: ρgh (product weight)
     * - Dynamic consolidation from vibration
     * - Plastic deformation of soft produce
     * - Container wall friction effects
     */
    it("varies with height", () => {
      const positions = [
        new Position(1, 0, 1), // Bottom
        new Position(1, testConfig.numLayers - 1, 1), // Top
      ];

      const packingFactors = positions.map((pos) =>
        flow.calculatePackingFactor(pos, testConfig)
      );

      // Verify decrease with height
      expect(packingFactors[1]).to.be.lessThan(packingFactors[0]);

      // Check specific ratios based on physics
      const bottomPF = packingFactors[0];
      const topPF = packingFactors[1];

      expect(bottomPF).to.be.within(0.85, 0.9); // Compressed bottom layer
      expect(topPF).to.be.within(0.7, 0.75); // Uncompressed top layer

      // Verify compression ratio matches model
      const compressionRatio = bottomPF / topPF;
      expect(compressionRatio).to.be.approximately(1.2, 0.05); // 20% total variation
    });

    /**
     * Test edge effects on packing density
     * Reference: Section IV - "Edge_effect = 0.9 for edge positions"
     *
     * Physical basis for edge effects:
     * - Center position (1,1,1):
     *   - Uniform compression
     *   - Maximum packing efficiency
     *   - Stable configuration
     *   - BASE_FACTOR = 0.8
     *
     * - Edge position (0,1,0):
     *   - Wall effects:
     *     - Reduced compression near walls
     *     - Irregular product orientation
     *     - Void spaces from wall mismatch
     *   - 10% reduction (Edge_effect = 0.9)
     *   - Expected total reduction: 15-20%
     *
     * Practical implications:
     * - Preferential flow paths
     * - Non-uniform cooling
     * - Product quality variations
     */
    it("is lower at edges", () => {
      const centerPos = new Position(1, 1, 1);
      const edgePos = new Position(0, 1, 0);

      const centerPacking = flow.calculatePackingFactor(centerPos, testConfig);
      const edgePacking = flow.calculatePackingFactor(edgePos, testConfig);

      expect(edgePacking).to.be.lessThan(centerPacking);

      // Verify edge effect ratio
      const edgeRatio = edgePacking / centerPacking;
      expect(edgeRatio).to.be.approximately(0.9, 0.05); // 10% reduction at edges
    });

    /**
     * Test base packing factor constraints
     * Reference: Section IV - "BASE_FACTOR = 0.8"
     *
     * Physical basis for packing limits:
     * - Minimum (0.5):
     *   - Loosest stable arrangement
     *   - Maximum practical void fraction
     *   - Based on:
     *     - Random sphere packing (0.54)
     *     - Produce shape factors
     *     - Container constraints
     *
     * - Maximum (0.95):
     *   - Densest possible arrangement
     *   - Limited by:
     *     - Product damage threshold
     *     - Required air paths
     *     - Cooling effectiveness
     *
     * Effect on system performance:
     * - Pressure drop ∝ (1-ε)²/ε³ (Ergun equation)
     * - Heat transfer area ∝ (1-ε)
     * - Air flow distribution
     */
    it("respects base packing factor", () => {
      const position = new Position(1, 1, 1);
      const packing = flow.calculatePackingFactor(position, testConfig);

      // Check against physical limits
      expect(packing).to.be.within(0.5, 0.95);

      // Verify relationship to base factor
      const baseFactor = 0.8;
      const tolerance = 0.15; // Allows for height and edge effects
      expect(packing).to.be.within(
        baseFactor * (1 - tolerance),
        baseFactor * (1 + tolerance)
      );
    });

    /**
     * Test packing factor variation across zones
     * Reference: Section IV - Spatial variation effects
     *
     * Physical basis for spatial variation:
     * - Horizontal variation:
     *   - Wall to center: 10-15%
     *   - Due to boundary effects
     *
     * - Vertical variation:
     *   - Bottom to top: 15-20%
     *   - Due to compression
     *
     * - Diagonal variation:
     *   - Corner to center: 25-30%
     *   - Combined effects
     *
     * Impact on cooling performance:
     * - Creates preferential flow paths
     * - Affects temperature uniformity
     * - Influences cooling time
     */
    it("shows consistent spatial variation", () => {
      const positions = {
        corner: new Position(0, 0, 0),
        center: new Position(1, 1, 1),
        edge: new Position(0, 1, 1),
        top: new Position(1, testConfig.numLayers - 1, 1),
      };

      const packingFactors = Object.entries(positions).reduce(
        (acc, [key, pos]) => ({
          ...acc,
          [key]: flow.calculatePackingFactor(pos, testConfig),
        }),
        {} as Record<string, number>
      );

      // Verify expected variations
      expect(packingFactors.center / packingFactors.edge - 1).to.be.within(
        0.1,
        0.15
      ); // Wall effect

      expect(packingFactors.corner / packingFactors.center - 1).to.be.within(
        0.25,
        0.3
      ); // Corner effect

      expect(packingFactors.top / packingFactors.center - 1).to.be.within(
        0.15,
        0.2
      ); // Height effect
    });
  });

  describe("Flow Restriction", () => {
    /**
     * Test edge position effects on flow restriction
     * Reference: Section IV - "EDGE_RESTRICTION = 1.2"
     *
     * Physical basis for edge restriction:
     * - Center position (1,1,1):
     *   - Uniform flow resistance
     *   - Base restriction = 1.0
     *   - Fully developed flow
     *   - Predictable pressure drop
     *
     * - Edge position (0,1,0):
     *   - Enhanced restriction from:
     *     - Wall friction (no-slip condition)
     *     - Flow separation/reattachment
     *     - Boundary layer effects
     *     - Geometric transitions
     *   - EDGE_RESTRICTION = 1.2 based on:
     *     - Empirical studies
     *     - Moody diagram for rough walls
     *     - Enhanced friction factor near walls
     *
     * Impact on system performance:
     * - Local pressure drop: ΔP ∝ restriction_factor
     * - Power requirement: P ∝ restriction_factor
     * - Flow maldistribution
     * - Cooling uniformity
     */
    it("is higher at edges", () => {
      const centerPos = new Position(1, 1, 1);
      const edgePos = new Position(0, 1, 0);

      const centerRestriction = flow.calculateFlowRestriction(
        centerPos,
        testConfig
      );
      const edgeRestriction = flow.calculateFlowRestriction(
        edgePos,
        testConfig
      );

      expect(edgeRestriction).to.be.greaterThan(centerRestriction);

      // Verify edge restriction factor
      const restrictionRatio = edgeRestriction / centerRestriction;
      expect(restrictionRatio).to.be.approximately(1.2, 0.05); // EDGE_RESTRICTION
    });

    /**
     * Test packing density effect on flow restriction
     * Reference: Section IV - Relationship between packing and resistance
     *
     * Physical basis:
     * - Dense packing (0.9):
     *   - Reduced void fraction
     *   - Increased surface area
     *   - Higher friction losses
     *   - Expected restriction increase: 30-40%
     *
     * - Loose packing (0.7):
     *   - Larger flow channels
     *   - Reduced surface contact
     *   - Lower pressure drop
     *   - Base case reference
     *
     * Relationship follows modified Ergun equation:
     * ΔP ∝ (1-ε)²/ε³
     * where ε is void fraction = (1 - packing_factor)
     */
    it("scales with packing factor", () => {
      const position = new Position(1, 1, 1);
      const denseConfig = { ...testConfig, packingFactor: 0.9 };
      const looseConfig = { ...testConfig, packingFactor: 0.7 };

      const denseRestriction = flow.calculateFlowRestriction(
        position,
        denseConfig
      );
      const looseRestriction = flow.calculateFlowRestriction(
        position,
        looseConfig
      );

      expect(denseRestriction).to.be.greaterThan(looseRestriction);

      // Check scaling based on Ergun equation
      const denseVoidFraction = 1 - 0.9;
      const looseVoidFraction = 1 - 0.7;
      const expectedRatio =
        (Math.pow(1 - denseVoidFraction, 2) * Math.pow(looseVoidFraction, 3)) /
        (Math.pow(1 - looseVoidFraction, 2) * Math.pow(denseVoidFraction, 3));

      const actualRatio = denseRestriction / looseRestriction;
      expect(actualRatio).to.be.approximately(expectedRatio, 0.1);
    });

    /**
     * Test position-dependent restriction variations
     * Reference: Section IV - Spatial variation of flow resistance
     *
     * Physical basis for spatial variation:
     * - Vertical variation:
     *   - Bottom: Maximum restriction
     *     - Compression effects
     *     - Condensate accumulation
     *     - Expected: 1.1-1.2 × base
     *
     *   - Top: Minimum restriction
     *     - Reduced compression
     *     - Free surface effects
     *     - Expected: 0.9-1.0 × base
     *
     * - Horizontal variation:
     *   - Center: Base restriction
     *   - Edges: Enhanced restriction
     *   - Corners: Maximum restriction
     *     Due to combined wall effects
     *
     * Impact on design:
     * - Fan sizing requirements
     * - Energy efficiency
     * - Temperature uniformity
     */
    it("varies consistently with position", () => {
      const positions = {
        bottom: new Position(1, 0, 1),
        top: new Position(1, testConfig.numLayers - 1, 1),
        center: new Position(1, 1, 1),
        corner: new Position(0, 0, 0),
      };

      const restrictions = Object.entries(positions).reduce(
        (acc, [key, pos]) => ({
          ...acc,
          [key]: flow.calculateFlowRestriction(pos, testConfig),
        }),
        {} as Record<string, number>
      );

      // Vertical variation
      const verticalRatio = restrictions.bottom / restrictions.top;
      expect(verticalRatio).to.be.within(1.1, 1.3);

      // Corner effect
      const cornerRatio = restrictions.corner / restrictions.center;
      expect(cornerRatio).to.be.within(1.3, 1.5);
    });

    /**
     * Test overall restriction range
     * Reference: Section IV - System constraints
     *
     * Physical basis for restriction bounds:
     * - Minimum (0.8):
     *   - Loosest acceptable packing
     *   - Maximum void fraction
     *   - Limited by:
     *     - Product stability
     *     - Cooling efficiency
     *     - Space utilization
     *
     * - Maximum (2.0):
     *   - Densest practical packing
     *   - Worst-case corner positions
     *   - Limited by:
     *     - Fan capacity
     *     - Energy efficiency
     *     - Product damage risk
     *
     * System implications:
     * - Pressure drop: ΔP = f(restriction) × ρv²/2
     * - Fan power: P = Q × ΔP
     * - Operating costs
     * - Cooling performance
     */
    it("maintains practical bounds", () => {
      const positions = [
        new Position(0, 0, 0), // Maximum restriction (corner)
        new Position(1, 1, 1), // Minimum restriction (center)
      ];

      const restrictions = positions.map((pos) =>
        flow.calculateFlowRestriction(pos, testConfig)
      );

      // Verify bounds
      restrictions.forEach((restriction) => {
        expect(restriction).to.be.within(0.8, 2.0);
      });

      // Corner should have highest restriction
      expect(restrictions[0]).to.be.greaterThan(restrictions[1]);
    });
  });

  describe("Flow Area Calculations", () => {
    /**
     * Test flow area calculation for single zone
     * Reference: Section I, 1.1
     *
     * Physical basis:
     * - Gross area = height × width
     * - Effective area reduced by packing
     * - Edge effects impact available flow area
     *
     * Expected behavior:
     * - Center zones have minimum flow area
     * - Edge zones have increased flow area
     * - Area scales with zone dimensions
     */
    it("calculates single zone flow area", () => {
      const config: ZonalConfig = {
        zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
        systemDimensions: { x: 3.0, y: 2.0, z: 2.0 },
        numZones: 3,
        numLayers: 2,
        numPallets: 2,
        tolerance: 1e-6,
        packingFactor: 0.8,
      };

      const centerPos = new Position(1, 1, 1);
      const edgePos = new Position(0, 1, 1);

      const centerArea = flow.calculateFlowArea(centerPos, config);
      const edgeArea = flow.calculateFlowArea(edgePos, config);

      // Verify edge effect
      expect(edgeArea).to.be.greaterThan(centerArea);

      // Check against gross area
      const grossArea = config.zoneDimensions.y * config.zoneDimensions.z;
      expect(centerArea).to.be.lessThan(grossArea);
      expect(edgeArea).to.be.lessThan(grossArea);
    });

    /**
     * Test total flow area calculation
     * Reference: Section I, 1.1
     *
     * Physical basis:
     * - Parallel flow channels
     * - Multiple layers and pallets
     * - Flow distribution effects
     *
     * Expected behavior:
     * - Total area scales with number of channels
     * - Account for distribution variations
     * - Respect system boundaries
     */
    it("calculates total system flow area", () => {
      const config: ZonalConfig = {
        zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
        systemDimensions: { x: 3.0, y: 2.0, z: 2.0 },
        numZones: 3,
        numLayers: 2,
        numPallets: 2,
        tolerance: 1e-6,
        packingFactor: 0.8,
      };

      const position = new Position(1, 1, 1);
      const singleArea = flow.calculateFlowArea(position, config);
      const totalArea = flow.calculateTotalFlowArea(position, config);

      // Verify scaling with number of channels
      const expectedTotal = singleArea * config.numLayers * config.numPallets;
      expect(totalArea).to.be.approximately(expectedTotal, 1e-6);

      // Check against system cross-section
      const systemCrossSection =
        config.systemDimensions.y * config.systemDimensions.z;
      expect(totalArea).to.be.lessThan(systemCrossSection);
    });

    /**
     * Test area scaling with dimensions
     * Reference: Section I, 1.1
     *
     * Physical basis:
     * - Linear scaling with dimensions
     * - Maintain aspect ratios
     * - Preserve void fraction
     */
    it("scales correctly with dimensions", () => {
      const baseConfig: ZonalConfig = {
        zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
        systemDimensions: { x: 3.0, y: 2.0, z: 2.0 },
        numZones: 3,
        numLayers: 2,
        numPallets: 2,
        tolerance: 1e-6,
        packingFactor: 0.8,
      };

      const scaledConfig = {
        ...baseConfig,
        zoneDimensions: { x: 2.0, y: 2.0, z: 2.0 },
        systemDimensions: { x: 6.0, y: 4.0, z: 4.0 },
      };

      const position = new Position(1, 1, 1);
      const baseArea = flow.calculateFlowArea(position, baseConfig);
      const scaledArea = flow.calculateFlowArea(position, scaledConfig);

      // Verify area scales with square of linear dimension
      expect(scaledArea).to.be.approximately(4 * baseArea, 1e-6);
    });
  });
});
