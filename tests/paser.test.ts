import { describe, expect, it } from "vitest";
import { getPaserLabel, PASER_DEFINITIONS_VERSION, PASER_RATING_LABELS } from "@/lib/paser/definitions";

describe("PASER rating labels", () => {
  it("covers every integer rating and has a version", () => {
    expect(Object.keys(PASER_RATING_LABELS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PASER_DEFINITIONS_VERSION).toBeTruthy();
    expect(Object.values(PASER_RATING_LABELS).every((label) => label.length > 0)).toBe(true);
  });

  it("does not return a label for fractional or out-of-range values", () => {
    expect(getPaserLabel(8)).toBe(PASER_RATING_LABELS[8]);
    expect(getPaserLabel(8.5)).toBeUndefined();
    expect(getPaserLabel(11)).toBeUndefined();
  });
});
