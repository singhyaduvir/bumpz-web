import { NextResponse } from "next/server";
import { z } from "zod";
import { parseLocation } from "@/lib/location";
import { geocodeLocation } from "@/lib/geocode";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const validId = z.string().uuid().safeParse(id);
    if (!validId.success) return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    const candidateSchema = z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      confidence: z.number().min(0).max(1),
      label: z.string().min(1).max(500),
    }).strict();
    const bodySchema = z.object({
      location: z.string().trim().min(3).max(300),
      candidate: candidateSchema.optional(),
    }).strict();
    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) return NextResponse.json({ error: "Enter a valid location and candidate." }, { status: 400 });
    const selectedCandidate = parsedBody.data.candidate;
    const location = parseLocation(parsedBody.data.location);
    if (!location) return NextResponse.json({ error: "Enter a city and valid U.S. state." }, { status: 400 });
    const match = await geocodeLocation(location.locationText);
    if (match.status !== "matched" && !selectedCandidate) {
      return NextResponse.json({ status: "needs_review", candidates: match.candidates });
    }
    const result = match.status === "matched"
      ? match.result
      : match.candidates.find((item) => selectedCandidate !== undefined &&
        item.label === selectedCandidate.label &&
        item.lat === selectedCandidate.lat &&
        item.lng === selectedCandidate.lng,
      );
    if (!result) {
      return NextResponse.json({ error: "That location option is no longer available. Please choose again." }, { status: 409 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("submissions").update({
      location_text: location.locationText,
      city: location.city,
      state: location.state,
      neighborhood: location.neighborhood,
      intersection: location.intersection,
      lat: result.lat,
      lng: result.lng,
      geocode_confidence: result.confidence,
      status: "complete",
    }).eq("id", validId.data).eq("status", "needs_review").select("id").maybeSingle();
    if (error) throw new Error(`Could not confirm location: ${error.message}`);
    if (!data) return NextResponse.json({ error: "This submission is no longer awaiting location review." }, { status: 409 });
    return NextResponse.json({ status: "complete" });
  } catch (error) {
    console.error("Location confirmation failed:", error);
    return NextResponse.json({ error: "Could not verify this location." }, { status: 500 });
  }
}
