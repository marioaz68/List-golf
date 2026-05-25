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
    },
    { onConflict: "committee_id,entry_id,member_user_id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/comite-handicap");
  return { ok: true };
}

export async function applyHandicapCommitteeSuggestion(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const entry_id = reqStr(formData, "entry_id");

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

  const { data: voteRows } = await admin
    .from("handicap_committee_votes")
    .select("adjustment, abstained")
    .eq("committee_id", committee.id)
    .eq("entry_id", entry_id)
    .eq("abstained", false);

  const adjustments = (voteRows ?? [])
    .map((v: any) =>
      v.adjustment != null ? Number(v.adjustment) : Number.NaN
    )
    .filter((n) => Number.isFinite(n));

  if (adjustments.length === 0) {
    redirectWith(tournament_id, {
      err: "No hay votos suficientes para aplicar un ajuste.",
      tab: "admin",
    });
    return;
  }

  const trim = trimmedAverage(
    adjustments,
    Number(committee.trim_low ?? 0),
    Number(committee.trim_high ?? 0)
  );
  const avg = trim.avg;
  if (avg == null || !Number.isFinite(avg) || trim.liveCount < 1) {
    redirectWith(tournament_id, {
      err: "El recorte deja menos de un voto vivo; ajusta los parámetros.",
      tab: "admin",
    });
    return;
  }

  const { data: entry, error: eErr } = await admin
    .from("tournament_entries")
    .select("id, handicap_index")
    .eq("id", entry_id)
    .eq("tournament_id", tournament_id)
    .single();

  if (eErr || !entry) {
    redirectWith(tournament_id, { err: "Inscripción no encontrada.", tab: "admin" });
    return;
  }

  const current = entry.handicap_index != null ? Number(entry.handicap_index) : null;
  if (current == null || !Number.isFinite(current)) {
    redirectWith(tournament_id, { err: "El jugador no tiene HI en el torneo.", tab: "admin" });
    return;
  }

  const nextHi = Math.round((current + avg) * 10) / 10;

  const { error: updErr } = await admin
    .from("tournament_entries")
    .update({ handicap_index: nextHi })
    .eq("id", entry_id);

  if (updErr) {
    redirectWith(tournament_id, { err: updErr.message, tab: "admin" });
    return;
  }

  revalidatePath("/comite-handicap");
  revalidatePath("/entries");
  redirectWith(tournament_id, { ok: "hi_applied", tab: "admin" });
}

export async function setHandicapCommitteeTrim(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const rawHigh = Number(String(formData.get("trim_high") ?? "0"));
  const rawLow = Number(String(formData.get("trim_low") ?? "0"));

  const trim_high = Number.isFinite(rawHigh)
    ? Math.min(20, Math.max(0, Math.trunc(rawHigh)))
    : 0;
  const trim_low = Number.isFinite(rawLow)
    ? Math.min(20, Math.max(0, Math.trunc(rawLow)))
    : 0;

  const { supabase, user } = await requireUser();
  const access = await loadHandicapCommitteeAccess(supabase, user.id, tournament_id);
  if (!access.isAdmin) {
    redirectWith(tournament_id, { err: "No tienes permiso.", tab: "admin" });
    return;
  }

  const { error } = await supabase
    .from("tournament_handicap_committees")
    .update({ trim_high, trim_low })
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
