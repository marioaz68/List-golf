"use client";

import { useMemo, useState, useTransition } from "react";
import { createClub, toggleClubActive, updateClub } from "./actions";

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  courses_count: number;
};

type Props = {
  clubs: ClubRow[];
};

type FormState = {
  id?: string;
  name: string;
  short_name: string;
  is_active: boolean;
};

const pageStyle: React.CSSProperties = {
  padding: 16,
  display: "grid",
  gap: 16,
  color: "#111827",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  color: "#111827",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
};

const tableWrapStyle: React.CSSProperties = {
  ...cardStyle,
  overflow: "hidden",
};

const thStyle: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  textAlign: "left",
  verticalAlign: "middle",
  color: "#374151",
  background: "#f8fafc",
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
  textAlign: "left",
  verticalAlign: "middle",
  color: "#111827",
  background: "#ffffff",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  background: "#ffffff",
  color: "#111827",
  lineHeight: 1.2,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #94a3b8",
  background: "#f8fafc",
  color: "#111827",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid #111827",
  background: "#111827",
  color: "#ffffff",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const greenButtonStyle: React.CSSProperties = {
  border: "1px solid #166534",
  background: "#16a34a",
  color: "#ffffff",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const redButtonStyle: React.CSSProperties = {
  border: "1px solid #991b1b",
  background: "#dc2626",
  color: "#ffffff",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function emptyForm(): FormState {
  return {
    name: "",
    short_name: "",
    is_active: true,
  };
}

export default function ClubsClient({ clubs }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubs;

    return clubs.filter((club) =>
      [club.name ?? "", club.short_name ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [clubs, query]);

  function beginEdit(club: ClubRow) {
    setErrorMsg("");
    setEditingId(club.id);
    setEditForm({
      id: club.id,
      name: club.name ?? "",
      short_name: club.short_name ?? "",
      is_active: club.is_active !== false,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
    setErrorMsg("");
  }

  function submitCreate() {
    setErrorMsg("");

    const fd = new FormData();
    fd.set("name", createForm.name);
    fd.set("short_name", createForm.short_name);
    fd.set("is_active", String(createForm.is_active));

    startTransition(async () => {
      try {
        await createClub(fd);
        setCreateForm(emptyForm());
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Error creando club");
      }
    });
  }

  function submitEdit() {
    if (!editForm.id) return;

    setErrorMsg("");

    const fd = new FormData();
    fd.set("club_id", editForm.id);
    fd.set("name", editForm.name);
    fd.set("short_name", editForm.short_name);
    fd.set("is_active", String(editForm.is_active));

    startTransition(async () => {
      try {
        await updateClub(fd);
        cancelEdit();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error actualizando club"
        );
      }
    });
  }

  function submitToggle(club: ClubRow) {
    setErrorMsg("");

    const fd = new FormData();
    fd.set("club_id", club.id);
    fd.set("next_active", String(!(club.is_active !== false)));

    startTransition(async () => {
      try {
        await toggleClubActive(fd);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error cambiando estatus"
        );
      }
    });
  }

  return (
    <div style={pageStyle}>
      <div
        style={{
          ...cardStyle,
          padding: 14,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
            Clubs
          </div>
          <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
            Catálogo maestro de clubs
          </div>
        </div>

        <div style={{ minWidth: 280, flex: "0 1 360px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar club..."
            style={inputStyle}
          />
        </div>
      </div>

      {errorMsg ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      ) : null}

      <section
        style={{
          ...cardStyle,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Alta de club
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px,2fr) minmax(160px,1fr) auto auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            value={createForm.name}
            onChange={(e) =>
              setCreateForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Nombre del club"
            style={inputStyle}
          />

          <input
            value={createForm.short_name}
            onChange={(e) =>
              setCreateForm((prev) => ({ ...prev, short_name: e.target.value }))
            }
            placeholder="Short name"
            style={inputStyle}
          />

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              whiteSpace: "nowrap",
              color: "#111827",
            }}
          >
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  is_active: e.target.checked,
                }))
              }
            />
            Activo
          </label>

          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            style={greenButtonStyle}
          >
            {isPending ? "Guardando..." : "Crear club"}
          </button>
        </div>
      </section>

      <section style={tableWrapStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Club</th>
              <th style={thStyle}>Short</th>
              <th style={thStyle}>Courses</th>
              <th style={thStyle}>Estatus</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={5}>
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtered.map((club) => {
                const isEditing = editingId === club.id;

                if (isEditing) {
                  return (
                    <tr key={club.id}>
                      <td style={tdStyle}>
                        <input
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          style={inputStyle}
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          value={editForm.short_name}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              short_name: e.target.value,
                            }))
                          }
                          style={inputStyle}
                        />
                      </td>

                      <td style={tdStyle}>{club.courses_count}</td>

                      <td style={tdStyle}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                            color: "#111827",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={editForm.is_active}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                is_active: e.target.checked,
                              }))
                            }
                          />
                          Activo
                        </label>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={submitEdit}
                            disabled={isPending}
                            style={primaryButtonStyle}
                          >
                            Guardar
                          </button>

                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isPending}
                            style={secondaryButtonStyle}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={club.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>
                        {club.name || "—"}
                      </div>
                    </td>

                    <td style={tdStyle}>{club.short_name || "—"}</td>

                    <td style={tdStyle}>{club.courses_count}</td>

                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          border: "1px solid #d1d5db",
                          background:
                            club.is_active !== false ? "#dcfce7" : "#f3f4f6",
                          color: "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {club.is_active !== false ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => beginEdit(club)}
                          disabled={isPending}
                          style={secondaryButtonStyle}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => submitToggle(club)}
                          disabled={isPending}
                          style={
                            club.is_active !== false
                              ? redButtonStyle
                              : greenButtonStyle
                          }
                        >
                          {club.is_active !== false ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}