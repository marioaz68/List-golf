"use client";

import DrawnSignaturePad from "@/components/ui/DrawnSignaturePad";
import PlayerAcceptLinkButton from "./PlayerAcceptLinkButton";
import {
  distanceCmToInputMeters,
  formatDistanceCm,
} from "@/lib/cercanos/distanceFormat";
import type {
  CaptureGroupOption,
  CaptureGroupPlayer,
  ClosestToPinHoleBoard,
} from "@/lib/cercanos/types";
import { CLOSEST_TO_PIN_MAX_PRIZES } from "@/lib/cercanos/types";
import {
  saveGroupClosestToPin,
  type SaveClosestToPinState,
} from "./actions";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const initial: SaveClosestToPinState = { ok: false, message: "" };

type RoundOpt = {
  id: string;
  round_no: number | null;
  round_date: string | null;
  wave: string | null;
  category_id: string | null;
  label: string;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  par3Holes: number[];
  rounds: RoundOpt[];
  initialRoundId: string;
  initialHole: number;
  initialGroupId: string;
  groups: CaptureGroupOption[];
  players: CaptureGroupPlayer[];
  board: ClosestToPinHoleBoard[];
};

function mapPlayerDistances(players: CaptureGroupPlayer[]) {
  const m: Record<string, string> = {};
  for (const p of players) {
    m[p.entryId] = distanceCmToInputMeters(p.distanceCm);
  }
  return m;
}

