import { expect } from "chai";
import { ZonalConfig } from "./Zone.js";
import { Position } from "./Position.js";
import { SystemStateManager, ZonalState } from "./SystemState.js";

describe("SystemStateManager", () => {
  // Test configuration
  const config: ZonalConfig = {
    zoneDimensions: { x: 1.0, y: 1.0, z: 1.0 },
    systemDimensions: { x: 3.0, y: 2.0, z: 2.0 },
    numZones: 3,
    numLayers: 2,
    numPallets: 2,
    tolerance: 1e-6,
    packingFactor: 0.8,
  };

  // Helper to create initial states
  const createInitialStates = (): Map<string, ZonalState> => {
    const states = new Map<string, ZonalState>();
    for (let i = 0; i < config.numZones; i++) {
      for (let j = 0; j < config.numLayers; j++) {
        for (let k = 0; k < config.numPallets; k++) {
          const pos = new Position(i, j, k);
          states.set(pos.toString(), {
            productTemp: 20,
            productMoisture: 0.8,
            airTemp: 15,
            airHumidity: 0.6,
            velocity: 2.0,
          });
        }
      }
    }
    return states;
  };

  describe("Initialization", () => {
    /**
     * Test proper initialization of system state
     * Reference: Section XI, 11.2 - "Step 1: Initialize"
     */
    it("initializes with valid configuration", () => {
      const initialStates = createInitialStates();
      const manager = new SystemStateManager(config, initialStates);

      expect(manager.getCurrentTime()).to.equal(0);
      expect(manager.getTimeStep()).to.be.greaterThan(0);
      expect(manager.getStates().size).to.equal(
        config.numZones * config.numLayers * config.numPallets
      );
    });

    /**
     * Test time step calculation
     * Reference: Section XI, 11.2 - "Time step selection"
     */
    it("calculates appropriate time step", () => {
      const manager = new SystemStateManager(config, createInitialStates());
      const dt = manager.getTimeStep();

      // Check against CFL condition
      const velocity = 2.0; // From initial state
      const dx = config.zoneDimensions.x;
      const cflLimit = dx / velocity;
      expect(dt).to.be.lessThan(cflLimit);

      // Check against thermal diffusion stability
      const alpha = 2.2e-5; // Approximate thermal diffusivity of air
      const foLimit = (0.5 * dx * dx) / alpha;
      expect(dt).to.be.lessThan(foLimit);
    });
  });

  describe("State Evolution", () => {
    /**
     * Test conservation of mass during evolution
     * Reference: Section XI, 11.2 - "Step 2: Time Integration"
     */
    it("conserves mass during evolution", () => {
      const manager = new SystemStateManager(config, createInitialStates());
      const initialMass = calculateTotalMass(manager.getStates());

      manager.evolveState();

      const finalMass = calculateTotalMass(manager.getStates());
      const errors = manager.getConservationErrors();

      // Check relative mass conservation
      const relativeMassError = Math.abs(finalMass - initialMass) / initialMass;
      expect(relativeMassError).to.be.lessThan(1e-6);
      expect(errors.mass).to.be.lessThan(1e-6);
    });

    /**
     * Test conservation of energy during evolution
     * Reference: Section XI, 11.2 - "Step 2: Time Integration"
     */
    it("conserves energy during evolution", () => {
      const manager = new SystemStateManager(config, createInitialStates());
      const initialEnergy = calculateTotalEnergy(manager.getStates());

      manager.evolveState();

      const finalEnergy = calculateTotalEnergy(manager.getStates());
      const errors = manager.getConservationErrors();

      // Check relative energy conservation
      const relativeEnergyError =
        Math.abs(finalEnergy - initialEnergy) / initialEnergy;
      expect(relativeEnergyError).to.be.lessThan(1e-6);
      expect(errors.energy).to.be.lessThan(1e-6);
    });

    /**
     * Test physical constraints enforcement
     * Reference: Section XI, 11.2 - "Step 2.4: Apply constraints"
     */
    it("enforces physical constraints", () => {
      const manager = new SystemStateManager(config, createInitialStates());
      manager.evolveState();

      const states = manager.getStates();
      for (const state of states.values()) {
        // Check temperature bounds
        expect(state.airTemp).to.be.within(-30, 50);

        // Check moisture bounds
        expect(state.productMoisture).to.be.gte(0);
        expect(state.airHumidity).to.be.within(0, 1);

        // Check saturation constraint
        const psat = calculateSaturationPressure(state.airTemp);
        const wsat = (0.622 * psat) / (101325 - psat);
        expect(state.airHumidity).to.be.at.most(wsat);
      }
    });

    /**
     * Test expected temperature evolution
     * Reference: Section XI, 11.2 - "Step 2: Time Integration"
     */
    it("shows expected temperature trends", () => {
      const manager = new SystemStateManager(config, createInitialStates());
      const initialState = manager.getStates().get("1,1,1")!;

      manager.evolveState();

      const finalState = manager.getStates().get("1,1,1")!;

      // Product should cool if initially warmer than air
      if (initialState.productTemp > initialState.airTemp) {
        expect(finalState.productTemp).to.be.lessThan(initialState.productTemp);
      }

      // Air temperature should move toward product temperature
      const initialDiff = Math.abs(
        initialState.productTemp - initialState.airTemp
      );
      const finalDiff = Math.abs(finalState.productTemp - finalState.airTemp);
      expect(finalDiff).to.be.lessThan(initialDiff);
    });
  });

  // Helper functions for tests

  function calculateTotalMass(states: Map<string, ZonalState>): number {
    let totalMass = 0;
    for (const state of states.values()) {
      totalMass += state.productMoisture + state.airHumidity;
    }
    return totalMass;
  }

  function calculateTotalEnergy(states: Map<string, ZonalState>): number {
    const cp = 1006; // Approximate specific heat of air
    let totalEnergy = 0;
    for (const state of states.values()) {
      totalEnergy += cp * (state.productTemp + state.airTemp);
    }
    return totalEnergy;
  }

  function calculateSaturationPressure(temperature: number): number {
    const A = 611.2;
    const B = 17.67;
    const C = 243.5;
    return A * Math.exp((B * temperature) / (temperature + C));
  }
});
