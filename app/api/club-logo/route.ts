import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubLogoRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
  generated_logo_url: string | null;
  primary_color: string | null;
};

function normalizeShort(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "CLB";

  return (
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "CLB"
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorFromShort(value: string | null) {
  const palette = [
    "#0f766e",
    "#1d4ed8",
    "#7c3aed",
    "#be123c",
    "#b45309",
    "#15803d",
    "#0369a1",
    "#4338ca",
    "#a21caf",
    "#0f172a",
    "#166534",
    "#92400e",
  ];

  const seed = normalizeShort(value);
  return palette[hashString(seed) % palette.length];
}

function normalizeLogoUrl(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);

    if (url.hostname === "www.dropbox.com" || url.hostname === "dropbox.com") {
      url.hostname = "dl.dropboxusercontent.com";
      url.searchParams.delete("dl");
      url.searchParams.delete("raw");
      return url.toString();
    }

    return raw;
  } catch {
    return raw;
  }
}

function svgLogo(shortName: string, color: string) {
  const safeShort = shortName.replace(/[<>&"']/g, "");
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f766e";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="35%" cy="25%" r="75%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="48%" stop-color="${safeColor}"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  <circle cx="48" cy="48" r="45" fill="url(#g)" stroke="#e2e8f0" stroke-width="4"/>
  <text x="48" y="55" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" letter-spacing="2">${safeShort}</text>
</svg>`;
}

function svgResponse(shortName: string, color: string) {
  return new NextResponse(svgLogo(shortName, color), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("club_id")?.trim() ?? "";

  if (!clubId) {
    return svgResponse("CLB", "#0f766e");
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, short_name, logo_url, generated_logo_url, primary_color")
    .eq("id", clubId)
    .maybeSingle();

  if (error || !data) {
    return svgResponse("CLB", "#0f766e");
  }

  const club = data as ClubLogoRow;
  const shortName = normalizeShort(club.short_name || club.name);
  const color = club.primary_color || colorFromShort(shortName);

  const officialLogo = normalizeLogoUrl(club.logo_url);
  if (officialLogo) {
    return NextResponse.redirect(officialLogo, {
      status: 302,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const generatedLogo = normalizeLogoUrl(club.generated_logo_url);
  if (generatedLogo) {
    return NextResponse.redirect(generatedLogo, {
      status: 302,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  return svgResponse(shortName, color);
}