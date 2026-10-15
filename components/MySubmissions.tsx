"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";

const savedSubmissionSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  location_text: z.string(),
  paser_rating: z.number().nullable(),
  photo_url: z.string().url(),
  status: z.string(),
});
type SavedSubmission = z.infer<typeof savedSubmissionSchema>;
const savedIdsSchema = z.array(z.string().uuid()).max(50);

export function MySubmissions() {
  const [items, setItems] = useState<SavedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ids = savedIdsSchema.parse(JSON.parse(localStorage.getItem("roadrate:submissions") ?? "[]"));
        const results = await Promise.all(ids.map(async (id) => {
          const response = await fetch(`/api/submissions/${encodeURIComponent(id)}`);
          if (!response.ok) throw new Error(`Could not load saved submission ${id}.`);
          return savedSubmissionSchema.parse(await response.json());
        }));
        if (!cancelled) setItems(results);
      } catch (cause) {
        console.error("Could not load saved submissions:", cause);
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load your saved roads.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="screen-message" role="status">Loading your roads…</div>;
  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!items.length) {
    return (
      <div className="empty-state">
        <span className="upload-icon" aria-hidden="true">↗</span>
        <h2>Your roads will show up here</h2>
        <p>Rate a road and keep a little record of the streets you’ve explored.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 14, paddingBottom: 36 }}>
      {items.map((item) => (
        <Link className="content-card" href={`/submissions/${item.id}`} key={item.id} style={{ display: "grid", gridTemplateColumns: "112px 1fr auto", alignItems: "center", gap: 15, color: "inherit", textDecoration: "none" }}>
          <img src={item.photo_url} alt={`Road at ${item.location_text}`} style={{ width: 112, height: 86, borderRadius: 13, objectFit: "cover", background: "#edf1ed" }} />
          <span>
            <strong style={{ display: "block", fontSize: 14, lineHeight: 1.4 }}>{item.location_text}</strong>
            <span style={{ display: "block", marginTop: 5, color: "#718078", fontSize: 11 }}>
              {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </span>
          {item.paser_rating !== null
            ? <span className={`rating-badge small ${item.paser_rating <= 3 ? "rating-low" : item.paser_rating <= 6 ? "rating-mid" : "rating-high"}`}>{item.paser_rating}</span>
            : <span className="confidence-pill">{item.status.replace("_", " ")}</span>}
        </Link>
      ))}
    </div>
  );
}
