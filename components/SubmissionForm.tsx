"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseLocation } from "@/lib/location";
import { invalidateRoadMapCache } from "@/lib/map-cache";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const stages = ["Uploading photo", "Analyzing the road", "Checking the location"];

export function SubmissionForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [stage, setStage] = useState(-1);
  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : "", [photo]);
  const parsedLocation = parseLocation(location);
  const photoError = photo && !ACCEPTED_TYPES.has(photo.type) ? "Choose a JPEG, PNG, HEIC, or WebP photo." :
    photo && photo.size > MAX_BYTES ? "Photos must be 15 MB or smaller." : "";
  const locationError = location.length > 0 && !parsedLocation
    ? "Add a city and valid state, for example Springfield, IL."
    : "";

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!photo || photoError || !parsedLocation) return;
    const data = new FormData();
    data.set("photo", photo);
    data.set("location", location.trim());
    setStage(0);
    const timer = window.setInterval(() => setStage((current) => Math.min(current + 1, 2)), 2800);
    try {
      const response = await fetch("/api/submissions", { method: "POST", body: data });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null) {
        const message = typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string" ? result.error : "We couldn’t submit this photo.";
        throw new Error(message);
      }
      const payload = result as { id?: unknown; status?: unknown; candidates?: unknown; error?: unknown };
      if (typeof payload.id !== "string") throw new Error("We couldn’t submit this photo.");
      if (payload.status === "analysis_failed" || payload.status === "rejected") {
        throw new Error(typeof payload.error === "string" ? payload.error : "We couldn’t rate this photo.");
      }
      const previous: unknown = JSON.parse(localStorage.getItem("roadrate:submissions") ?? "[]");
      const ids = Array.isArray(previous) ? previous.filter((id): id is string => typeof id === "string") : [];
      localStorage.setItem("roadrate:submissions", JSON.stringify([payload.id, ...ids.filter((id) => id !== payload.id)].slice(0, 50)));
      if (payload.status === "needs_review") {
        sessionStorage.setItem(`roadrate:candidates:${payload.id}`, JSON.stringify(payload.candidates ?? []));
      }
      invalidateRoadMapCache();
      window.dispatchEvent(new CustomEvent("roadrate:submission-complete", { detail: { id: payload.id } }));
      router.push(`/submissions/${payload.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn’t submit this photo.");
      setStage(-1);
    } finally {
      window.clearInterval(timer);
    }
  }

  const busy = stage >= 0;
  const ready = Boolean(photo && !photoError && parsedLocation);
  return (
    <form className="form-card" onSubmit={submit} aria-busy={busy}>
      <h2 className="card-heading">Rate a road</h2>
      <p className="card-help">Add a photo and location for a road rating.</p>
      <label className="photo-picker" htmlFor="road-photo">
        <input
          ref={inputRef}
          id="road-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
          capture="environment"
          aria-label="Choose or take a road photo"
          disabled={busy}
          onChange={(event) => {
            setPhoto(event.currentTarget.files?.[0] ?? null);
            setSubmitError("");
          }}
        />
        {preview ? (
          <>
            <img className="photo-preview" src={preview} alt={photo?.name ? `Preview of ${photo.name}` : "Selected road photo preview"} />
            <span className="photo-overlay">
              <span><strong>{photo?.name}</strong><span>{photo ? `${(photo.size / 1024 / 1024).toFixed(1)} MB · Tap to change` : ""}</span></span>
              <span className="secondary-button" style={{ minHeight: 36, display: "inline-flex", alignItems: "center", padding: "0 12px", fontSize: 11 }}>Change</span>
            </span>
          </>
        ) : (
          <span className="upload-content">
            <span className="upload-icon" aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <strong>Add a road photo</strong>
            <span>Take a photo or choose one</span>
            <span>JPEG, PNG, HEIC, or WebP · Max 15 MB</span>
          </span>
        )}
      </label>
      {photoError && <p className="field-error" role="alert">{photoError}</p>}

      <label className="field-label" htmlFor="road-location">Where was this taken?</label>
      <input
        className="text-input"
        id="road-location"
        name="location"
        type="text"
        autoComplete="street-address"
        placeholder="e.g. Elm St & 3rd Ave, Riverside, Springfield, IL"
        value={location}
        aria-invalid={Boolean(locationError)}
        aria-describedby="location-hint location-error"
        disabled={busy}
        onChange={(event) => setLocation(event.target.value)}
      />
      <p className="input-hint" id="location-hint">Include a city and state.</p>
      {locationError && <p className="field-error" id="location-error" role="alert">{locationError}</p>}
      {submitError && <p className="error-banner" role="alert" style={{ marginTop: 14 }}>{submitError}</p>}

      {busy && (
        <ol className="progress-list" aria-live="polite" aria-label="Submission progress">
          {stages.map((label, index) => (
            <li className={`progress-item ${index < stage ? "done" : index === stage ? "active" : ""}`} key={label}>
              <span className="progress-dot" aria-hidden="true">{index < stage ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <button className="primary-button form-submit" type="submit" disabled={!ready || busy}>
        {busy ? "Rating your road…" : "Get road rating"}
      </button>
      <p className="disclaimer">Photo-based estimate, not a formal PASER survey.</p>
    </form>
  );
}
