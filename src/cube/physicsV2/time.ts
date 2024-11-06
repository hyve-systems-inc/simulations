import { SystemParameters } from "../modelV2/systemEvolution.js";

/**
 * Calculate maximum stable time step according to Section 11.2
 * @returns Time step in seconds
 */
export function calculateTimeStep(params: SystemParameters): number {
  // Calculate worst-case air velocity
  const minDensity = params.pressure / (287.1 * (40 + 273.15)); // at 40°C
  const velocity =
    params.airFlow /
    (minDensity * params.containerWidth * params.containerHeight);

  // 1. Convective time scale: L/(10 * v)
  const dtConvective = params.containerLength / (10 * velocity);

  // 2. Thermal time scale: mp * cp/(10 * h * A)
  const minMass = Math.min(...params.productMass.flat());
  const maxArea = Math.max(...params.productArea.flat());
  const dtThermal =
    (minMass * params.specificHeat) / (10 * params.baseHeatTransfer * maxArea);

  // 3. Mass flow time scale: ma/(10 * ṁa)
  const minAirMass = Math.min(...params.airMass);
  const dtMassFlow = minAirMass / (10 * params.airFlow);

  // Take minimum of all time scales
  const dt = Math.min(dtConvective, dtThermal, dtMassFlow);

  return dt;
}

/**
 * Debug version that prints intermediate calculations
 */
export function calculateTimeStepDebug(params: SystemParameters): number {
  console.log("\nStep Size Debug:");

  // Calculate worst-case air velocity
  const minDensity = params.pressure / (287.1 * (40 + 273.15));
  const velocity =
    params.airFlow /
    (minDensity * params.containerWidth * params.containerHeight);
  console.log("minDensity =", minDensity, "kg/m³");
  console.log("velocity =", velocity, "m/s");

  // 1. Convective time scale
  const dtConvective = params.containerLength / (10 * velocity);
  console.log("\nTime Scales:");
  console.log("dtConvective = L/(10*v) =", dtConvective, "s");

  // 2. Thermal time scale
  const minMass = Math.min(...params.productMass.flat());
  const maxArea = Math.max(...params.productArea.flat());
  const dtThermal =
    (minMass * params.specificHeat) / (10 * params.baseHeatTransfer * maxArea);
  console.log("minMass =", minMass, "kg");
  console.log("maxArea =", maxArea, "m²");
  console.log("dtThermal = mp*cp/(10*h*A) =", dtThermal, "s");

  // 3. Mass flow time scale
  const minAirMass = Math.min(...params.airMass);
  const dtMassFlow = minAirMass / (10 * params.airFlow);
  console.log("dtMassFlow = ma/(10*ṁa) =", dtMassFlow, "s");

  // Calculate final time step
  const dt = Math.min(dtConvective, dtThermal, dtMassFlow);
  console.log(
    "\nFinal dt = min(dtConvective, dtThermal, dtMassFlow) =",
    dt,
    "s"
  );

  return dt;
}
