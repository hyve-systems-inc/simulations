import {
  SystemState,
  SystemParameters,
  evolveState,
} from "./systemEvolution.js";
import {
  calculateTotalEnergy,
  calculateEnergyFlows,
} from "../physicsV2/energyConservation.js";
import {
  calculateTotalMoisture,
  isHumidityValid,
  saturationHumidityRatio,
} from "../physicsV2/psychrometrics.js";
import {
  productMoistureRate,
  airMoistureRate,
} from "../physicsV2/massConservation.js";
import { calculateTimeStep } from "../physicsV2/time.js";

export class Cube {
  private state: SystemState;
  private params: SystemParameters;
  private initialEnergy: number;
  private initialMoisture: number;
  private currentTimeStep: number;

  constructor(initialState: SystemState, parameters: SystemParameters) {
    this.state = { ...initialState };
    this.params = { ...parameters };
    this.initialEnergy = calculateTotalEnergy(initialState, parameters);
    this.initialMoisture = calculateTotalMoisture(initialState, parameters);
    this.currentTimeStep = calculateTimeStep(parameters);
  }

  public nextDt(): SystemState {
    // Evolve to next state
    this.state = evolveState(this.state, this.params);
    return this.state;
  }

  public simulateFor(duration: number): {
    finalState: SystemState;
    timeSteps: number;
    averageTimeStep: number;
    timeHistory: Array<{
      time: number;
      avgTemp: number;
      coolingPower: number;
      TCPI: number;
      timeStep: number;
    }>;
  } {
    let elapsedTime = 0;
    let steps = 0;
    const timeHistory = [];

    while (elapsedTime < duration) {
      this.nextDt();
      elapsedTime = this.state.t;
      steps++;

      // Record state at this time step
      timeHistory.push({
        time: elapsedTime,
        avgTemp: this.getAverageProductTemperature(),
        coolingPower: this.state.coolingPower,
        TCPI: this.state.TCPI,
        timeStep: this.currentTimeStep,
      });
    }

    return {
      finalState: this.getCurrentState(),
      timeSteps: steps,
      averageTimeStep: elapsedTime / steps,
      timeHistory,
    };
  }

  public getCurrentState(): SystemState {
    return { ...this.state };
  }

  public getParameters(): SystemParameters {
    return { ...this.params };
  }

  public getCurrentTimeStep(): number {
    return this.currentTimeStep;
  }

  private getAverageProductTemperature(): number {
    const allTemps = this.state.productTemp.flat();
    return allTemps.reduce((a, b) => a + b) / allTemps.length;
  }

  public getEnergyBalance(): {
    totalEnergy: number;
    energyChange: number;
    coolingPowerUsed: number;
    timeStep: number;
    energyPerZone: number[];
    coolingEfficiency: number;
  } {
    const currentEnergy = calculateTotalEnergy(this.state, this.params);

    // Calculate energy per zone
    const energyPerZone = this.state.productTemp.map((zoneTemp, i) => {
      return zoneTemp.reduce((sum, temp, j) => {
        return (
          sum + this.params.productMass[i][j] * this.params.specificHeat * temp
        );
      }, 0);
    });

    // Calculate cooling efficiency (actual vs. theoretical maximum)
    const theoreticalMax = this.params.maxCoolingPower * this.currentTimeStep;
    const actualCooling = this.state.coolingPower * this.currentTimeStep;
    const coolingEfficiency = actualCooling / theoreticalMax;

    return {
      totalEnergy: currentEnergy,
      energyChange: currentEnergy - this.initialEnergy,
      coolingPowerUsed: this.state.coolingPower,
      timeStep: this.currentTimeStep,
      energyPerZone,
      coolingEfficiency,
    };
  }

  public getEnergyFlows(): ReturnType<typeof calculateEnergyFlows> {
    return calculateEnergyFlows(this.state, this.params, this.currentTimeStep);
  }

