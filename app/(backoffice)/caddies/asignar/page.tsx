import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import AsignarCaddieClient, {
  type AssignmentContext,
  type CaddieOption,
} from "./AsignarCaddieClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function getParam(sp: SP, key: string): string {
  const value = sp[key];
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

type EntryRow = {
  id: string;
  tournament_id: string;
  player_number: number | null;
  status: string | null;
  players: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  categories: { code: string | null; name: string | null } | null;
};

type RoundRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
};

type PairingGroupRow = {
  id: string;
  round_id: string;
  group_no: number | null;
  starting_hole: number | null;
  tee_time: string | null;
};

type AssignmentRow = {
  id: string;
  entry_id: string;
  caddie_id: string;
  round_id: string | null;
  is_active: boolean | null;
};

function displayPlayer(entry: EntryRow): string {
  const p = entry.players;
  const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return full || "Jugador sin nombre";
}

function displayCategory(entry: EntryRow): string {
  const c = entry.categories;
  return c?.code ?? c?.name ?? "—";
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

const pageWrap: React.CSSProperties = {
  padding: "16px 20px",
  display: "grid",
  gap: 14,
  maxWidth: 1100,
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const headerStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const ghostButtonStyle: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const playerHeroStyle: React.CSSProperties = {
  padding: "16px",
  display: "grid",
  gap: 6,
};

const labelChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#e0e7ff",
  color: "#3730a3",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
};

export default async function AsignarCaddiePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const entry_id = getParam(sp, "entry_id");
  const queryTournamentId = getParam(sp, "tournament_id");
  const queryRoundId = getParam(sp, "round_id");
  const backParam = getParam(sp, "back");

  if (!entry_id) {
    redirect("/entries");
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // 1. Inscrito
  const { data: entryRowRaw } = await supabase
    .from("tournament_entries")
    .select(
      `id, tournament_id, player_number, status,
       players ( first_name, last_name ),
       categories ( code, name )`
    )
    .eq("id", entry_id)
    .maybeSingle();

  const entry = entryRowRaw as EntryRow | null;
  if (!entry) {
    redirect("/entries");
  }

  const tournamentId = queryTournamentId || entry.tournament_id;

  // 2. Torneo
  const { data: tournamentRow } = await supabase
    .from("tournaments")
    .select("id, name, short_name")
    .eq("id", tournamentId)
    .maybeSingle();

  // 3. Rondas del torneo (ordenadas)
  const { data: roundsRaw } = await supabase
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  const rounds = (roundsRaw ?? []) as RoundRow[];

  // 4. Elegir ronda: query > primera ronda disponible.
  //    Modo "Todas": por defecto (sin round_id en la URL) el caddie se asigna
  //    a TODAS las rondas del torneo. Al elegir una ronda concreta (R1, R2…)
  //    se cambia solo esa ronda. La ronda ancla para el insert es la primera.
  const allRoundsMode = rounds.length > 0 && !queryRoundId;
  const round =
    rounds.find((r) => r.id === queryRoundId) ??
    rounds[0] ??
    null;

  // 5. Grupo del jugador en esa ronda (para guardar pairing_group_id)
  let pairingGroup: PairingGroupRow | null = null;
  if (round) {
    const { data: memberRow } = await supabase
      .from("pairing_group_members")
      .select("group_id, entry_id")
      .eq("entry_id", entry_id);
    const memberGroupIds = (memberRow ?? [])
      .map((m) => m.group_id)
      .filter(Boolean);
    if (memberGroupIds.length > 0) {
      const { data: groupsRaw } = await supabase
        .from("pairing_groups")
        .select("id, round_id, group_no, starting_hole, tee_time")
        .in("id", memberGroupIds);
      const groups = (groupsRaw ?? []) as PairingGroupRow[];
      pairingGroup =
        groups.find((g) => g.round_id === round.id) ?? null;
    }
  }

  // 6. Asignaciones activas del torneo+ronda (para detectar conflictos
  //    y resaltar el caddie actual del jugador).
  const { data: assignmentsRaw } = await supabaseAdmin
    .from("caddie_assignments")
    .select("id, entry_id, caddie_id, round_id, is_active")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);
  const assignments = (assignmentsRaw ?? []) as AssignmentRow[];

  const currentAssignmentForRound = round
    ? assignments.find(
        (a) => a.entry_id === entry_id && a.round_id === round.id
      ) ?? null
    : null;
  const currentCaddieId = currentAssignmentForRound?.caddie_id ?? null;

  const busyCaddieIds = new Set<string>();
  if (round) {
    for (const a of assignments) {
      if (
        a.round_id === round.id &&
        a.entry_id !== entry_id &&
        a.caddie_id
      ) {
        busyCaddieIds.add(a.caddie_id);
      }
    }
  }

  // 7. Catálogo de caddies activos
  const { data: caddiesRaw } = await supabase
    .from("caddies")
    .select(
      "id, first_name, last_name, nickname, phone, whatsapp_phone, telegram, level, is_active"
    )
    .eq("is_active", true)
    .order("first_name", { ascending: true });

  const caddies: CaddieOption[] = (caddiesRaw ?? []).map((c) => ({
    id: String(c.id),
    firstName: String(c.first_name ?? "").trim(),
    lastName: String(c.last_name ?? "").trim(),
    nickname: c.nickname ?? null,
    phone: c.phone ?? null,
    whatsapp: c.whatsapp_phone ?? null,
    telegram: c.telegram ?? null,
    level: c.level ?? null,
    isActive: c.is_active !== false,
    alreadyAssignedToOtherEntry: busyCaddieIds.has(String(c.id)),
  }));

  const redirectTo = backParam || "/entries";

  const ctx: AssignmentContext = {
    tournamentId,
    entryId: entry_id,
    roundId: round?.id ?? "",
    pairingGroupId: pairingGroup?.id ?? null,
    redirectTo,
    currentCaddieId,
    allRounds: allRoundsMode,
  };

  const tournamentName =
    tournamentRow?.short_name ?? tournamentRow?.name ?? "Torneo";

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#64748b",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Asignar caddie
            </div>
            <h1
              style={{
                margin: "2px 0 0 0",
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {displayPlayer(entry)}
            </h1>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#475569",
              }}
            >
              {tournamentName} ·{" "}
              {entry.player_number != null
                ? `#${entry.player_number} · `
                : ""}
              {displayCategory(entry)}
              {allRoundsMode
                ? " · Todas las rondas"
                : round
                  ? ` · R${round.round_no ?? "?"}`
                  : ""}
              {pairingGroup
                ? ` · Grupo ${pairingGroup.group_no ?? "?"} (${formatTime(
                    pairingGroup.tee_time
                  )})`
                : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={redirectTo} style={ghostButtonStyle}>
              ← Volver
            </Link>
            <Link
              href={`/caddies?tournament_id=${encodeURIComponent(
                tournamentId
              )}`}
              style={ghostButtonStyle}
            >
              Asignaciones del torneo
            </Link>
          </div>
        </div>

        {round && rounds.length > 1 ? (
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid #e5e7eb",
              background: "#fafafa",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span style={labelChipStyle}>RONDA</span>
            {(() => {
              // "Todas" siempre primero. Omite round_id para volver al modo
              // que asigna el caddie a todas las rondas del torneo.
              const allParams = new URLSearchParams({
                entry_id,
                tournament_id: tournamentId,
              });
              if (backParam) allParams.set("back", backParam);
              return (
                <Link
                  href={`/caddies/asignar?${allParams.toString()}`}
                  style={{
                    ...ghostButtonStyle,
                    background: allRoundsMode ? "#111827" : "#fff",
                    color: allRoundsMode ? "#fff" : "#0f172a",
                    borderColor: allRoundsMode ? "#111827" : "#cbd5e1",
                    fontWeight: 800,
                    height: 28,
                    fontSize: 11,
                  }}
                >
                  Todas
                </Link>
              );
            })()}
            {rounds.map((r) => {
              const isCurrent = !allRoundsMode && r.id === round.id;
              const baseParams = new URLSearchParams({
                entry_id,
                tournament_id: tournamentId,
                round_id: r.id,
              });
              if (backParam) baseParams.set("back", backParam);
              return (
                <Link
                  key={r.id}
                  href={`/caddies/asignar?${baseParams.toString()}`}
                  style={{
                    ...ghostButtonStyle,
                    background: isCurrent ? "#111827" : "#fff",
                    color: isCurrent ? "#fff" : "#0f172a",
                    borderColor: isCurrent ? "#111827" : "#cbd5e1",
                    fontWeight: 700,
                    height: 28,
                    fontSize: 11,
                  }}
                >
                  R{r.round_no ?? "?"}
                </Link>
              );
            })}
          </div>
        ) : null}

        <div style={playerHeroStyle}>
          {!round ? (
            <div
              style={{
                padding: "10px 12px",
                border: "1px dashed #f59e0b",
                background: "#fffbeb",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400e",
              }}
            >
              El torneo no tiene rondas creadas todavía. Configura al menos
              una ronda en{" "}
              <Link
                href={`/rounds?tournament_id=${encodeURIComponent(
                  tournamentId
                )}`}
                style={{
                  color: "#92400e",
                  textDecoration: "underline",
                  fontWeight: 700,
                }}
              >
                Rondas
              </Link>{" "}
              antes de asignar caddies.
            </div>
          ) : caddies.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                borderRadius: 8,
                fontSize: 12,
                color: "#475569",
              }}
            >
              No hay caddies activos en el catálogo.{" "}
              <Link
                href="/caddies/new"
                style={{
                  color: "#0f172a",
                  textDecoration: "underline",
                  fontWeight: 700,
                }}
              >
                Agregar caddie
              </Link>
            </div>
          ) : (
            <AsignarCaddieClient caddies={caddies} ctx={ctx} />
          )}
        </div>
      </div>
    </div>
  );
}
