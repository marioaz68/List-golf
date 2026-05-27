"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import {
  clampAdjustment,
  HANDICAP_COMMITTEE_DEFAULT_SIZE,
  trimmedAverage,
} from "@/lib/handicap-committee/constants";
import { loadHandicapCommitteeAccess } from "@/lib/handicap-committee/access";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function redirectWith(
  tournamentId: string,
  params: { err?: string; ok?: string; tab?: string }
) {
  const qs = new URLSearchParams({ tournament_id: tournamentId });
  if (params.err) qs.set("err", params.err);
  if (params.ok) qs.set("ok", params.ok);
  if (params.tab) qs.set("tab", params.tab);
  redirect(`/comite-handicap?${qs.toString()}`);
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión no válida.");
  return { supabase, user };
}

export async function enableHandicapCommittee(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const expectedRaw = String(formData.get("expected_members") ?? "").trim();
  const expected = expectedRaw
    ? Math.min(50, Math.max(1, Math.trunc(Number(expectedRaw))))
    : HANDICAP_COMMITTEE_DEFAULT_SIZE;

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso para activar el comité." });
    return;
  }

  const { error } = await supabase.from("tournament_handicap_committees").upsert(
    {
      tournament_id,
      status: "open",
      expected_members: expected,
      opens_at: new Date().toISOString(),
      closes_at: null,
      closed_by: null,
    },
    { onConflict: "tournament_id" }
  );

  if (error) {
    redirectWith(tournament_id, {
      err: "No se pudo activar el comité. ¿Aplicaste la migración en Supabase? " + error.message,
    });
    return;
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, { ok: "committee_enabled", tab: "admin" });
}

export async function setHandicapCommitteeStatus(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const status = reqStr(formData, "status");
  if (status !== "open" && status !== "closed") {
    redirectWith(tournament_id, { err: "Estado inválido." });
    return;
  }

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso." });
    return;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "closed") {
    patch.closes_at = new Date().toISOString();
    patch.closed_by = user.id;
  } else {
    patch.closes_at = null;
    patch.closed_by = null;
  }

  const { error } = await supabase
    .from("tournament_handicap_committees")
    .update(patch)
    .eq("tournament_id", tournament_id);

  if (error) {
    redirectWith(tournament_id, { err: error.message });
    return;
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, {
    ok: status === "closed" ? "committee_closed" : "committee_reopened",
    tab: "admin",
  });
}

export async function saveHandicapCommitteeVote(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const entry_id = reqStr(formData, "entry_id");
  const abstained = String(formData.get("abstained") ?? "") === "true";
  const disqualifyVote =
    String(formData.get("disqualify_vote") ?? "") === "true";

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isMember) {
    return { ok: false, error: "No eres miembro del comité de este torneo." };
  }

  const { data: committee, error: cErr } = await supabase
    .from("tournament_handicap_committees")
    .select("id, status")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (cErr || !committee) {
    return { ok: false, error: "El comité no está activo en este torneo." };
  }
  if (committee.status !== "open") {
    return { ok: false, error: "La votación está cerrada." };
  }

  const { data: presence } = await supabase
    .from("handicap_committee_member_presence")
    .select("is_present")
    .eq("committee_id", committee.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!presence?.is_present) {
    return {
      ok: false,
      error:
        "No estás marcado como presente en esta sesión del comité. Pide a un director que te active.",
    };
  }

  let adjustment: number | null = null;
  if (!abstained) {
    const raw = Number(String(formData.get("adjustment") ?? "").trim());
    if (!Number.isFinite(raw)) {
      return { ok: false, error: "Ajuste inválido." };
    }
    adjustment = clampAdjustment(raw);
  }

  const { error } = await supabase.from("handicap_committee_votes").upsert(
    {
      committee_id: committee.id,
      tournament_id,
      entry_id,
      member_user_id: user.id,
      adjustment,
      abstained,
      disqualify_vote: disqualifyVote,
    },
    { onConflict: "committee_id,entry_id,member_user_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/comite-handicap");
  return { ok: true };
}

