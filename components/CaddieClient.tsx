"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCaddieAction,
  deleteCaddieAction,
  saveCaddieFavoritesAction,
  updateCaddieAction,
} from "@/app/(backoffice)/caddies/new/actions";
import SubmitButton from "@/components/ui/SubmitButton";
import StealthTextInput from "@/components/ui/StealthTextInput";

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

type AntiAutofillInputProps = {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  maxLength?: number;
};

type AntiAutofillTextareaProps = {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  style?: React.CSSProperties;
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

const dangerButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #b91c1c",
  borderRadius: 8,
  background: "#b91c1c",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 11,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "#334155",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const dotBlue: React.CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 999,
  background: "#2563eb",
  border: "1px solid #1d4ed8",
  display: "inline-block",
  flex: "0 0 auto",
};

const dotRed: React.CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 999,
  background: "#dc2626",
  border: "1px solid #b91c1c",
  display: "inline-block",
  flex: "0 0 auto",
};

const dotGreen: React.CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 999,
  background: "#16a34a",
  border: "1px solid #15803d",
  display: "inline-block",
  flex: "0 0 auto",
};


const antiSafariProps = {
  autoComplete: "section-listgolf-caddies one-time-code",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
} as const;

function AntiAutofillInput({
  name,
  defaultValue,
  required,
  placeholder,
  style,
  maxLength,
}: AntiAutofillInputProps) {
  const generatedName = useRef(
    `lf_caddie_${name}_${Math.random().toString(36).slice(2)}`
  );
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  return (
    <>
      <input type="hidden" name={name} value={value} />

      <StealthTextInput
        value={value}
        onChange={setValue}
        required={required}
        placeholder={placeholder}
        style={style}
        maxLength={maxLength}
        ariaLabel={placeholder ?? name}
      />
    </>
  );
}

function AntiAutofillTextarea({
  name,
  defaultValue,
  placeholder,
  style,
}: AntiAutofillTextareaProps) {
  const generatedName = useRef(
    `lf_caddie_${name}_${Math.random().toString(36).slice(2)}`
  );
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  return (
    <>
      <input type="hidden" name={name} value={value} />

      <textarea
        name={generatedName.current}
        value={value}
        placeholder={placeholder}
        style={style}
        onChange={(e) => setValue(e.target.value)}
        {...antiSafariProps}
      />
    </>
  );
}

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

function displayLevelName(level: string | null) {
  if (level === "advanced") return "Avanzado";
  if (level === "intermediate") return "Intermedio";
  if (level === "beginner") return "Principiante";
  return "Sin nivel";
}

function renderLevelDot(level: string | null) {
  if (level === "advanced") return <span style={dotBlue} title="Avanzado" />;
  if (level === "intermediate") return <span style={dotRed} title="Intermedio" />;
  if (level === "beginner") return <span style={dotGreen} title="Principiante" />;
  return <span style={{ color: "#94a3b8" }}>—</span>;
}


