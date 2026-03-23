"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import PlayerEditModal from "./PlayerEditModal";

type PlayerRowActionsProps = {
  player: {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
};

export default function PlayerRowActions({
  player,
}: PlayerRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const playerId = player?.id ?? null;
  const label =
    `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() ||
    player?.email ||
    "este jugador";

  async function onDelete() {
    if (!playerId) {
      alert("No se puede eliminar: jugador no válido.");
      return;
    }

    const ok = confirm(`¿Eliminar a ${label}?`);
    if (!ok) return;

    const supabase = createClient();
    const { error } = await supabase.from("players").delete().eq("id", playerId);

    if (error) {
      alert("Error al eliminar: " + error.message);
      return;
    }

    startTransition(() => {
      setOpen(false);
      router.refresh();
    });
  }

  if (!playerId) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled
          title="Jugador no disponible"
          className="inline-flex min-h-6 items-center justify-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium leading-none text-gray-400"
        >
          Editar
        </button>

        <button
          type="button"
          disabled
          title="Jugador no disponible"
          className="inline-flex min-h-6 items-center justify-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium leading-none text-gray-400"
        >
          Eliminar
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={isPending}
          className="inline-flex min-h-6 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Editar
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="inline-flex min-h-6 items-center justify-center rounded border border-red-700 bg-red-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Eliminar
        </button>
      </div>

      <PlayerEditModal
        open={open}
        onClose={() => setOpen(false)}
        player={player}
      />
    </>
  );
}