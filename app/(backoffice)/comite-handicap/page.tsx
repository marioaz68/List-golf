import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { loadHandicapCommitteeAccess } from "@/lib/handicap-committee/access";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import {
  HANDICAP_COMMITTEE_DEFAULT_SIZE,
  formatAdjustmentLabel,
  trimmedAverage,
} from "@/lib/handicap-committee/constants";
import {
  enableHandicapCommittee,
  setHandicapCommitteeStatus,
  applyHandicapCommitteeSuggestion,
  setHandicapCommitteeMemberPresence,
  revokeHandicapCommitteeRole,
  setHandicapCommitteeTrim,
  inviteHandicapCommitteeMember,
  resetHandicapCommitteeVotes,
} from "./actions";
import HandicapCommitteeVoter, {
  type HandicapEntryRow,
  type HandicapVoteRow,
} from "./HandicapCommitteeVoter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function playerName(p: {
  first_name?: string | null;
  last_name?: string | null;
} | null) {
  const ln = String(p?.last_name ?? "").trim();
  const fn = String(p?.first_name ?? "").trim();
  return `${ln} ${fn}`.trim() || "Jugador";
}

export default async function ComiteHandicapPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";
  const actionError = typeof sp.err === "string" ? sp.err.trim() : "";
  const actionOk = typeof sp.ok === "string" ? sp.ok.trim() : "";
  const tab =
    typeof sp.tab === "string" && sp.tab === "admin" ? "admin" : "vote";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6 text-red-700">Inicia sesión para acceder al comité.</div>
    );
  }

  if (!tournamentId) {
    const roles = await getUserRoles(supabase, user.id);
    const isGlobalAdmin = roles.includes("super_admin") || roles.includes("club_admin");

    let allowedTournamentIds: string[] | null = null;
    if (!isGlobalAdmin) {
      const ids = new Set<string>();

      const { data: scoped } = await supabase
        .from("user_tournament_roles")
        .select("tournament_id, roles:role_id(code)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      for (const row of scoped ?? []) {
        const r: any = (row as any).roles;
        const code = Array.isArray(r) ? r[0]?.code : r?.code;
        if (code === "handicap_committee" || code === "tournament_director") {
          if ((row as any).tournament_id) ids.add(String((row as any).tournament_id));
        }
      }

      // Alcance club: todos los torneos del club donde tiene comité.
      const { data: clubScoped } = await supabase
        .from("user_club_roles")
        .select("club_id, roles:role_id(code)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const committeeClubIds = new Set<string>();
      for (const row of clubScoped ?? []) {
        const r: any = (row as any).roles;
        const code = Array.isArray(r) ? r[0]?.code : r?.code;
        if (code === "handicap_committee" && (row as any).club_id) {
          committeeClubIds.add(String((row as any).club_id));
        }
      }
      if (committeeClubIds.size > 0) {
        const { data: clubTournaments } = await supabase
          .from("tournaments")
          .select("id")
          .in("club_id", Array.from(committeeClubIds));
        for (const t of clubTournaments ?? []) {
          if ((t as any).id) ids.add(String((t as any).id));
        }
      }

      // Alcance global: comité en todo el sistema.
      const { data: globalScoped } = await supabase
        .from("user_global_roles")
        .select("roles:role_id(code)")
        .eq("user_id", user.id)
        .eq("is_active", true);
      const isGlobalCommittee = (globalScoped ?? []).some((row: any) => {
        const r = Array.isArray(row.roles) ? row.roles[0] : row.roles;
        return r?.code === "handicap_committee";
      });
      if (isGlobalCommittee) {
        allowedTournamentIds = null;
      } else {
        allowedTournamentIds = Array.from(ids);
      }
    }

    let tournamentsQuery = supabase
      .from("tournaments")
      .select("id, name, start_date")
      .order("start_date", { ascending: false })
      .limit(80);
    if (allowedTournamentIds && allowedTournamentIds.length === 0) {
      tournamentsQuery = tournamentsQuery.eq("id", "__none__");
    } else if (allowedTournamentIds) {
      tournamentsQuery = tournamentsQuery.in("id", allowedTournamentIds);
    }

    const { data: tournaments } = await tournamentsQuery;

    if ((tournaments ?? []).length === 1) {
      redirect(`/comite-handicap?tournament_id=${tournaments![0].id}`);
    }

    return (
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Comité de Handicap</h1>
          <p className="mt-1 text-sm text-slate-300">
            Elige un torneo para auditar handicaps o votar (voto anónimo entre miembros).
          </p>
        </div>
        {(tournaments ?? []).length === 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            No tienes torneos asignados. Pide a un administrador que te asigne el rol
            «Comité de Handicap» o «Director del Torneo» en algún torneo.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(tournaments ?? []).map((t) => (
              <Link
                key={t.id}
                href={`/comite-handicap?tournament_id=${t.id}`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                {t.name ?? t.id.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournamentId);
  if (!access.isMember) {
    return (
      <div className="p-6 text-red-700">
        No tienes acceso al comité de handicap de este torneo.
      </div>
    );
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: committee } = await supabase
    .from("tournament_handicap_committees")
    .select(
      "id, status, expected_members, opens_at, closes_at, trim_high, trim_low"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const adminEarly = tryCreateAdminClient();
  const entriesClient = adminEarly ?? supabase;

  const { data: entriesRaw } = await entriesClient
    .from("tournament_entries")
    .select("id, player_id, category_id, handicap_index, status")
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled")
    .order("handicap_index", { ascending: true });

  const playerIds = Array.from(
    new Set(
      (entriesRaw ?? [])
        .map((e: any) => (e.player_id ? String(e.player_id) : null))
        .filter((v): v is string => Boolean(v))
    )
  );
  const categoryIds = Array.from(
    new Set(
      (entriesRaw ?? [])
        .map((e: any) => (e.category_id ? String(e.category_id) : null))
        .filter((v): v is string => Boolean(v))
    )
  );

  const [{ data: playerRows }, { data: categoryRows }] = await Promise.all([
    playerIds.length
      ? entriesClient
          .from("players")
          .select("id, first_name, last_name, club_id")
          .in("id", playerIds)
      : Promise.resolve({ data: [] as any[] }),
    categoryIds.length
      ? entriesClient
          .from("categories")
          .select("id, code, name")
          .in("id", categoryIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const playerById = new Map<string, any>(
    (playerRows ?? []).map((p: any) => [String(p.id), p])
  );
  const categoryById = new Map<string, any>(
    (categoryRows ?? []).map((c: any) => [String(c.id), c])
  );

  const clubIds = Array.from(
    new Set(
      (playerRows ?? [])
        .map((p: any) => (p.club_id ? String(p.club_id) : null))
        .filter((v): v is string => Boolean(v))
    )
  );

  const { data: clubRows } = clubIds.length
    ? await entriesClient
        .from("clubs")
        .select("id, name, short_name")
        .in("id", clubIds)
    : { data: [] as any[] };

  const clubById = new Map<string, any>(
    (clubRows ?? []).map((c: any) => [String(c.id), c])
  );

  const entries: HandicapEntryRow[] = (entriesRaw ?? [])
    .map((row: any) => {
      const player = row.player_id ? playerById.get(String(row.player_id)) : null;
      const cat = row.category_id ? categoryById.get(String(row.category_id)) : null;
      const club = player?.club_id ? clubById.get(String(player.club_id)) : null;
      return {
        entry_id: row.id as string,
        player_name: playerName(player),
        handicap_index: row.handicap_index != null ? Number(row.handicap_index) : null,
        category_code: cat?.code ?? cat?.name ?? null,
        club_label: club?.short_name ?? club?.name ?? null,
      };
    })
    .filter((e) => e.entry_id);

  let myVotes: HandicapVoteRow[] = [];
  if (committee?.id) {
    const { data: votes } = await supabase
      .from("handicap_committee_votes")
      .select("entry_id, adjustment, abstained, disqualify_vote")
      .eq("committee_id", committee.id)
      .eq("member_user_id", user.id);

    myVotes = (votes ?? []).map((v) => ({
      entry_id: v.entry_id as string,
      adjustment: v.adjustment != null ? Number(v.adjustment) : null,
      abstained: Boolean(v.abstained),
      disqualify_vote: Boolean((v as { disqualify_vote?: boolean }).disqualify_vote),
    }));
  }

  let myPresence = false;
  if (committee?.id) {
    const { data: presenceMine } = await supabase
      .from("handicap_committee_member_presence")
      .select("is_present")
      .eq("committee_id", committee.id)
      .eq("user_id", user.id)
      .maybeSingle();
    myPresence = Boolean(presenceMine?.is_present);
  }

  const admin = tryCreateAdminClient();
  let summaryRows: Array<{
    entry_id: string;
    n_votes: number;
    n_abstained: number;
    avg_adjustment: number | null;
  }> = [];
  const votesByEntry = new Map<string, number[]>();
  const abstainedByEntry = new Map<string, number>();
  const disqualifyByEntry = new Map<string, number>();
  let memberCount = 0;

  // Cargamos los votos agregados (anónimos) SIEMPRE que haya admin client
  // y exista comité, no solo para admins, para poder mostrar el promedio
  // final al votante cuando la votación esté cerrada.
  if (admin && committee?.id) {
    const { data: voteRows } = await admin
      .from("handicap_committee_votes")
      .select("entry_id, adjustment, abstained, disqualify_vote")
      .eq("committee_id", committee.id);

    for (const v of voteRows ?? []) {
      const eid = String((v as any).entry_id);
      if ((v as any).abstained) {
        abstainedByEntry.set(eid, (abstainedByEntry.get(eid) ?? 0) + 1);
      }
      if ((v as any).disqualify_vote) {
        disqualifyByEntry.set(
          eid,
          (disqualifyByEntry.get(eid) ?? 0) + 1
        );
      }
      if ((v as any).abstained) continue;
      const adj = (v as any).adjustment;
      if (adj == null) continue;
      const n = Number(adj);
      if (!Number.isFinite(n)) continue;
      const list = votesByEntry.get(eid) ?? [];
      list.push(n);
      votesByEntry.set(eid, list);
    }
  }

  type CommitteeScope = "tournament" | "club" | "global";
  type CandidateRow = {
    user_id: string;
    full_name: string;
    email: string | null;
    role_codes: string[];
    committee_scopes: CommitteeScope[];
    is_present: boolean;
    has_presence_row: boolean;
  };
  let candidateRows: CandidateRow[] = [];
  let presentCount = 0;
  let tournamentClubId: string | null = null;
  let actorIsSuperAdmin = false;
  let actorIsClubAdmin = false;

  if (access.isAdmin && admin && committee?.id) {
    const { data: summary } = await admin
      .from("handicap_committee_vote_summary")
      .select("entry_id, n_votes, n_abstained, avg_adjustment")
      .eq("committee_id", committee.id);

    summaryRows = (summary ?? []).map((s) => ({
      entry_id: s.entry_id as string,
      n_votes: Number(s.n_votes ?? 0),
      n_abstained: Number(s.n_abstained ?? 0),
      avg_adjustment:
        s.avg_adjustment != null ? Number(s.avg_adjustment) : null,
    }));

    const { data: roleRows } = await admin
      .from("roles")
      .select("id, code")
      .in("code", ["handicap_committee", "tournament_director"]);

    const roleIdByCode = new Map<string, string>(
      (roleRows ?? []).map((r) => [String(r.code), String(r.id)])
    );
    const handicapRoleId = roleIdByCode.get("handicap_committee") ?? null;
    const directorRoleId = roleIdByCode.get("tournament_director") ?? null;

    if (handicapRoleId) {
      const { count } = await admin
        .from("user_tournament_roles")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId)
        .eq("role_id", handicapRoleId)
        .eq("is_active", true);
      memberCount = count ?? 0;
    }

    // Club_id del torneo para resolver alcance "club".
    const { data: tournamentClubRow } = await admin
      .from("tournaments")
      .select("club_id")
      .eq("id", tournamentId)
      .maybeSingle();
    tournamentClubId = (tournamentClubRow as any)?.club_id ?? null;

    // Quién es el actor (super/club/dir) para mostrar opciones de alcance.
    const [{ data: actorGlobals }, { data: actorClubs }] = await Promise.all([
      admin
        .from("user_global_roles")
        .select("roles:role_id(code)")
        .eq("user_id", user.id)
        .eq("is_active", true),
      admin
        .from("user_club_roles")
        .select("club_id, roles:role_id(code)")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
    actorIsSuperAdmin = (actorGlobals ?? []).some((r: any) => {
      const x = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return x?.code === "super_admin";
    });
    actorIsClubAdmin = (actorClubs ?? []).some((r: any) => {
      const x = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return (
        x?.code === "club_admin" &&
        tournamentClubId &&
        String(r.club_id) === tournamentClubId
      );
    });

    const codeById = new Map<string, string>(
      (roleRows ?? []).map((r) => [String(r.id), String(r.code)])
    );

    // Mapa por usuario de roles + alcances de comité.
    const codesByUser = new Map<string, Set<string>>();
    const scopesByUser = new Map<string, Set<CommitteeScope>>();

    function addCode(uid: string, code: string) {
      if (!codesByUser.has(uid)) codesByUser.set(uid, new Set());
      codesByUser.get(uid)!.add(code);
    }
    function addScope(uid: string, scope: CommitteeScope) {
      if (!scopesByUser.has(uid)) scopesByUser.set(uid, new Set());
      scopesByUser.get(uid)!.add(scope);
    }

    // 1) Roles directos en este torneo (handicap_committee + tournament_director).
    const candidateRoleIds = [handicapRoleId, directorRoleId].filter(
      (v): v is string => Boolean(v)
    );
    if (candidateRoleIds.length > 0) {
      const { data: roleAssignments } = await admin
        .from("user_tournament_roles")
        .select("user_id, role_id")
        .eq("tournament_id", tournamentId)
        .in("role_id", candidateRoleIds)
        .eq("is_active", true);

      for (const r of roleAssignments ?? []) {
        const uid = String((r as any).user_id);
        const code = codeById.get(String((r as any).role_id));
        if (!uid || !code) continue;
        addCode(uid, code);
        if (code === "handicap_committee") addScope(uid, "tournament");
      }
    }

    // 2) Comité a nivel club del torneo.
    if (handicapRoleId && tournamentClubId) {
      const { data: clubMembers } = await admin
        .from("user_club_roles")
        .select("user_id")
        .eq("club_id", tournamentClubId)
        .eq("role_id", handicapRoleId)
        .eq("is_active", true);
      for (const r of clubMembers ?? []) {
        const uid = String((r as any).user_id);
        if (!uid) continue;
        addCode(uid, "handicap_committee");
        addScope(uid, "club");
      }
    }

    // 3) Comité a nivel global.
    if (handicapRoleId) {
      const { data: globalMembers } = await admin
        .from("user_global_roles")
        .select("user_id")
        .eq("role_id", handicapRoleId)
        .eq("is_active", true);
      for (const r of globalMembers ?? []) {
        const uid = String((r as any).user_id);
        if (!uid) continue;
        addCode(uid, "handicap_committee");
        addScope(uid, "global");
      }
    }

    const userIds = Array.from(codesByUser.keys());

    const [{ data: profilesRows }, { data: presenceRows }] = await Promise.all([
      userIds.length
        ? admin
            .from("profiles")
            .select("id, first_name, last_name, email")
            .in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      admin
        .from("handicap_committee_member_presence")
        .select("user_id, is_present")
        .eq("committee_id", committee.id),
    ]);

    const presenceByUser = new Map<string, boolean>();
    for (const p of presenceRows ?? []) {
      presenceByUser.set(String((p as any).user_id), Boolean((p as any).is_present));
    }

    candidateRows = (profilesRows ?? []).map((p: any) => {
      const fullName = `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() ||
        (p.email ?? "Usuario");
      const codes = Array.from(codesByUser.get(String(p.id)) ?? []);
      const scopes = Array.from(scopesByUser.get(String(p.id)) ?? []);
      const hasPresence = presenceByUser.has(String(p.id));
      const isPresent = presenceByUser.get(String(p.id)) ?? false;
      return {
        user_id: String(p.id),
        full_name: fullName,
        email: p.email ?? null,
        role_codes: codes,
        committee_scopes: scopes as CommitteeScope[],
        is_present: isPresent,
        has_presence_row: hasPresence,
      };
    });

    candidateRows.sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
    presentCount = candidateRows.filter((c) => c.is_present).length;
  }

  const summaryByEntry = new Map(summaryRows.map((s) => [s.entry_id, s]));

  // Resumen anónimo para mostrar al votante (solo cuando la votación está
  // cerrada, lo deja visible en la pestaña Votar para que todos los miembros
  // vean el resultado final aunque no sean admin).
  const trimLowGlobal = Number(committee?.trim_low ?? 0);
  const trimHighGlobal = Number(committee?.trim_high ?? 0);
  const voteSummariesForVoter = entries.map((e) => {
    const adjustments = votesByEntry.get(e.entry_id) ?? [];
    const trim = trimmedAverage(adjustments, trimLowGlobal, trimHighGlobal);
    const suggested =
      e.handicap_index != null && trim.avg != null
        ? Math.round((e.handicap_index + trim.avg) * 10) / 10
        : null;
    return {
      entry_id: e.entry_id,
      n_votes: adjustments.length,
      n_live: trim.liveCount,
      avg_adjustment: trim.avg,
      suggested_hi: suggested,
    };
  });
  const showAdmin = access.isAdmin && tab === "admin";
  const showVote = tab === "vote" || !access.isAdmin;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Comité de Handicap</h1>
        <p className="mt-1 text-sm text-slate-300">
          {tournament?.name ?? "Torneo"} · Voto anónimo · Solo bajar HI (−0.5 a −5.0)
        </p>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
          {actionError}
        </div>
      ) : null}
      {actionOk === "committee_enabled" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Comité activado. Asigna el rol «Comité de Handicap» a los 9 miembros en Usuarios.
        </div>
      ) : null}
      {actionOk === "committee_closed" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Votación cerrada.
        </div>
      ) : null}
      {actionOk === "hi_applied" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          HI del torneo actualizado con el ajuste sugerido.
        </div>
      ) : null}
      {actionOk === "member_present" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Miembro marcado como presente.
        </div>
      ) : null}
      {actionOk === "member_absent" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Miembro marcado como ausente.
        </div>
      ) : null}
      {actionOk === "role_assigned" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Usuario agregado al comité.
        </div>
      ) : null}
      {actionOk === "role_revoked" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Usuario removido del comité.
        </div>
      ) : null}
      {actionOk === "trim_saved" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Recorte de outliers actualizado.
        </div>
      ) : null}
      {actionOk === "votes_reset" ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950">
          Votación reiniciada: se borraron todos los votos del comité.
        </div>
      ) : null}

      {access.isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/comite-handicap?tournament_id=${tournamentId}&tab=vote`}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              showVote
                ? "bg-emerald-600 text-white"
                : "border border-slate-400 bg-white text-slate-800"
            }`}
          >
            Votar (prueba)
          </Link>
          <Link
            href={`/comite-handicap?tournament_id=${tournamentId}&tab=admin`}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              showAdmin
                ? "bg-emerald-600 text-white"
                : "border border-slate-400 bg-white text-slate-800"
            }`}
          >
            Administración
          </Link>
          <Link
            href={`/users?tournament_id=${tournamentId}`}
            className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            Gestionar miembros
          </Link>
        </div>
      ) : null}

      {showAdmin ? (
        <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Administración del comité</h2>

          {!committee ? (
            <form action={enableHandicapCommittee} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tournament_id" value={tournamentId} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-800">Miembros esperados</span>
                <input
                  type="number"
                  name="expected_members"
                  min={1}
                  max={50}
                  defaultValue={HANDICAP_COMMITTEE_DEFAULT_SIZE}
                  className="w-24 rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Activar comité en este torneo
              </button>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-sm text-slate-800">
                <span>
                  Estado:{" "}
                  <strong>{committee.status === "open" ? "Abierta" : "Cerrada"}</strong>
                </span>
                <span>
                  Miembros con rol: <strong>{memberCount}</strong> /{" "}
                  {committee.expected_members}
                </span>
                <span>
                  Presentes hoy: <strong>{presentCount}</strong> / {candidateRows.length}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {committee.status === "open" ? (
                  <form action={setHandicapCommitteeStatus}>
                    <input type="hidden" name="tournament_id" value={tournamentId} />
                    <input type="hidden" name="status" value="closed" />
                    <button
                      type="submit"
                      className="rounded-lg border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
                    >
                      Cerrar votación
                    </button>
                  </form>
                ) : (
                  <form action={setHandicapCommitteeStatus}>
                    <input type="hidden" name="tournament_id" value={tournamentId} />
                    <input type="hidden" name="status" value="open" />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-600 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    >
                      Reabrir votación
                    </button>
                  </form>
                )}

                <details className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-rose-900">
                    Reiniciar votación (pruebas)
                  </summary>
                  <form
                    action={resetHandicapCommitteeVotes}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input
                      type="hidden"
                      name="tournament_id"
                      value={tournamentId}
                    />
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-rose-900">
                        Escribe REINICIAR para confirmar
                      </span>
                      <input
                        type="text"
                        name="confirm"
                        placeholder="REINICIAR"
                        autoComplete="off"
                        className="w-40 rounded border border-rose-400 bg-white px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Borrar todos los votos
                    </button>
                    <p className="basis-full text-[11px] text-rose-900/80">
                      Elimina <strong>todos</strong> los votos guardados del comité
                      en este torneo. Usar solo para pruebas o cuando los datos
                      iniciales eran incorrectos. La acción no se puede deshacer.
                    </p>
                  </form>
                </details>
              </div>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Miembros del comité (marcar presentes)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Autoriza quién puede votar en <strong>este torneo</strong> y
                    marca su asistencia. El alcance define si el acceso es solo
                    aquí, en todo el club o en todo el sistema.
                  </p>
                </div>

                <form
                  action={inviteHandicapCommitteeMember}
                  className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                >
                  <input type="hidden" name="tournament_id" value={tournamentId} />
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
                    <span className="font-semibold text-slate-800">
                      Invitar miembro (email)
                    </span>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="miembro@email.com"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-slate-800">Alcance</span>
                    <select
                      name="scope"
                      defaultValue="tournament"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="tournament">Solo este torneo</option>
                      {(actorIsSuperAdmin || actorIsClubAdmin) && (
                        <option value="club">Todo el club del torneo</option>
                      )}
                      {actorIsSuperAdmin && (
                        <option value="global">Todo el sistema</option>
                      )}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Autorizar acceso
                  </button>
                </form>

                {candidateRows.length === 0 ? (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    Aún no hay miembros autorizados. Usa el formulario de arriba o
                    asigna el rol en{" "}
                    <Link
                      href={`/users?tournament_id=${tournamentId}`}
                      className="font-semibold underline"
                    >
                      Usuarios
                    </Link>
                    . Los directores del torneo aparecen automáticamente.
                  </div>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {candidateRows.map((c) => {
                      const isDirector = c.role_codes.includes("tournament_director");
                      const scopeLabels: Record<CommitteeScope, string> = {
                        tournament: "Este torneo",
                        club: "Todo el club",
                        global: "Todo el sistema",
                      };
                      const scopeColors: Record<CommitteeScope, string> = {
                        tournament: "bg-violet-800 text-white",
                        club: "bg-indigo-700 text-white",
                        global: "bg-fuchsia-800 text-white",
                      };
                      return (
                        <li
                          key={c.user_id}
                          className={[
                            "flex flex-col gap-2 rounded-lg border bg-white p-2.5",
                            c.is_present
                              ? "border-emerald-400/70"
                              : "border-slate-300",
                          ].join(" ")}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {c.full_name}
                            </div>
                            <div className="truncate text-[11px] text-slate-600">
                              {c.email ?? "—"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.committee_scopes.map((sc) => (
                                <span
                                  key={sc}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${scopeColors[sc]}`}
                                >
                                  {scopeLabels[sc]}
                                </span>
                              ))}
                              {isDirector ? (
                                <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  Director
                                </span>
                              ) : null}
                              {c.is_present ? (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  Presente
                                </span>
                              ) : (
                                <span className="rounded-full border border-slate-400 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                  Ausente
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <form action={setHandicapCommitteeMemberPresence}>
                              <input
                                type="hidden"
                                name="tournament_id"
                                value={tournamentId}
                              />
                              <input type="hidden" name="user_id" value={c.user_id} />
                              <input
                                type="hidden"
                                name="is_present"
                                value={c.is_present ? "false" : "true"}
                              />
                              <button
                                type="submit"
                                className={[
                                  "rounded px-2.5 py-1 text-xs font-semibold",
                                  c.is_present
                                    ? "border border-amber-600 bg-amber-50 text-amber-900"
                                    : "bg-emerald-700 text-white",
                                ].join(" ")}
                              >
                                {c.is_present ? "Marcar ausente" : "Marcar presente"}
                              </button>
                            </form>

                            {c.committee_scopes.map((sc) => {
                              const canRevoke =
                                sc === "global"
                                  ? actorIsSuperAdmin
                                  : sc === "club"
                                    ? actorIsSuperAdmin || actorIsClubAdmin
                                    : true;
                              if (!canRevoke) return null;
                              return (
                                <form
                                  key={`revoke-${c.user_id}-${sc}`}
                                  action={revokeHandicapCommitteeRole}
                                >
                                  <input
                                    type="hidden"
                                    name="tournament_id"
                                    value={tournamentId}
                                  />
                                  <input type="hidden" name="user_id" value={c.user_id} />
                                  <input type="hidden" name="scope" value={sc} />
                                  <button
                                    type="submit"
                                    className="rounded border border-rose-500 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700"
                                  >
                                    Quitar ({scopeLabels[sc]})
                                  </button>
                                </form>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <form
                action={setHandicapCommitteeTrim}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Recorte de outliers
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-800">
                    Quitar votos altos (más suaves)
                  </span>
                  <input
                    type="number"
                    name="trim_high"
                    min={0}
                    max={20}
                    defaultValue={Number(committee.trim_high ?? 0)}
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-800">
                    Quitar votos bajos (más severos)
                  </span>
                  <input
                    type="number"
                    name="trim_low"
                    min={0}
                    max={20}
                    defaultValue={Number(committee.trim_low ?? 0)}
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Guardar recorte
                </button>
                <p className="basis-full text-[11px] text-slate-600">
                  Por cada jugador se descartan los N votos más cercanos a 0 y los
                  N votos más cercanos a −5; el promedio y el HI sugerido se
                  recalculan con los votos vivos.
                </p>
              </form>

              <p className="text-xs text-slate-600">
                Resumen agregado (anonimizado): se muestran los votos individuales
                sin nombre. Verde = activo, gris = descartado por recorte.
              </p>

              {entries.length === 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  No hay inscripciones activas en este torneo todavía. Agrega
                  jugadores en{" "}
                  <Link
                    href={`/entries?tournament_id=${tournamentId}`}
                    className="font-semibold underline"
                  >
                    Inscripciones
                  </Link>{" "}
                  para que el comité los pueda calificar.
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm text-slate-900">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Jugador</th>
                      <th className="px-3 py-2">HI actual</th>
                      <th className="px-3 py-2">Votos (anónimos)</th>
                      <th className="px-3 py-2">Vivos</th>
                      <th className="px-3 py-2">Prom. recortado</th>
                      <th className="px-3 py-2">HI sugerido</th>
                      <th className="px-3 py-2">No jugar</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const adjustments = votesByEntry.get(e.entry_id) ?? [];
                      const trim = trimmedAverage(
                        adjustments,
                        Number(committee.trim_low ?? 0),
                        Number(committee.trim_high ?? 0)
                      );
                      const abstained = abstainedByEntry.get(e.entry_id) ?? 0;
                      const disqVotes = disqualifyByEntry.get(e.entry_id) ?? 0;
                      const avg = trim.avg;
                      const suggested =
                        e.handicap_index != null && avg != null
                          ? Math.round((e.handicap_index + avg) * 10) / 10
                          : null;

                      const shuffledChips = (() => {
                        const arr = [...trim.values];
                        for (let i = arr.length - 1; i > 0; i -= 1) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [arr[i], arr[j]] = [arr[j], arr[i]];
                        }
                        return arr;
                      })();

                      return (
                        <tr key={e.entry_id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-medium">{e.player_name}</td>
                          <td className="px-3 py-2 tabular-nums">{e.handicap_index ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {shuffledChips.length === 0 ? (
                                <span className="text-xs text-slate-400">
                                  Sin votos
                                </span>
                              ) : (
                                shuffledChips.map((v, idx) => (
                                  <span
                                    key={`${e.entry_id}-${idx}`}
                                    title={
                                      v.trimmed
                                        ? v.reason === "low"
                                          ? "Descartado (más severo)"
                                          : "Descartado (más suave)"
                                        : "Voto vivo"
                                    }
                                    className={[
                                      "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                                      v.trimmed
                                        ? "border border-slate-300 bg-slate-100 text-slate-500 line-through"
                                        : "bg-emerald-600 text-white",
                                    ].join(" ")}
                                  >
                                    {formatAdjustmentLabel(v.value)}
                                  </span>
                                ))
                              )}
                              {abstained > 0 ? (
                                <span
                                  className="rounded border border-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800"
                                  title="Miembros que se abstuvieron"
                                >
                                  {abstained} abst.
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {trim.liveCount} / {adjustments.length}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {avg != null ? formatAdjustmentLabel(avg) : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-semibold">
                            {suggested ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {disqVotes > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                                {disqVotes} votos
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {avg != null && trim.liveCount > 0 ? (
                              <form action={applyHandicapCommitteeSuggestion}>
                                <input
                                  type="hidden"
                                  name="tournament_id"
                                  value={tournamentId}
                                />
                                <input type="hidden" name="entry_id" value={e.entry_id} />
                                <button
                                  type="submit"
                                  className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                                >
                                  Aplicar HI
                                </button>
                              </form>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {showVote ? (
        committee ? (
          <HandicapCommitteeVoter
            tournamentId={tournamentId}
            entries={entries}
            myVotes={myVotes}
            committeeOpen={committee.status === "open"}
            isPresent={myPresence}
            isAdmin={access.isAdmin}
            voteSummaries={voteSummariesForVoter}
          />
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            El comité aún no está activo en este torneo. Un administrador debe activarlo
            primero.
          </div>
        )
      ) : null}
    </div>
  );
}
