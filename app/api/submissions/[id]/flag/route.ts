import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const validId = z.string().uuid().safeParse(id);
    if (!validId.success) return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().rpc("increment_submission_flag", { submission_id: validId.data });
    if (error) throw new Error(`Could not flag submission: ${error.message}`);
    return NextResponse.json({ flag_count: data });
  } catch (error) {
    console.error("Flag submission failed:", error);
    return NextResponse.json({ error: "Could not flag this submission." }, { status: 500 });
  }
}
