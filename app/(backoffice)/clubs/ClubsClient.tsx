"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createClub,
  mergeClubIntoWinner,
  toggleClubActive,
  updateClub,
} from "./actions";

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

const selectStyle: React.CSSProperties = {
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubs;

    return clubs.filter((club) =>
      [club.name ?? "", club.short_name ?? "", club.normalized_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [clubs, query]);

  const inactiveClubs = useMemo(
    () => clubs.filter((club) => club.is_active === false),
    [clubs]
  );

  const activeClubs = useMemo(
    () => clubs.filter((club) => club.is_active !== false),
    [clubs]
  );

  function clearMessages() {
    setErrorMsg("");
    setInfoMsg("");
  }

  function beginEdit(club: ClubRow) {
    clearMessages();
    setEditForm({
      id: club.id,
      name: club.name ?? "",
      short_name: club.short_name ?? "",
      is_active: club.is_active !== false,
    });
    setEditingId(club.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
    clearMessages();
  }

  function submitCreate() {
    clearMessages();

    const fd = new FormData();
    fd.set("name", createForm.name);
    fd.set("short_name", createForm.short_name);
    fd.set("is_active", String(createForm.is_active));

    startTransition(async () => {
      try {
        const saved = await createClub(fd);
        if (!saved?.id) {
          throw new Error("No se confirmó el alta del club.");
        }
        setCreateForm(emptyForm());
        setInfoMsg("Club creado correctamente.");
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Error creando club");
      }
    });
  }

  function submitEdit() {
    if (!editForm.id) {
      setErrorMsg("No se encontró el club a editar.");
      return;
    }

    clearMessages();

    const fd = new FormData();
    fd.set("club_id", editForm.id);
    fd.set("name", editForm.name);
    fd.set("short_name", editForm.short_name);
    fd.set("is_active", String(editForm.is_active));

    startTransition(async () => {
      try {
        const saved = await updateClub(fd);

        if (!saved?.id) {
          throw new Error("No se confirmó la actualización del club.");
        }

        if ((saved.short_name ?? null) !== (editForm.short_name.trim() || null)) {
          throw new Error(
            "La base no regresó el short name esperado. No se guardó correctamente."
          );
        }

        setEditingId(null);
        setEditForm(emptyForm());
        setInfoMsg("Club actualizado correctamente.");
        router.refresh();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error actualizando club"
        );
      }
    });
  }

  function submitToggle(club: ClubRow) {
    clearMessages();

    const fd = new FormData();
    fd.set("club_id", club.id);
    fd.set("next_active", String(!(club.is_active !== false)));

    startTransition(async () => {
      try {
        const saved = await toggleClubActive(fd);
        if (!saved?.id) {
          throw new Error("No se confirmó el cambio de estatus.");
        }
        setInfoMsg(
          club.is_active !== false
            ? "Club desactivado correctamente."
            : "Club activado correctamente."
        );
        router.refresh();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error cambiando estatus"
        );
      }
    });
  }

  function submitMerge() {
    clearMessages();

    if (!mergeSourceId || !mergeTargetId) {
      setErrorMsg("Selecciona club duplicado y club destino.");
      return;
    }

    if (mergeSourceId === mergeTargetId) {
      setErrorMsg("El club duplicado y el destino no pueden ser el mismo.");
      return;
    }

    const fd = new FormData();
    fd.set("source_club_id", mergeSourceId);
    fd.set("target_club_id", mergeTargetId);

    startTransition(async () => {
      try {
        await mergeClubIntoWinner(fd);
        setMergeSourceId("");
        setMergeTargetId("");
        setInfoMsg(
          "Fusión aplicada. Se movieron los courses al club destino y el club duplicado quedó inactivo."
        );
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Error fusionando club");
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

      {!errorMsg && infoMsg ? (
        <div
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {infoMsg}
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

      <section
        style={{
          ...cardStyle,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Fusionar club duplicado
        </div>

        <div style={{ fontSize: 12, color: "#4b5563" }}>
          Mueve los courses del club duplicado al club bueno y deja el duplicado
          inactivo. No borra el registro origen.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px,1fr) minmax(220px,1fr) auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <select
            value={mergeSourceId}
            onChange={(e) => setMergeSourceId(e.target.value)}
            style={selectStyle}
          >
            <option value="">Club duplicado / origen</option>
            {inactiveClubs.map((club) => (
              <option key={club.id} value={club.id}>
                {(club.name ?? "—") + ` · courses: ${club.courses_count}`}
              </option>
            ))}
          </select>

          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            style={selectStyle}
          >
            <option value="">Club bueno / destino</option>
            {activeClubs.map((club) => (
              <option key={club.id} value={club.id}>
                {(club.name ?? "—") + ` · courses: ${club.courses_count}`}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={submitMerge}
            disabled={isPending}
            style={primaryButtonStyle}
          >
            {isPending ? "Fusionando..." : "Fusionar"}
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

                return (
                  <tr key={club.id}>
                    <td style={tdStyle}>
                      {isEditing ? (
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
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, color: "#111827" }}>
                            {club.name || "—"}
                          </div>
                          {club.normalized_name ? (
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                              {club.normalized_name}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>

                    <td style={tdStyle}>
                      {isEditing ? (
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
                      ) : (
                        club.short_name || "—"
                      )}
                    </td>

                    <td style={tdStyle}>{club.courses_count}</td>

                    <td style={tdStyle}>
                      {isEditing ? (
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
                      ) : (
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
                      )}
                    </td>

                    <td style={tdStyle}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={submitEdit}
                            disabled={isPending}
                            style={primaryButtonStyle}
                          >
                            {isPending ? "Guardando..." : "Guardar"}
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
                      ) : (
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
                      )}
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