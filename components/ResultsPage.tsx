"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { Navigation, type AppTab } from "@/components/Navigation";
import dynamic from "next/dynamic";
import { invalidateRoadMapCache } from "@/lib/map-cache";
import { getPaserLabel } from "@/lib/paser/definitions";

const RoadMap = dynamic(() => import("@/components/RoadMap").then((module) => module.RoadMap), {
  ssr: false,
  loading: () => <div className="map-card" style={{ height: 300 }} aria-busy="true" />,
});

type Distress = { type: string; severity: string; extent: string };
type Submission = {
  id: string;
  created_at: string;
  location_text: string;
  lat: number | null;
  lng: number | null;
  paser_rating: number | null;
  rating_confidence: "low" | "medium" | "high" | null;
  distresses: Distress[] | null;
  rationale: string | null;
  status: string;
  flag_count: number;
  photo_url: string;
};
type Candidate = { lat: number; lng: number; confidence: number; label: string };

function badgeClass(rating: number) {
  return rating <= 3 ? "rating-low" : rating <= 6 ? "rating-mid" : "rating-high";
}

async function getSubmission(id: string): Promise<Submission> {
  const response = await fetch(`/api/submissions/${encodeURIComponent(id)}`, { cache: "no-store" });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(
    typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
      ? result.error : "Could not load this road rating.",
  );
  return result as Submission;
}

