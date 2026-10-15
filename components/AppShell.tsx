"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BrandMark } from "@/components/Brand";
import { Navigation, type AppTab } from "@/components/Navigation";
import { MySubmissions } from "@/components/MySubmissions";
import { SubmissionForm } from "@/components/SubmissionForm";

const RoadMap = dynamic(() => import("@/components/RoadMap").then((module) => module.RoadMap), {
  ssr: false,
  loading: () => <div className="map-card" style={{ height: 420 }} aria-busy="true" />,
});

export function AppShell() {
  const [active, setActive] = useState<AppTab>("rate");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "map" || tab === "mine" || tab === "rate") setActive(tab);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Bumpz home">
          <BrandMark />
          <span className="brand-name">Bumpz</span>
        </Link>
        <Navigation active={active} onChange={setActive} />
      </header>
      <main className="page-wrap">
        {active === "rate" && (
          <div className="home-grid">
            <div className="hero-copy">
              <p className="eyebrow">See your street clearly</p>
              <h1 className="hero-title">Better roads start with one <span>photo.</span></h1>
              <p className="hero-subtitle">Share a road photo to get a rating and help your community track road conditions.</p>
            </div>
            <SubmissionForm />
          </div>
        )}
        {active === "map" && (
          <section className="map-page-shell">
            <div className="section-header">
              <div>
                <p className="eyebrow">Roads around you</p>
                <h1 className="section-title">The road map</h1>
                <p className="section-description">Explore photo-based PASER estimates from across the U.S.</p>
              </div>
            </div>
            <RoadMap />
            <p className="disclaimer" style={{ marginTop: 14 }}>Ratings are estimates from single photos, not formal PASER surveys.</p>
          </section>
        )}
        {active === "mine" && (
          <section style={{ padding: "30px 0" }}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Your contributions</p>
                <h1 className="section-title">My roads</h1>
                <p className="section-description">A little collection of the streets you’ve shared.</p>
              </div>
            </div>
            <MySubmissions />
          </section>
        )}
      </main>
    </div>
  );
}
