"use client";

export interface SidebarGroup {
  id: string;
  number: number;
  hoyo: number;
  status: "en_ritmo" | "adelantado" | "atrasado";
  label: string;
  detail: string;
  tee: string;
  players: string[];
  role?: "normal" | "blocker" | "blocked";
  blockedBy?: number;
}

const STATUS_COLOR: Record<SidebarGroup["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
};
const BLOCKED_COLOR = "#f59e0b";

// Helpers visuales — en producción esto vendrá del paceCalculator del servidor.
// Por ahora se infiere del detail para el demo.
function deltaFromDetail(detail: string): { mins: number; sign: "+" | "-" | "0" } {
  // Busca patrones tipo "Adelantado 6 min", "Atrasado 27 min"
  const m = detail.match(/(adelantado|atrasado|tarde|adelanto|atraso)[^\d]*(\d+)\s*min/i);
  if (!m) return { mins: 0, sign: "0" };
  const isAdv = /adelant/i.test(m[1]);
  return { mins: parseInt(m[2], 10), sign: isAdv ? "-" : "+" };
}

interface Props {
  groups: SidebarGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function SidebarGroups({ groups, selectedId, onSelect }: Props) {
  return (
    <aside style={{
      width: 260, minWidth: 260, height: "100%",
      background: "#111", color: "#fff",
      borderRight: "1px solid #222",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #222" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>CCQ · Ritmo de juego</div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
          <span style={{ background: "#7c2d12", color: "#fed7aa", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>DEMO</span>
          {" "}datos ficticios
        </div>
      </div>

      <div style={{ padding: "10px 14px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Grupos en campo
        </span>
        {selectedId && (
          <button
            onClick={() => onSelect(null)}
            style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px",
              background: "#2563eb", color: "#fff", border: "none",
              borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            ✕ Ver todo el campo
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {groups.map((g) => {
          const isOpen = selectedId === g.id;
          const isBlocker = g.role === "blocker";
          const isBlocked = g.role === "blocked";
          const accent = isBlocked ? BLOCKED_COLOR : STATUS_COLOR[g.status];
          const detailColor = isBlocker ? "#fecaca" : isBlocked ? "#fde68a" : "#d1d5db";
          const delta = deltaFromDetail(g.detail);
          return (
            <div key={g.id} style={{
              background: isBlocker ? "#3f0d0d" : isOpen ? "#1f2937" : "#1a1a1a",
              border: `1px solid ${accent}55`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 6, marginBottom: 6, overflow: "hidden",
              boxShadow: isBlocker ? `0 0 0 1px ${accent}66, 0 0 12px ${accent}40` : "none",
            }}>
              <button
                onClick={() => onSelect(isOpen ? null : g.id)}
                style={{
                  width: "100%", padding: "8px 10px",
                  background: "transparent", color: "#fff",
                  border: "none", cursor: "pointer", textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: accent,
                      color: "#fff", fontSize: 13, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>{g.number}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</div>
                    {isBlocker && (
                      <span style={{
                        fontSize: 9, background: "#dc2626", color: "#fff",
                        padding: "1px 5px", borderRadius: 3, fontWeight: 800,
                      }}>🚦 BLOQUEA</span>
                    )}
                  </div>
                  <TimeChip delta={delta} status={g.status} isBlocked={isBlocked} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>tee {g.tee}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{isOpen ? "▾ jugadores" : "▸ ver jugadores"}</div>
                </div>

                <div style={{ fontSize: 11, color: detailColor, marginTop: 4 }}>{g.detail}</div>
              </button>

              {isOpen && (
                <div style={{
                  background: "#0a0a0a",
                  borderTop: `1px solid ${accent}33`,
                  padding: "8px 12px",
                }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    Jugadores ({g.players.length})
                  </div>
                  {g.players.map((p, i) => (
                    <div key={i} style={{
                      fontSize: 11, color: "#e5e7eb", padding: "3px 0",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ color: "#6b7280", width: 14 }}>{i + 1}.</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid #222", fontSize: 10, color: "#6b7280" }}>
        <div style={{ marginBottom: 4 }}>Semáforo:</div>
        <Legend color="#10b981" label="En ritmo" />
        <Legend color="#3b82f6" label="Adelantado" />
        <Legend color="#ef4444" label="Lento (bloquea)" />
        <Legend color="#f59e0b" label="Pegado / víctima" />
      </div>
    </aside>
  );
}

function TimeChip({ delta, status, isBlocked }: {
  delta: { mins: number; sign: "+" | "-" | "0" };
  status: SidebarGroup["status"];
  isBlocked: boolean;
}) {
  // Si no se detectó delta del texto, mostrar etiqueta simple
  if (delta.sign === "0" || delta.mins === 0) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700,
        padding: "2px 7px", borderRadius: 4,
        background: status === "en_ritmo" ? "#064e3b" : "#1f2937",
        color: status === "en_ritmo" ? "#6ee7b7" : "#9ca3af",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>OK</span>
    );
  }
  // Negativo = adelantado (verde/azul), positivo = atrasado (rojo o amarillo)
  const isAhead = delta.sign === "-";
  const color = isAhead
    ? { bg: "#0c4a6e", fg: "#bae6fd" }                                 // adelantado
    : isBlocked
      ? { bg: "#78350f", fg: "#fde68a" }                                // pegado
      : { bg: "#7f1d1d", fg: "#fecaca" };                               // lento real
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      padding: "2px 7px", borderRadius: 4,
      background: color.bg, color: color.fg,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {isAhead ? "−" : "+"}{delta.mins} min
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#d1d5db", marginTop: 2 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: color,
        border: "1.5px solid #fff", flexShrink: 0,
      }} />
      {label}
    </div>
  );
}
