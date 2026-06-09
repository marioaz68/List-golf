/**
 * /rondas-diarias/[id] — pantalla simple de salidas de la ronda del día.
 *
 * No es un torneo: el comité asigna jugadores (directo del módulo Jugadores,
 * sin inscripción manual) a cada salida y dispara el inicio con aviso por
 * Telegram a jugadores y caddies. El control de scores/handicaps sigue su
 * curso normal vía el link de captura del grupo.
 *
 * Acceso: super_admin, club_admin, tournament_director, handicap_committee.
 */
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import SalidasClient, { type SalidaRow } from "./SalidasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "handicap_committee",
]);

export default async function RondaDiariaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/rondas-diarias/${id}`);

  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  if (!roles.some((r) => ALLOWED_ROLES.has(r))) redirect("/inicio");

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name, kind, start_date, club_id, course_id")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();
  if ((tournament as { kind: string | null }).kind !== "daily_round") {
    // No es una ronda del día — mandar al editor de torneos normal.
    redirect(`/tournaments/edit?id=${id}`);
  }

  // Ronda principal (la ronda del día tiene una sola ronda).
  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, group_size")
    .eq("tournament_id", id)
    .order("round_no", { ascending: true })
    .limit(1);
  const round = (roundsRaw ?? [])[0] as
    | { id: string; round_no: number; round_date: string | null; group_size: number | null }
    | undefined;

  let salidas: SalidaRow[] = [];
  let roundId = "";
  let roundDate: string | null = null;
  let groupSize = 4;

  if (round?.id) {
    roundId = String(round.id);
    roundDate = round.round_date ?? null;
    groupSize = round.group_size ?? 4;

    const { data: groupsRaw } = await admin
      .from("pairing_groups")
      .select("id, group_no, tee_time, starting_hole, notes, actual_start_at")
      .eq("round_id", roundId)
      .order("tee_time", { ascending: true })
      .order("starting_hole", { ascending: true });

    const groups = (groupsRaw ?? []) as Array<{
      id: string;
      group_no: number | null;
      tee_time: string | null;
      starting_hole: number | null;
      notes: string | null;
      actual_start_at: string | null;
    }>;

    const groupIds = groups.map((g) => g.id);
    const membersByGroup = new Map<string, SalidaRow["players"]>();
    const caddieByEntry = new Map<
      string,
      { caddieId: string; caddieName: string }
    >();

    if (groupIds.length > 0) {
      const { data: membersRaw } = await admin
        .from("pairing_group_members")
        .select(
          `id, position, group_id, entry_id,
           tournament_entries (
             id, player_id, handicap_index,
             players ( first_name, last_name, handicap_index, telegram_user_id, telegram_chat_id )
           )`
        )
        .in("group_id", groupIds)
        .order("position", { ascending: true });

      // Caddies activos asignados en esta ronda (por entry).
      const { data: caddieRows } = await admin
        .from("caddie_assignments")
        .select(
          `entry_id, caddie_id, is_active,
           caddies ( id, first_name, last_name )`
        )
        .eq("tournament_id", id)
        .eq("round_id", roundId)
        .eq("is_active", true);
      type CaddieAssignRaw = {
        entry_id: string | null;
        caddie_id: string | null;
        caddies:
          | { id: string; first_name: string | null; last_name: string | null }
          | Array<{
              id: string;
              first_name: string | null;
              last_name: string | null;
            }>
          | null;
      };
      for (const c of (caddieRows ?? []) as unknown as CaddieAssignRaw[]) {
        if (!c.entry_id) continue;
        const cad = Array.isArray(c.caddies) ? c.caddies[0] : c.caddies;
        const cn =
          [cad?.first_name, cad?.last_name]
            .map((p) => String(p ?? "").trim())
            .filter(Boolean)
            .join(" ") || "Caddie";
        caddieByEntry.set(String(c.entry_id), {
          caddieId: String(c.caddie_id ?? cad?.id ?? ""),
          caddieName: cn,
        });
      }

      type MemberRaw = {
        id: string;
        position: number | null;
        group_id: string;
        entry_id: string | null;
        tournament_entries:
          | {
              id: string | null;
              player_id: string | null;
              handicap_index: number | null;
              players:
                | {
                    first_name: string | null;
                    last_name: string | null;
                    handicap_index: number | null;
                    telegram_user_id?: string | null;
                    telegram_chat_id?: string | null;
                  }
                | null;
            }
          | null;
      };

      for (const m of (membersRaw ?? []) as unknown as MemberRaw[]) {
        const entry = Array.isArray(m.tournament_entries)
          ? m.tournament_entries[0]
          : m.tournament_entries;
        const player = entry?.players
          ? Array.isArray(entry.players)
            ? entry.players[0]
            : entry.players
          : null;
        const name =
          [player?.first_name, player?.last_name]
            .map((p) => String(p ?? "").trim())
            .filter(Boolean)
            .join(" ") || "(sin nombre)";
        const hi =
          entry?.handicap_index ?? player?.handicap_index ?? null;
        const hasTelegram = Boolean(
          (player?.telegram_chat_id ?? player?.telegram_user_id ?? "")
            .toString()
            .trim()
        );
        const entryId = entry?.id ? String(entry.id) : "";
        const caddie = entryId ? caddieByEntry.get(entryId) : undefined;
        const list = membersByGroup.get(m.group_id) ?? [];
        list.push({
          memberId: m.id,
          entryId,
          playerId: entry?.player_id ? String(entry.player_id) : "",
          name,
          handicapIndex: hi,
          hasTelegram,
          caddieId: caddie?.caddieId ?? null,
          caddieName: caddie?.caddieName ?? null,
        });
        membersByGroup.set(m.group_id, list);
      }
    }

    salidas = groups.map((g) => ({
      groupId: g.id,
      groupNo: g.group_no,
      teeTime: g.tee_time ? g.tee_time.slice(0, 5) : null,
      startingHole: g.starting_hole,
      notes: g.notes,
      startedAt: g.actual_start_at,
      players: membersByGroup.get(g.id) ?? [],
    }));
  }

  return (
    <SalidasClient
      tournamentId={id}
      tournamentName={String((tournament as { name: string }).name ?? "Ronda del día")}
      roundId={roundId}
      roundDate={roundDate}
      groupSize={groupSize}
      clubId={(tournament as { club_id: string | null }).club_id}
      salidas={salidas}
    />
  );
}
