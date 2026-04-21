"use client";

import { useState, useTransition } from "react";
import PlayerEditModal from "./PlayerEditModal";
import { deletePlayerAction } from "@/app/(backoffice)/players/actions";

type PlayerModalData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
  club_id: string | null;
  ghin_number: string | null;
  shirt_size: string | null;
  shoe_size: string | null;
};

type PlayerRowActionsProps = {
  player: PlayerModalData | null;
  canDelete?: boolean;
};

export default function PlayerRowActions({
  player,
  canDelete = false,
}: PlayerRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const playerId = player?.id ?? null;

  if (!playerId || !player) {
    return (
      <button
        type="button"
        disabled
        title="Jugador no disponible"
        className="inline-flex h-6 w-full items-center justify-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium leading-none text-gray-400"
      >
        Editar
      </button>
    );
  }

  function handleDelete() {
    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este jugador? Esta acción no se puede deshacer."
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deletePlayerAction(playerId);

      if (!result.ok) {
        window.alert(result.message ?? "No se pudo eliminar el jugador.");
        return;
      }

      window.alert("Jugador eliminado correctamente.");
      window.location.reload();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-6 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-gray-800"
        >
          Editar
        </button>

        {canDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Eliminar jugador"
            className="inline-flex h-6 items-center justify-center rounded border border-red-700 bg-red-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Borrando..." : "Eliminar"}
          </button>
        ) : null}
      </div>

      <PlayerEditModal
        open={open}
        onClose={() => setOpen(false)}
        player={player}
      />
    </>
  );
}