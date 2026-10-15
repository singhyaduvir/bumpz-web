import Anthropic from "@anthropic-ai/sdk";
import { analysisSchema, type AnalysisResult } from "@/lib/paser/schema";
import { PASER_RATING_LABELS } from "@/lib/paser/definitions";

const prompt = `You assess asphalt roads using the official Asphalt PASER Manual published by the Transportation Information Center, University of Wisconsin–Madison: https://ltap.engr.wisc.edu/wp-content/uploads/2019/12/Asphalt-PASER_02_rev13.pdf. Follow these steps in order:
1. Confirm the image shows a paved road surface. If not (including gravel or concrete), set is_road=false, paser_rating=null, and explain why in rationale.
2. Identify visible distresses: alligator/fatigue cracking, transverse cracking, longitudinal cracking, block cracking, raveling, potholes, rutting, patching, edge cracking, and bleeding. For each visible distress report severity low/medium/high and extent as a brief estimate. Do not infer hidden damage.
3. Match the observations to the official PASER rating descriptions and choose one integer rating from 1 to 10 only for asphalt roads. Do not treat the brief rating labels below as a substitute for the manual.
4. If the image contains explicit or inappropriate content, set is_road=false, set paser_rating=null, and begin rationale with the exact marker "INAPPROPRIATE_CONTENT:". Do not describe or rate the content.
5. Lower confidence when blurry, dark, steeply angled, or not representative of the road section.
Return JSON only in this exact shape:
{"is_road":boolean,"paser_rating":integer|null,"confidence":"low"|"medium"|"high","distresses":[{"type":"alligator/fatigue cracking"|"transverse cracking"|"longitudinal cracking"|"block cracking"|"raveling"|"potholes"|"rutting"|"patching"|"edge cracking"|"bleeding","severity":"low"|"medium"|"high","extent":"string"}],"rationale":"up to 3 sentences","image_quality_issues":["string"]}
PASER rating labels:\n${Object.entries(PASER_RATING_LABELS).map(([score, label]) => `${score}: ${label}`).join("\n")}`;

export async function analyzeRoadImage(jpeg: Buffer): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) throw new Error("Anthropic vision model is not configured.");
  const client = new Anthropic({ apiKey });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        ],
      }],
    });
    const text = response.content.find((part) => part.type === "text");
    try {
      if (!text || text.type !== "text") throw new Error("Model response did not contain text.");
      const clean = text.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const parsed: unknown = JSON.parse(clean);
      return analysisSchema.parse(parsed);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Vision model returned invalid output after retry: ${String(lastError)}`);
}
