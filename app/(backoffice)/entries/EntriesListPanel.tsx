"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEntry,
  disqualifyEntry,
  restoreEntry,
  withdrawEntry,
} from "./actions";
import PlayerRowActions from "@/components/PlayerRowActions";
import { createScorecardWithTokensAction } from "@/app/(backoffice)/scorecards/actions";

type RoundSignature = {
  round_no: number;
  player_signed?: boolean | null;
  marker_signed?: boolean | null;
  witness_signed?: boolean | null;
};

type Entry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  round_signatures?: RoundSignature[] | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    club_label: string | null;
    email?: string | null;
    gender?: "M" | "F" | "X" | null;
    handicap_index?: number | null;
    handicap_torneo?: number | null;
    phone?: string | null;
    club?: string | null;
    club_id?: string | null;
    initials?: string | null;
    ghin_number?: string | null;
    shirt_size?: string | null;
    shoe_size?: string | null;
  } | null;
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

function badgeClass(status: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "confirmed":
      return "border-green-300 bg-green-50 text-green-700";
    case "withdrawn":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "dq":
      return "border-red-300 bg-red-50 text-red-700";
    default:
      return "border-gray-300 bg-gray-50 text-gray-700";
  }
}

function badgeLabel(status: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "confirmed":
      return "Activo";
    case "withdrawn":
      return "Baja";
    case "dq":
      return "DQ";
    default:
      return status ?? "-";
  }
}

function getSignatureCount(sig?: RoundSignature | null) {
  return (
    (sig?.player_signed ? 1 : 0) +
    (sig?.marker_signed ? 1 : 0) +
    (sig?.witness_signed ? 1 : 0)
  );
}

function getBallClass(sig?: RoundSignature | null) {
  const count = getSignatureCount(sig);

  if (count >= 3) {
    return "bg-green-600";
  }

  if (count === 2) {
    return "bg-blue-600";
  }

  return "bg-red-600";
}

const BTN_BASE =
  "inline-flex h-6 items-center justify-center rounded border px-2 text-[10px] font-medium text-white disabled:opacity-50";

const SLOT_SM = "w-[72px] shrink-0";
const SLOT_MD = "w-[84px] shrink-0";
const SLOT_EDIT = "w-[110px] shrink-0";
const ACTIONS_COL = "min-w-[560px] w-[560px]";