export default function CercanosCaptureClient({
  tournamentId,
  tournamentName,
  par3Holes,
  rounds,
  initialRoundId,
  initialHole,
  initialGroupId,
  groups,
  players,
  board,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveGroupClosestToPin,
    initial
  );

  const [distances, setDistances] = useState(() => mapPlayerDistances(players));
  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");

  useEffect(() => {
    setDistances(mapPlayerDistances(players));
  }, [players]);

  useEffect(() => {
    setSignature(null);
  }, [initialGroupId, initialHole, initialRoundId]);

  const navigate = (next: {
    roundId?: string;
    hole?: number;
    groupId?: string;
  }) => {
    const qs = new URLSearchParams();
    qs.set("tournament_id", tournamentId);
    qs.set("round_id", next.roundId ?? initialRoundId);
    qs.set("hole", String(next.hole ?? initialHole));
    const gid = next.groupId !== undefined ? next.groupId : initialGroupId;
    if (gid) qs.set("group_id", gid);
    router.push(`/cercanos?${qs.toString()}`);
  };

  const boardForHole = useMemo(
    () => board.find((b) => b.holeNumber === initialHole) ?? null,
    [board, initialHole]
  );

  if (par3Holes.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-100">
        No hay pares 3 configurados en la tarjeta del torneo. Configura los
        hoyos (par) en <strong>Hoyos torneo</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-white">
          Más cerca de la bandera
        </h1>
        <p className="text-sm text-slate-300">
          {tournamentName} · pares 3 · hasta {CLOSEST_TO_PIN_MAX_PRIZES} premios
          por hoyo (1.º = más cercano)
        </p>
        <p className="text-[11px] text-slate-500">
          Capturista: midela y opcionalmente firma aquí. Jugador: acepta en{" "}
          <strong>su</strong> teléfono con QR/link (no Telegram).{" "}
          <a
            href={`/cercanos/premios?tournament_id=${tournamentId}`}
            className="font-semibold text-cyan-300 underline"
          >
            Alta de premios
          </a>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-300">
          Ronda
          <select
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-white"
            value={initialRoundId}
            onChange={(e) =>
              navigate({ roundId: e.target.value, groupId: "" })
            }
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-slate-300">
          Par 3
          <select
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-white"
            value={initialHole}
            onChange={(e) => navigate({ hole: Number(e.target.value) })}
          >
            {par3Holes.map((h) => (
              <option key={h} value={h}>
                Hoyo {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-slate-300">
          Grupo en juego
          <select
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-white"
            value={initialGroupId}
            onChange={(e) => navigate({ groupId: e.target.value })}
          >
            <option value="">— Seleccionar grupo —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                G{g.groupNo}
                {g.teeTime ? ` · ${String(g.teeTime).slice(0, 5)}` : ""}
                {g.startingHole != null ? ` · salida ${g.startingHole}` : ""}
                {` · ${g.memberCount} jug.`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {initialGroupId && players.length > 0 ? (
        <form
          action={formAction}
          className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="round_id" value={initialRoundId} />
          <input type="hidden" name="group_id" value={initialGroupId} />
          <input type="hidden" name="hole_number" value={initialHole} />
          <input type="hidden" name="signature_payload" value={signature ?? ""} />

          <div className="text-sm font-bold text-cyan-200">
            Captura · hoyo {initialHole} · G
            {groups.find((g) => g.id === initialGroupId)?.groupNo ?? "?"}
          </div>
          <p className="text-[11px] text-slate-400">
            Distancia en <strong>metros</strong> (ej. 1.25 o 0.40). También acepta
            cm (ej. 40 cm) o pies′pulgadas (5&apos;6&quot;). Deja vacío para
            borrar.
          </p>

          <ul className="space-y-3">
            {players.map((p) => (
              <li
                key={p.entryId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#08111f]/60 px-3 py-2"
              >
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm font-semibold text-white">
                    {p.playerNumber != null ? `#${p.playerNumber} · ` : ""}
                    {p.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {p.categoryCode ?? "—"}
                    {p.distanceCm != null
                      ? ` · guardado: ${formatDistanceCm(p.distanceCm)}`
                      : ""}
                    {p.capturistSigned
                      ? ` · ✍️ capturista${p.capturistSignerName ? ` (${p.capturistSignerName})` : ""}`
                      : ""}
                    {p.playerAccepted
                      ? ` · ✓ jugador${p.playerSignerName ? ` (${p.playerSignerName})` : ""}`
                      : p.distanceCm != null
                        ? " · pendiente jugador"
                        : ""}
                  </div>
                  {p.acceptUrl && p.distanceCm != null ? (
                    <div className="mt-1.5">
                      <PlayerAcceptLinkButton
                        url={p.acceptUrl}
                        playerName={p.name}
                        distanceLabel={formatDistanceCm(p.distanceCm)}
                      />
                    </div>
                  ) : null}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  m
                  <input
                    name={`dist_${p.entryId}`}
                    value={distances[p.entryId] ?? ""}
                    onChange={(e) =>
                      setDistances((prev) => ({
                        ...prev,
                        [p.entryId]: e.target.value,
                      }))
                    }
                    inputMode="decimal"
                    placeholder="1.25"
                    className="w-28 rounded-md border border-white/20 bg-white px-2 py-1.5 text-sm font-mono text-slate-900"
                  />
                </label>
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-950/20 p-3">
            <div className="text-sm font-bold text-amber-100">
              Firma del capturista (opcional)
            </div>
            <p className="text-[11px] text-amber-100/70">
              Firma del capturista en este dispositivo. El jugador acepta aparte
              con QR en su móvil.
            </p>
            <label className="block text-xs font-semibold text-slate-300">
              Nombre del capturista
              <input
                name="signer_name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Ej. Mario · capturista H3"
                maxLength={120}
                className="mt-1 w-full rounded-md border border-white/20 bg-white px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <DrawnSignaturePad value={signature} onChange={setSignature} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg border border-cyan-400 bg-gradient-to-b from-cyan-400 to-cyan-600 px-4 py-2 text-sm font-bold text-[#08111f] disabled:opacity-50"
            >
              {pending
                ? "Guardando…"
                : signature
                  ? "Guardar distancias + firma"
                  : "Guardar distancias"}
            </button>
            {state.message ? (
              <span
                className={`text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {state.message}
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
          {groups.length === 0
            ? "No hay grupos en salidas para esta ronda."
            : "Selecciona el grupo que está jugando este par 3."}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
          Ranking vivo · hoyo {initialHole}
        </h2>
        {boardForHole && boardForHole.totalEntries > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[360px] text-left text-sm text-white">
              <thead className="bg-white/5 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Cat</th>
                  <th className="px-3 py-2 text-right">Distancia</th>
                </tr>
              </thead>
              <tbody>
                {boardForHole.standings.map((s) => (
                  <tr
                    key={s.entryId}
                    className="border-t border-white/5 odd:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-bold text-cyan-200">
                      {s.tied ? `T${s.position}` : s.position}
                    </td>
                    <td className="px-3 py-2">
                      {s.playerName}
                      <span className="ml-1 text-[10px] text-slate-500">
                        {s.capturistSigned ? "✍️" : ""}
                        {s.playerAccepted ? "✓" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {s.categoryCode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {formatDistanceCm(s.distanceCm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Aún no hay distancias capturadas en este hoyo.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
          Todos los pares 3 (resumen)
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {board.map((b) => (
            <button
              key={b.holeNumber}
              type="button"
              onClick={() => navigate({ hole: b.holeNumber })}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                b.holeNumber === initialHole
                  ? "border-cyan-400/50 bg-cyan-950/40"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="font-bold text-white">Hoyo {b.holeNumber}</div>
              <div className="text-[11px] text-slate-400">
                {b.totalEntries} captura{b.totalEntries === 1 ? "" : "s"}
                {b.standings[0]
                  ? ` · 1º ${formatDistanceCm(b.standings[0].distanceCm)}`
                  : ""}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