/**
 * Resuelve el ajuste que se aplicará al HI del torneo para una sola
 * inscripción. Permite override (cuando el admin redondea el promedio del
 * comité en la tabla agregada) o, si no se pasa, recalcula el promedio
 * recortado actual y lo usa.
 *
 * Devuelve `{ ok: true, current, adjustment, nextHi }` o `{ ok: false, error }`.
 */
async function computeApplyForEntry(
  admin: ReturnType<typeof tryCreateAdminClient> extends infer T
    ? Exclude<T, null>
    : never,
  committeeId: string,
  tournament_id: string,
  entry_id: string,
  trim_low: number,
  trim_high: number,
  override: number | null
): Promise<
  | {
      ok: true;
      adjustment: number;
      current: number;
      nextHi: number;
    }
  | { ok: false; error: string }
> {
  let adjustmentToApply: number | null = null;

  if (override != null && Number.isFinite(override)) {
    // El admin nos da el ajuste exacto (redondeado en la UI). Se usa tal cual.
    adjustmentToApply = override;
  } else {
    // Recalcular promedio recortado a partir de los votos vivos.
    const { data: voteRows } = await admin
      .from("handicap_committee_votes")
      .select("adjustment, abstained")
      .eq("committee_id", committeeId)
      .eq("entry_id", entry_id);

    let n_abstained = 0;
    const adjustments: number[] = [];
    for (const row of voteRows ?? []) {
      if ((row as { abstained?: boolean }).abstained) {
        n_abstained += 1;
        continue;
      }
      const adj = (row as { adjustment?: unknown }).adjustment;
      if (adj == null) continue;
      const n = Number(adj);
      if (Number.isFinite(n)) adjustments.push(n);
    }

    if (adjustments.length === 0) {
      return { ok: false, error: "no_votes" };
    }

    const trim = trimmedAverage(
      adjustments,
      trim_low,
      trim_high,
      n_abstained
    );
    const avg = trim.avg;
    if (avg == null || !Number.isFinite(avg) || trim.averageDenominator < 1) {
      return { ok: false, error: "trim_empty" };
    }
    adjustmentToApply = avg;
  }

  const { data: entry, error: eErr } = await admin
    .from("tournament_entries")
    .select("id, handicap_index")
    .eq("id", entry_id)
    .eq("tournament_id", tournament_id)
    .single();

  if (eErr || !entry) {
    return { ok: false, error: "entry_not_found" };
  }

  const current =
    entry.handicap_index != null ? Number(entry.handicap_index) : null;
  if (current == null || !Number.isFinite(current)) {
    return { ok: false, error: "no_hi" };
  }

  const nextHi = Math.round((current + adjustmentToApply) * 10) / 10;
  return { ok: true, adjustment: adjustmentToApply, current, nextHi };
}

export async function applyHandicapCommitteeSuggestion(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const entry_id = reqStr(formData, "entry_id");
  const overrideRaw = String(formData.get("adjustment_override") ?? "").trim();
  const override = overrideRaw === "" ? null : Number(overrideRaw);

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para aplicar ajustes.",
      tab: "admin",
    });
    return;
  }

  const { data: committee } = await admin
    .from("tournament_handicap_committees")
    .select("id, trim_high, trim_low")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!committee) {
    redirectWith(tournament_id, { err: "Comité no encontrado.", tab: "admin" });
    return;
  }

  const res = await computeApplyForEntry(
    admin,
    committee.id,
    tournament_id,
    entry_id,
    Number(committee.trim_low ?? 0),
    Number(committee.trim_high ?? 0),
    override
  );

  if (!res.ok) {
    const map: Record<string, string> = {
      no_votes: "No hay votos suficientes para aplicar un ajuste.",
      trim_empty:
        "El recorte deja menos de un voto vivo; ajusta los parámetros.",
      entry_not_found: "Inscripción no encontrada.",
      no_hi: "El jugador no tiene HI en el torneo.",
    };
    redirectWith(tournament_id, {
      err: map[res.error] ?? res.error,
      tab: "admin",
    });
    return;
  }

  const { error: updErr } = await admin
    .from("tournament_entries")
    .update({ handicap_index: res.nextHi })
    .eq("id", entry_id);

  if (updErr) {
    redirectWith(tournament_id, { err: updErr.message, tab: "admin" });
    return;
  }

  revalidatePath("/comite-handicap");
  revalidatePath("/entries");
  redirectWith(tournament_id, { ok: "hi_applied", tab: "admin" });
}

