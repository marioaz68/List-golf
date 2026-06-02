"use client";

import { useState } from "react";

interface DemoGroup {
  id: string;
  number: number;
  hoyo: number;
  status: "en_ritmo" | "adelantado" | "atrasado";
  label: string;
  detail: string;
  tee: string;
  players: string[];
}

const STATUS_COLOR: Record<DemoGroup["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
};

export function SidebarGroups({ groups }: { groups: DemoGroup[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <aside style={{
      width: 240, minWidth: 240, height: "100%",
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

      <div style={{ padding: "10px 14px", borderBottom: "1px solid #222", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Grupos en campo · click para ver jugadores
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {groups.map((g) => {
          const isOpen = openId === g.id;
          return (
            <div key={g.id} style={{
              background: "#1a1a1a", border: `1px solid ${STATUS_COLOR[g.status]}33`,
              borderLeft: `4px solid ${STATUS_COLOR[g.status]}`,
              borderRadius: 6, marginBottom: 6, overflow: "hidden",
            }}>
              <button
                onClick={() => setOpenId(isOpen ? null : g.id)}
                style={{
                  width: "100%", padding: "8px 10px",
                  background: "transparent", color: "#fff",
                  border: "none", cursor: "pointer", textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: STATUS_COLOR[g.status],
                      color: "#fff", fontSize: 12, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{g.number}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>
                    tee {g.tee} · {isOpen ? "▾" : "▸"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 4 }}>{g.detail}</div>
              </button>

              {isOpen && (
                <div style={{
                  background: "#0a0a0a",
                  borderTop: `1px solid ${STATUS_COLOR[g.status]}33`,
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
        <Legend color="#ef4444" label="Atrasado" />
      </div>
    </aside>
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
