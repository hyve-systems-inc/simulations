import { Cilantro } from "./models/util/commodityContainerModels.js";
import { createPallet } from "./models/util/createPallet.js";

// Example usage:
const cilantroPallet = createPallet(5, 3, 2, Cilantro);
if (cilantroPallet) {
  console.log("Successfully created pallet");
  console.log(cilantroPallet.getAverageThermalState());
  console.log(cilantroPallet.calculateTotalRespirationHeat());
  cilantroPallet.updateAllTemperatures(-1);
  console.log(cilantroPallet.getAverageThermalState());
  console.log(cilantroPallet.calculateTotalRespirationHeat());
} else {
  console.log("Failed to create pallet");
}
