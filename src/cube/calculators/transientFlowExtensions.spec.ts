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
import { ZonalDimensions } from "../models/Zone.js";
import * as flow from "./flowProperties--simplified.js";
import * as physical from "./physicalProperties.js";

describe("Transient Flow Extensions", () => {
  // Common test configuration
  const baseConfig = ZonalDimensions.createConfig(
    { x: 3, y: 3, z: 3 },
    4,
    6,
    4,
    { packingFactor: 0.8 }
  );

  const baseTransientConfig: TransientConfig = {
    wallTemp: 20,
    inletTemp: 5,
    inletPressure: 101425, // Standard pressure + 100 Pa
    outletPressure: 101325, // Standard pressure
  };

  const baseTransientState = initializeTransientState(
    baseConfig,
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

      const massFlow = calculateMassFlow(baseConfig, state);

      // Calculate expected mass flow
      const area = flow.calculateFlowArea(baseConfig);
      const expectedMassFlow = state.density * state.velocity * area;

      expect(massFlow).to.be.approximately(expectedMassFlow, 1e-6);
    });
  });

  describe("Velocity Updates", () => {
    /**
     * Test momentum balance and velocity calculation
     * Reference: Section II - "Core Conservation Equations"
     *
     * Physical basis:
     * - Pressure forces drive flow
     * - Wall friction opposes motion
     * - Net force determines acceleration
     *
     * Test conditions:
     * - Pressure difference drives flow
     * - Initial velocity = 0
     * - Expected acceleration from pressure gradient
     */
    it("calculates new velocity based on pressure gradient", () => {
      const airProps: flow.AirProperties = {
        density: 1.2,
        viscosity: 1.825e-5,
        conductivity: 0.0257,
        prandtl: 0.713,
      };

      const dt = 0.01;
      const newVelocity = calculateNewVelocity(
        baseConfig,
        baseTransientState,
        dt,
        airProps,
        baseTransientConfig.outletPressure
      );

      // Velocity should increase due to pressure gradient
      expect(newVelocity).to.be.greaterThan(0);

      // Velocity should not exceed theoretical maximum from Bernoulli
      const maxVelocity = Math.sqrt(
        (2 *
          (baseTransientState.pressure - baseTransientConfig.outletPressure)) /
          baseTransientState.density
      );
      expect(newVelocity).to.be.lessThan(maxVelocity);
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
        baseConfig,
        baseTransientState,
        baseTransientConfig,
        dt,
        airProps
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
      const initialState = initializeTransientState(
        baseConfig,
        baseTransientConfig
      );

      const airProps: flow.AirProperties = {
        density: 1.2,
        viscosity: 1.825e-5,
        conductivity: 0.0257,
        prandtl: 0.713,
      };

      const dt = calculateTimeStep(initialState, baseConfig);
      const newState = updateTransientState(
        baseConfig,
        initialState,
        baseTransientConfig,
        dt,
        airProps
      );

      // Verify time increment
      expect(newState.time).to.equal(initialState.time + dt);

      // Verify mass conservation
      const area = flow.calculateFlowArea(baseConfig);
      const expectedMassFlow = newState.density * newState.velocity * area;
      expect(newState.massFlow).to.be.approximately(expectedMassFlow, 1e-4);

      // Verify energy is bounded
      const volume = area * baseConfig.zoneDimensions.x;
      const maxEnergy =
        newState.density *
        volume *
        physical.calculateSpecificHeat(baseTransientConfig.wallTemp) *
        baseTransientConfig.wallTemp;
      expect(newState.energy).to.be.lessThan(maxEnergy);
    });
  });

  describe("Time Step Selection", () => {
    /**
     * Test time step calculation
     * Reference: Section VII, 2.2 - "Stability Criteria"
     *
     * Physical basis:
     * - CFL condition: dt ≤ dx/v (Courant-Friedrichs-Lewy)
     *   Ensures fluid particles don't move more than one cell per time step
     *
     * - Diffusive stability: dt ≤ dx²/(2α)
     *   Prevents numerical instabilities in heat diffusion calculations
     *
     * Test conditions:
     * - Velocity = 2.0 m/s
     *   --> CFL limit = 1.0m / 2.0m/s = 0.5s
     *
     * - dx = 1.0m (from baseConfig)
     * - Temperature = 20°C
     * - Both stability criteria must be satisfied
     */
    it("calculates appropriate time step based on physics", () => {
      const dt = calculateTimeStep(baseTransientState, baseConfig);

      // Verify CFL condition
      const dx = baseConfig.zoneDimensions.x;
      const cflLimit = dx / baseTransientState.velocity;
      expect(dt).to.be.lessThanOrEqual(cflLimit);

      // Verify diffusive stability
      const { diffusivity: alpha } = physical.calculateDiffusivity(
        baseTransientState.temperature
      );
      const diffusiveLimit = (dx * dx) / (2 * alpha);
      expect(dt).to.be.lessThanOrEqual(diffusiveLimit);

      // Verify dt matches the most restrictive limit
      const expectedDt = Math.min(cflLimit, diffusiveLimit);
      expect(dt).to.be.approximately(expectedDt, 1e-6);
    });

    /**
     * Test time step behavior with varying velocities
     * Reference: Section VII, 2.2 - "Stability Criteria"
     *
     * Physical basis:
     * - Higher velocities require smaller time steps
     * - CFL condition becomes more restrictive as velocity increases
     * - Diffusive limit remains constant for fixed temperature
     *
     * Test conditions:
     * - Low velocity (0.5 m/s)
     * - Medium velocity (2.0 m/s)
     * - High velocity (5.0 m/s)
     */
    it("adjusts time step appropriately with velocity changes", () => {
      const velocities = [0.5, 2.0, 5.0];
      const timeSteps = velocities.map((v) => {
        const state = { ...baseTransientState, velocity: v };
        return calculateTimeStep(state, baseConfig);
      });

      // Verify inverse relationship with velocity
      for (let i = 1; i < timeSteps.length; i++) {
        expect(timeSteps[i]).to.be.lessThan(timeSteps[i - 1]);

        // Verify inverse proportionality
        const ratio = timeSteps[i - 1] / timeSteps[i];
        const velocityRatio = velocities[i] / velocities[i - 1];
        expect(ratio).to.be.approximately(velocityRatio, 0.1);
      }
    });

    /**
     * Test time step limits for extreme conditions
     * Reference: Section VII, 2.2 - "Stability Criteria"
     *
     * Physical basis:
     * - Very high velocities require very small time steps
     * - Very low velocities are limited by diffusive stability
     * - System must remain stable at bounds of operation
     *
     * Test conditions:
     * - Near-zero velocity
     * - Maximum expected velocity
     */
    it("handles extreme velocity conditions safely", () => {
      // Test near-zero velocity
      const slowState = { ...baseTransientState, velocity: 1e-6 };
      const dtSlow = calculateTimeStep(slowState, baseConfig);
      expect(dtSlow).to.be.finite;
      expect(dtSlow).to.be.greaterThan(0);

      // Test very high velocity
      const fastState = { ...baseTransientState, velocity: 100.0 };
      const dtFast = calculateTimeStep(fastState, baseConfig);
      expect(dtFast).to.be.finite;
      expect(dtFast).to.be.greaterThan(0);
      expect(dtFast).to.be.lessThan(dtSlow);
    });
  });
});
