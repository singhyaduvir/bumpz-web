import { describe, expect, it } from "vitest";
import { analysisSchema } from "@/lib/paser/schema";

const validOutput = {
  is_road: true,
  paser_rating: 6,
  confidence: "medium",
  distresses: [{ type: "transverse cracking", severity: "low", extent: "occasional" }],
  rationale: "Some light cracking is visible across the surface.",
  image_quality_issues: [],
};

describe("vision model output schema", () => {
  it("accepts a well-formed integer rating and distress list", () => {
    expect(analysisSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rejects fractional ratings, missing fields, and invalid distress severities", () => {
    expect(analysisSchema.safeParse({ ...validOutput, paser_rating: 6.5 }).success).toBe(false);
    expect(analysisSchema.safeParse({ ...validOutput, extra: true }).success).toBe(false);
    expect(analysisSchema.safeParse({
      ...validOutput,
      distresses: [{ type: "potholes", severity: "extreme", extent: "many" }],
    }).success).toBe(false);
    expect(analysisSchema.safeParse({ ...validOutput, is_road: false, paser_rating: 6 }).success).toBe(false);
    expect(analysisSchema.safeParse({
      ...validOutput,
      rationale: "First sentence. Second sentence. Third sentence. Fourth sentence.",
    }).success).toBe(false);
  });
});
