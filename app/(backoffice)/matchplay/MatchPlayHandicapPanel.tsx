"use client";

import { useMemo, useState } from "react";
import type { MatchPlayEntryRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import {
  computeWhsHandicap,
  isValidWhsTee,
  type WhsTeeData,
} from "@/lib/handicap/whs";
import {
  clearEntryPlayingHandicapOverride,
  recomputeMatchplayHandicaps,
  saveMatchplayWhsSettings,
  setEntryPlayingHandicapOverride,
} from "./handicapActions";

type WhsRules = {
  allowance_pct: number | null;
  whs_slope_men: number | null;
  whs_slope_women: number | null;
  whs_course_rating_men: number | null;
  whs_course_rating_women: number | null;
  whs_par_men: number | null;
  whs_par_women: number | null;
};

export type CourseTeeSetForWhs = {
  id: string;
  code: string | null;
  name: string | null;
  gender_default: "M" | "F" | "X" | null;
  slope_men: number | null;
  slope_women: number | null;
  course_rating_men: number | null;
  course_rating_women: number | null;
  par: number | null;
  yardage: number | null;
};

type Props = {
  tournamentId: string;
  rules: WhsRules;
  entries: MatchPlayEntryRow[];
  courseTeeSets: CourseTeeSetForWhs[];
  flashStatus?: string | null;
  flashMessage?: string | null;
};

const cardStyle =
  "rounded-lg border border-white/10 bg-[#0f172a] p-3 text-white";

const inputClass =
  "w-full min-w-0 rounded border border-white/15 bg-[#0a1220] px-2 py-1 text-[12px] text-white";

const labelClass =
  "block text-[10px] font-semibold uppercase tracking-wide text-slate-400";

const primaryBtn =
  "inline-flex items-center justify-center min-h-[30px] rounded border border-emerald-700 bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 text-[12px] font-semibold text-white";

const subtleBtn =
  "inline-flex items-center justify-center min-h-[28px] rounded border border-white/15 bg-[#1f2937] px-3 text-[11px] font-semibold text-white";

const dangerBtn =
  "inline-flex items-center justify-center min-h-[28px] rounded border border-rose-700 bg-gradient-to-b from-rose-500 to-rose-700 px-3 text-[11px] font-semibold text-white";

function fmtNum(n: number | null | undefined, fallback = "—"): string {
  if (n == null || !Number.isFinite(Number(n))) return fallback;
  return String(n);
}

export default function MatchPlayHandicapPanel({
  tournamentId,
  rules,
  entries,
  courseTeeSets,
  flashStatus,
  flashMessage,
}: Props) {
  const [search, setSearch] = useState("");
  const [editingEntry, setEditingEntry] = useState<string | null>(null);

  const [slopeMen, setSlopeMen] = useState<string>(
    rules.whs_slope_men != null ? String(rules.whs_slope_men) : ""
  );
  const [crMen, setCrMen] = useState<string>(
    rules.whs_course_rating_men != null ? String(rules.whs_course_rating_men) : ""
  );
  const [parMen, setParMen] = useState<string>(
    rules.whs_par_men != null ? String(rules.whs_par_men) : ""
  );
  const [slopeWomen, setSlopeWomen] = useState<string>(
    rules.whs_slope_women != null ? String(rules.whs_slope_women) : ""
  );
  const [crWomen, setCrWomen] = useState<string>(
    rules.whs_course_rating_women != null ? String(rules.whs_course_rating_women) : ""
  );
  const [parWomen, setParWomen] = useState<string>(
    rules.whs_par_women != null ? String(rules.whs_par_women) : ""
  );

  const teeOptionsMen = useMemo(
    () =>
      courseTeeSets.filter(
        (t) =>
          t.slope_men != null && t.course_rating_men != null && t.par != null
      ),
    [courseTeeSets]
  );
  const teeOptionsWomen = useMemo(
    () =>
      courseTeeSets.filter(
        (t) =>
          t.slope_women != null && t.course_rating_women != null && t.par != null
      ),
    [courseTeeSets]
  );

  function applyTeeMen(teeId: string) {
    const tee = teeOptionsMen.find((t) => t.id === teeId);
    if (!tee) return;
    setSlopeMen(String(tee.slope_men ?? ""));
    setCrMen(String(tee.course_rating_men ?? ""));
    setParMen(String(tee.par ?? ""));
  }

  function applyTeeWomen(teeId: string) {
    const tee = teeOptionsWomen.find((t) => t.id === teeId);
    if (!tee) return;
    setSlopeWomen(String(tee.slope_women ?? ""));
    setCrWomen(String(tee.course_rating_women ?? ""));
    setParWomen(String(tee.par ?? ""));
  }

  const tee_men: Partial<WhsTeeData> = {
    slope: Number(slopeMen) || undefined,
    course_rating: Number(crMen) || undefined,
    par: Number(parMen) || undefined,
  };
  const tee_women: Partial<WhsTeeData> = {
    slope: Number(slopeWomen) || undefined,
    course_rating: Number(crWomen) || undefined,
    par: Number(parWomen) || undefined,
  };
  const menValid = isValidWhsTee(tee_men);
  const womenValid = isValidWhsTee(tee_women);
  const allowance = rules.allowance_pct ?? 100;

  const previewRows = useMemo(() => {
    return entries.map((e) => {
      const gender = (e.player.gender ?? "X").toUpperCase();
      const tee = gender === "F" && womenValid
        ? tee_women
        : gender === "M" && menValid
          ? tee_men
          : menValid
            ? tee_men
            : womenValid
              ? tee_women
              : null;

      let preview: ReturnType<typeof computeWhsHandicap> | null = null;
      if (tee && isValidWhsTee(tee)) {
        preview = computeWhsHandicap({
          hi: e.effective_hi,
          slope: tee.slope,
          course_rating: tee.course_rating,
          par: tee.par,
          allowance_pct: allowance,
        });
      }
      return { entry: e, preview };
    });
  }, [entries, menValid, womenValid, tee_men, tee_women, allowance]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return previewRows;
    return previewRows.filter((r) => {
      const text = `${formatPlayerName(r.entry.player)} ${
        r.entry.category_code ?? ""
      } ${r.entry.player.gender ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [previewRows, search]);

  return (
    <section id="handicaps" className={cardStyle}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            Handicaps WHS / GHIN (match play)
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-400">
            Por inscrito: categoría (HI) → salida del campo según{" "}
            <span className="text-slate-300">reglas salida/categoría</span> →
            Course Handicap{" "}
            <span className="text-slate-300">
              (HI × Slope/113 + CR − Par)
            </span>{" "}
            → Playing Handicap{" "}
            <span className="text-slate-300">
              (CH × % de reglas de competencia)
            </span>
            . Los valores de abajo son respaldo si el torneo no tiene salidas
            por categoría configuradas.
          </p>
        </div>
      </header>

      {flashStatus && flashMessage ? (
        <div
          className={`mt-2 rounded-md border px-3 py-1.5 text-[12px] ${
            flashStatus === "error"
              ? "border-rose-500/50 bg-rose-950/40 text-rose-100"
              : "border-emerald-500/50 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <form
        action={saveMatchplayWhsSettings}
        className="mt-3 grid gap-3 rounded border border-white/10 bg-[#0a1220] p-3 md:grid-cols-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
            Salida caballeros (M)
          </legend>

          {teeOptionsMen.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <label className={labelClass}>Cargar del campo</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      applyTeeMen(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">Seleccionar salida…</option>
                  {teeOptionsMen.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.code} · Slope {t.slope_men} · CR{" "}
                      {t.course_rating_men} · Par {t.par}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>Slope</label>
              <input
                type="number"
                name="whs_slope_men"
                min={55}
                max={155}
                step={1}
                value={slopeMen}
                onChange={(e) => setSlopeMen(e.target.value)}
                placeholder="113"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Course Rating</label>
              <input
                type="number"
                name="whs_course_rating_men"
                min={50}
                max={90}
                step={0.1}
                value={crMen}
                onChange={(e) => setCrMen(e.target.value)}
                placeholder="71.4"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Par</label>
              <input
                type="number"
                name="whs_par_men"
                min={60}
                max={80}
                step={1}
                value={parMen}
                onChange={(e) => setParMen(e.target.value)}
                placeholder="72"
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-pink-300">
            Salida damas (F)
          </legend>

          {teeOptionsWomen.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <label className={labelClass}>Cargar del campo</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      applyTeeWomen(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">Seleccionar salida…</option>
                  {teeOptionsWomen.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.code} · Slope {t.slope_women} · CR{" "}
                      {t.course_rating_women} · Par {t.par}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>Slope</label>
              <input
                type="number"
                name="whs_slope_women"
                min={55}
                max={155}
                step={1}
                value={slopeWomen}
                onChange={(e) => setSlopeWomen(e.target.value)}
                placeholder="119"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Course Rating</label>
              <input
                type="number"
                name="whs_course_rating_women"
                min={50}
                max={90}
                step={0.1}
                value={crWomen}
                onChange={(e) => setCrWomen(e.target.value)}
                placeholder="72.6"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Par</label>
              <input
                type="number"
                name="whs_par_women"
                min={60}
                max={80}
                step={1}
                value={parWomen}
                onChange={(e) => setParWomen(e.target.value)}
                placeholder="72"
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        <div className="md:col-span-2 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
          <div>
            <label className={labelClass}>Allowance % (WHS)</label>
            <input
              type="number"
              name="allowance_pct"
              min={1}
              max={100}
              step={0.5}
              defaultValue={allowance}
              className={inputClass}
              required
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Bola Baja+Alta: 80 · Four-ball: 90 · Individual: 100
            </p>
          </div>
          <div className="flex-1 text-[11px] text-slate-400">
            Al guardar se recalculan automáticamente CH y PH de todos los
            inscritos (los que tienen override manual quedan intactos).
          </div>
          <button type="submit" className={primaryBtn}>
            Guardar y recalcular todos
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jugador o categoría…"
          className={`${inputClass} max-w-xs`}
        />
        <form action={recomputeMatchplayHandicaps}>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <button type="submit" className={subtleBtn}>
            Recalcular ahora
          </button>
        </form>
        <p className="text-[11px] text-slate-400">
          {entries.length} inscritos · {menValid ? "✅" : "⚠️"} datos M ·{" "}
          {womenValid ? "✅" : "⚠️"} datos F
        </p>
      </div>

      <div className="mt-2 overflow-x-auto rounded border border-white/10">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
            <tr>
              <th className="px-2 py-1.5">Jugador</th>
              <th className="px-2 py-1.5">Cat</th>
              <th className="px-2 py-1.5">Sexo</th>
              <th className="px-2 py-1.5 text-right">HI</th>
              <th className="px-2 py-1.5 text-right">CH calc</th>
              <th className="px-2 py-1.5 text-right">PH calc</th>
              <th className="px-2 py-1.5 text-right">PH guardado</th>
              <th className="px-2 py-1.5">Override</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ entry, preview }) => {
              const isEditing = editingEntry === entry.id;
              const hasOverride = entry.playing_handicap_override != null;
              return (
                <tr
                  key={entry.id}
                  className="border-t border-white/5 align-middle hover:bg-white/[0.02]"
                >
                  <td className="px-2 py-1.5 font-medium text-white">
                    {formatPlayerName(entry.player)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">
                    {entry.category_code ?? entry.category_name ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">
                    {entry.player.gender ?? "X"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-200">
                    {entry.effective_hi.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                    {preview ? preview.course_handicap : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">
                    {preview ? preview.playing_handicap : "—"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                      hasOverride ? "text-amber-300" : "text-white"
                    }`}
                  >
                    {fmtNum(entry.playing_handicap)}
                  </td>
                  <td className="px-2 py-1.5">
                    {hasOverride ? (
                      <span
                        className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200"
                        title={entry.playing_handicap_override_reason ?? ""}
                      >
                        Manual
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isEditing ? (
                      <form
                        action={setEntryPlayingHandicapOverride}
                        onSubmit={() => setEditingEntry(null)}
                        className="flex flex-wrap items-center gap-1"
                      >
                        <input
                          type="hidden"
                          name="tournament_id"
                          value={tournamentId}
                        />
                        <input type="hidden" name="entry_id" value={entry.id} />
                        <input
                          type="number"
                          name="playing_handicap"
                          step={1}
                          min={0}
                          max={54}
                          defaultValue={
                            entry.playing_handicap_override ??
                            entry.playing_handicap ??
                            preview?.playing_handicap ??
                            0
                          }
                          className={`${inputClass} w-16 text-right`}
                          required
                          autoFocus
                        />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Razón (opcional)"
                          className={`${inputClass} w-40`}
                        />
                        <button type="submit" className={primaryBtn}>
                          Aplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEntry(null)}
                          className={subtleBtn}
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingEntry(entry.id)}
                          className={subtleBtn}
                        >
                          Override
                        </button>
                        {hasOverride ? (
                          <form action={clearEntryPlayingHandicapOverride}>
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />
                            <input
                              type="hidden"
                              name="entry_id"
                              value={entry.id}
                            />
                            <button type="submit" className={dangerBtn}>
                              Quitar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-4 text-center text-[12px] text-slate-400"
                >
                  Sin inscritos para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
