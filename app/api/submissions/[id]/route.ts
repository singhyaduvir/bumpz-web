import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const validId = z.string().uuid().safeParse(id);
    if (!validId.success) return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("submissions")
      .select("id,created_at,location_text,city,state,neighborhood,intersection,lat,lng,geocode_confidence,paser_rating,rating_confidence,distresses,rationale,status,flag_count,image_path")
      .eq("id", validId.data).single();
    if (error || !data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    const { data: signed, error: signedError } = await supabase.storage
      .from("road-photos").createSignedUrl(data.image_path, 60 * 60);
    if (signedError) throw new Error(`Could not sign photo URL: ${signedError.message}`);
    return NextResponse.json({
      id: data.id,
      created_at: data.created_at,
      location_text: data.location_text,
      city: data.city,
      state: data.state,
      neighborhood: data.neighborhood,
      intersection: data.intersection,
      lat: data.lat,
      lng: data.lng,
      geocode_confidence: data.geocode_confidence,
      paser_rating: data.paser_rating,
      rating_confidence: data.rating_confidence,
      distresses: data.distresses,
      rationale: data.rationale,
      status: data.status,
      flag_count: data.flag_count,
      photo_url: signed.signedUrl,
    });
  } catch (error) {
    console.error("Could not fetch submission:", error);
    return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
  }
}
