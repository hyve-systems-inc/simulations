/**
 * Rounds a number to a specified number of significant figures.
 * If sigFigs is undefined, returns the original number unchanged.
 *
 * @param num - The number to round
 * @param sigFigs - Optional number of significant figures
 * @returns The rounded number, or the original if sigFigs is undefined
 *
 * @example
 * significant(123.456) // returns 123.456
 * significant(123.456, 3) // returns 123
 * significant(0.123456, 3) // returns 0.123
 * significant(0) // returns 0
 * significant(0, 3) // returns 0
 */
export function significant(num: number, sigFigs?: number): number {
  // Return early if sigFigs is undefined or if num is 0
  if (sigFigs === undefined || num === 0) return num;

  // Validate inputs
  if (!Number.isFinite(num)) {
    console.log(num);
    throw new Error("Input must be a finite number");
  }
  if (!Number.isInteger(sigFigs) || sigFigs <= 0) {
    throw new Error("Significant figures must be a positive integer");
  }

  // Calculate magnitude (position of leftmost significant digit)
  const magnitude = Math.floor(Math.log10(Math.abs(num))) + 1;

  // Calculate factor to shift decimal point
  const factor = Math.pow(10, sigFigs - magnitude);

  // Round to significant figures
  return Math.round(num * factor) / factor;
}