  public getMoistureBalance(): {
    totalMoisture: number;
    moistureChange: number;
    moistureRates: {
      productRates: number[][];
      airRates: number[];
    };
    timeStep: number;
    averageProductMoisture: number;
    moistureDistribution: {
      min: number;
      max: number;
      standardDeviation: number;
    };
  } {
    const currentMoisture = calculateTotalMoisture(this.state, this.params);
    const productRates: number[][] = Array(this.params.zones)
      .fill(0)
      .map(() => Array(this.params.layers).fill(0));
    const airRates: number[] = Array(this.params.zones).fill(0);

    // Calculate moisture rates
    for (let i = 0; i < this.params.zones; i++) {
      for (let j = 0; j < this.params.layers; j++) {
        const mevap =
          -this.params.productMass[i][j] *
          productMoistureRate(0.001, this.params.productMass[i][j]);
        productRates[i][j] = mevap;
      }

      const mdehum = isHumidityValid(
        this.state.airHumidity[i],
        this.state.airTemp[i]
      )
        ? this.state.airHumidity[i] -
          saturationHumidityRatio(this.state.airTemp[i])
        : 0;

      airRates[i] = airMoistureRate(
        0.001,
        mdehum > 0 ? mdehum : 0,
        0,
        this.params.airMass[i]
      );
    }

    // Calculate moisture distribution statistics
    const allMoisture = this.state.productMoisture.flat();
    const avgMoisture =
      allMoisture.reduce((a, b) => a + b) / allMoisture.length;
    const variance =
      allMoisture.reduce((a, b) => a + Math.pow(b - avgMoisture, 2), 0) /
      allMoisture.length;

    return {
      totalMoisture: currentMoisture,
      moistureChange: currentMoisture - this.initialMoisture,
      moistureRates: {
        productRates,
        airRates,
      },
      timeStep: this.currentTimeStep,
      averageProductMoisture: avgMoisture,
      moistureDistribution: {
        min: Math.min(...allMoisture),
        max: Math.max(...allMoisture),
        standardDeviation: Math.sqrt(variance),
      },
    };
  }

  public getPerformanceMetrics(): {
    TCPI: number;
    temperatureUniformity: number;
    moistureUniformity: number;
    coolingRate: number;
    timeStep: number;
    zoneMetrics: Array<{
      avgTemp: number;
      avgMoisture: number;
      coolingEffectiveness: number;
    }>;
  } {
    // Calculate temperature variation
    const allTemps = this.state.productTemp.flat();
    const avgTemp = allTemps.reduce((a, b) => a + b) / allTemps.length;
    const tempVariance =
      allTemps.reduce((a, b) => a + Math.pow(b - avgTemp, 2), 0) /
      allTemps.length;
    const tempUniformity = Math.sqrt(tempVariance);

    // Calculate moisture variation
    const allMoisture = this.state.productMoisture.flat();
    const avgMoisture =
      allMoisture.reduce((a, b) => a + b) / allMoisture.length;
    const moistureVariance =
      allMoisture.reduce((a, b) => a + Math.pow(b - avgMoisture, 2), 0) /
      allMoisture.length;
    const moistureUniformity = Math.sqrt(moistureVariance);

    // Calculate cooling rate (°C/hour)
    const coolingRate =
      (this.state.coolingPower * 3600) /
      (this.params.specificHeat *
        this.state.productTemp.flat().reduce((sum, temp) => sum + temp, 0));

    // Calculate zone-specific metrics
    const zoneMetrics = this.state.productTemp.map((zoneTemp, i) => {
      const zoneMoisture = this.state.productMoisture[i];
      const zoneAvgTemp = zoneTemp.reduce((a, b) => a + b) / zoneTemp.length;
      const zoneAvgMoisture =
        zoneMoisture.reduce((a, b) => a + b) / zoneMoisture.length;

      // Calculate cooling effectiveness for this zone
      const idealCooling = this.params.maxCoolingPower / this.params.zones;
      const actualCooling = this.state.coolingPower / this.params.zones;
      const effectiveness = actualCooling / idealCooling;

      return {
        avgTemp: zoneAvgTemp,
        avgMoisture: zoneAvgMoisture,
        coolingEffectiveness: effectiveness,
      };
    });

    return {
      TCPI: this.state.TCPI,
      temperatureUniformity: tempUniformity,
      moistureUniformity: moistureUniformity,
      coolingRate,
      timeStep: this.currentTimeStep,
      zoneMetrics,
    };
  }

