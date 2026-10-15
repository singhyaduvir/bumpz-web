"use client";

import { GeoJSONSource, Map as MapLibre, NavigationControl, Popup, setWorkerUrl, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Feature as GeoJsonFeature, FeatureCollection as GeoJsonFeatureCollection, Point as GeoJsonPoint } from "geojson";
import { invalidateRoadMapCache, roadMapCache, type MapSubmission } from "@/lib/map-cache";

type RoadFeature = GeoJsonFeature<GeoJsonPoint, MapSubmission & { highlight: boolean }>;
type RoadCollection = GeoJsonFeatureCollection<GeoJsonPoint, MapSubmission & { highlight: boolean }>;
type MapPayload = { submissions: MapSubmission[]; next_offset: number | null };

const CACHE_MS = 30_000;
const MIN_HEIGHT = 300;
const mapSubmissionSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  location_text: z.string(),
  lat: z.number(),
  lng: z.number(),
  paser_rating: z.number().int().min(1).max(10),
  rating_confidence: z.string(),
  photo_url: z.string().url(),
});

function emptyCollection(): RoadCollection {
  return { type: "FeatureCollection", features: [] };
}

export function RoadMap({ focusedId }: { focusedId?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fetchSequenceRef = useRef(0);
  const focusedIdRef = useRef(focusedId);
  const [height, setHeight] = useState(420);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = Number(localStorage.getItem("roadrate:map-height"));
      const preferred = Number.isFinite(saved) && saved >= MIN_HEIGHT ? saved : 420;
      setHeight(Math.min(preferred, Math.round(window.innerHeight * 0.8)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

  const fetchViewport = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const key = [west, south, east, north].map((n) => n.toFixed(1)).join(":");
    const requestSequence = ++fetchSequenceRef.current;
    const cached = roadMapCache.get(key);
    if (cached && Date.now() - cached.created < CACHE_MS) {
      setMessage("");
      applyFeatures(cached.items, map, focusedIdRef.current);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const all: MapSubmission[] = [];
      let offset = 0;
      let nextOffset: number | null = 0;
      while (nextOffset !== null) {
        const params = new URLSearchParams({
          west: String(west), south: String(south), east: String(east), north: String(north), offset: String(offset),
        });
        const response = await fetch(`/api/submissions/map?${params.toString()}`);
        const payload: unknown = await response.json();
        if (!response.ok) {
          const error = typeof payload === "object" && payload !== null && "error" in payload &&
            typeof payload.error === "string" ? payload.error : "Could not load map pins.";
          throw new Error(error);
        }
        const result = payload as MapPayload;
        all.push(...result.submissions);
        nextOffset = result.next_offset;
        if (nextOffset !== null) offset = nextOffset;
      }
      if (requestSequence !== fetchSequenceRef.current) return;
      roadMapCache.set(key, { created: Date.now(), items: all });
      applyFeatures(all, map, focusedIdRef.current);
    } catch (error) {
      if (requestSequence === fetchSequenceRef.current) {
        setMessage(error instanceof Error ? error.message : "Could not load map pins.");
      }
    } finally {
      if (requestSequence === fetchSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    setWorkerUrl("/maplibre-gl-worker.mjs");
    const map = new MapLibre({
      container: hostRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [-98.5, 39.5],
      zoom: 3.25,
      minZoom: 2.5,
      maxZoom: 18,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("roads", {
        type: "geojson",
        data: emptyCollection(),
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 48,
        clusterProperties: {
          ratingSum: ["+", ["get", "paser_rating"]],
          ratingCount: ["+", 1],
        },
      });
      map.addLayer({
        id: "road-clusters",
        type: "circle",
        source: "roads",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["/", ["get", "ratingSum"], ["max", ["get", "ratingCount"], 1]], "#e98980", 4, "#f0c853", 7, "#69bc89"],
          "circle-radius": ["step", ["get", "point_count"], 23, 15, 28, 40, 34],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "road-cluster-label",
        type: "symbol",
        source: "roads",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["concat", ["to-string", ["get", "point_count"]], " · ", ["to-string", ["round", ["/", ["get", "ratingSum"], ["max", ["get", "ratingCount"], 1]]]]],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#24342a" },
      });
      map.addLayer({
        id: "road-points",
        type: "circle",
        source: "roads",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["case", ["get", "highlight"], 13, 9],
          "circle-color": ["step", ["get", "paser_rating"], "#e98980", 4, "#f0c853", 7, "#69bc89"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
          "circle-opacity": ["case", ["get", "highlight"], 0.72, 1],
        },
      });
      map.addLayer({
        id: "road-point-label",
        type: "symbol",
        source: "roads",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["to-string", ["get", "paser_rating"]],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#17241c" },
      });
      map.on("click", "road-clusters", (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ["road-clusters"] })[0];
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        const source = map.getSource("roads") as GeoJSONSource;
        if (clusterId !== undefined) {
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const coordinates = (feature.geometry as GeoJsonPoint).coordinates as [number, number];
            map.easeTo({ center: coordinates, zoom });
          }).catch((error: unknown) => {
            console.error("Could not expand map cluster:", error);
          });
        }
      });
      map.on("click", "road-points", (event) => showPopup(map, event));
      map.on("mouseenter", "road-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "road-clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "road-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "road-points", () => { map.getCanvas().style.cursor = ""; });
      void fetchViewport();
    });
    map.on("moveend", () => void fetchViewport());
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [fetchViewport]);

  useEffect(() => {
    const refresh = () => {
      invalidateRoadMapCache();
      void fetchViewport();
    };
    window.addEventListener("roadrate:submission-complete", refresh);
    return () => window.removeEventListener("roadrate:submission-complete", refresh);
  }, [fetchViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedId) return;
    const cachedItems = [...roadMapCache.values()].flatMap((item) => item.items);
    const focus = cachedItems.find((item) => item.id === focusedId);
    if (focus) map.flyTo({ center: [focus.lng, focus.lat], zoom: 12, duration: 1300 });
  }, [focusedId, loading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => map.resize(), 80);
    return () => window.clearTimeout(timer);
  }, [fullscreen, height]);

  function resizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = cardRef.current?.getBoundingClientRect().height ?? height;
    const move = (moveEvent: PointerEvent) => {
      setHeight(Math.min(Math.round(window.innerHeight * 0.8), Math.max(MIN_HEIGHT, startHeight + moveEvent.clientY - startY)));
    };
    const end = () => {
      localStorage.setItem("roadrate:map-height", String(cardRef.current?.getBoundingClientRect().height ?? height));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  const handleFullscreen = () => setFullscreen((current) => !current);
  return (
    <div
      ref={cardRef}
      className={`map-card ${fullscreen ? "map-fullscreen" : ""}`}
      style={fullscreen ? undefined : { height, minHeight: MIN_HEIGHT }}
      aria-label="Interactive map of rated roads in the United States"
    >
      <div ref={hostRef} className="map-host" />
      {loading && <div className="map-loading" role="status">Finding rated roads in this area…</div>}
      {message && <div className="map-error" role="alert">{message}</div>}
      <div className="map-controls">
        <button className="map-control" type="button" aria-label={fullscreen ? "Exit fullscreen map" : "Show fullscreen map"} onClick={handleFullscreen}>
          {fullscreen ? "×" : "⛶"}
        </button>
      </div>
      <div className="map-legend" aria-label="Map rating legend">
        <span className="legend-key"><i className="legend-dot" style={{ background: "#e98980" }} />1–3 Poor</span>
        <span className="legend-key"><i className="legend-dot" style={{ background: "#f0c853" }} />4–6 Fair</span>
        <span className="legend-key"><i className="legend-dot" style={{ background: "#69bc89" }} />7–10 Good</span>
      </div>
      <div className="map-resize-handle" role="slider" aria-label="Resize map" aria-valuemin={MIN_HEIGHT} aria-valuenow={height} aria-valuemax={Math.round(typeof window === "undefined" ? 800 : window.innerHeight * 0.8)} tabIndex={0} onPointerDown={resizeStart} onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const next = Math.min(Math.round(window.innerHeight * 0.8), Math.max(MIN_HEIGHT, height + (event.key === "ArrowUp" ? 30 : -30)));
          setHeight(next);
          localStorage.setItem("roadrate:map-height", String(next));
        }
      }}>
        <span className="map-resize-grip" aria-hidden="true" />
      </div>
    </div>
  );
}

