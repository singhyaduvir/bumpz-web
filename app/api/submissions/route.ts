import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { parseLocation } from "@/lib/location";
import { analyzeRoadImage } from "@/lib/analysis";
import { geocodeLocation } from "@/lib/geocode";
import { checkSubmissionRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PASER_DEFINITIONS_VERSION } from "@/lib/paser/definitions";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;

function detectImageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp" &&
    /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(bytes.toString("ascii", 8, 12))) return "heif";
  return null;
}

function requestIp(request: Request): string {
  return request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("photo");
    const locationText = form.get("location");
    const inputSchema = z.object({
      photo: z.instanceof(File),
      location: z.string().trim().min(3).max(300),
    }).strict();
    const input = inputSchema.safeParse({ photo: file, location: locationText });
    if (!input.success) {
      return NextResponse.json({ error: "Choose a road photo and enter its location." }, { status: 400 });
    }
    const { photo, location: submittedLocation } = input.data;
    if (photo.size <= 0 || photo.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photos must be smaller than 15 MB." }, { status: 413 });
    }
    const location = parseLocation(submittedLocation);
    if (!location) {
      return NextResponse.json({ error: "Enter a city and valid U.S. state, such as Springfield, IL." }, { status: 400 });
    }
    const inputBytes = Buffer.from(await photo.arrayBuffer());
    const imageType = detectImageType(inputBytes);
    if (!imageType) {
      return NextResponse.json({ error: "That file is not a supported JPEG, PNG, HEIC, or WebP image." }, { status: 415 });
    }

    const ipHash = await checkSubmissionRateLimit(requestIp(request));
    const image = sharp(inputBytes, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS ||
      metadata.width < 32 || metadata.height < 32) {
      return NextResponse.json({ error: "This image has invalid or unusually large dimensions." }, { status: 400 });
    }
    const jpeg = await image.rotate().resize({
      width: 2048, height: 2048, fit: "inside", withoutEnlargement: true,
    }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const imagePath = `roads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("road-photos").upload(imagePath, jpeg, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

    const { data: inserted, error: insertError } = await supabase.from("submissions").insert({
      image_path: imagePath,
      location_text: location.locationText,
      city: location.city,
      state: location.state,
      neighborhood: location.neighborhood,
      intersection: location.intersection,
      status: "uploaded",
      ip_hash: ipHash,
      paser_definitions_version: PASER_DEFINITIONS_VERSION,
    }).select("id").single();
    if (insertError || !inserted) {
      await supabase.storage.from("road-photos").remove([imagePath]);
      throw new Error(`Could not create submission: ${insertError?.message ?? "No record returned."}`);
    }

    const [analysisOutcome, geocodeOutcome] = await Promise.allSettled([
      analyzeRoadImage(jpeg),
      geocodeLocation(location.locationText),
    ]);
    if (geocodeOutcome.status === "rejected") {
      console.error("Geocoding failed; submission requires location review:", geocodeOutcome.reason);
    }
    if (analysisOutcome.status === "rejected") {
      const { error } = await supabase.from("submissions").update({ status: "analysis_failed" }).eq("id", inserted.id);
      if (error) throw new Error(`Could not mark analysis failure: ${error.message}`);
      return NextResponse.json({
        id: inserted.id,
        status: "analysis_failed",
        error: "We couldn't rate this photo just now. Please try another clear road photo.",
      }, { status: 200 });
    }

    const analysis = analysisOutcome.value;
    if (analysis.rationale.startsWith("INAPPROPRIATE_CONTENT:")) {
      const { error } = await supabase.from("submissions").update({
        status: "rejected",
        rationale: "This image cannot be accepted.",
        model_version: process.env.ANTHROPIC_MODEL,
      }).eq("id", inserted.id);
      if (error) throw new Error(`Could not reject submission: ${error.message}`);
      return NextResponse.json({
        id: inserted.id, status: "rejected",
        error: "This image can’t be accepted. Please choose an appropriate road photo.",
      });
    }
    if (!analysis.is_road || analysis.paser_rating === null) {
      const { error } = await supabase.from("submissions").update({
        status: "rejected",
        rating_confidence: analysis.confidence,
        distresses: analysis.distresses,
        rationale: analysis.rationale,
        model_version: process.env.ANTHROPIC_MODEL,
      }).eq("id", inserted.id);
      if (error) throw new Error(`Could not save image rejection: ${error.message}`);
      return NextResponse.json({
        id: inserted.id, status: "rejected",
        error: "This doesn’t look like an asphalt road surface. Gravel and concrete aren’t rated yet.",
      });
    }

    const locationStatus = geocodeOutcome.status === "fulfilled"
      ? geocodeOutcome.value
      : { status: "needs_review" as const, candidates: [] };
    const commonUpdate = {
      status: "rated" as const,
      paser_rating: analysis.paser_rating,
      rating_confidence: analysis.confidence,
      distresses: analysis.distresses,
      rationale: analysis.rationale,
      model_version: process.env.ANTHROPIC_MODEL,
    };
    const { error: ratedError } = await supabase.from("submissions")
      .update(commonUpdate).eq("id", inserted.id);
    if (ratedError) throw new Error(`Could not save rating: ${ratedError.message}`);

    if (locationStatus.status === "needs_review") {
      const { error } = await supabase.from("submissions")
        .update({ status: "needs_review" }).eq("id", inserted.id);
      if (error) throw new Error(`Could not save location review status: ${error.message}`);
      return NextResponse.json({
        id: inserted.id,
        status: "needs_review",
        candidates: locationStatus.candidates,
      });
    }

    const { error: completeError } = await supabase.from("submissions").update({
      status: "complete",
      lat: locationStatus.result.lat,
      lng: locationStatus.result.lng,
      geocode_confidence: locationStatus.result.confidence,
    }).eq("id", inserted.id);
    if (completeError) throw new Error(`Could not save geocoded location: ${completeError.message}`);
    return NextResponse.json({ id: inserted.id, status: "complete" });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "You’ve reached the limit of 10 submissions per hour." }, { status: 429 });
    }
    console.error("Submission failed:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Submission failed. Please try again.",
    }, { status: 500 });
  }
}
