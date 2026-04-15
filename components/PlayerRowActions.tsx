"use client";

import { useState } from "react";
import PlayerEditModal from "./PlayerEditModal";

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
};

type PlayerRowActionsProps = {
  player: PlayerModalData | null;
};

export default function PlayerRowActions({
  player,
}: PlayerRowActionsProps) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-6 w-full items-center justify-center rounded border border-gray-700 bg-gray-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-gray-800"
      >
        Editar
      </button>

      <PlayerEditModal
        open={open}
        onClose={() => setOpen(false)}
        player={player}
      />
    </>
  );
}