/**
 * Aplica el HI ajustado para varias inscripciones a la vez. Por cada
 * inscripción incluida, el formulario debe traer:
 *   - entry_ids = "id1,id2,id3,..."
 *   - adj_<id> = "-0.5" (ajuste redondeado por el admin)
 *
 * Las inscripciones que no traigan adjuste se ignoran (no se modifica su HI).
 */
export async function applyHandicapCommitteeSuggestionsBulk(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(
    supabase,
    user.id,
    tournament_id
  );
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para aplicar ajustes.",
      tab: "admin",
    });
    return;
  }

  const { data: committee } = await admin
    .from("tournament_handicap_committees")
    .select("id, trim_high, trim_low")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!committee) {
    redirectWith(tournament_id, { err: "Comité no encontrado.", tab: "admin" });
    return;
  }

  const idsRaw = String(formData.get("entry_ids") ?? "").trim();
  const entryIds = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entryIds.length === 0) {
    redirectWith(tournament_id, {
      err: "No hay inscripciones seleccionadas.",
      tab: "admin",
    });
    return;
  }

  let okCount = 0;
  const failures: string[] = [];

  for (const entry_id of entryIds) {
    const overrideRaw = String(formData.get(`adj_${entry_id}`) ?? "").trim();
    const override = overrideRaw === "" ? null : Number(overrideRaw);

    const res = await computeApplyForEntry(
      admin,
      committee.id,
      tournament_id,
      entry_id,
      Number(committee.trim_low ?? 0),
      Number(committee.trim_high ?? 0),
      override
    );
    if (!res.ok) {
      failures.push(entry_id);
      continue;
    }
    const { error: updErr } = await admin
      .from("tournament_entries")
      .update({ handicap_index: res.nextHi })
      .eq("id", entry_id);
    if (updErr) {
      failures.push(entry_id);
      continue;
    }
    okCount += 1;
  }

  revalidatePath("/comite-handicap");
  revalidatePath("/entries");

  if (okCount === 0) {
    redirectWith(tournament_id, {
      err: "No se pudo aplicar ningún ajuste.",
      tab: "admin",
    });
    return;
  }

  redirectWith(tournament_id, {
    ok:
      failures.length === 0
        ? `hi_applied_bulk_${okCount}`
        : `hi_applied_bulk_${okCount}_fail_${failures.length}`,
    tab: "admin",
  });
}

export async function resetHandicapCommitteeVotes(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  const sessionName = String(formData.get("session_name") ?? "").trim();
  const sessionNotes = String(formData.get("session_notes") ?? "").trim();

  if (confirm !== "REINICIAR") {
    redirectWith(tournament_id, {
      err: "Escribe REINICIAR para confirmar el borrado de votos.",
      tab: "admin",
    });
    return;
  }

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para reiniciar la votación.",
      tab: "admin",
    });
    return;
  }

  const { data: committee } = await admin
    .from("tournament_handicap_committees")
    .select("id, trim_high, trim_low, disqualify_threshold")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!committee?.id) {
    redirectWith(tournament_id, {
      err: "Comité no encontrado.",
      tab: "admin",
    });
    return;
  }

  await archiveCommitteeSession({
    admin,
    tournamentId: tournament_id,
    committee,
    userId: user.id,
    name: sessionName || null,
    notes: sessionNotes || null,
  });

  const { error } = await admin
    .from("handicap_committee_votes")
    .delete()
    .eq("committee_id", committee.id);

  if (error) {
    redirectWith(tournament_id, { err: error.message, tab: "admin" });
    return;
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, { ok: "votes_reset", tab: "admin" });
}

type CommitteeForArchive = {
  id: string;
  trim_high?: number | null;
  trim_low?: number | null;
  disqualify_threshold?: number | null;
};

