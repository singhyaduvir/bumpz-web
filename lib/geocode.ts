import { z } from "zod";

const geocodeResultSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  label: z.string(),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
export type GeocodeResponse =
  | { status: "matched"; result: GeocodeResult }
  | { status: "needs_review"; candidates: GeocodeResult[] };

let nominatimQueue = Promise.resolve();
let lastNominatimRequest = 0;

async function fetchNominatim(url: URL): Promise<Response> {
  const request = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastNominatimRequest));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimRequest = Date.now();
    return fetch(url, {
      headers: { "User-Agent": `RoadRate/1.0 (${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"})` },
      signal: AbortSignal.timeout(8000),
    });
  });
  nominatimQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function geocodeWithMapbox(query: string, token: string): Promise<GeocodeResponse> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "US");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Mapbox geocoding failed (${response.status}).`);
  const data: unknown = await response.json();
  const features = z.object({ features: z.array(z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({
        full_address: z.string().optional(),
        name: z.string().optional(),
        match_code: z.object({ confidence: z.string().optional() }).optional(),
      }),
  })) }).parse(data).features;
  const candidates = features.map((feature) => geocodeResultSchema.parse({
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
    confidence: feature.properties.match_code?.confidence === "exact" ? 0.98 :
      feature.properties.match_code?.confidence === "high" ? 0.85 :
        feature.properties.match_code?.confidence === "medium" ? 0.65 : 0.4,
    label: feature.properties.full_address ?? feature.properties.name ?? query,
  }));
  if (candidates[0]?.confidence && candidates[0].confidence >= 0.85 &&
    (candidates.length === 1 || candidates[0].confidence > candidates[1].confidence)) {
    return { status: "matched", result: candidates[0] };
  }
  return { status: "needs_review", candidates };
}

async function geocodeWithNominatim(query: string): Promise<GeocodeResponse> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  const response = await fetchNominatim(url);
  if (!response.ok) throw new Error(`Nominatim geocoding failed (${response.status}).`);
  const data: unknown = await response.json();
  const candidates = z.array(z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    importance: z.number().optional(),
  })).parse(data).map((item) => geocodeResultSchema.parse({
    lat: Number(item.lat),
    lng: Number(item.lon),
    confidence: item.importance ?? 0.4,
    label: item.display_name,
  }));
  return { status: "needs_review", candidates };
}

export async function geocodeLocation(query: string): Promise<GeocodeResponse> {
  const mapboxKey = process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxKey) return geocodeWithNominatim(query);
  try {
    const result = await geocodeWithMapbox(query, mapboxKey);
    if (result.status === "matched" || result.candidates.length) return result;
  } catch (mapboxError) {
    try {
      console.warn("Mapbox geocoding failed; trying Nominatim fallback:", mapboxError);
      return await geocodeWithNominatim(query);
    } catch (nominatimError) {
      throw new Error(`Mapbox and Nominatim geocoding both failed: ${String(mapboxError)}; ${String(nominatimError)}`);
    }
  }
  return geocodeWithNominatim(query);
}
