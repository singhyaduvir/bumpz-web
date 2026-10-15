import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function checkSubmissionRateLimit(ipAddress: string): Promise<string> {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) throw new Error("IP_HASH_SECRET is not configured.");
  const ipHash = createHash("sha256").update(`${secret}:${ipAddress}`).digest("hex");
  const { data, error } = await getSupabaseAdmin().rpc("claim_submission_slot", {
    requested_ip_hash: ipHash,
  });
  if (error) throw new Error(`Could not check submission rate limit: ${error.message}`);
  if (data !== true) throw new Error("RATE_LIMITED");
  return ipHash;
}