async function archiveCommitteeSession(params: {
  admin: NonNullable<ReturnType<typeof tryCreateAdminClient>>;
  tournamentId: string;
  committee: CommitteeForArchive;
  userId: string;
  name: string | null;
  notes: string | null;
}): Promise<{ archived: boolean; sessionId: string | null }> {
  const { admin, tournamentId, committee, userId, name, notes } = params;

  const { data: voteRows } = await admin
    .from("handicap_committee_votes")
    .select("entry_id, adjustment, abstained, disqualify_vote, member_user_id")
    .eq("committee_id", committee.id);

  if (!voteRows || voteRows.length === 0) {
    return { archived: false, sessionId: null };
  }

  const { data: entriesRaw } = await admin
    .from("tournament_entries")
    .select("id, player_id, category_id, handicap_index")
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled");

  const playerIds = Array.from(
    new Set(
      (entriesRaw ?? [])
        .map((e: any) => (e.player_id ? String(e.player_id) : null))
        .filter((v: string | null): v is string => Boolean(v))
    )
  );
  const categoryIds = Array.from(
    new Set(
      (entriesRaw ?? [])
        .map((e: any) => (e.category_id ? String(e.category_id) : null))
        .filter((v: string | null): v is string => Boolean(v))
    )
  );

  const [{ data: playerRows }, { data: categoryRows }, { data: presenceRows }] =
    await Promise.all([
      playerIds.length
        ? admin
            .from("players")
            .select("id, first_name, last_name")
            .in("id", playerIds)
        : Promise.resolve({ data: [] as any[] }),
      categoryIds.length
        ? admin
            .from("categories")
            .select("id, code, name")
            .in("id", categoryIds)
        : Promise.resolve({ data: [] as any[] }),
      admin
        .from("handicap_committee_member_presence")
        .select("user_id, is_present")
        .eq("committee_id", committee.id),
    ]);

  const playerById = new Map<string, any>(
    (playerRows ?? []).map((p: any) => [String(p.id), p])
  );
  const categoryById = new Map<string, any>(
    (categoryRows ?? []).map((c: any) => [String(c.id), c])
  );

  const trimLow = Number(committee.trim_low ?? 0);
  const trimHigh = Number(committee.trim_high ?? 0);

  const votesByEntry = new Map<
    string,
    { adj: number[]; n_abs: number; n_dq: number }
  >();
  const voterIds = new Set<string>();
  for (const v of voteRows) {
    const row = v as any;
    const eid = row.entry_id ? String(row.entry_id) : null;
    if (!eid) continue;
    if (row.member_user_id) voterIds.add(String(row.member_user_id));
    const slot = votesByEntry.get(eid) ?? {
      adj: [] as number[],
      n_abs: 0,
      n_dq: 0,
    };
    if (row.abstained) {
      slot.n_abs += 1;
    } else if (row.adjustment != null) {
      const n = Number(row.adjustment);
      if (Number.isFinite(n)) slot.adj.push(n);
    }
    if (row.disqualify_vote) slot.n_dq += 1;
    votesByEntry.set(eid, slot);
  }

  const nPresent = (presenceRows ?? []).filter(
    (p: any) => p.is_present
  ).length;

  const { data: lastSession } = await admin
    .from("handicap_committee_vote_sessions")
    .select("session_no")
    .eq("committee_id", committee.id)
    .order("session_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSessionNo = Number((lastSession as any)?.session_no ?? 0) + 1;

  const { data: sess, error: sessErr } = await admin
    .from("handicap_committee_vote_sessions")
    .insert({
      committee_id: committee.id,
      tournament_id: tournamentId,
      session_no: nextSessionNo,
      name: name || `Sesión ${nextSessionNo}`,
      notes,
      archived_by: userId,
      trim_high: trimHigh,
      trim_low: trimLow,
      disqualify_threshold: Number(committee.disqualify_threshold ?? 0),
      n_members_present: nPresent,
      n_voters: voterIds.size,
      n_entries: (entriesRaw ?? []).length,
    })
    .select("id")
    .single();

  if (sessErr || !sess?.id) {
    throw new Error(
      `No se pudo archivar la sesión previa: ${sessErr?.message ?? "sin id"}`
    );
  }

  const snapRows = (entriesRaw ?? []).map((e: any) => {
    const eid = String(e.id);
    const slot = votesByEntry.get(eid) ?? {
      adj: [] as number[],
      n_abs: 0,
      n_dq: 0,
    };
    const trim = trimmedAverage(
      slot.adj,
      trimLow,
      trimHigh,
      slot.n_abs
    );
    const player = e.player_id ? playerById.get(String(e.player_id)) : null;
    const cat = e.category_id ? categoryById.get(String(e.category_id)) : null;
    const playerLabel = player
      ? `${player.last_name ?? ""} ${player.first_name ?? ""}`.trim() ||
        "Jugador"
      : "Jugador";
    const hiNow =
      e.handicap_index != null && Number.isFinite(Number(e.handicap_index))
        ? Number(e.handicap_index)
        : null;
    const suggested =
      hiNow != null && trim.avg != null
        ? Math.round((hiNow + trim.avg) * 10) / 10
        : null;

    return {
      session_id: sess.id,
      entry_id: eid,
      entry_player_name: playerLabel,
      entry_handicap_index: hiNow,
      entry_category_code: cat?.code ?? cat?.name ?? null,
      n_votes: slot.adj.length,
      n_abstained: slot.n_abs,
      n_disqualify: slot.n_dq,
      avg_adjustment: trim.avg,
      suggested_hi: suggested,
      votes_anon: trim.values,
    };
  });

  if (snapRows.length > 0) {
    const { error: snapErr } = await admin
      .from("handicap_committee_vote_snapshots")
      .insert(snapRows);
    if (snapErr) {
      throw new Error(`No se pudo archivar los votos: ${snapErr.message}`);
    }
  }

  return { archived: true, sessionId: sess.id };
}

export async function setHandicapCommitteeTrim(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const rawHigh = Number(String(formData.get("trim_high") ?? "0"));
  const rawLow = Number(String(formData.get("trim_low") ?? "0"));
  const rawThreshold = Number(
    String(formData.get("disqualify_threshold") ?? "0")
  );

  const trim_high = Number.isFinite(rawHigh)
    ? Math.min(20, Math.max(0, Math.trunc(rawHigh)))
    : 0;
  const trim_low = Number.isFinite(rawLow)
    ? Math.min(20, Math.max(0, Math.trunc(rawLow)))
    : 0;
  const disqualify_threshold = Number.isFinite(rawThreshold)
    ? Math.min(50, Math.max(0, Math.trunc(rawThreshold)))
    : 0;

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const { error } = await supabase
    .from("tournament_handicap_committees")
    .update({ trim_high, trim_low, disqualify_threshold })
    .eq("tournament_id", tournament_id);

  if (error) {
    redirectWith(tournament_id, { err: error.message, tab: "admin" });
    return;
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, { ok: "trim_saved", tab: "admin" });
}

export async function setHandicapCommitteeMemberPresence(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const target_user_id = reqStr(formData, "user_id");
  const wantPresent = String(formData.get("is_present") ?? "") === "true";

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const { data: committee } = await supabase
    .from("tournament_handicap_committees")
    .select("id")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!committee?.id) {
    redirectWith(tournament_id, {
      err: "Activa primero el comité para gestionar miembros.",
      tab: "admin",
    });
    return;
  }

  const { error } = await supabase
    .from("handicap_committee_member_presence")
    .upsert(
      {
        committee_id: committee.id,
        tournament_id,
        user_id: target_user_id,
        is_present: wantPresent,
        marked_at: new Date().toISOString(),
        marked_by: user.id,
      },
      { onConflict: "committee_id,user_id" }
    );

  if (error) {
    redirectWith(tournament_id, { err: error.message, tab: "admin" });
    return;
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, {
    ok: wantPresent ? "member_present" : "member_absent",
    tab: "admin",
  });
}

