"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createClub,
  mergeClubIntoWinner,
  regenerateClubLogo,
  toggleClubActive,
  updateClub,
  updateClubLogo,
} from "./actions";

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  logo_url: string | null;
  generated_logo_url: string | null;
  primary_color: string | null;
  is_verified_logo: boolean | null;
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
  logo_url: string;
  primary_color: string;
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

const logoButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#111827",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function emptyForm(): FormState {
  return {
    name: "",
    short_name: "",
    logo_url: "",
    primary_color: "",
    is_active: true,
  };
}

function normalizeShort(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "GC";

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorFromShort(value: string | null) {
  const palette = [
    "#0f766e",
    "#1d4ed8",
    "#7c3aed",
    "#be123c",
    "#b45309",
    "#15803d",
    "#0369a1",
    "#4338ca",
    "#a21caf",
    "#0f172a",
    "#166534",
    "#92400e",
  ];

  const seed = normalizeShort(value);
  return palette[hashString(seed) % palette.length];
}

function ClubBadge({
  club,
  size = 42,
}: {
  club: Pick<
    ClubRow,
    "name" | "short_name" | "logo_url" | "generated_logo_url" | "primary_color"
  >;
  size?: number;
}) {
  const logo = club.logo_url || club.generated_logo_url || "";
  const shortName = normalizeShort(club.short_name);
  const color = club.primary_color || colorFromShort(club.short_name);

  if (logo) {
    return (
      <img
        src={logo}
        alt={club.name || shortName}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          border: "2px solid #e2e8f0",
          background: "#ffffff",
          display: "block",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: `radial-gradient(circle at 35% 25%, rgba(255,255,255,.32), ${color} 48%, rgba(2,6,23,.26))`,
        color: "#ffffff",
        border: "2px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: Math.max(10, Math.floor(size * 0.28)),
        letterSpacing: 1,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.24)",
      }}
      title={club.name || shortName}
    >
      {shortName.slice(0, 3)}
    </div>
  );
}

function ClubPreviewFromForm({ form }: { form: FormState }) {
  const shortName = normalizeShort(form.short_name);
  const color = form.primary_color || colorFromShort(shortName);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <ClubBadge
        club={{
          name: form.name,
          short_name: shortName,
          logo_url: form.logo_url,
          generated_logo_url: null,
          primary_color: color,
        }}
      />
      <div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{shortName}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {form.logo_url ? "Logo oficial" : "Logo automático"}
        </div>
      </div>
    </div>
  );
}

