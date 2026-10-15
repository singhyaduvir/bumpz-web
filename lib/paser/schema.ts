import { z } from "zod";

export const distressSchema = z.object({
  type: z.enum([
    "alligator/fatigue cracking",
    "transverse cracking",
    "longitudinal cracking",
    "block cracking",
    "raveling",
    "potholes",
    "rutting",
    "patching",
    "edge cracking",
    "bleeding",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  extent: z.string().trim().min(1).max(120),
}).strict();

export const analysisSchema = z.object({
  is_road: z.boolean(),
  paser_rating: z.number().int().min(1).max(10).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  distresses: z.array(distressSchema).max(20),
  rationale: z.string().trim().min(1).max(600).refine(
    (value) => value.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).length <= 3,
    "Rationale must contain at most three sentences.",
  ),
  image_quality_issues: z.array(z.string().trim().min(1).max(120)).max(10),
}).strict().refine((result) => result.is_road === (result.paser_rating !== null), {
  message: "A PASER rating is present only when the image shows a paved road.",
});

export type AnalysisResult = z.infer<typeof analysisSchema>;
