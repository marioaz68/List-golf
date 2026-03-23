import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PlayerRow = {
  first_name?: string;
  last_name?: string;
  handicap_index?: number | string;
  phone?: string;
  email?: string;
  club?: string;
  handicap_torneo?: number | string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // Usa SERVICE_ROLE para upsert desde backend (API route)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toNumberOrNull(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cleanString(v: unknown) {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: PlayerRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "No rows provided" }, { status: 400 });
    }

    // Normaliza datos (no mandamos email_norm/phone_norm: triggers los llenan)
    const normalized = rows.map((r) => ({
      first_name: cleanString(r.first_name),
      last_name: cleanString(r.last_name),
      handicap_index: toNumberOrNull(r.handicap_index),
      phone: cleanString(r.phone),
      email: cleanString(r.email),
      club: cleanString(r.club),
      handicap_torneo: toNumberOrNull(r.handicap_torneo),
    }));

    // 1) Con email -> upsert por email_norm
    const withEmail = normalized.filter((r) => r.email);
    if (withEmail.length) {
      const { error } = await supabase
        .from("players")
        .upsert(withEmail, { onConflict: "email_norm" }); // usa tu índice UNIQUE de email_norm
      if (error) throw error;
    }

    // 2) Sin email pero con phone -> upsert por phone_norm
    const withoutEmailWithPhone = normalized.filter((r) => !r.email && r.phone);
    if (withoutEmailWithPhone.length) {
      const { error } = await supabase
        .from("players")
        .upsert(withoutEmailWithPhone, { onConflict: "phone_norm" }); // usa tu índice UNIQUE de phone_norm
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      processed: rows.length,
      upsertedByEmail: withEmail.length,
      upsertedByPhone: withoutEmailWithPhone.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}