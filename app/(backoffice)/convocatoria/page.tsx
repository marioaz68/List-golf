import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import type { ConvocatoriaDraft } from "@/lib/convocatoria/types";
import {
  isMatchPlayConvocatoriaDraft,
  normalizeConvocatoriaDraft,
  normalizeWorkflowStatus,
} from "@/lib/convocatoria/draftUtils";
import { upgradeTournamentCutRulesFromMachote } from "@/lib/convocatoria/upgradeTournamentRules";
import {
  alignConvocatoriaWithMachote,
  buildMachoteDraftForTournament,
  draftNeedsMachoteSync,
} from "@/lib/convocatoria/syncWithMachote";
import { matchPlayMachote } from "@/lib/convocatoria/templates/matchPlayMachote";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";
import ConvocatoriaEditor from "./ConvocatoriaEditor";
import MatchPlayConvocatoriaEditor from "./MatchPlayConvocatoriaEditor";
import {
  loadCcqMixtoMatchPlayTemplate,
  loadConvocatoriaTemplate,
  uploadConvocatoriaDocx,
} from "./actions";

export const dynamic = "force-dynamic";

type SP = {
  tournament_id?: string;
  applied?: string;
  saved?: string;
  closed?: string;
  template?: string;
  matchplay?: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  textDecoration: "none",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#0891b2, #0e7490)",
  border: "1px solid #155e75",
};

