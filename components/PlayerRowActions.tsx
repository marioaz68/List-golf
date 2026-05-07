"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  min_age?: number | null;
};

type PlayerRowActionsProps = {
  player: PlayerModalData | null;
  tournamentId?: string;
  categories?: Category[];
  currentCategoryId?: string | null;
  entryId?: string;
  canDelete?: boolean;
};

export default function PlayerRowActions({
  player,
  tournamentId = "",
  categories = [],
  currentCategoryId,
  entryId,
  canDelete = false,
}: PlayerRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!player || !player.id) {
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

  const safePlayer = player;
  const safeTournamentId = tournamentId;

  function handleDelete() {
    const fullName = `${safePlayer.first_name ?? ""} ${safePlayer.last_name ?? ""}`.trim();

    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar ${fullName || "este jugador"}?\n\nSolo se eliminará si NO forma parte de ningún torneo.`
    );

    if (!confirmed) return;

    const playerId = safePlayer.id;

    startTransition(async () => {
      const result = await deletePlayerAction(playerId, safeTournamentId || null);

      if (!result.ok) {
        window.alert(result.message ?? "No se pudo eliminar el jugador.");
        return;
      }

      window.alert("Jugador eliminado correctamente.");
      router.refresh();
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
            title="Eliminar jugador solo si no tiene torneos"
            className="inline-flex h-6 items-center justify-center rounded border border-red-700 bg-red-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Borrando..." : "Eliminar"}
          </button>
        ) : null}
      </div>

      <PlayerEditModal
        open={open}
        onClose={() => setOpen(false)}
        player={safePlayer}
        categories={categories}
        currentCategoryId={currentCategoryId}
        entryId={entryId}
        tournamentId={safeTournamentId}
      />
    </>
  );
}
