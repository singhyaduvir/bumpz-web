export const PASER_DEFINITIONS_VERSION = "TIC-asphalt-rev13-2013";

// Official reference: https://ltap.engr.wisc.edu/wp-content/uploads/2019/12/Asphalt-PASER_02_rev13.pdf
// The protected manual's full rating descriptions are not reproduced here. See rating details on printed pp. 15–25.
export const PASER_RATING_LABELS: Record<number, string> = {
  1: "Failed",
  2: "Very poor",
  3: "Poor",
  4: "Poor to fair",
  5: "Fair",
  6: "Fair to good",
  7: "Good",
  8: "Very good",
  9: "Excellent",
  10: "New pavement",
};

export function getPaserLabel(rating: number): string | undefined {
  return Number.isInteger(rating) ? PASER_RATING_LABELS[rating] : undefined;
}
