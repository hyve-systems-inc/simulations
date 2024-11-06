import { significant } from "../lib.js";
import { SystemParameters, SystemState } from "../modelV2/systemEvolution.js";

/**
 * Energy conservation calculations
 * References Section II
 */

/**
 * Calculate air energy rate of change
 * From Section II, equation 2.1:
 * ma,i * cp,air * dTa,i/dt = ṁa * cp,air * (Ta,i-1 - Ta,i) + Σj(Qp-a,i,j) + Qwalls,i - Qcool,i
 */
export function airTemperatureRate(
  massAir: number,
  cpAir: number,
  massFlow: number,
  TaIn: number,
  TaOut: number,
  QproductAir: number, // Heat flow FROM product TO air (positive = heating air)
  Qwalls: number, // Heat flow FROM walls TO air (positive = heating air)
  Qcool: number, // Heat removal BY cooling unit (positive = cooling air)
  sigFigs?: number
): number {
  const dTadt =
    (massFlow * cpAir * (TaIn - TaOut) + // Air flow term
      QproductAir + // Heat from product
      Qwalls - // Heat from walls
      Qcool) / // Heat removal by cooling
    (massAir * cpAir);
  return significant(dTadt, sigFigs);
}

/**
 * Calculate product energy rate of change
 * From Section II, equation 2.1:
 * mp,i,j * cp * dTp,i,j/dt = Qresp,i,j - Qconv,i,j - Qevap,i,j
 */
export function productTemperatureRate(
  Qresp: number, // Heat FROM respiration (positive = heating product)
  Qconv: number, // Heat TO air (positive = cooling product)
  Qevap: number, // Heat loss from evaporation (positive = cooling product)
  mass: number,
  cp: number,
  sigFigs?: number
): number {
  const dTdt =
    (Qresp - // Respiration adds heat
      Qconv - // Convection removes heat when product is warmer than air
      Qevap) / // Evaporation always removes heat
    (mass * cp);
  return significant(dTdt, sigFigs);
}

export const calculateTotalEnergy = (
  state: SystemState,
  params: SystemParameters
): number => {
  let totalEnergy = 0;
  // Sum up thermal energy in products
  for (let i = 0; i < params.zones; i++) {
    for (let j = 0; j < params.layers; j++) {
      totalEnergy +=
        params.productMass[i][j] *
        params.specificHeat *
        state.productTemp[i][j];
    }
  }
  // Sum up thermal energy in air
  for (let i = 0; i < params.zones; i++) {
    totalEnergy +=
      params.airMass[i] * params.airSpecificHeat * state.airTemp[i];
  }
  return totalEnergy;
};

export function calculateEnergyFlows(
  state: SystemState,
  params: SystemParameters,
  dt: number
) {
  // Calculate energy stored in product
  let productEnergy = 0;
  for (let i = 0; i < params.zones; i++) {
    for (let j = 0; j < params.layers; j++) {
      productEnergy +=
        params.productMass[i][j] *
        params.specificHeat *
        state.productTemp[i][j];
    }
  }

  // Calculate energy stored in air
  let airEnergy = 0;
  for (let i = 0; i < params.zones; i++) {
    airEnergy += params.airMass[i] * params.airSpecificHeat * state.airTemp[i];
  }

  // Calculate total respiration heat across all product
  let respHeat = 0;
  for (let i = 0; i < params.zones; i++) {
    for (let j = 0; j < params.layers; j++) {
      respHeat +=
        params.respirationRate *
        Math.exp(
          params.respirationTempCoeff *
            (state.productTemp[i][j] - params.respirationRefTemp)
        ) *
        params.productMass[i][j] *
        params.respirationEnthalpy *
        dt;
    }
  }

  const sensibleCooling =
    params.airFlow *
    params.airSpecificHeat *
    (state.airTemp[0] - params.coilTemp) *
    dt;

  const energyFlows = {
    energyStores: {
      productEnergy, // J
      airEnergy, // J
      totalEnergy: productEnergy + airEnergy,
    },
    heatFlows: {
      respirationHeat: respHeat, // J over dt
      sensibleCooling, // J over dt
      actualCooling: state.coolingPower * dt,
    },
    temperatures: {
      productTempRange: {
        min: Math.min(...state.productTemp.flat()),
        max: Math.max(...state.productTemp.flat()),
      },
      airTempRange: {
        min: Math.min(...state.airTemp),
        max: Math.max(...state.airTemp),
      },
    },
  };

  //   console.log(energyFlows);

  return energyFlows;
}
