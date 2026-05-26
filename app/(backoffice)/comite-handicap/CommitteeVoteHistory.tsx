"use client";

import { useState } from "react";
import { formatAdjustmentLabel } from "@/lib/handicap-committee/constants";

export type ArchivedSession = {
  id: string;
  session_no: number;
  name: string | null;
  notes: string | null;
  archived_at: string;
  trim_high: number;
  trim_low: number;
  disqualify_threshold: number;
  n_members_present: number;
  n_voters: number;
  n_entries: number;
};

export type ArchivedSnapshot = {
  id: string;
  session_id: string;
  entry_player_name: string | null;
  entry_handicap_index: number | null;
  entry_category_code: string | null;
  n_votes: number;
  n_abstained: number;
  n_disqualify: number;
  avg_adjustment: number | null;
  suggested_hi: number | null;
  votes_anon: Array<{ value: number; trimmed: boolean; reason?: string }> | null;
};

type Props = {
  sessions: ArchivedSession[];
  snapshotsBySession: Record<string, ArchivedSnapshot[]>;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function CommitteeVoteHistory({
  sessions,
  snapshotsBySession,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-sm font-bold text-slate-900">
          Historial de votaciones
        </h3>
        <p className="mt-2 text-xs text-slate-600">
          Aún no hay sesiones archivadas. Al reiniciar la votación se guardará
          aquí un resumen anónimo de los resultados.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-bold text-slate-900">
        Historial de votaciones ({sessions.length})
      </h3>
      <p className="text-xs text-slate-600">
        Sesiones guardadas al reiniciar. Los votos individuales permanecen
        anónimos.
      </p>

      <ul className="space-y-2">
        {sessions.map((s) => {
          const snaps = snapshotsBySession[s.id] ?? [];
          const isOpen = openId === s.id;
          return (
            <li
              key={s.id}
              className="overflow-hidden rounded-lg border border-slate-300 bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
              >
                <span className="font-semibold">
                  {s.name ?? `Sesión ${s.session_no}`}
                </span>
                <span className="text-xs text-slate-500">
                  {formatWhen(s.archived_at)} · {s.n_voters} votantes ·{" "}
                  {s.n_entries} jugadores
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-slate-200 px-3 py-2">
                  <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                    <span>
                      Recorte: −{s.trim_low} suaves / −{s.trim_high} severos
                    </span>
                    <span>
                      Umbral «No jugar»: {s.disqualify_threshold || "off"}
                    </span>
                    <span>Presentes: {s.n_members_present}</span>
                    {s.notes ? <span>Notas: {s.notes}</span> : null}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-900">
                      <thead className="bg-slate-100 uppercase text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5">Jugador</th>
                          <th className="px-2 py-1.5">HI</th>
                          <th className="px-2 py-1.5">Votos</th>
                          <th className="px-2 py-1.5">Prom.</th>
                          <th className="px-2 py-1.5">HI sug.</th>
                          <th className="px-2 py-1.5">No jugar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snaps.map((row) => {
                          const over =
                            s.disqualify_threshold > 0 &&
                            row.n_disqualify >= s.disqualify_threshold;
                          const chips = row.votes_anon ?? [];
                          return (
                            <tr
                              key={row.id}
                              className="border-t border-slate-100 align-top"
                            >
                              <td className="px-2 py-1.5 font-medium">
                                {row.entry_player_name ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.entry_handicap_index ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap gap-0.5">
                                  {chips.length === 0 ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    chips.map((v, i) => (
                                      <span
                                        key={i}
                                        className={[
                                          "rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums",
                                          v.trimmed
                                            ? "bg-slate-100 text-slate-500 line-through"
                                            : "bg-emerald-600 text-white",
                                        ].join(" ")}
                                      >
                                        {formatAdjustmentLabel(v.value)}
                                      </span>
                                    ))
                                  )}
                                  {row.n_abstained > 0 ? (
                                    <span className="text-[10px] text-amber-700">
                                      {row.n_abstained} abst.
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.avg_adjustment != null
                                  ? formatAdjustmentLabel(row.avg_adjustment)
                                  : "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums font-semibold">
                                {row.suggested_hi ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                {row.n_disqualify > 0 ? (
                                  <span
                                    className={[
                                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                      over
                                        ? "bg-rose-700 text-white"
                                        : "bg-rose-100 text-rose-800",
                                    ].join(" ")}
                                  >
                                    {row.n_disqualify}
                                    {over ? " · No autorizado" : ""}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
