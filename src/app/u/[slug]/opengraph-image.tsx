/**
 * Dynamic OG image for /u/[slug] — rendered server-side via next/og.
 *
 * Produces a 1200×630 card with the student's name, program, and a credit
 * progress bar. Used in Twitter/LinkedIn/Reddit link unfurls.
 */

import { getPublicProfileBySlug } from "@/lib/community/public-profile";
import { TOTAL_DEGREE_CREDITS } from "@/lib/domain/requirements";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ImageResponse> {
  const { slug } = await params;
  const profile = await getPublicProfileBySlug(slug);

  const name = profile?.displayName ?? "Concordia student";
  const program = profile?.program ?? "Software Engineering";
  const earned = profile?.creditsEarned ?? 0;
  const pct = Math.min(100, Math.round((earned / TOTAL_DEGREE_CREDITS) * 100));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0f1c17",
        color: "#e8f0ea",
        padding: "64px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: 28, color: "#7fcfa3", letterSpacing: 2 }}>SOEN COMPASS</div>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 32, color: "#9fb3a8" }}>{`Concordia · ${program}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", fontSize: 36 }}>
          {`${earned} / ${TOTAL_DEGREE_CREDITS} credits (${pct}%)`}
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "24px",
            background: "#1d3329",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: "#2f9d6b" }} />
        </div>
      </div>
    </div>,
    { ...size },
  );
}
