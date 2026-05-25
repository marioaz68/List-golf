"use client";

import { useMemo, useState, useTransition } from "react";
import {
  HANDICAP_ADJUSTMENT_MAX,
  HANDICAP_ADJUSTMENT_MIN,
  HANDICAP_ADJUSTMENT_STEP,
  formatAdjustmentLabel,
} from "@/lib/handicap-committee/constants";
import { saveHandicapCommitteeVote } from "./actions";

export type HandicapEntryRow = {
  entry_id: string;
  player_name: string;
  club_label: string | null;
  handicap_index: number | null;
  category_code: string | null;
};

export type HandicapVoteRow = {
  entry_id: string;
  adjustment: number | null;
  abstained: boolean;
};

type Props = {
  tournamentId: string;
  entries: HandicapEntryRow[];
  myVotes: HandicapVoteRow[];
  committeeOpen: boolean;
  isPresent: boolean;
  isAdmin: boolean;
};

export default function HandicapCommitteeVoter({
  tournamentId,
  entries,
  myVotes,
  committeeOpen,
  isPresent,
  isAdmin,
}: Props) {
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const voteByEntry = useMemo(() => {
    const m = new Map<string, HandicapVoteRow>();
    for (const v of myVotes) m.set(v.entry_id, v);
    return m;
  }, [myVotes]);

  const votedCount = useMemo(
    () => entries.filter((e) => voteByEntry.has(e.entry_id)).length,
    [entries, voteByEntry]
  );

  const qn = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!qn) return entries;
    return entries.filter((e) => {
      const hay = [e.player_name, e.club_label, e.category_code, String(e.handicap_index ?? "")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qn);
    });
  }, [entries, qn]);

  const canVote = committeeOpen && isPresent;

  return (
    <div className="space-y-4">
      {!isPresent ? (
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">No estás marcado como presente.</div>
          <p className="mt-1">
            {isAdmin
              ? "Marca tu asistencia en la sección «Miembros del comité» del panel de Administración para poder votar."
              : "Pide al director del torneo que te active en el panel del comité. Mientras tanto no podrás guardar votos."}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Tu progreso</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{
              width: entries.length
                ? `${Math.round((votedCount / entries.length) * 100)}%`
                : "0%",
            }}
          />
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Has calificado <span className="font-bold">{votedCount}</span> de{" "}
          <span className="font-bold">{entries.length}</span> jugadores
        </div>
        {!committeeOpen ? (
          <p className="mt-2 text-sm text-amber-800">
            La votación está cerrada. Ya no puedes cambiar tus calificaciones.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-600">
            Tu voto es privado: ningún otro miembro ve tus calificaciones. Solo bajar HI
            (−0.5 a −5.0).
          </p>
        )}
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar jugador, club, HI…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
      />

      {msg ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {msg}
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((entry) => (
          <PlayerVoteCard
            key={entry.entry_id}
            entry={entry}
            tournamentId={tournamentId}
            initial={voteByEntry.get(entry.entry_id)}
            disabled={!canVote || pending}
            committeeOpen={committeeOpen}
            onSaved={() => setMsg("")}
            onError={(e) => setMsg(e)}
            startTransition={startTransition}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Sin resultados para esta búsqueda.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayerVoteCard({
  entry,
  tournamentId,
  initial,
  disabled,
  committeeOpen,
  onSaved,
  onError,
  startTransition,
}: {
  entry: HandicapEntryRow;
  tournamentId: string;
  initial?: HandicapVoteRow;
  disabled: boolean;
  committeeOpen: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
  startTransition: (fn: () => void) => void;
}) {
  const saved = Boolean(initial);
  const defaultAdjustment =
    initial?.abstained || initial?.adjustment == null
      ? -1.0
      : Number(initial.adjustment);

  const [abstained, setAbstained] = useState(initial?.abstained ?? false);
  const [adjustment, setAdjustment] = useState(defaultAdjustment);
  const [editing, setEditing] = useState(!saved);
  const [justSaved, setJustSaved] = useState(false);

  const lockedByClosing = !committeeOpen;

  async function handleSave() {
    const fd = new FormData();
    fd.set("tournament_id", tournamentId);
    fd.set("entry_id", entry.entry_id);
    fd.set("abstained", abstained ? "true" : "false");
    if (!abstained) fd.set("adjustment", String(adjustment));

    const res = await saveHandicapCommitteeVote(fd);
    if (!res.ok) {
      onError(res.error ?? "Error al guardar");
      return;
    }
    onSaved();
    setJustSaved(true);
    setEditing(false);
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  function handleCancel() {
    setAbstained(initial?.abstained ?? false);
    setAdjustment(defaultAdjustment);
    setEditing(false);
  }

  const showControls = editing && !lockedByClosing;

  return (
    <article
      className={[
        "rounded-xl border p-3 shadow-sm",
        saved ? "border-emerald-400/60 bg-emerald-50/40" : "border-slate-300 bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-950">{entry.player_name}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            {entry.club_label ? `${entry.club_label} · ` : ""}
            HI {entry.handicap_index ?? "—"}
            {entry.category_code ? ` · ${entry.category_code}` : ""}
          </div>
        </div>
        {saved ? (
          <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            {justSaved ? "Guardado" : "Listo"}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
            Pendiente
          </span>
        )}
      </div>

      {!showControls && saved ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-sm text-slate-800">
            {initial?.abstained ? (
              <>
                <span className="font-semibold">Te abstuviste</span> en este jugador.
              </>
            ) : (
              <>
                Calificación guardada:{" "}
                <span className="font-bold tabular-nums text-slate-950">
                  {formatAdjustmentLabel(initial?.adjustment ?? null)} pts
                </span>
              </>
            )}
          </div>

          {lockedByClosing ? (
            <span className="text-[11px] font-semibold uppercase text-amber-800">
              Bloqueado · votación cerrada
            </span>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
            >
              Editar calificación
            </button>
          )}
        </div>
      ) : null}

      {showControls ? (
        <>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={abstained}
              disabled={disabled}
              onChange={(e) => setAbstained(e.target.checked)}
            />
            Sin opinión (abstenerse)
          </label>

          {!abstained ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">Bajar HI</span>
                <span className="font-bold tabular-nums text-slate-950">
                  {formatAdjustmentLabel(adjustment)} pts
                </span>
              </div>
              <input
                type="range"
                min={HANDICAP_ADJUSTMENT_MIN}
                max={HANDICAP_ADJUSTMENT_MAX}
                step={HANDICAP_ADJUSTMENT_STEP}
                value={adjustment}
                disabled={disabled}
                onChange={(e) => setAdjustment(Number(e.target.value))}
                className="h-3 w-full accent-slate-800"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>−5.0 (máx.)</span>
                <span>−0.5 (mín.)</span>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => startTransition(() => handleSave())}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saved ? "Guardar cambios" : "Guardar calificación"}
            </button>
            {saved ? (
              <button
                type="button"
                disabled={disabled}
                onClick={handleCancel}
                className="rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {!showControls && !saved && lockedByClosing ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No alcanzaste a votar y la votación ya está cerrada.
        </div>
      ) : null}
    </article>
  );
}