type ActorRoleFlags = {
  isSuperAdmin: boolean;
  isClubAdminOfTournament: boolean;
  isTournamentDirector: boolean;
};

async function getActorRoleFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tournamentId: string
): Promise<ActorRoleFlags> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  const clubId: string | null = (tournament as any)?.club_id ?? null;

  const [{ data: globals }, { data: clubs }, { data: tours }] = await Promise.all([
    supabase
      .from("user_global_roles")
      .select("roles:role_id(code)")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("user_club_roles")
      .select("club_id, roles:role_id(code)")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("user_tournament_roles")
      .select("roles:role_id(code)")
      .eq("user_id", userId)
      .eq("tournament_id", tournamentId)
      .eq("is_active", true),
  ]);

  const hasGlobalRole = (code: string) =>
    (globals ?? []).some((r: any) => {
      const x = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return x?.code === code;
    });
  const hasClubRoleAt = (code: string, cid: string | null) =>
    (clubs ?? []).some((r: any) => {
      const x = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return x?.code === code && cid && String(r.club_id) === cid;
    });
  const hasTourRole = (code: string) =>
    (tours ?? []).some((r: any) => {
      const x = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return x?.code === code;
    });

  return {
    isSuperAdmin: hasGlobalRole("super_admin"),
    isClubAdminOfTournament: hasClubRoleAt("club_admin", clubId),
    isTournamentDirector: hasTourRole("tournament_director"),
  };
}

