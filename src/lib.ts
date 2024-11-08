export function randomWithinTolerance(
  value: number,
  tolerance: number
): number {
  // Calculate the range
  const min = value - Math.abs(tolerance);
  const max = value + Math.abs(tolerance);

  // Generate random number within range
  return min + Math.random() * (max - min);
}