export default function ClubsClient({ clubs }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logoEditingId, setLogoEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [logoForm, setLogoForm] = useState({
    club_id: "",
    logo_url: "",
    primary_color: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubs;

    return clubs.filter((club) =>
      [
        club.name ?? "",
        club.short_name ?? "",
        club.normalized_name ?? "",
        club.primary_color ?? "",
      ]
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
      logo_url: club.logo_url ?? "",
      primary_color: club.primary_color ?? "",
      is_active: club.is_active !== false,
    });
    setEditingId(club.id);
    setLogoEditingId(null);
  }

  function beginLogoEdit(club: ClubRow) {
    clearMessages();
    setLogoForm({
      club_id: club.id,
      logo_url: club.logo_url ?? "",
      primary_color: club.primary_color ?? colorFromShort(club.short_name),
    });
    setLogoEditingId(club.id);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
    clearMessages();
  }

  function cancelLogoEdit() {
    setLogoEditingId(null);
    setLogoForm({
      club_id: "",
      logo_url: "",
      primary_color: "",
    });
    clearMessages();
  }

  function submitCreate() {
    clearMessages();

    const fd = new FormData();
    fd.set("name", createForm.name);
    fd.set("short_name", createForm.short_name);
    fd.set("logo_url", createForm.logo_url);
    fd.set("primary_color", createForm.primary_color);
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
    fd.set("logo_url", editForm.logo_url);
    fd.set("primary_color", editForm.primary_color);
    fd.set("is_active", String(editForm.is_active));

    startTransition(async () => {
      try {
        const saved = await updateClub(fd);

        if (!saved?.id) {
          throw new Error("No se confirmó la actualización del club.");
        }

        if ((saved.short_name ?? null) !== (normalizeShort(editForm.short_name) || null)) {
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

  function submitLogoEdit() {
    if (!logoForm.club_id) {
      setErrorMsg("No se encontró el club para editar logo.");
      return;
    }

    clearMessages();

    const fd = new FormData();
    fd.set("club_id", logoForm.club_id);
    fd.set("logo_url", logoForm.logo_url);
    fd.set("primary_color", logoForm.primary_color);

    startTransition(async () => {
      try {
        const saved = await updateClubLogo(fd);
        if (!saved?.id) {
          throw new Error("No se confirmó la actualización del logo.");
        }

        setLogoEditingId(null);
        setLogoForm({
          club_id: "",
          logo_url: "",
          primary_color: "",
        });
        setInfoMsg("Logo actualizado correctamente.");
        router.refresh();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error actualizando logo"
        );
      }
    });
  }

  function submitRegenerateLogo(club: ClubRow) {
    clearMessages();

    const fd = new FormData();
    fd.set("club_id", club.id);

    startTransition(async () => {
      try {
        await regenerateClubLogo(fd);
        setInfoMsg("Logo automático regenerado.");
        router.refresh();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Error regenerando logo"
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
          "Fusión aplicada. Se movieron los courses/players al club destino y el club duplicado quedó inactivo."
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
            Catálogo maestro de clubs, logos oficiales y logos automáticos
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
              "minmax(220px,2fr) minmax(120px,0.8fr) 90px minmax(220px,1.5fr) auto auto",
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

          <input
            value={createForm.primary_color}
            onChange={(e) =>
              setCreateForm((prev) => ({
                ...prev,
                primary_color: e.target.value,
              }))
            }
            placeholder="#0f766e"
            style={inputStyle}
          />

          <input
            value={createForm.logo_url}
            onChange={(e) =>
              setCreateForm((prev) => ({ ...prev, logo_url: e.target.value }))
            }
            placeholder="URL logo oficial opcional"
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

        <div
          style={{
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            borderRadius: 10,
            padding: 10,
          }}
        >
          <ClubPreviewFromForm form={createForm} />
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
          Mueve los courses y players del club duplicado al club bueno y deja el duplicado
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
              <th style={thStyle}>Logo</th>
              <th style={thStyle}>Club</th>
              <th style={thStyle}>Short</th>
              <th style={thStyle}>Courses</th>
              <th style={thStyle}>Logo oficial</th>
              <th style={thStyle}>Estatus</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={7}>
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtered.map((club) => {
                const isEditing = editingId === club.id;
                const isLogoEditing = logoEditingId === club.id;

                return (
                  <tr key={club.id}>
                    <td style={tdStyle}>
                      <ClubBadge club={club} />
                    </td>

                    <td style={tdStyle}>
                      {isEditing ? (
                        <div style={{ display: "grid", gap: 6 }}>
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

                          <input
                            value={editForm.logo_url}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                logo_url: e.target.value,
                              }))
                            }
                            placeholder="URL logo oficial opcional"
                            style={inputStyle}
                          />

                          <input
                            value={editForm.primary_color}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                primary_color: e.target.value,
                              }))
                            }
                            placeholder="#0f766e"
                            style={inputStyle}
                          />
                        </div>
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
                          {club.primary_color ? (
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                              Color: {club.primary_color}
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
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 999,
                            background: "#e2e8f0",
                            color: "#0f172a",
                            padding: "3px 8px",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {club.short_name || "—"}
                        </span>
                      )}
                    </td>

                    <td style={tdStyle}>{club.courses_count}</td>

                    <td style={tdStyle}>
                      {isLogoEditing ? (
                        <div style={{ display: "grid", gap: 6, minWidth: 260 }}>
                          <input
                            value={logoForm.logo_url}
                            onChange={(e) =>
                              setLogoForm((prev) => ({
                                ...prev,
                                logo_url: e.target.value,
                              }))
                            }
                            placeholder="Pega URL de logo oficial"
                            style={inputStyle}
                          />

                          <input
                            value={logoForm.primary_color}
                            onChange={(e) =>
                              setLogoForm((prev) => ({
                                ...prev,
                                primary_color: e.target.value,
                              }))
                            }
                            placeholder="#0f766e"
                            style={inputStyle}
                          />

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={submitLogoEdit}
                              disabled={isPending}
                              style={primaryButtonStyle}
                            >
                              {isPending ? "Guardando..." : "Guardar logo"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelLogoEdit}
                              disabled={isPending}
                              style={secondaryButtonStyle}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: "fit-content",
                              padding: "3px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              border: "1px solid #d1d5db",
                              background: club.logo_url ? "#dcfce7" : "#fef9c3",
                              color: "#111827",
                              fontWeight: 700,
                            }}
                          >
                            {club.logo_url ? "Oficial" : "Automático"}
                          </span>
                          {club.logo_url ? (
                            <div
                              style={{
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: 11,
                                color: "#64748b",
                              }}
                              title={club.logo_url}
                            >
                              {club.logo_url}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              Usa iniciales del short name.
                            </div>
                          )}
                        </div>
                      )}
                    </td>

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
                            onClick={() => beginLogoEdit(club)}
                            disabled={isPending}
                            style={logoButtonStyle}
                          >
                            Logo
                          </button>

                          <button
                            type="button"
                            onClick={() => submitRegenerateLogo(club)}
                            disabled={isPending}
                            style={logoButtonStyle}
                          >
                            Regenerar
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