export default function EntriesListPanel({
  entries,
  tournamentId,
}: {
  entries: Entry[];
  tournamentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.players?.club_label) set.add(e.players.club_label);
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [entries]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.categories?.code) set.add(e.categories.code);
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return entries.filter((e) => {
      const name =
        `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.toLowerCase();

      const clubText = (e.players?.club_label ?? "").toLowerCase();
      const numberText = String(e.player_number ?? "");
      const statusText = String(e.status ?? "").toLowerCase();

      const roundsText = [1, 2, 3]
        .map((roundNo) => {
          const sig =
            e.round_signatures?.find((r) => r.round_no === roundNo) ?? null;
          const count = getSignatureCount(sig);
          return `r${roundNo} ${count} firmas`;
        })
        .join(" ")
        .toLowerCase();

      return (
        (!q ||
          name.includes(q) ||
          clubText.includes(q) ||
          numberText.includes(q) ||
          statusText.includes(q) ||
          roundsText.includes(q)) &&
        (!club || e.players?.club_label === club) &&
        (!category || e.categories?.code === category)
      );
    });
  }, [entries, search, club, category]);

  function runAction(
    action: (formData: FormData) => Promise<void>,
    entryId: string,
    message: string
  ) {
    const ok = window.confirm(message);
    if (!ok) return;

    const fd = new FormData();
    fd.append("id", entryId);
    fd.append("tournament_id", tournamentId);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
      } catch (err: any) {
        alert(err?.message ?? "Error ejecutando acción");
      }
    });
  }

  async function handleGenerateLinks(entryId: string) {
    try {
      const roundId =
        new URLSearchParams(window.location.search).get("round_id") ?? "";

      if (!roundId) {
        alert("No se encontró round_id en la URL.");
        return;
      }

      const res = await createScorecardWithTokensAction({
        tournament_id: tournamentId,
        round_id: roundId,
        entry_id: entryId,
      });

      const msg = `Jugador:
${res.player_url}

Marcador:
${res.marker_url}

Testigo:
${res.witness_url}`;

      await navigator.clipboard.writeText(msg);
      alert("Ligas copiadas al portapapeles");
    } catch (err: any) {
      alert(err?.message ?? "Error generando ligas");
    }
  }

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <div className="font-semibold uppercase text-gray-700">
          Jugadores inscritos
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <input
            placeholder="#, nombre, club, estatus o ronda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 min-w-[180px] rounded border px-2"
          />

          <select
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className="h-7 px-2"
          >
            <option value="">Club</option>
            {clubs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-7 px-2"
          >
            <option value="">Cat</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <div className="text-[10px] text-gray-600">
            {filtered.length}/{entries.length}
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto border">
        <table className="min-w-[1320px] w-max whitespace-nowrap text-[11px]">
          <thead className="sticky top-0 z-10 bg-gray-200">
            <tr>
              <th className="px-1 py-1 text-left">#</th>
              <th className="px-1 py-1 text-left">Jugador</th>
              <th className="px-1 py-1 text-left">Club</th>
              <th className="px-1 py-1 text-left">Hcp</th>
              <th className="px-1 py-1 text-left">Cat</th>
              <th className="px-1 py-1 text-left">Estatus</th>
              <th className="px-1 py-1 text-left">Firmas</th>
              <th className={`${ACTIONS_COL} px-1 py-1 text-left`}>
                Acciones
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((e) => {
              const fullName =
                `${e.players?.last_name ?? ""} ${e.players?.first_name ?? ""}`.trim() ||
                "-";

              const status = (e.status ?? "").toLowerCase();
              const isDQ = status === "dq";
              const isWithdrawn = status === "withdrawn";

              return (
                <tr key={e.id} className="border-t align-middle">
                  <td className="px-1 py-1 font-semibold">
                    {e.player_number ?? "-"}
                  </td>

                  <td className="px-1 py-1">{fullName}</td>

                  <td className="px-1 py-1">{e.players?.club_label ?? "-"}</td>

                  <td className="px-1 py-1">{e.handicap_index ?? "-"}</td>

                  <td className="px-1 py-1">{e.categories?.code ?? "-"}</td>

                  <td className="px-1 py-1">
                    <span
                      className={`inline-flex h-6 items-center rounded border px-2 text-[10px] font-semibold ${badgeClass(
                        e.status
                      )}`}
                    >
                      {badgeLabel(e.status)}
                    </span>
                  </td>

                  <td className="px-1 py-1">
                    <div className="flex min-w-[114px] items-center justify-center gap-3">
                      {[1, 2, 3].map((roundNo) => {
                        const sig =
                          e.round_signatures?.find(
                            (r) => r.round_no === roundNo
                          ) ?? null;

                        return (
                          <div
                            key={roundNo}
                            className="flex flex-col items-center gap-1"
                            title={`R${roundNo}: ${getSignatureCount(sig)} firma(s)`}
                          >
                            <span className="text-[9px] font-semibold text-gray-700">
                              R{roundNo}
                            </span>
                            <span
                              className={`block h-3 w-3 rounded-full ${getBallClass(
                                sig
                              )}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </td>

                  <td className={`${ACTIONS_COL} px-1 py-1`}>
                    <div className="flex min-w-[560px] items-center gap-2 overflow-x-auto whitespace-nowrap">
                      <div className={SLOT_MD}>
                        <button
                          type="button"
                          onClick={() => handleGenerateLinks(e.id)}
                          disabled={isPending}
                          className="h-7 w-full rounded border border-blue-800 bg-blue-700 text-[11px] font-bold text-white"
                        >
                          FIRMAS
                        </button>
                      </div>

                      <div
                        className={`${SLOT_MD} sticky left-0 z-20 bg-white pr-1 shadow-[2px_0_0_0_rgba(255,255,255,1)]`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              deleteEntry,
                              e.id,
                              "¿Eliminar definitivamente? Se eliminará si no tiene hoyos capturados."
                            )
                          }
                          disabled={isPending}
                          className="h-7 w-full rounded border border-red-800 bg-red-700 text-[11px] font-bold text-white"
                        >
                          ELIMINAR
                        </button>
                      </div>

                      <div className={SLOT_SM}>
                        {isWithdrawn ? (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                restoreEntry,
                                e.id,
                                "¿Reactivar este jugador en el torneo?"
                              )
                            }
                            disabled={isPending}
                            className={`${BTN_BASE} w-full border-green-700 bg-green-700`}
                          >
                            REA
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                withdrawEntry,
                                e.id,
                                "¿Dar de baja a este jugador del torneo?"
                              )
                            }
                            disabled={isPending}
                            className={`${BTN_BASE} w-full border-amber-600 bg-amber-600`}
                          >
                            Baja
                          </button>
                        )}
                      </div>

                      <div className={SLOT_SM}>
                        {isDQ ? (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                restoreEntry,
                                e.id,
                                "¿Quitar DQ y regresar el jugador a activo?"
                              )
                            }
                            disabled={isPending}
                            className={`${BTN_BASE} w-full border-sky-700 bg-sky-700`}
                          >
                            REA
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                disqualifyEntry,
                                e.id,
                                "¿Marcar DQ? Esto pondrá 400 a la ronda actual/última del torneo y dejará al jugador como DQ."
                              )
                            }
                            disabled={isPending}
                            className={`${BTN_BASE} w-full border-red-700 bg-red-700`}
                          >
                            DQ
                          </button>
                        )}
                      </div>

                      <div className={SLOT_EDIT}>
                        <PlayerRowActions
                          tournamentId={tournamentId}
                          player={
                            e.players
                              ? {
                                  id: e.players.id,
                                  first_name: e.players.first_name,
                                  last_name: e.players.last_name,
                                  initials: e.players.initials ?? null,
                                  gender: e.players.gender ?? null,
                                  handicap_index:
                                    e.players.handicap_index ?? null,
                                  handicap_torneo:
                                    e.handicap_index ??
                                    e.players.handicap_torneo ??
                                    null,
                                  phone: e.players.phone ?? null,
                                  email: e.players.email ?? null,
                                  club: e.players.club ?? null,
                                  club_id: e.players.club_id ?? null,
                                  ghin_number: e.players.ghin_number ?? null,
                                  shirt_size: e.players.shirt_size ?? null,
                                  shoe_size: e.players.shoe_size ?? null,
                                }
                              : null
                          }
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-2 text-gray-600">
                  Sin resultados
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}