import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const querySchema = z.object({
  west: z.coerce.number().min(-180).max(180),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid map bounds." }, { status: 400 });
    const { west, south, east, north, offset } = parsed.data;
    const supabase = getSupabaseAdmin();
    let query = supabase.from("submissions")
      .select("id,created_at,location_text,lat,lng,paser_rating,rating_confidence,image_path")
      .eq("status", "complete")
      .not("lat", "is", null).not("lng", "is", null)
      .gte("lat", south).lte("lat", north)
      .order("created_at", { ascending: false })
      .range(offset, offset + 499);
    query = west <= east
      ? query.gte("lng", west).lte("lng", east)
      : query.or(`lng.gte.${west},lng.lte.${east}`);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load map submissions: ${error.message}`);
    const submissions = await Promise.all((data ?? []).map(async (item) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from("road-photos").createSignedUrl(item.image_path, 60 * 60);
      if (signedError) throw new Error(`Could not sign map photo URL: ${signedError.message}`);
      return { ...item, photo_url: signed.signedUrl };
    }));
    return NextResponse.json({ submissions, next_offset: submissions.length === 500 ? offset + 500 : null }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Map submissions failed:", error);
    return NextResponse.json({ error: "Unable to load map submissions." }, { status: 500 });
  }
}