export function ResultsPage({ id }: { id: string }) {
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const refresh = useCallback(async () => {
    try {
      const record = await getSubmission(id);
      setSubmission(record);
      setLocation(record.location_text);
      if (record.status === "needs_review") {
        const saved: unknown = JSON.parse(sessionStorage.getItem(`roadrate:candidates:${id}`) ?? "[]");
        setCandidates(Array.isArray(saved) ? saved as Candidate[] : []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this road rating.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    void getSubmission(id).then((record) => {
      if (!active) return;
      setSubmission(record);
      setLocation(record.location_text);
      if (record.status === "needs_review") {
        const saved: unknown = JSON.parse(sessionStorage.getItem(`roadrate:candidates:${id}`) ?? "[]");
        setCandidates(Array.isArray(saved) ? saved as Candidate[] : []);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load this road rating.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  async function confirmLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirming(true);

    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(id)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, ...(selectedCandidate ? { candidate: selectedCandidate } : {}) }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "Could not verify this location.",
      );
      if (typeof result === "object" && result !== null && "status" in result && result.status === "needs_review") {
        const nextCandidates = "candidates" in result && Array.isArray(result.candidates) ? result.candidates as Candidate[] : [];
        setCandidates(nextCandidates);
        setSelectedCandidate(null);
        setError("We still can’t confirm an exact location. Please make the address more specific.");
        return;
      }
      sessionStorage.removeItem(`roadrate:candidates:${id}`);
      await refresh();
      invalidateRoadMapCache();
      window.dispatchEvent(new CustomEvent("roadrate:submission-complete", { detail: { id } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify this location.");
    } finally {
      setConfirming(false);
    }
  }

  async function flagSubmission() {
    if (flagged) return;
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(id)}/flag`, { method: "POST" });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "Could not flag this rating.",
      );
      setFlagged(true);
      if (submission && typeof result === "object" && result !== null && "flag_count" in result &&
        typeof result.flag_count === "number") {
        setSubmission({ ...submission, flag_count: result.flag_count });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not flag this rating.");
    }
  }

  function navigate(tab: AppTab) {
    router.push(tab === "rate" ? "/" : `/?tab=${tab}`);
  }

  if (loading && !submission) return <div className="screen-message" role="status">Loading your road rating…</div>;
  if (error && !submission) return <div className="screen-message" role="alert">{error}</div>;
  if (!submission) return null;

  const rating = submission.paser_rating;
  const date = new Date(submission.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Bumpz home">
          <BrandMark />
          <span className="brand-name">Bumpz</span>
        </Link>
        <Navigation active="rate" onChange={navigate} />
      </header>
      <main className="page-wrap">
        <div className="result-grid">
        <div className="result-photo-wrap">
          <img className="result-photo" src={submission.photo_url} alt={`Road photo at ${submission.location_text}`} />
          {rating !== null && <span className={`rating-badge large ${badgeClass(rating)}`} aria-label={`PASER estimate ${rating} out of 10`}>{rating}</span>}
        </div>
        <aside className="result-aside">
          {submission.status === "needs_review" ? (
            <section className="content-card">
              <p className="eyebrow">One more thing</p>
              <h1 className="detail-title">Let’s place this road accurately</h1>
              <p className="card-help">We couldn’t confirm one exact U.S. match automatically. No map pin is created until you confirm a location below.</p>
              {candidates.length > 0 && (
                <div className="review-candidates" aria-label="Possible locations">
                  {candidates.map((candidate, index) => (
                    <div className="candidate" key={`${candidate.lat}:${candidate.lng}`}>
                      <strong>Possible match {index + 1}</strong><br />{candidate.label}
                      <button
                        className="secondary-button"
                        type="button"
                        style={{ minHeight: 34, marginTop: 8, padding: "0 12px", fontSize: 11 }}
                        aria-pressed={selectedCandidate?.label === candidate.label && selectedCandidate.lat === candidate.lat && selectedCandidate.lng === candidate.lng}
                        onClick={() => { setSelectedCandidate(candidate); setError(""); }}
                      >
                        {selectedCandidate?.label === candidate.label && selectedCandidate.lat === candidate.lat && selectedCandidate.lng === candidate.lng
                          ? "Selected location" : "Use this location"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={confirmLocation}>
                <label className="field-label" htmlFor="confirm-location">Correct the location</label>
                <input className="text-input" id="confirm-location" value={location} onChange={(event) => { setLocation(event.target.value); setSelectedCandidate(null); }} />
                {error && <p className="field-error" role="alert">{error}</p>}
                <button className="primary-button form-submit" disabled={confirming}>{confirming ? "Checking…" : selectedCandidate ? "Confirm selected location" : "Confirm location"}</button>
              </form>
              <p className="disclaimer">The rating is still an estimate from a single photo, not a formal PASER survey.</p>
            </section>
          ) : rating === null ? (
            <section className="content-card">
              <p className="eyebrow">Bumpz result</p>
              <h1 className="detail-title">This photo wasn’t rated</h1>
              <p className="card-help">{submission.rationale ?? "This photo could not be rated as an asphalt road."}</p>
            </section>
          ) : (
            <>
              <section className="content-card">
                <p className="eyebrow">Your road rating</p>
                <div className="result-rating-row">
                  <span className={`rating-badge ${badgeClass(rating)}`} aria-hidden="true">{rating}</span>
                  <div className="result-rating-copy">
                    <strong>PASER estimate</strong>
                    <span className="confidence-pill">{submission.rating_confidence ?? "unknown"} confidence</span>
                  </div>
                </div>
                <p className="result-caption">{getPaserLabel(rating)}</p>
                <p className="result-caption"><strong>As entered:</strong> {submission.location_text}</p>
                <p className="result-caption"><strong>Rated on:</strong> {date}</p>
                <p className="disclaimer">A single-photo estimate for information only. This is not a formal PASER survey or engineering assessment.</p>
              </section>
              <section className="content-card">
                <h2 className="detail-title">What we noticed</h2>
                {submission.distresses?.length ? (
                  <ul className="distress-list">
                    {submission.distresses.map((distress, index) => (
                      <li className="distress-item" key={`${distress.type}-${index}`}>
                        <span className="distress-type">{distress.type}</span>
                        <span className="distress-meta">{distress.severity} · {distress.extent}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="card-help">No visible distress was identified.</p>}
                {submission.rationale && <p className="location-note" style={{ marginTop: 12 }}>{submission.rationale}</p>}
              </section>
              <section className="content-card">
                <h2 className="detail-title">Your road on the map</h2>
                <RoadMap focusedId={submission.id} />
              </section>
              {error && <p className="error-banner" role="alert">{error}</p>}
              <button className="secondary-button" type="button" onClick={() => void flagSubmission()} disabled={flagged} aria-label="Flag this road rating">
                {flagged ? "Thanks — flagged for review" : "Not right? Flag this"}
                {submission.flag_count > 0 && !flagged ? ` · ${submission.flag_count}` : ""}
              </button>
            </>
          )}
        </aside>
        </div>
        {submission.status === "needs_review" && <button className="secondary-button" type="button" onClick={() => router.push("/")}>Back to Rate</button>}
      </main>
    </div>
  );
}
