/**
 * Banner que aparece HASTA ARRIBA de /tournaments (lista de torneos) para
 * los staff que pueden operar las rondas diarias del club.
 *
 * - Si la ronda del día YA existe: tarjeta verde con "Abrir hoy →"
 * - Si NO existe: tarjeta ámbar con "➕ Crear ronda de hoy" (link a /rondas-diarias)
 * - Si el usuario no tiene rol → no renderiza nada.
 *
 * Server component — consulta directa a BD.
 */
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "handicap_committee",
]);

interface Props {
  userRoles: string[];
}

function todayMexico(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatHumanDate(iso: string): string {
  const dt = new Date(iso + "T12:00:00");
  return dt.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function TodayDailyRoundBanner({ userRoles }: Props) {
  if (!userRoles.some((r) => ALLOWED_ROLES.has(r))) return null;

  const admin = createAdminClient();
  const date = todayMexico();

  let todayRound: {
    id: string;
    name: string;
    status: string;
    entriesCount: number;
  } | null = null;

  try {
    const { data: round, error } = await admin
      .from("tournaments")
      .select("id, name, status")
      .eq("kind", "daily_round")
      .eq("start_date", date)
      .limit(1)
      .maybeSingle();

    if (error) {
      // Migración aún no aplicada → no romper la página, solo ocultar el banner
      if (/(kind|is_private)/i.test(error.message)) return null;
    }

    if (round) {
      const { data: entries } = await admin
        .from("tournament_entries")
        .select("id", { count: "exact", head: false })
        .eq("tournament_id", round.id);
      todayRound = {
        id: String(round.id),
        name: String(round.name),
        status: String(round.status ?? ""),
        entriesCount: Array.isArray(entries) ? entries.length : 0,
      };
    }
  } catch {
    return null;
  }

  // --- Estilos inline para no chocar con el resto del page ---
  const wrap: React.CSSProperties = {
    borderRadius: 12,
    padding: "14px 16px",
    border: "2px solid",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };
  const greenWrap: React.CSSProperties = {
    ...wrap,
    borderColor: "#10b981",
    background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
  };
  const amberWrap: React.CSSProperties = {
    ...wrap,
    borderColor: "#f59e0b",
    background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#475569",
  };
  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  };
  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  };
  const primaryBtn: React.CSSProperties = {
    display: "inline-block",
    background: "#10b981",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: "none",
    fontSize: 14,
  };
  const amberBtn: React.CSSProperties = {
    ...primaryBtn,
    background: "#f59e0b",
  };
  const ghostBtn: React.CSSProperties = {
    display: "inline-block",
    background: "#fff",
    color: "#065f46",
    border: "1px solid #10b981",
    padding: "10px 14px",
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: "none",
    fontSize: 13,
  };

  if (todayRound) {
    return (
      <div style={greenWrap}>
        <div>
          <div style={labelStyle}>🗓️ Ronda del día · {formatHumanDate(date)}</div>
          <h2 style={titleStyle}>{todayRound.name}</h2>
          <p style={subStyle}>
            {todayRound.entriesCount}{" "}
            {todayRound.entriesCount === 1 ? "jugador" : "jugadores"} ·{" "}
            estatus <strong>{todayRound.status}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={`/tournaments/edit?tournament_id=${todayRound.id}`}
            style={primaryBtn}
          >
            Abrir hoy →
          </Link>
          <Link
            href={`/tee-sheet?tournament_id=${todayRound.id}`}
            style={ghostBtn}
          >
            Tee Sheet
          </Link>
          <Link
            href={`/score-entry?tournament_id=${todayRound.id}`}
            style={ghostBtn}
          >
            Capturar scores
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={amberWrap}>
      <div>
        <div style={labelStyle}>🗓️ Hoy · {formatHumanDate(date)}</div>
        <h2 style={titleStyle}>Aún no hay ronda creada para hoy</h2>
        <p style={subStyle}>
          Cuando llegue gente al campo, crea la ronda del día y agrega
          jugadores. Queda privada (no aparece en la página pública del club).
        </p>
      </div>
      <Link href="/rondas-diarias" style={amberBtn}>
        ➕ Crear ronda de hoy
      </Link>
    </div>
  );
}