export default async function ConvocatoriaPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const locale = await getLocale();
  const cv = messages[locale].convocatoria;
  const common = messages[locale].common;
  const nav = messages[locale].sidebar.nav;

  const supabase = createAdminClient();
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  const tournamentList = tournaments ?? [];
  const effectiveId =
    tournamentId || (tournamentList[0]?.id as string | undefined) || "";

  if (!tournamentId && effectiveId) {
    redirect(`/convocatoria?tournament_id=${effectiveId}`);
  }

  if (!effectiveId) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">{cv.title}</h1>
        <p className="text-sm text-amber-200">{cv.noTournaments}</p>
      </div>
    );
  }

  const { data: convRow, error: convError } = await supabase
    .from("tournament_convocatoria")
    .select("file_name, draft_json, warnings, status, applied_at")
    .eq("tournament_id", effectiveId)
    .maybeSingle();

  if (
    convError &&
    /tournament_convocatoria|does not exist|schema cache/i.test(convError.message)
  ) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">{cv.title}</h1>
        <div className="rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-100">
          {cv.migrationMissing}
        </div>
      </div>
    );
  }

  const { count: entryCount } = await supabase
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", effectiveId);

  const tournamentName =
    tournamentList.find((t) => t.id === effectiveId)?.name ?? null;

  const { data: tournamentRow } = await supabase
    .from("tournaments")
    .select("settings")
    .eq("id", effectiveId)
    .maybeSingle();

  const tournamentSettings = (tournamentRow?.settings ?? {}) as TournamentSettings & {
    matchplay?: { match_type?: "individual" | "pairs"; bracket_main_pairs?: number | null };
  };
  const tournamentIsMatchPlay = isMatchPlayFormat(tournamentSettings);
  const hintedMatchType =
    tournamentSettings.matchplay?.match_type === "individual"
      ? "individual"
      : "pairs";
  const hintedBracketMain =
    tournamentSettings.matchplay?.bracket_main_pairs ?? null;

  let rulesUpgraded = false;
  if (!tournamentIsMatchPlay) {
    try {
      const upgrade = await upgradeTournamentCutRulesFromMachote(
        supabase,
        effectiveId
      );
      rulesUpgraded = upgrade.upgraded;
    } catch (upgradeErr) {
      console.error("[convocatoria] upgrade cut rules:", upgradeErr);
    }
  }

  const rawDraft = (convRow?.draft_json ?? null) as ConvocatoriaDraft | null;
  let draft = rawDraft ? normalizeConvocatoriaDraft(rawDraft) : null;
  const workflowStatus = normalizeWorkflowStatus(convRow?.status);
  const hasEntries = (entryCount ?? 0) > 0;
  let hasDraft = Boolean(draft?.categories?.length);
  let autoProvisioned = false;
  let autoSynced = false;

  if (!hasDraft) {
    draft = tournamentIsMatchPlay
      ? matchPlayMachote({
          title: typeof tournamentName === "string" ? tournamentName : null,
          matchplay: {
            match_type: hintedMatchType,
            bracket_main_pairs: hintedBracketMain,
            max_pairs_per_category: hintedBracketMain,
          },
        })
      : buildMachoteDraftForTournament(
          typeof tournamentName === "string" ? tournamentName : null
        );
    const now = new Date().toISOString();
    const { error: provisionError } = await supabase
      .from("tournament_convocatoria")
      .upsert(
        {
          tournament_id: effectiveId,
          file_name: tournamentIsMatchPlay
            ? "Plantilla: Match Play por parejas"
            : "Plantilla: 68º Torneo Anual CCQ",
          draft_json: draft,
          warnings: draft.warnings,
          status: "editing",
          updated_at: now,
        },
        { onConflict: "tournament_id" }
      );
    if (provisionError) {
      throw new Error(provisionError.message);
    }
    hasDraft = true;
    autoProvisioned = true;
  } else if (
    draft &&
    !tournamentIsMatchPlay &&
    !isMatchPlayConvocatoriaDraft(draft) &&
    workflowStatus === "editing" &&
    draftNeedsMachoteSync(draft)
  ) {
    const aligned = alignConvocatoriaWithMachote(
      draft,
      typeof tournamentName === "string" ? tournamentName : null
    );
    const { error: syncError } = await supabase
      .from("tournament_convocatoria")
      .update({
        draft_json: aligned,
        warnings: aligned.warnings,
        updated_at: new Date().toISOString(),
      })
      .eq("tournament_id", effectiveId);
    if (syncError) {
      throw new Error(syncError.message);
    }
    draft = aligned;
    autoSynced = true;
  }

  const editorLabels = {
    statusEditing: cv.statusEditing,
    statusClosed: cv.statusClosed,
    statusApplied: cv.statusApplied,
    tabMeta: cv.tabMeta,
    tabReference: cv.tabReference,
    tabCategories: cv.tabCategories,
    tabCompetition: cv.tabCompetition,
    tabCuts: cv.tabCuts,
    tabPrizes: cv.tabPrizes,
    saveDraft: cv.saveDraft,
    closeConvocatoria: cv.closeConvocatoria,
    reopenConvocatoria: cv.reopenConvocatoria,
    generateParams: cv.generateParams,
    generateBlocked: cv.generateBlocked,
    confirmClose: cv.confirmClose,
    confirmGenerate: cv.confirmGenerate,
    metaTitle: cv.metaTitle,
    metaHoles: cv.metaHoles,
    metaCutHoles: cv.metaCutHoles,
    metaCutPct: cv.metaCutPct,
    metaRounds: cv.metaRounds,
    metaPracticeDay: cv.metaPracticeDay,
    metaHandicapDate: cv.metaHandicapDate,
    refSystem: cv.refSystem,
    refGentlemen: cv.refGentlemen,
    refLadies: cv.refLadies,
    refSeniorsAges: cv.refSeniorsAges,
    refCutPolicy: cv.refCutPolicy,
    refCutTiebreakGross: cv.refCutTiebreakGross,
    refCutTiebreakStableford: cv.refCutTiebreakStableford,
    refCutTiebreakSeniors: cv.refCutTiebreakSeniors,
    refTrophyTiebreak: cv.refTrophyTiebreak,
    refTrophies: cv.refTrophies,
    refOutOfScope: cv.refOutOfScope,
    colCode: cv.colCode,
    colName: cv.colName,
    colHcp: cv.colHcp,
    colCut: cv.colCut,
    colGroup: cv.colGroup,
    colGender: cv.colGender,
    addCategory: cv.addCategory,
    warnings: cv.reviewWarnings,
    readOnlyHint: cv.readOnlyHint,
  };

  return (
    <div className="space-y-3 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">{cv.title}</h1>
      <p className="max-w-3xl text-[12px] leading-snug text-slate-300">
        {tournamentIsMatchPlay ? cv.introMatchPlay : cv.intro}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Link href="/tournaments/new" style={buttonStyle}>
          {cv.newTournament}
        </Link>
        <Link
          href={`/categories?tournament_id=${effectiveId}`}
          style={buttonStyle}
        >
          {nav.categories}
        </Link>
        {tournamentIsMatchPlay ? (
          <Link href={`/matchplay?tournament_id=${effectiveId}`} style={buttonStyle}>
            {cv.linkMatchPlay}
          </Link>
        ) : (
          <>
            <Link
              href={`/competition-rules?tournament_id=${effectiveId}`}
              style={buttonStyle}
            >
              {nav.competitionRules}
            </Link>
            <Link href={`/cut-rules?tournament_id=${effectiveId}`} style={buttonStyle}>
              {nav.cutRules}
            </Link>
          </>
        )}
        <Link href={`/prize-rules?tournament_id=${effectiveId}`} style={buttonStyle}>
          {cv.linkPrizes}
        </Link>
      </div>

      <form method="GET" action="/convocatoria" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300">
            {common.tournament}
          </label>
          <select
            name="tournament_id"
            defaultValue={effectiveId}
            className="mt-1 w-full max-w-md rounded border border-white/15 bg-[#0f172a] px-2 py-1.5 text-sm text-white"
          >
            {tournamentList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ?? t.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" style={buttonStyle}>
          {common.change}
        </button>
      </form>

      {sp.applied === "1" ? (
        <div className="rounded-lg border border-green-400/50 bg-green-950/40 px-3 py-2 text-[12px] text-green-100">
          {sp.matchplay === "1" ? cv.appliedOkMatchPlay : cv.appliedOk}
        </div>
      ) : null}
      {sp.closed === "1" ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-100">
          {cv.closedOk}
        </div>
      ) : null}

      {autoProvisioned ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[12px] text-cyan-100">
          {tournamentIsMatchPlay ? cv.autoProvisionNoteMatchPlay : cv.autoProvisionNote}
        </div>
      ) : null}
      {autoSynced ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[12px] text-cyan-100">
          {cv.autoSyncNote}
        </div>
      ) : null}
      {rulesUpgraded ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-[12px] text-emerald-100">
          {cv.rulesUpgradedNote}
        </div>
      ) : null}

      {hasDraft && draft ? (
        tournamentIsMatchPlay || isMatchPlayConvocatoriaDraft(draft) ? (
          <MatchPlayConvocatoriaEditor
            tournamentId={effectiveId}
            initialDraft={draft}
            workflowStatus={workflowStatus}
            templateName={convRow?.file_name ?? null}
            hasEntries={hasEntries}
            labels={{
              ...editorLabels,
              tabRules: cv.tabMatchPlayRules,
              matchPlayBadge: cv.matchPlayBadge,
              confirmGenerate: cv.confirmGenerateMatchPlay,
            }}
          />
        ) : (
          <ConvocatoriaEditor
            tournamentId={effectiveId}
            initialDraft={draft}
            workflowStatus={workflowStatus}
            templateName={convRow?.file_name ?? null}
            hasEntries={hasEntries}
            labels={editorLabels}
          />
        )
      ) : null}

      <details className="rounded-lg border border-white/10 bg-[#0f172a] p-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-400">
          {cv.importOptionalTitle}
        </summary>
        <form action={loadConvocatoriaTemplate} className="mt-2 space-y-2">
          <input type="hidden" name="tournament_id" value={effectiveId} />
          <p className="text-[10px] text-slate-500">{cv.reloadTemplateHint}</p>
          <button type="submit" style={buttonStyle}>
            {cv.loadTemplateButton}
          </button>
        </form>
        {tournamentIsMatchPlay || isMatchPlayConvocatoriaDraft(draft) ? (
          <form
            action={loadCcqMixtoMatchPlayTemplate}
            className="mt-3 space-y-2"
          >
            <input type="hidden" name="tournament_id" value={effectiveId} />
            <p className="text-[10px] text-slate-500">
              Plantilla específica del Torneo Match Play de Parejas Mixto CCQ
              2026 (categoría única, calcuta, consolaciones, premios 43/20/12/10/8/7%).
            </p>
            <button type="submit" style={buttonStyle}>
              Cargar plantilla CCQ Mixto Match Play
            </button>
          </form>
        ) : null}
        <form action={uploadConvocatoriaDocx} className="mt-3 space-y-2">
          <input type="hidden" name="tournament_id" value={effectiveId} />
          <p className="text-[10px] text-slate-500">
            {cv.importOptionalHint} Acepta Word (.docx), PDF y Excel (.xlsx,
            .xls).
          </p>
          <input
            type="file"
            name="convocatoria_file"
            accept=".docx,.pdf,.xlsx,.xls"
            className="block w-full max-w-md text-[11px] text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-600 file:px-2 file:py-1 file:text-white"
          />
          <button type="submit" style={buttonStyle}>
            {cv.importOptionalButton}
          </button>
        </form>
      </details>
    </div>
  );
}