  public getTimeScales(): {
    convective: number;
    thermal: number;
    massFlow: number;
    massTransfer: number;
    limiting: string;
    timeStep: number;
    cflNumber: number;
    fourier: number;
  } {
    const dx = this.params.containerLength / this.params.zones;
    const minAirMass = Math.min(...this.params.airMass);
    const minDensity = this.params.pressure / (287.1 * (40 + 273.15));
    const maxVelocity =
      this.params.airFlow /
      (minDensity * this.params.containerWidth * this.params.containerHeight);

    const minMass = Math.min(...this.params.productMass.flat());
    const maxArea = Math.max(...this.params.productArea.flat());
    const thermalDiffusivity =
      (this.params.baseHeatTransfer * maxArea) /
      (minMass * this.params.specificHeat);

    const timeScales = {
      convective: dx / maxVelocity,
      thermal: (0.5 * dx * dx) / thermalDiffusivity,
      massFlow: minAirMass / this.params.airFlow,
      massTransfer: dx / this.params.evaporativeMassTransfer,
    };

    const limiting = Object.entries(timeScales).reduce((a, b) =>
      a[1] < b[1] ? a : b
    )[0];

    // Calculate dimensionless numbers
    const cflNumber = (maxVelocity * this.currentTimeStep) / dx;
    const fourier = (thermalDiffusivity * this.currentTimeStep) / (dx * dx);

    return {
      ...timeScales,
      limiting,
      timeStep: this.currentTimeStep,
      cflNumber,
      fourier,
    };
  }

  public validateState(): {
    isValid: boolean;
    violations: string[];
    warnings: string[];
    metrics: {
      maxTempGradient: number;
      maxMoistureGradient: number;
      stabilityMetrics: {
        cfl: number;
        fourier: number;
      };
    };
  } {
    const violations: string[] = [];
    const warnings: string[] = [];

    // Check temperature bounds
    const minTemp = Math.min(
      ...this.state.airTemp,
      ...this.state.productTemp.flat()
    );
    const maxTemp = Math.max(
      ...this.state.airTemp,
      ...this.state.productTemp.flat()
    );

    if (minTemp < this.params.coilTemp) {
      violations.push(`Temperature below coil temperature: ${minTemp}°C`);
    }
    if (maxTemp > 50) {
      violations.push(`Temperature exceeds maximum: ${maxTemp}°C`);
    }

    // Check humidity bounds
    for (let i = 0; i < this.params.zones; i++) {
      if (!isHumidityValid(this.state.airHumidity[i], this.state.airTemp[i])) {
        violations.push(
          `Invalid humidity in zone ${i}: ${this.state.airHumidity[i]}`
        );
      }
    }

    // Check TCPI bounds
    if (this.state.TCPI < 0 || this.state.TCPI > 1) {
      violations.push(`Invalid TCPI: ${this.state.TCPI}`);
    }

    // Check cooling power bounds
    if (
      this.state.coolingPower < 0 ||
      this.state.coolingPower > this.params.maxCoolingPower
    ) {
      violations.push(`Invalid cooling power: ${this.state.coolingPower}W`);
    }

    // Calculate gradients
    const tempGradients = this.state.productTemp
      .map((zone) =>
        zone
          .map((temp, j) => (j > 0 ? Math.abs(temp - zone[j - 1]) : 0))
          .filter((x) => x > 0)
      )
      .flat();
    const maxTempGradient = Math.max(...tempGradients);

    const moistureGradients = this.state.productMoisture
      .map((zone) =>
        zone
          .map((moisture, j) => (j > 0 ? Math.abs(moisture - zone[j - 1]) : 0))
          .filter((x) => x > 0)
      )
      .flat();
    const maxMoistureGradient = Math.max(...moistureGradients);

    // Check stability metrics
    const { cflNumber, fourier } = this.getTimeScales();

    if (cflNumber > 1) {
      warnings.push(`CFL condition violated: ${cflNumber}`);
    }
    if (fourier > 0.5) {
      warnings.push(`Fourier condition violated: ${fourier}`);
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
      metrics: {
        maxTempGradient,
        maxMoistureGradient,
        stabilityMetrics: {
          cfl: cflNumber,
          fourier,
        },
      },
    };
  }
}