export async function assignHandicapCommitteeRole(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const target_user_id = reqStr(formData, "user_id");
  const scope = String(formData.get("scope") ?? "tournament").trim();
  if (!["tournament", "club", "global"].includes(scope)) {
    redirectWith(tournament_id, { err: "Alcance inválido.", tab: "admin" });
    return;
  }

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const flags = await getActorRoleFlags(supabase, user.id, tournament_id);

  if (scope === "global" && !flags.isSuperAdmin) {
    redirectWith(tournament_id, {
      err: "Solo un Super Admin puede otorgar comité global.",
      tab: "admin",
    });
    return;
  }
  if (
    scope === "club" &&
    !flags.isSuperAdmin &&
    !flags.isClubAdminOfTournament
  ) {
    redirectWith(tournament_id, {
      err: "Solo el Club Admin (o Super Admin) puede otorgar comité por club.",
      tab: "admin",
    });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para asignar roles.",
      tab: "admin",
    });
    return;
  }

  const { data: roleRow, error: rErr } = await admin
    .from("roles")
    .select("id")
    .eq("code", "handicap_committee")
    .maybeSingle();

  if (rErr || !roleRow?.id) {
    redirectWith(tournament_id, {
      err: "Rol handicap_committee no encontrado en el catálogo.",
      tab: "admin",
    });
    return;
  }

  if (scope === "global") {
    const { error } = await admin.from("user_global_roles").upsert(
      {
        user_id: target_user_id,
        role_id: roleRow.id,
        is_active: true,
      },
      { onConflict: "user_id,role_id" }
    );
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  } else if (scope === "club") {
    const { data: tournament } = await admin
      .from("tournaments")
      .select("club_id")
      .eq("id", tournament_id)
      .maybeSingle();
    const clubId = (tournament as any)?.club_id ?? null;
    if (!clubId) {
      redirectWith(tournament_id, {
        err: "El torneo no tiene club asignado.",
        tab: "admin",
      });
      return;
    }
    const { error } = await admin.from("user_club_roles").upsert(
      {
        user_id: target_user_id,
        club_id: clubId,
        role_id: roleRow.id,
        is_active: true,
      },
      { onConflict: "user_id,club_id,role_id" }
    );
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  } else {
    const { error } = await admin.from("user_tournament_roles").upsert(
      {
        user_id: target_user_id,
        tournament_id,
        role_id: roleRow.id,
        is_active: true,
      },
      { onConflict: "user_id,tournament_id,role_id" }
    );
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, { ok: "role_assigned", tab: "admin" });
}

