import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase";
import { PASER_DEFINITIONS_VERSION } from "../lib/paser/definitions";

type Fixture = {
  file: string;
  location: string;
  city: string;
  state: string;
  expected_rating: [number, number];
};

async function main() {
  const root = path.resolve(process.cwd(), "tests/fixtures/roads");
  const fixturesPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(fixturesPath, "utf8")) as Fixture[];
  if (manifest.length < 5) throw new Error("Seed manifest must contain at least five fixtures.");
  const available = new Set(await readdir(root));
  const supabase = getSupabaseAdmin();
  for (const fixture of manifest) {
    if (!available.has(fixture.file)) throw new Error(`Missing road fixture photo: ${fixture.file}`);
    const source = await readFile(path.join(root, fixture.file));
    const jpeg = await sharp(source, { limitInputPixels: 100_000_000 })
      .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const now = new Date();
    const imagePath = `roads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.jpg`;
    const uploaded = await supabase.storage.from("road-photos").upload(imagePath, jpeg, { contentType: "image/jpeg" });
    if (uploaded.error) throw new Error(`Could not upload ${fixture.file}: ${uploaded.error.message}`);
    const inserted = await supabase.from("submissions").insert({
      image_path: imagePath,
      location_text: fixture.location,
      city: fixture.city,
      state: fixture.state,
      paser_rating: Math.round((fixture.expected_rating[0] + fixture.expected_rating[1]) / 2),
      rating_confidence: "medium",
      distresses: [],
      rationale: `Development seed photo; expected PASER range ${fixture.expected_rating[0]}–${fixture.expected_rating[1]}.`,
      status: "complete",
      geocode_confidence: 0.95,
      lat: 39.7817,
      lng: -89.6501,
      model_version: "development-seed",
      paser_definitions_version: PASER_DEFINITIONS_VERSION,
    });
    if (inserted.error) throw new Error(`Could not seed ${fixture.file}: ${inserted.error.message}`);
    console.info(`Seeded ${fixture.location} (expected range ${fixture.expected_rating[0]}–${fixture.expected_rating[1]}).`);
  }
}

main().catch((error: unknown) => {
  console.error("RoadRate seed failed:", error);
  process.exitCode = 1;
});
