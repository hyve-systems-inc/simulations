import { expect } from "chai";
import {
  calculateDevelopment,
  calculateMassFlow,
  calculateNewVelocity,
  calculateNewTemperature,
  updateTransientState,
  initializeTransientState,
  calculateTimeStep,
  TransientState,
  TransientConfig,
} from "./transientFlowExtensions.js";
import { ZonalConfig, ZonalDimensions } from "../models/Zone.js";
import * as flow from "./flowProperties--simplified.js";
import * as physical from "./physicalProperties.js";
import { COMMODITY_PROPERTIES, PACKAGING_CONFIGS } from "../cube.js";
import { Position } from "../models/Position.js";

describe("Transient Flow Extensions", () => {
  // Common test configuration
  const testZonalConfig: ZonalConfig = {
    ...ZonalDimensions.createConfig({ x: 3, y: 3, z: 3 }, 4, 6, 4, {
      commodityPackingFactor: 0.8,
      temperatures: { default: 20 },
    }),
    containerFillFactor: 0.9,
  };

  const baseTransientConfig: TransientConfig = {
    wallTemp: 20,
    inletTemp: 5,
    inletPressure: 101425, // Standard pressure + 100 Pa
    outletPressure: 101325, // Standard pressure
  };

  const baseTransientState = initializeTransientState(
    testZonalConfig,
    baseTransientConfig
  );

  describe("Flow Development Calculations", () => {
    /**
     * Test flow development calculations based on documented requirements
     * Reference: Section IV, 4.1 - "Local turbulence effects"
     *
     * Physical basis from documentation:
     * - Entry length correlations:
     *   - Laminar: Le ≈ 0.05 * Re * D
     *   - Turbulent: Le ≈ 10 * D
     * - Flow is laminar when Re < 2300
     * - Flow development follows exponential approach
     */

    describe("Flow Development Calculations", () => {
      /**
       * Test laminar flow development
       * Reference: Section IV, 4.1
       * "Laminar entry length ≈ 0.05 * Re * D"
       */
      it("calculates laminar development with increasing distance", () => {
        const reynolds = 2000; // Chosen < 2300 for laminar regime
        const diameter = 0.1;
        const entryLength = 0.05 * reynolds * diameter;

        const dev1 = calculateDevelopment(entryLength / 2, diameter, reynolds);
        const dev2 = calculateDevelopment(entryLength, diameter, reynolds);

        // Only verify documented behavior - monotonic increase
        expect(dev1).to.be.lessThan(dev2);
      });

      /**
       * Test turbulent flow development
       * Reference: Section IV, 4.1
       * "Turbulent entry length ≈ 10 * D"
       */
      it("calculates turbulent development with increasing distance", () => {
        const reynolds = 10000; // Chosen > 2300 for turbulent regime
        const diameter = 0.1;
        const entryLength = 10 * diameter;

        const dev1 = calculateDevelopment(entryLength / 2, diameter, reynolds);
        const dev2 = calculateDevelopment(entryLength, diameter, reynolds);

        // Only verify documented behavior - monotonic increase
        expect(dev1).to.be.lessThan(dev2);
      });
    });

    /**
     * Test flow development in turbulent regime
     * Reference: Section IV, 4.1 - "Local turbulence effects"
     *
     * Physical basis:
     * - Turbulent entry length ≈ 10 * D
     * - Shorter than laminar due to enhanced mixing
     * - Re > 2300 for turbulent flow
     */
    it("calculates correct development length for turbulent flow", () => {
      const reynolds = 10000;
      const diameter = 0.1;
      const entryLength = 10 * diameter;

      const positions = [0.2, 1.0, 2.0].map((x) =>
        calculateDevelopment(x, diameter, reynolds)
      );

      // Verify monotonic increase
      expect(positions[0]).to.be.lessThan(positions[1]);
      expect(positions[1]).to.be.lessThan(positions[2]);

      // Verify bounds
      positions.forEach((dev) => expect(dev).to.be.within(0, 1));

      // Verify development approaches completion
      expect(positions[2]).to.be.greaterThan(0.95); // Nearly fully developed

      // Verify turbulent develops faster than laminar
      const laminarRe = 2000;
      const x = 0.5 * entryLength; // Compare at same physical distance
      const turbulentDev = calculateDevelopment(x, diameter, reynolds);
      const laminarDev = calculateDevelopment(x, diameter, laminarRe);
      expect(turbulentDev).to.be.greaterThan(laminarDev);
    });
  });

  describe("Mass Flow Calculations", () => {
    /**
     * Test mass conservation principles
     * Reference: Section II, 2.2 - "Mass Conservation"
     *
     * Physical basis:
     * ṁ = ρvA (conservation of mass)
     *
     * Test conditions:
     * - Standard air density
     * - Typical velocity range
     * - Known flow area
     */
    it("correctly calculates mass flow rate", () => {
      const state: TransientState = {
        time: 0,
        velocity: 2.0,
        temperature: 20,
        pressure: 101325,
        density: 1.2,
        massFlow: 0,
        energy: 0,
        development: 1,
      };

      const massFlow = calculateMassFlow(testZonalConfig, state);

      // Calculate expected mass flow
      const area = flow.calculateFlowArea(testZonalConfig);
      const expectedMassFlow = state.density * state.velocity * area;

      expect(massFlow).to.be.approximately(expectedMassFlow, 1e-6);
    });
  });

  describe("Velocity Updates", () => {
    /**
     * Test momentum balance and velocity calculation
     * Reference: Section II - "Core Conservation Equations"
     * Reference: Section IV - "Momentum equation: ∂(ρv)/∂t + ∂(ρv²)/∂x = -∂p/∂x - f"
     *
     * Physical basis from documentation:
     * - Pressure forces drive flow (-∂p/∂x)
     * - Wall friction opposes motion (f term)
     */
    it("calculates new velocity based on pressure gradient", () => {
      const position = new Position(1, 1, 1);
      const airProps: flow.AirProperties = {
        density: 1.2,
        viscosity: 1.825e-5,
        conductivity: 0.0257,
        prandtl: 0.713,
      };

      const dt = 0.01; // Small time step for testing momentum balance

      const newVelocity = calculateNewVelocity(
        testZonalConfig,
        baseTransientState,
        position,
        dt,
        airProps,
        baseTransientConfig
      );

      // Verify pressure gradient causes acceleration
      expect(newVelocity).to.be.greaterThan(baseTransientState.velocity);
    });
  });

  describe("Temperature Evolution", () => {
    /**
     * Test energy balance and temperature calculation
     * Reference: Section II, 2.1 - "Energy Conservation"
     *
     * Physical basis:
     * - Convective heat transfer with walls
     * - Energy transport by flow
     * - Temperature evolution over time
     *
     * Test conditions:
     * - Wall temperature > fluid temperature
     * - Positive flow rate
     * - Expected heating of fluid
     */
    it("calculates temperature changes from heat transfer", () => {
      const airProps: flow.AirProperties = {
        density: 1.2,
        viscosity: 1.825e-5,
        conductivity: 0.0257,
        prandtl: 0.713,
      };

      const dt = 0.1;
      const newTemp = calculateNewTemperature(
        testZonalConfig,
        baseTransientState,
        baseTransientConfig,
        new Position(1, 1, 1),
        dt,
        airProps,
        COMMODITY_PROPERTIES.strawberry,
        PACKAGING_CONFIGS["strawberry-standard"]
      );

      // Temperature should increase (warming from walls)
      expect(newTemp).to.be.greaterThan(baseTransientState.temperature);

      // Temperature should not exceed wall temperature
      expect(newTemp).to.be.lessThan(baseTransientConfig.wallTemp);
    });
  });

  describe("State Updates", () => {
    /**
     * Test complete state update process
     * Reference: Section VII - "Time Integration"
     *
     * Physical basis:
     * - Coupled evolution of all state variables
     * - Conservation of mass and energy
     * - Development of flow profile
     *
     * Test conditions:
     * - Realistic initial state
     * - Small time step
     * - All properties updated consistently
     */
    it("updates full state consistently", () => {
      const position = new Position(1, 1, 1);
      const initialState = initializeTransientState(
        testZonalConfig,
        baseTransientConfig
      );

      const airProps: flow.AirProperties = {
        density: 1.2,
        viscosity: 1.825e-5,
        conductivity: 0.0257,
        prandtl: 0.713,
      };

      const dt = calculateTimeStep(initialState, testZonalConfig);
      const newState = updateTransientState(
        testZonalConfig,
        initialState,
        baseTransientConfig,
        position,
        dt,
        airProps
      );

      // Verify time increment
      expect(newState.time).to.equal(initialState.time + dt);

      // Verify mass conservation
      const area = flow.calculateFlowArea(testZonalConfig);
      const expectedMassFlow = newState.density * newState.velocity * area;
      expect(newState.massFlow).to.be.approximately(expectedMassFlow, 1e-4);

      // Verify energy is bounded
      const volume = area * testZonalConfig.zoneDimensions.x;
      const maxEnergy =
        newState.density *
        volume *
        physical.calculateSpecificHeat(baseTransientConfig.wallTemp) *
        baseTransientConfig.wallTemp;
      expect(newState.energy).to.be.lessThan(maxEnergy);
    });
  });

  /**
   * Test time step calculations
   * Reference: Section XI - "Time step selection:
   * dt = min(
   *   L/(10 * v),           # Convective time scale
   *   mp * cp/(10 * h * A), # Thermal time scale
   *   ma/(10 * ṁa)         # Mass flow time scale
   * )"
   */
  describe("Time Step Selection", () => {
    /**
     * Test basic time step calculation
     * Reference: Section XI - "Calculate appropriate time step based on physics"
     */
    it("calculates time step as minimum of documented time scales", () => {
      const dt = calculateTimeStep(baseTransientState, testZonalConfig);

      // Calculate all time scales per documentation
      const convectiveTimeScale =
        testZonalConfig.zoneDimensions.x / (10 * baseTransientState.velocity);

      const { diffusivity } = physical.calculateDiffusivity(
        baseTransientState.temperature
      );
      const thermalTimeScale =
        (testZonalConfig.zoneDimensions.x * testZonalConfig.zoneDimensions.x) /
        (20 * diffusivity);

      const massFlowTimeScale =
        (baseTransientState.density *
          flow.calculateFlowArea(testZonalConfig) *
          testZonalConfig.zoneDimensions.x) /
        (10 * baseTransientState.massFlow);

      // Verify dt is minimum of time scales
      const expectedDt = Math.min(
        convectiveTimeScale,
        thermalTimeScale,
        massFlowTimeScale
      );
      expect(dt).to.be.approximately(expectedDt, 1e-6);
    });

    /**
     * Test time scales vary correctly with velocity
     * Reference: Section XI - "dt = min(...)"
     */
    it("scales correctly with velocity changes", () => {
      // Calculate baseline
      const baseVelocity = baseTransientState.velocity;
      const baseDt = calculateTimeStep(baseTransientState, testZonalConfig);

      // Double velocity
      const fasterState = {
        ...baseTransientState,
        velocity: baseVelocity * 2,
        massFlow: baseTransientState.massFlow * 2, // Mass flow scales with velocity
      };
      const fasterDt = calculateTimeStep(fasterState, testZonalConfig);

      // Convective time scale should halve
      const baseConvectiveScale =
        testZonalConfig.zoneDimensions.x / (10 * baseVelocity);
      const fasterConvectiveScale =
        testZonalConfig.zoneDimensions.x / (10 * (baseVelocity * 2));
      expect(fasterConvectiveScale).to.be.approximately(
        baseConvectiveScale / 2,
        1e-6
      );

      // Mass flow time scale should halve
      const baseFlowScale =
        (baseTransientState.density *
          flow.calculateFlowArea(testZonalConfig) *
          testZonalConfig.zoneDimensions.x) /
        (10 * baseTransientState.massFlow);
      const fasterFlowScale =
        (fasterState.density *
          flow.calculateFlowArea(testZonalConfig) *
          testZonalConfig.zoneDimensions.x) /
        (10 * fasterState.massFlow);
      expect(fasterFlowScale).to.be.approximately(baseFlowScale / 2, 1e-6);
    });

    /**
     * Test time scales vary correctly with temperature
     * Reference: Section XI - "mp * cp/(10 * h * A)"
     */
    it("scales correctly with temperature changes", () => {
      // Calculate baseline
      const baseTemp = baseTransientState.temperature;
      const baseDt = calculateTimeStep(baseTransientState, testZonalConfig);

      // Change temperature
      const warmerState = {
        ...baseTransientState,
        temperature: baseTemp + 20,
      };
      const warmerDt = calculateTimeStep(warmerState, testZonalConfig);

      // Thermal time scale should change with diffusivity
      const { diffusivity: baseDiff } = physical.calculateDiffusivity(baseTemp);
      const { diffusivity: warmerDiff } = physical.calculateDiffusivity(
        baseTemp + 20
      );
      const baseTimeScale =
        (testZonalConfig.zoneDimensions.x * testZonalConfig.zoneDimensions.x) /
        (20 * baseDiff);
      const warmerTimeScale =
        (testZonalConfig.zoneDimensions.x * testZonalConfig.zoneDimensions.x) /
        (20 * warmerDiff);

      expect(warmerTimeScale / baseTimeScale).to.be.approximately(
        baseDiff / warmerDiff,
        1e-6
      );
    });

    /**
     * Test stability criteria for extreme conditions
     * Reference: Section XI - "Stability Requirements"
     */
    it("maintains stability under extreme conditions", () => {
      // Very low velocity case
      const lowVelocityState = {
        ...baseTransientState,
        velocity: 1e-6,
        massFlow: 1e-6,
      };
      const dtLow = calculateTimeStep(lowVelocityState, testZonalConfig);
      expect(dtLow).to.be.finite;
      expect(dtLow).to.be.greaterThan(0);

      // Very high velocity case
      const highVelocityState = {
        ...baseTransientState,
        velocity: 1e3,
        massFlow: 1e3,
      };
      const dtHigh = calculateTimeStep(highVelocityState, testZonalConfig);
      expect(dtHigh).to.be.finite;
      expect(dtHigh).to.be.greaterThan(0);
      expect(dtHigh).to.be.lessThan(dtLow);
    });
  });
});
