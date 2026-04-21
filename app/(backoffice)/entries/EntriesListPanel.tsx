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

type Entry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
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

const BTN_BASE =
  "inline-flex h-6 items-center justify-center rounded border px-2 text-[10px] font-medium text-white disabled:opacity-50";

const SLOT_SM = "w-[66px] shrink-0";
const SLOT_MD = "w-[76px] shrink-0";
const SLOT_EDIT = "w-[76px] shrink-0";

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

      return (
        (!q ||
          name.includes(q) ||
          clubText.includes(q) ||
          numberText.includes(q) ||
          statusText.includes(q)) &&
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

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <div className="font-semibold uppercase text-gray-700">
          Jugadores inscritos
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <input
            placeholder="#, nombre, club o estatus..."
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

      <div className="max-h-[560px] overflow-auto border overflow-x-auto">
        <table className="w-full whitespace-nowrap text-[11px]">
          <thead className="sticky top-0 z-10 bg-gray-200">
            <tr>
              <th className="px-1 py-1 text-left">#</th>
              <th className="px-1 py-1 text-left">Jugador</th>
              <th className="px-1 py-1 text-left">Club</th>
              <th className="px-1 py-1 text-left">Hcp</th>
              <th className="px-1 py-1 text-left">Cat</th>
              <th className="px-1 py-1 text-left">Estatus</th>
              <th className="w-[480px] px-1 py-1 text-left">Acciones</th>
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
                    <div className="flex items-center gap-2 whitespace-nowrap">
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

                      <div className={SLOT_MD}>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              deleteEntry,
                              e.id,
                              "¿Eliminar definitivamente? Se eliminará si no tiene hoyos capturados. Si ya tiene scores reales, deberás usar DQ."
                            )
                          }
                          disabled={isPending}
                          className={`${BTN_BASE} w-full border-black bg-black`}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-2 text-gray-600">
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