import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/utils/supabase/server";
import { startingHoleLabelForGroup } from "@/app/torneos/[id]/lib/shotgunStartingLabels";

export const dynamic = "force-dynamic";

type RoundRow = {
  id: string;
  tournament_id: string;
  round_no: number;
  round_date: string | null;
  start_type: string | null;
  start_time: string | null;
  categories?:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

type GroupRow = {
  id: string;
  round_id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  notes: string | null;
};

function roundCategoryLabel(r: RoundRow) {
  const c = r.categories;
  const raw = Array.isArray(c) ? c[0] ?? null : c ?? null;
  const code = raw?.code?.trim() || "";
  const name = raw?.name?.trim() || "";
  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  if (name) return name;
  return "";
}

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function playerName(first: string | null, last: string | null) {
  const a = String(last ?? "").trim();
  const b = String(first ?? "").trim();
  return `${a} ${b}`.trim() || "—";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tournamentId = request.nextUrl.searchParams.get("tournament_id")?.trim() ?? "";
  if (!tournamentId) {
    return NextResponse.json({ error: "Falta tournament_id" }, { status: 400 });
  }

  const roundId = request.nextUrl.searchParams.get("round_id")?.trim() ?? "";
  if (!roundId) {
    return NextResponse.json({ error: "Falta round_id" }, { status: 400 });
  }

  const { data: tRow, error: tErr } = await supabase
    .from("tournaments")
    .select("id,name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr || !tRow) {
    return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
  }

  const tournamentName = String((tRow as { name?: string | null }).name ?? "").trim() || "torneo";

  const { data: rRow, error: rErr } = await supabase
    .from("rounds")
    .select(
      `
      id,
      tournament_id,
      round_no,
      round_date,
      start_type,
      start_time,
      categories:categories (
        code,
        name
      )
    `
    )
    .eq("id", roundId)
    .maybeSingle();

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  if (!rRow) {
    return NextResponse.json({ error: "Ronda no encontrada" }, { status: 404 });
  }

  const round = rRow as RoundRow;
  if (round.tournament_id !== tournamentId) {
    return NextResponse.json(
      { error: "La ronda no pertenece a este torneo" },
      { status: 400 }
    );
  }

  const rounds = [round];
  const roundIds = [roundId];

  const { data: gData, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id,round_id,group_no,tee_time,starting_hole,notes")
    .in("round_id", roundIds)
    .order("round_id", { ascending: true })
    .order("group_no", { ascending: true });

  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  const allGroups = (gData ?? []) as GroupRow[];
  const groupsByRound = new Map<string, GroupRow[]>();
  for (const g of allGroups) {
    const list = groupsByRound.get(g.round_id) ?? [];
    list.push(g);
    groupsByRound.set(g.round_id, list);
  }

  const groupIds = allGroups.map((g) => g.id);
  const membersByGroup = new Map<
    string,
    Array<{
      position: number;
      name: string;
      club: string;
      handicap: string;
    }>
  >();

  if (groupIds.length > 0) {
    const { data: mData, error: mErr } = await supabase
      .from("pairing_group_members")
      .select(
        `
        group_id,
        position,
        tournament_entries (
          handicap_index,
          players (
            first_name,
            last_name,
            clubs:clubs (
              name,
              short_name
            )
          )
        )
      `
      )
      .in("group_id", groupIds)
      .order("position", { ascending: true });

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    for (const row of (mData ?? []) as any[]) {
      const gid = row.group_id as string;
      const te = Array.isArray(row.tournament_entries)
        ? row.tournament_entries[0] ?? null
        : row.tournament_entries ?? null;
      const player = Array.isArray(te?.players)
        ? te.players[0] ?? null
        : te?.players ?? null;
      const club = Array.isArray(player?.clubs)
        ? player.clubs[0] ?? null
        : player?.clubs ?? null;
      const clubLabel =
        (club?.short_name ?? "").trim() || (club?.name ?? "").trim() || "—";
      const hi = te?.handicap_index;
      const entry = {
        position: Number(row.position ?? 0),
        name: playerName(player?.first_name ?? null, player?.last_name ?? null),
        club: clubLabel,
        handicap: hi == null || hi === "" ? "—" : String(hi),
      };
      const list = membersByGroup.get(gid) ?? [];
      list.push(entry);
      membersByGroup.set(gid, list);
    }
  }

  const rows: Record<string, string | number>[] = [];

  for (const round of rounds) {
    const groups = (groupsByRound.get(round.id) ?? []).sort(
      (a, b) => Number(a.group_no) - Number(b.group_no)
    );
    const n = groups.length;
    const roundCat = roundCategoryLabel(round);
    const startTypeLabel = String(round.start_type ?? "").trim() || "—";

    groups.forEach((g, idx) => {
      const salida = startingHoleLabelForGroup({
        startType: round.start_type,
        groupIndexInRound: idx,
        groupsInRound: n,
        starting_hole: g.starting_hole,
      });
      const members = (membersByGroup.get(g.id) ?? []).sort((a, b) => a.position - b.position);

      if (members.length === 0) {
        rows.push({
          Torneo: tournamentName,
          Ronda: round.round_no,
          "Fecha ronda": round.round_date ?? "—",
          "Tipo salida": startTypeLabel,
          "Categoría ronda": roundCat || "—",
          Grupo: g.group_no,
          "Hora tee": (g.tee_time ?? round.start_time ?? "—").toString().slice(0, 5),
          Salida: salida ?? "—",
          "Categoría grupo": catKey(g.notes),
          Pos: "—",
          Jugador: "—",
          Club: "—",
          HCP: "—",
        });
        return;
      }

      for (const m of members) {
        rows.push({
          Torneo: tournamentName,
          Ronda: round.round_no,
          "Fecha ronda": round.round_date ?? "—",
          "Tipo salida": startTypeLabel,
          "Categoría ronda": roundCat || "—",
          Grupo: g.group_no,
          "Hora tee": (g.tee_time ?? round.start_time ?? "—").toString().slice(0, 5),
          Salida: salida ?? "—",
          "Categoría grupo": catKey(g.notes),
          Pos: m.position,
          Jugador: m.name,
          Club: m.club,
          HCP: m.handicap,
        });
      }
    });
  }

  if (rows.length === 0) {
    const roundCat = roundCategoryLabel(round);
    const startTypeLabel = String(round.start_type ?? "").trim() || "—";
    rows.push({
      Torneo: tournamentName,
      Ronda: round.round_no,
      "Fecha ronda": round.round_date ?? "—",
      "Tipo salida": startTypeLabel,
      "Categoría ronda": roundCat || "—",
      Grupo: "—",
      "Hora tee": "—",
      Salida: "—",
      "Categoría grupo": "—",
      Pos: "—",
      Jugador: "No hay grupos en esta ronda",
      Club: "—",
      HCP: "—",
    });
  }

  const csv = "\uFEFF" + Papa.unparse(rows);
  const safeTournament = tournamentName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "torneo";
  const datePart = String(round.round_date ?? "")
    .replace(/[^\d-]/g, "")
    .slice(0, 10);
  const filename = `salidas_R${round.round_no}${datePart ? `_${datePart}` : ""}_${safeTournament}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
