"use client";

import { useEffect, useMemo, useState } from "react";

type FavoriteStarProps = {
  tournamentId: string;
  playerId: string;
  className?: string;
};

function getStorageKey(tournamentId: string) {
  return `listgolf:favorites:${tournamentId}`;
}

export default function FavoriteStar({
  tournamentId,
  playerId,
  className = "",
}: FavoriteStarProps) {
  const storageKey = useMemo(() => getStorageKey(tournamentId), [tournamentId]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      setIsFavorite(Array.isArray(parsed) && parsed.includes(playerId));
    } catch {
      setIsFavorite(false);
    } finally {
      setReady(true);
    }
  }, [storageKey, playerId]);

  function toggleFavorite() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      const current = Array.isArray(parsed) ? parsed : [];

      let next: string[];

      if (current.includes(playerId)) {
        next = current.filter((id) => id !== playerId);
        setIsFavorite(false);
      } else {
        next = [...current, playerId];
        setIsFavorite(true);
      }

      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent("listgolf-favorites-changed", {
          detail: { tournamentId, favorites: next },
        })
      );
    } catch {
      // no-op
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
      title={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={
        className ||
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg leading-none transition hover:bg-white/10"
      }
      disabled={!ready}
    >
      <span className={isFavorite ? "text-amber-300" : "text-slate-500"}>
        {isFavorite ? "★" : "☆"}
      </span>
    </button>
  );
}