import { writeFileSync } from "fs";
import CoolingSystemCalculator, {
  AirProperties,
  SystemParameters,
  TimeInterval,
} from "./energyCalcs/coolingSystemCalculator.js";

// Convert 60°F to Celsius: (60°F - 32) * 5/9 = 15.56°C
const strawberryParameters: SystemParameters = {
  // Basic respiration and thermal parameters
  rRef: 0.0162, // kg CO₂/kg·h (Reference respiration rate at 5°C for strawberries)
  k: 0.112, // 1/°C (Temperature coefficient for strawberry respiration)
  tRef: 5, // °C (Reference temperature for respiration measurements)
  hResp: 9200, // J/kg CO₂ (Heat of respiration for strawberries)
  mass: 860, // kg (Given mass of strawberries)
  specificHeat: 3950, // J/kg·°C (Specific heat capacity of strawberries)
  tInitial: 15.56, // °C (Given: converted from 60°F)
  tTarget: 2, // °C (Optimal storage temperature for strawberries)
  eRate: 1200000, // J/°C·h (Energy rate coefficient for typical cooling system)

  // Heat transfer parameters
  surfaceArea: 172, // m² (Estimated: ~0.2 m² per kg for packed strawberries)
  heatTransferCoeff: 28, // W/m²·K (Typical for forced air cooling of berries)
  airVelocity: 1.5, // m/s (Recommended air velocity for strawberry cooling)
  relativeHumidity: 90, // % (Recommended humidity for strawberry storage)
  ambientTemp: 4, // °C (Typical cold storage room temperature)

  // Evaporative cooling parameters
  moistureContent: 0.908, // kg water/kg dry matter (90.8% moisture content for fresh strawberries)
  waterActivity: 0.98, // dimensionless (Typical water activity for fresh strawberries)
  surfaceWetness: 0.85, // dimensionless (Surface wetness factor for fresh berries)
  productPorosity: 0.07, // dimensionless (Typical porosity for strawberry tissue)
  massDiffusivity: 1.8e-9, // m²/s (Effective mass diffusivity in strawberry tissue)
  latentHeat: 2.45e6, // J/kg (Latent heat of vaporization at average temperature)

  // Air volume parameters
  roomVolume: 12.47, // m³ (Total storage room volume)
  freeAirSpace: 4.49, // m³ (Available air space = roomVolume - product volume)
  airExchangeRate: 30, // 1/h (Air changes per hour)
  airflowRate: undefined, // m³/h (Volumetric air flow rate)
  productStacking: 0.75, // dimensionless (Stacking factor affecting air flow)
  ventEfficiency: 0.6, // dimensionless (0-1, Ventilation efficiency factor)
};

const timeInterval: TimeInterval = {
  t0: 0, // start time (hours)
  t1: 5, // end time (hours)
  dt: 1 / 12, // 5 minutes expressed in hours (0.0833... hours)
};

const airProperties: AirProperties = {
  density: 1.225, // kg/m³
  specificHeat: 1005, // J/kg·K
  thermalConductivity: 0.024, // W/m·K
  viscosity: 1.81e-5, // Pa·s
  diffusivity: 2.2e-5, // m²/s
};

const calculator = new CoolingSystemCalculator(
  airProperties,
  strawberryParameters,
  timeInterval
);

const result = calculator.calculate();

writeFileSync("./output.json", JSON.stringify(result, undefined, 2));