function applyFeatures(items: MapSubmission[], map: MapLibreMap, focusedId?: string) {
  const source = map.getSource("roads") as GeoJSONSource | undefined;
  if (!source) return;
  const features: RoadFeature[] = items.map((item) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [item.lng, item.lat] },
    properties: { ...item, highlight: item.id === focusedId },
  }));
  source.setData({ type: "FeatureCollection", features } satisfies RoadCollection);
}

function showPopup(map: MapLibreMap, event: MapMouseEvent) {
  const feature = map.queryRenderedFeatures(event.point, { layers: ["road-points"] })[0];
  if (!feature) return;
  const parsed = mapSubmissionSchema.safeParse(feature.properties);
  if (!parsed.success) {
    console.error("Map feature had an invalid submission payload:", parsed.error);
    return;
  }
  const data = parsed.data;
  const card = document.createElement("a");
  card.className = "popup-card";
  card.href = `/submissions/${data.id}`;
  card.style.textDecoration = "none";
  card.style.color = "inherit";
  const photo = document.createElement("img");
  photo.className = "popup-photo";
  photo.src = data.photo_url;
  photo.alt = `Road surface at ${data.location_text}`;
  const body = document.createElement("div");
  body.className = "popup-body";
  const rating = document.createElement("div");
  rating.className = "popup-rating";
  const badge = document.createElement("span");
  const score = Number(data.paser_rating);
  badge.className = `rating-badge small ${score <= 3 ? "rating-low" : score <= 6 ? "rating-mid" : "rating-high"}`;
  badge.textContent = String(score);
  const label = document.createElement("span");
  label.textContent = `PASER estimate · ${data.rating_confidence} confidence`;
  rating.append(badge, label);
  const place = document.createElement("div");
  place.className = "popup-place";
  place.textContent = String(data.location_text);
  const date = document.createElement("div");
  date.className = "popup-date";
  date.textContent = new Date(String(data.created_at)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  body.append(rating, place, date);
  card.append(photo, body);
  new Popup({ offset: 14, closeButton: true, maxWidth: "240px" })
    .setLngLat((feature.geometry as GeoJsonPoint).coordinates as [number, number])
    .setDOMContent(card)
    .addTo(map);
}
