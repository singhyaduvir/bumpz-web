export type MapSubmission = {
  id: string;
  created_at: string;
  location_text: string;
  lat: number;
  lng: number;
  paser_rating: number;
  rating_confidence: string;
  photo_url: string;
};

export const roadMapCache = new Map<string, { created: number; items: MapSubmission[] }>();

export function invalidateRoadMapCache() {
  roadMapCache.clear();
}