export async function revokeHandicapCommitteeRole(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const target_user_id = reqStr(formData, "user_id");
  const scope = String(formData.get("scope") ?? "tournament").trim();
  if (!["tournament", "club", "global"].includes(scope)) {
    redirectWith(tournament_id, { err: "Alcance inválido.", tab: "admin" });
    return;
  }

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const flags = await getActorRoleFlags(supabase, user.id, tournament_id);
  if (scope === "global" && !flags.isSuperAdmin) {
    redirectWith(tournament_id, {
      err: "Solo Super Admin puede quitar comité global.",
      tab: "admin",
    });
    return;
  }
  if (
    scope === "club" &&
    !flags.isSuperAdmin &&
    !flags.isClubAdminOfTournament
  ) {
    redirectWith(tournament_id, {
      err: "Solo Club Admin (o Super Admin) puede quitar comité por club.",
      tab: "admin",
    });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para revocar roles.",
      tab: "admin",
    });
    return;
  }

  const { data: roleRow } = await admin
    .from("roles")
    .select("id")
    .eq("code", "handicap_committee")
    .maybeSingle();

  if (!roleRow?.id) {
    redirectWith(tournament_id, { err: "Rol no encontrado.", tab: "admin" });
    return;
  }

  if (scope === "global") {
    const { error } = await admin
      .from("user_global_roles")
      .update({ is_active: false })
      .eq("user_id", target_user_id)
      .eq("role_id", roleRow.id);
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  } else if (scope === "club") {
    const { data: tournament } = await admin
      .from("tournaments")
      .select("club_id")
      .eq("id", tournament_id)
      .maybeSingle();
    const clubId = (tournament as any)?.club_id ?? null;
    if (!clubId) {
      redirectWith(tournament_id, {
        err: "El torneo no tiene club asignado.",
        tab: "admin",
      });
      return;
    }
    const { error } = await admin
      .from("user_club_roles")
      .update({ is_active: false })
      .eq("user_id", target_user_id)
      .eq("club_id", clubId)
      .eq("role_id", roleRow.id);
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  } else {
    const { error } = await admin
      .from("user_tournament_roles")
      .update({ is_active: false })
      .eq("user_id", target_user_id)
      .eq("tournament_id", tournament_id)
      .eq("role_id", roleRow.id);
    if (error) {
      redirectWith(tournament_id, { err: error.message, tab: "admin" });
      return;
    }
  }

  revalidatePath("/comite-handicap");
  redirectWith(tournament_id, { ok: "role_revoked", tab: "admin" });
}

export async function inviteHandicapCommitteeMember(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const scope = String(formData.get("scope") ?? "tournament").trim();

  if (!emailRaw) {
    redirectWith(tournament_id, {
      err: "Escribe el email del miembro a invitar.",
      tab: "admin",
    });
    return;
  }
  if (!["tournament", "club", "global"].includes(scope)) {
    redirectWith(tournament_id, { err: "Alcance inválido.", tab: "admin" });
    return;
  }

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const flags = await getActorRoleFlags(supabase, user.id, tournament_id);
  if (scope === "global" && !flags.isSuperAdmin) {
    redirectWith(tournament_id, {
      err: "Solo Super Admin puede otorgar comité global.",
      tab: "admin",
    });
    return;
  }
  if (
    scope === "club" &&
    !flags.isSuperAdmin &&
    !flags.isClubAdminOfTournament
  ) {
    redirectWith(tournament_id, {
      err: "Solo Club Admin (o Super Admin) puede otorgar comité por club.",
      tab: "admin",
    });
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    redirectWith(tournament_id, {
      err: "Falta SUPABASE_SERVICE_ROLE_KEY para invitar miembros.",
      tab: "admin",
    });
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", emailRaw)
    .maybeSingle();

  if (!profile?.id) {
    redirectWith(tournament_id, {
      err: `No existe un usuario con email "${emailRaw}". Créalo primero en Usuarios → Nuevo.`,
      tab: "admin",
    });
    return;
  }

  const fd2 = new FormData();
  fd2.set("tournament_id", tournament_id);
  fd2.set("user_id", String(profile.id));
  fd2.set("scope", scope);
  await assignHandicapCommitteeRole(fd2);
}