export default function CaddieClient({
  clubs,
  caddies,
  players,
  initialSelectedCaddie,
  favoriteIdsByCaddie,
}: Props) {
  const router = useRouter();
  const [createFormKey, setCreateFormKey] = useState(0);
  const [searchCaddie, setSearchCaddie] = useState("");
  const [searchPlayer, setSearchPlayer] = useState("");
  const [selected, setSelected] = useState<Caddie | null>(initialSelectedCaddie);
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<Set<string>>(
    new Set()
  );
  const [formError, setFormError] = useState("");

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

  async function handleCreateCaddie(formData: FormData) {
    setFormError("");

    const result = await createCaddieAction(formData);

    if (result?.ok === false) {
      setFormError(result.error || "No se pudo guardar el caddie.");
      return;
    }

    setCreateFormKey((prev) => prev + 1);
    setSelected(null);
    setSearchCaddie("");
    router.refresh();
  }

  async function handleUpdateCaddie(formData: FormData) {
    setFormError("");

    const result = await updateCaddieAction(formData);

    if (result?.ok === false) {
      setFormError(result.error || "No se pudo actualizar el caddie.");
      return;
    }

    router.refresh();
  }

  async function handleDeleteCaddie(formData: FormData) {
    const caddieId = String(formData.get("caddie_id") ?? "");
    await deleteCaddieAction(formData);

    if (selected?.id === caddieId) {
      setSelected(null);
      setSelectedFavoriteIds(new Set());
    }

    router.refresh();
  }

  async function handleSaveFavorites(formData: FormData) {
    await saveCaddieFavoritesAction(formData);
    router.refresh();
  }


  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <h2 style={titleStyle}>NUEVO CADDIE</h2>
          <p style={subStyle}>Alta rápida de caddie</p>
        </div>

        <form
          key={createFormKey}
          action={handleCreateCaddie}
          style={bodyStyle}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        >
          <div style={gridStyle}>
            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Nombre</label>
              <AntiAutofillInput name="first_name" required style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Apellido</label>
              <AntiAutofillInput name="last_name" required style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Apodo</label>
              <AntiAutofillInput name="nickname" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Nivel</label>
              <select name="level" defaultValue="" style={fieldStyle} autoComplete="off">
                <option value="">Sin nivel</option>
                <option value="advanced">Azul · Avanzado</option>
                <option value="intermediate">Rojo · Intermedio</option>
                <option value="beginner">Verde · Principiante</option>
              </select>
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Teléfono</label>
              <AntiAutofillInput name="phone" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Telegram</label>
              <AntiAutofillInput name="telegram" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>WhatsApp</label>
              <AntiAutofillInput name="whatsapp_phone" style={fieldStyle} />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>WhatsApp E164</label>
              <AntiAutofillInput
                name="whatsapp_phone_e164"
                placeholder="+52442..."
                style={fieldStyle}
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <label style={labelStyle}>Email</label>
              <AntiAutofillInput
                name="email"
                placeholder="correo@ejemplo.com"
                style={fieldStyle}
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <label style={labelStyle}>Club</label>
              <select name="club_id" defaultValue="" style={fieldStyle} autoComplete="off">
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
              <AntiAutofillTextarea name="notes" style={textareaStyle} />
            </div>
          </div>

          {formError ? (
            <div
              style={{
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {formError}
            </div>
          ) : null}

          <div>
            <SubmitButton
              pendingText="Guardando..."
              className="h-8 rounded border border-gray-900 bg-gray-900 px-3 text-[12px] font-bold text-white"
            >
              Guardar caddie
            </SubmitButton>
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
            type="search"
            enterKeyHint="done"
            name="lf_search_caddie"
            placeholder="Buscar caddie..."
            value={searchCaddie}
            onChange={(e) => setSearchCaddie(e.target.value)}
            style={fieldStyle}
            {...antiSafariProps}
          />

          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Apellido</th>
                  <th style={thStyle}>Apodo</th>
                  <th style={thStyle}>Teléfono</th>
                  <th style={thStyle}>Nivel</th>
                  <th style={thStyle}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredCaddies.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={6}>
                      No hay caddies con ese filtro.
                    </td>
                  </tr>
                ) : (
                  filteredCaddies.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        background: selected?.id === c.id ? "#eff6ff" : "#fff",
                      }}
                    >
                      <td style={tdStyle}>
                        <strong>{c.first_name || "—"}</strong>
                      </td>
                      <td style={tdStyle}>{c.last_name || "—"}</td>
                      <td style={tdStyle}>{c.nickname || "—"}</td>
                      <td style={tdStyle}>{c.phone || c.whatsapp_phone || "—"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            fontWeight: 700,
                          }}
                        >
                          {renderLevelDot(c.level)}
                          {displayLevelName(c.level)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            style={ghostButtonStyle}
                          >
                            Editar
                          </button>

                          <form action={handleDeleteCaddie}>
                            <input type="hidden" name="caddie_id" value={c.id} />
                            <SubmitButton
                              pendingText="Eliminando..."
                              className="h-7 px-2 border border-red-800 rounded bg-red-700 text-white text-[11px] font-bold"
                            >
                              Eliminar
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div style={cardStyle}>
          <div style={cardHeader}>
            <h2 style={titleStyle}>EDITAR CADDIE</h2>
            <p style={subStyle}>{displayCaddieName(selected)}</p>
          </div>

          <form
            key={selected.id}
            action={handleUpdateCaddie}
            style={bodyStyle}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          >
            <input type="hidden" name="caddie_id" value={selected.id} />

            <div style={gridStyle}>
              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Nombre</label>
                <AntiAutofillInput
                  name="first_name"
                  required
                  defaultValue={selected.first_name ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Apellido</label>
                <AntiAutofillInput
                  name="last_name"
                  required
                  defaultValue={selected.last_name ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Apodo</label>
                <AntiAutofillInput
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
                  autoComplete="off"
                >
                  <option value="">Sin nivel</option>
                  <option value="advanced">Azul · Avanzado</option>
                  <option value="intermediate">Rojo · Intermedio</option>
                  <option value="beginner">Verde · Principiante</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Teléfono</label>
                <AntiAutofillInput
                  name="phone"
                  defaultValue={selected.phone ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>Telegram</label>
                <AntiAutofillInput
                  name="telegram"
                  defaultValue={selected.telegram ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>WhatsApp</label>
                <AntiAutofillInput
                  name="whatsapp_phone"
                  defaultValue={selected.whatsapp_phone ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label style={labelStyle}>WhatsApp E164</label>
                <AntiAutofillInput
                  name="whatsapp_phone_e164"
                  defaultValue={selected.whatsapp_phone_e164 ?? ""}
                  style={fieldStyle}
                />
              </div>

              <div style={{ gridColumn: "span 4" }}>
                <label style={labelStyle}>Email</label>
                <AntiAutofillInput
                  name="email"
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
                  autoComplete="off"
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
                <AntiAutofillTextarea
                  name="notes"
                  defaultValue={selected.notes ?? ""}
                  style={textareaStyle}
                />
              </div>
            </div>

            <div>
              <SubmitButton
                pendingText="Guardando..."
                className="h-8 rounded border border-gray-900 bg-gray-900 px-3 text-[12px] font-bold text-white"
              >
                Guardar datos generales
              </SubmitButton>
            </div>
          </form>

          <form
            action={handleSaveFavorites}
            style={bodyStyle}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          >
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
            type="search"
            enterKeyHint="done"
                  name="lf_search_player"
                  value={searchPlayer}
                  onChange={(e) => setSearchPlayer(e.target.value)}
                  placeholder="Buscar jugador..."
                  style={fieldStyle}
                  {...antiSafariProps}
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
              <SubmitButton
                pendingText="Asignando..."
                className="h-8 rounded border border-gray-900 bg-gray-900 px-3 text-[12px] font-bold text-white"
              >
                Asignar favoritos
              </SubmitButton>

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
