import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeRoadImage } from "@/lib/analysis";

type Fixture = {
  file: string;
  expected_rating: [number, number];
  expected_confidence?: "low" | "medium" | "high";
};

describe("road photo regression fixtures", () => {
  it("provides five image fixtures with valid expected rating ranges", async () => {
    const root = path.resolve(process.cwd(), "tests/fixtures/roads");
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Fixture[];
    expect(manifest.length).toBeGreaterThanOrEqual(5);
    for (const fixture of manifest) {
      const file = path.join(root, fixture.file);
      expect((await stat(file)).size).toBeGreaterThan(1000);
      const bytes = await readFile(file);
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(fixture.expected_rating[0]).toBeGreaterThanOrEqual(1);
      expect(fixture.expected_rating[1]).toBeLessThanOrEqual(10);
      expect(fixture.expected_rating[0]).toBeLessThanOrEqual(fixture.expected_rating[1]);
    }
  });

  const visionDescribe = process.env.ROADRATE_RUN_VISION_FIXTURES === "true" &&
    process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? describe : describe.skip;

  visionDescribe("vision PASER regression", () => {
    it("rates fixture photos within their reviewed reference ranges", async () => {
      const root = path.resolve(process.cwd(), "tests/fixtures/roads");
      const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Fixture[];
      for (const fixture of manifest) {
        const normalized = await sharp(path.join(root, fixture.file))
          .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 86 }).toBuffer();
        const result = await analyzeRoadImage(normalized);
        expect(result.is_road, fixture.file).toBe(true);
        expect(result.paser_rating, fixture.file).toBeGreaterThanOrEqual(fixture.expected_rating[0]);
        expect(result.paser_rating, fixture.file).toBeLessThanOrEqual(fixture.expected_rating[1]);
      }
    }, 120_000);
  });
});
