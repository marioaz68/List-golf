"use client";

import { useState, useMemo } from "react";

type Caddie = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type Props = {
  caddies: Caddie[];
  players: Player[];
  initialSelectedCaddie: Caddie | null;
  favoriteIdsByCaddie: Record<string, string[]>;
};

export default function CaddieClient({
  caddies,
  players,
  initialSelectedCaddie,
  favoriteIdsByCaddie,
}: Props) {
  const [searchCaddie, setSearchCaddie] = useState("");
  const [searchPlayer, setSearchPlayer] = useState("");
  const [selected, setSelected] = useState<Caddie | null>(
    initialSelectedCaddie
  );

  const filteredCaddies = useMemo(() => {
    return caddies.filter((c) => {
      const text = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.nickname ?? ""} ${c.phone ?? ""}`;
      return text.toLowerCase().includes(searchCaddie.toLowerCase());
    });
  }, [caddies, searchCaddie]);

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const text = `${p.first_name ?? ""} ${p.last_name ?? ""}`;
      return text.toLowerCase().includes(searchPlayer.toLowerCase());
    });
  }, [players, searchPlayer]);

  const selectedFavorites = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(favoriteIdsByCaddie[selected.id] ?? []);
  }, [selected, favoriteIdsByCaddie]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      
      {/* 🔍 BUSCADOR CADDIE */}
      <input
        placeholder="Buscar caddie..."
        value={searchCaddie}
        onChange={(e) => setSearchCaddie(e.target.value)}
        style={{
          height: 36,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
        }}
      />

      {/* LISTA */}
      <div
        style={{
          maxHeight: 200,
          overflow: "auto",
          border: "1px solid #334155",
          borderRadius: 8,
          background: "#0f172a",
        }}
      >
        {filteredCaddies.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelected(c)}
            style={{
              padding: 8,
              cursor: "pointer",
              borderBottom: "1px solid #1e293b",
              background:
                selected?.id === c.id ? "#1e40af" : "transparent",
              color: "#fff",
            }}
          >
            {c.nickname || `${c.first_name} ${c.last_name}`}
          </div>
        ))}
      </div>

      {/* FAVORITOS */}
      {selected && (
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 12,
            background: "#020617",
          }}
        >
          <h3 style={{ margin: 0, marginBottom: 10 }}>
            Favoritos de {selected.nickname || selected.first_name}
          </h3>

          <input
            placeholder="Buscar jugador..."
            value={searchPlayer}
            onChange={(e) => setSearchPlayer(e.target.value)}
            style={{
              height: 36,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              marginBottom: 10,
              width: "100%",
            }}
          />

          <div style={{ maxHeight: 250, overflow: "auto" }}>
            {filteredPlayers.map((p) => (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 6,
                  color: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  defaultChecked={selectedFavorites.has(p.id)}
                />
                {p.first_name} {p.last_name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}