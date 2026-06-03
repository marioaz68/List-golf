"use client";

import { useState } from "react";
import { RitmoMap, GroupDot } from "./RitmoMap";
import { SidebarGroups, SidebarGroup } from "./SidebarGroups";
import { useViewport } from "./useViewport";

interface DemoViewProps {
  groups: (SidebarGroup & GroupDot)[];
}

export function DemoView({ groups }: DemoViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const vp = useViewport();

  // Mobile portrait: layout vertical (map arriba, lista abajo, collapsible)
  if (vp.layout === "mobile_portrait") {
    return <MobilePortraitLayout groups={groups} selectedId={selectedId} setSelectedId={setSelectedId} shouldRotate={vp.shouldRotateMap} />;
  }

  // Desktop landscape o mobile landscape: sidebar + map
  return (
    <main style={{
      height: "100dvh", width: "100vw", display: "flex", flexDirection: "row",
      background: "#0a0a0a", overflow: "hidden",
      fontFamily: "-apple-system, system-ui, sans-serif",
    }}>
      <div style={{ width: vp.isMobile ? 180 : 260, minWidth: vp.isMobile ? 180 : 260, height: "100%" }}>
        <SidebarGroups groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        <RitmoMap groups={groups} selectedId={selectedId} rotate={vp.shouldRotateMap} />
      </div>
    </main>
  );
}

function MobilePortraitLayout({
  groups, selectedId, setSelectedId, shouldRotate,
}: {
  groups: (SidebarGroup & GroupDot)[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  shouldRotate: boolean;
}) {
  // En móvil, el sidebar se vuelve un "panel inferior" que se puede expandir
  const [panelExpanded, setPanelExpanded] = useState(false);
  const mapHeight = panelExpanded ? "35vh" : "62vh";

  return (
    <main style={{
      height: "100dvh", width: "100vw", display: "flex", flexDirection: "column",
      background: "#0a0a0a", overflow: "hidden",
      fontFamily: "-apple-system, system-ui, sans-serif",
    }}>
      {/* Header súper compacto */}
      <header style={{
        background: "#111", padding: "8px 12px",
        borderBottom: "1px solid #222", color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>CCQ · Ritmo</div>
          <div style={{ fontSize: 9, color: "#9ca3af" }}>
            <span style={{ background: "#7c2d12", color: "#fed7aa", padding: "1px 4px", borderRadius: 2, fontWeight: 600 }}>DEMO</span>
            {" "}{groups.length} grupos
          </div>
        </div>
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            style={{
              fontSize: 10, fontWeight: 700, padding: "4px 8px",
              background: "#2563eb", color: "#fff", border: "none",
              borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ✕ Ver todo
          </button>
        )}
      </header>

      {/* Mapa */}
      <div style={{ height: mapHeight, position: "relative", transition: "height 0.3s ease" }}>
        <RitmoMap groups={groups} selectedId={selectedId} rotate={shouldRotate} />
      </div>

      {/* Panel inferior con grupos */}
      <div style={{
        flex: 1, background: "#111", borderTop: "2px solid #333",
        display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        <button
          onClick={() => setPanelExpanded(!panelExpanded)}
          style={{
            background: "#1a1a1a", border: "none", color: "#fff",
            padding: "8px 12px", fontFamily: "inherit", fontSize: 11,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            cursor: "pointer", borderBottom: "1px solid #222",
          }}
        >
          <span style={{ fontWeight: 700 }}>📋 Grupos en campo</span>
          <span style={{ color: "#9ca3af" }}>{panelExpanded ? "▼ contraer" : "▲ expandir"}</span>
        </button>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <MobileGroupList groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </main>
  );
}

function MobileGroupList({
  groups, selectedId, onSelect,
}: {
  groups: SidebarGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const STATUS_COLOR: Record<SidebarGroup["status"], string> = {
    en_ritmo: "#10b981", adelantado: "#3b82f6", atrasado: "#ef4444",
  };
  const BLOCKED_COLOR = "#f59e0b";
  return (
    <div style={{ padding: "6px 8px" }}>
      {groups.map((g) => {
        const isOpen = selectedId === g.id;
        const isBlocker = g.role === "blocker";
        const isBlocked = g.role === "blocked";
        const accent = isBlocked ? BLOCKED_COLOR : STATUS_COLOR[g.status];
        return (
          <div key={g.id} style={{
            background: isBlocker ? "#3f0d0d" : isOpen ? "#1f2937" : "#1a1a1a",
            border: `1px solid ${accent}55`, borderLeft: `4px solid ${accent}`,
            borderRadius: 6, marginBottom: 6, overflow: "hidden",
          }}>
            <button
              onClick={() => onSelect(isOpen ? null : g.id)}
              style={{
                width: "100%", padding: "10px 12px", background: "transparent",
                color: "#fff", border: "none", cursor: "pointer", textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: accent,
                  color: "#fff", fontSize: 16, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>{g.number}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                    {isBlocker && (
                      <span style={{ fontSize: 9, background: "#dc2626", color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 800 }}>
                        🚦 BLOQUEA
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 2 }}>{g.detail}</div>
                </div>
              </div>
              {isOpen && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${accent}33` }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>
                    Jugadores
                  </div>
                  {g.players.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#e5e7eb", padding: "2px 0" }}>
                      {i + 1}. {p}
                    </div>
                  ))}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
