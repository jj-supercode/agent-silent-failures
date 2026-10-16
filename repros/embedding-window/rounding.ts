/** Rounds a measured value for a report; stored rounded, so a re-run diffs only when the measurement moves. */
export const roundTo = (value: number, decimals: number): number => Number(value.toFixed(decimals));
