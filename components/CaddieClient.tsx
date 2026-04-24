"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createCaddieAction,
  saveCaddieFavoritesAction,
  updateCaddieAction,
} from "@/app/(backoffice)/caddies/new/actions";

type Club = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type Caddie = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp_phone: string | null;
  whatsapp_phone_e164: string | null;
  email: string | null;
  club_id: string | null;
  notes: string | null;
  is_active: boolean | null;
  level: string | null;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type Props = {
  clubs: Club[];
  caddies: Caddie[];
  players: Player[];
  initialSelectedCaddie: Caddie | null;
  favoriteIdsByCaddie: Record<string, string[]>;
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: 0,
  color: "#0f172a",
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  margin: "2px 0 0 0",
};

const bodyStyle: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 10,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
  textTransform: "uppercase",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 70,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
};

const buttonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #111827",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

function displayCaddieName(c: Caddie) {
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return c.nickname?.trim() || full || "Sin nombre";
}

function displayPlayerName(p: Player) {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Sin nombre";
}

function displayClubName(c: Club) {
  return c.short_name?.trim() || c.name || "Club";
}

export default function CaddieClient({
  clubs,
  caddies,
  players,
  initialSelectedCaddie,
  favoriteIdsByCaddie,
}: Props) {
  const [searchCaddie, setSearchCaddie] = useState("");
  const [searchPlayer, setSearchPlayer] = useState("");
  const [selected, setSelected] = useState<Caddie | null>(initialSelectedCaddie);
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (!selected) {
      setSelectedFavoriteIds(new Set());
      return;
    }

    setSelectedFavoriteIds(new Set(favoriteIdsByCaddie[selected.id] ?? []));
  }, [selected, favoriteIdsByCaddie]);

  const filteredCaddies = useMemo(() => {
    const q = searchCaddie.toLowerCase().trim();

    return caddies.filter((c) => {
      const text = [
        c.first_name,
        c.last_name,
        c.nickname,
        c.phone,
        c.telegram,
        c.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !q || text.includes(q);
    });
  }, [caddies, searchCaddie]);

  const filteredPlayers = useMemo(() => {
    const q = searchPlayer.toLowerCase().trim();

    return players.filter((p) => {
      const text = displayPlayerName(p).toLowerCase();
      return !q || text.includes(q);
    });
  }, [players, searchPlayer]);

  const selectedFavoritePlayers = useMemo(() => {
    return players.filter((p) => selectedFavoriteIds.has(p.id));
  }, [players, selectedFavoriteIds]);

  function toggleFavorite(playerId: string) {
    setSelectedFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <h2 style={titleStyle}>NUEVO CADDIE</h2>
          <p style={subStyle}>Alta rápida de caddie</p>
        </div>

        <form action={createCaddieAction} style={bodyStyle}>
          <div style={gridStyle}>
            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Nombre</label>
              <input name="first_name" required style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Apellido</label>
              <input name="last_name" required style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Apodo</label>
              <input name="nickname" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Nivel</label>
              <select name="level" defaultValue="" style={fieldStyle}>
                <option value="">Sin nivel</option>
                <option value="advanced">Azul · Avanzado</option>
                <option value="intermediate">Rojo · Intermedio</option>
                <option value="beginner">Verde · Principiante</option>
              </select>
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Teléfono</label>
              <input name="phone" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Telegram</label>
              <input name="telegram" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>WhatsApp</label>
              <input name="whatsapp_phone" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>WhatsApp E164</label>
              <input name="whatsapp_phone_e164" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <label style={labelStyle}>Email</label>
              <input name="email" type="email" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <label style={labelStyle}>Club</label>
              <select name="club_id" defaultValue="" style={fieldStyle}>
                <option value="">Sin club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {displayClubName(club)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "span 12" }}>
              <label style={labelStyle}>Notas</label>
              <textarea name="notes" style={textareaStyle} />
            </div>
          </div>

          <div>
            <button type="submit" style={buttonStyle}>
              Guardar caddie
            </button>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <h2 style={titleStyle}>BUSCAR / EDITAR CADDIE</h2>
          <p style={subStyle}>Busca por nombre, apodo, teléfono o Telegram</p>
        </div>

        <div style={bodyStyle}>
          <input
            placeholder="Buscar caddie..."
            value={searchCaddie}
            onChange={(e) => setSearchCaddie(e.target.value)}
            style={fieldStyle}
          />

          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
            }}
          >
            {filteredCaddies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 10px",
                  border: 0,
                  borderBottom: "1px solid #eef2f7",
                  background: selected?.id === c.id ? "#eff6ff" : "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <strong>{displayCaddieName(c)}</strong>
                <span style={{ color: "#64748b", marginLeft: 8 }}>
                  {c.phone ?? ""} {c.telegram ?? ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div style={cardStyle}>
          <div style={cardHeader}>
            <h2 style={titleStyle}>EDITAR CADDIE</h2>
            <p style={subStyle}>{displayCaddieName(selected)}</p>
          </div>

          <form action={updateCaddieAction} style={bodyStyle}>
            <input type="hidden" name="caddie_id" value={selected.id} />

            <div style={gridStyle}>
              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Nombre</label>
                <input
                  name="first_name"
                  required
                  defaultValue={selected.first_name ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Apellido</label>
                <input
                  name="last_name"
                  required
                  defaultValue={selected.last_name ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Apodo</label>
                <input
                  name="nickname"
                  defaultValue={selected.nickname ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Nivel</label>
                <select
                  name="level"
                  defaultValue={selected.level ?? ""}
                  style={fieldStyle}
                >
                  <option value="">Sin nivel</option>
                  <option value="advanced">Azul · Avanzado</option>
                  <option value="intermediate">Rojo · Intermedio</option>
                  <option value="beginner">Verde · Principiante</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Teléfono</label>
                <input
                  name="phone"
                  defaultValue={selected.phone ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Telegram</label>
                <input
                  name="telegram"
                  defaultValue={selected.telegram ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>WhatsApp</label>
                <input
                  name="whatsapp_phone"
                  defaultValue={selected.whatsapp_phone ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>WhatsApp E164</label>
                <input
                  name="whatsapp_phone_e164"
                  defaultValue={selected.whatsapp_phone_e164 ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 4" }}>
                <label style={labelStyle}>Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={selected.email ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 4" }}>
                <label style={labelStyle}>Club</label>
                <select
                  name="club_id"
                  defaultValue={selected.club_id ?? ""}
                  style={fieldStyle}
                >
                  <option value="">Sin club</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {displayClubName(club)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <label style={labelStyle}>Notas</label>
                <textarea
                  name="notes"
                  defaultValue={selected.notes ?? ""}
                  style={textareaStyle}
                />
              </div>
            </div>

            <div>
              <button type="submit" style={buttonStyle}>
                Guardar datos generales
              </button>
            </div>
          </form>

          <form action={saveCaddieFavoritesAction} style={bodyStyle}>
            <input type="hidden" name="caddie_id" value={selected.id} />

            {Array.from(selectedFavoriteIds).map((playerId) => (
              <input
                key={playerId}
                type="hidden"
                name="favorite_player_ids"
                value={playerId}
              />
            ))}

            <div style={gridStyle}>
              <div style={{ gridColumn: "span 6" }}>
                <label style={labelStyle}>Buscar jugador favorito</label>
                <input
                  value={searchPlayer}
                  onChange={(e) => setSearchPlayer(e.target.value)}
                  placeholder="Buscar jugador..."
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 6,
                  }}
                >
                  {filteredPlayers.map((p) => (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 12,
                        color: "#0f172a",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFavoriteIds.has(p.id)}
                        onChange={() => toggleFavorite(p.id)}
                      />
                      {displayPlayerName(p)}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <label style={labelStyle}>Favoritos seleccionados</label>
                <div
                  style={{
                    minHeight: 40,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {selectedFavoritePlayers.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      Sin favoritos seleccionados.
                    </span>
                  ) : (
                    selectedFavoritePlayers.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1e3a8a",
                          borderRadius: 999,
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {displayPlayerName(p)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={buttonStyle}>
                Asignar favoritos
              </button>

              <button
                type="button"
                style={ghostButtonStyle}
                onClick={() => setSelectedFavoriteIds(new Set())}
              >
                Limpiar favoritos
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}