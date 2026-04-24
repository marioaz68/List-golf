"use client";

import { useState, useMemo } from "react";

export default function CaddieClient({
  caddies,
  players,
  initialSelectedCaddie,
  favoriteIdsByCaddie,
}) {
  const [searchCaddie, setSearchCaddie] = useState("");
  const [searchPlayer, setSearchPlayer] = useState("");
  const [selected, setSelected] = useState(initialSelectedCaddie);

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
    if (!selected) return new Set();
    return favoriteIdsByCaddie[selected.id] || new Set();
  }, [selected, favoriteIdsByCaddie]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      
      {/* 🔍 BUSCAR CADDIE */}
      <div>
        <input
          placeholder="Buscar caddie..."
          value={searchCaddie}
          onChange={(e) => setSearchCaddie(e.target.value)}
          style={{ width: "100%", height: 40 }}
        />
      </div>

      {/* LISTA CADDIES */}
      <div style={{ maxHeight: 200, overflow: "auto" }}>
        {filteredCaddies.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelected(c)}
            style={{
              padding: 8,
              cursor: "pointer",
              background: selected?.id === c.id ? "#e0f2fe" : "white",
            }}
          >
            {c.nickname || `${c.first_name} ${c.last_name}`}
          </div>
        ))}
      </div>

      {/* 🔵 FAVORITOS */}
      {selected && (
        <div>
          <h3>Favoritos de {selected.nickname}</h3>

          <input
            placeholder="Buscar jugador..."
            value={searchPlayer}
            onChange={(e) => setSearchPlayer(e.target.value)}
            style={{ width: "100%", height: 40 }}
          />

          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {filteredPlayers.map((p) => (
              <label key={p.id} style={{ display: "block" }}>
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