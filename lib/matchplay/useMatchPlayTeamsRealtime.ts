"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { MatchPlayTeamRow } from "./teamTypes";

type RawTeamRow = {
  id: string;
  tournament_id: string;
  category_id: string | null;
  player_a_entry_id: string | null;
  player_b_entry_id: string | null;
  team_name: string | null;
  combined_hi: number | null;
  seed: number | null;
  auction_bid: number | null;
  auction_order: number | null;
  is_active: boolean;
};

/**
 * Mantiene una lista de equipos sincronizada en vivo con Supabase Realtime.
 * Conserva en cada equipo el snapshot inicial (`player_a`, `player_b`) que viene
 * desde el server y sólo refresca los campos editables (`auction_bid`,
 * `auction_order`, `seed`, `team_name`, `is_active`).
 */
export function useMatchPlayTeamsRealtime(
  tournamentId: string,
  initial: MatchPlayTeamRow[]
): { teams: MatchPlayTeamRow[]; pulse: number } {
  const [teams, setTeams] = useState<MatchPlayTeamRow[]>(initial);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    setTeams(initial);
  }, [initial]);

  useEffect(() => {
    if (!tournamentId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`mp-teams-${tournamentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "matchplay_pair_teams",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload: {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          new: RawTeamRow | null;
          old: { id?: string } | null;
        }) => {
          setPulse((p) => p + 1);
          if (payload.eventType === "DELETE") {
            const id = payload.old?.id;
            if (!id) return;
            setTeams((prev) => prev.filter((t) => t.id !== id));
            return;
          }

          const row = payload.new;
          if (!row) return;

          setTeams((prev) => {
            const idx = prev.findIndex((t) => t.id === row.id);
            if (idx === -1) {
              return [
                ...prev,
                {
                  id: row.id,
                  tournament_id: row.tournament_id,
                  category_id: row.category_id,
                  player_a_entry_id: row.player_a_entry_id,
                  player_b_entry_id: row.player_b_entry_id,
                  team_name: row.team_name,
                  combined_hi: row.combined_hi,
                  seed: row.seed,
                  auction_bid: row.auction_bid,
                  auction_order: row.auction_order,
                  is_active: row.is_active,
                  player_a: null,
                  player_b: null,
                },
              ];
            }
            const copy = [...prev];
            copy[idx] = {
              ...copy[idx],
              team_name: row.team_name,
              combined_hi: row.combined_hi,
              seed: row.seed,
              auction_bid: row.auction_bid,
              auction_order: row.auction_order,
              is_active: row.is_active,
              category_id: row.category_id,
            };
            return copy;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  return { teams, pulse };
}
