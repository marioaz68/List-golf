import { RitmoMap } from "./RitmoMap";

// Datos ficticios — no toca DB. Solo para visualización demo.
const DEMO_GROUPS = [
  { id: "G1", number: 1, lat: 20.56120, lon: -100.40860, hoyo: 5,  status: "en_ritmo"   as const, label: "Hoyo 5",  detail: "✅ En ritmo",            tee: "08:00" },
  { id: "G2", number: 2, lat: 20.56240, lon: -100.40760, hoyo: 8,  status: "adelantado" as const, label: "Hoyo 8",  detail: "🟢 Adelantado 6 min",   tee: "08:10" },
  { id: "G3", number: 3, lat: 20.55700, lon: -100.40720, hoyo: 12, status: "atrasado"   as const, label: "Hoyo 12", detail: "⚠️ Atrasado 14 min",    tee: "08:20" },
  { id: "G4", number: 4, lat: 20.55880, lon: -100.40460, hoyo: 16, status: "en_ritmo"   as const, label: "Hoyo 16", detail: "✅ En ritmo",            tee: "08:30" },
];

const STATUS_COLOR = {
  en_ritmo:   "#10b981",
  adelantado: "#3b82f6",
  atrasado:   "#ef4444",
} as const;

export default function RitmoDemoPage() {
  return (
    <main style={{
      height: "100dvh", width: "100vw", display: "flex", flexDirection: "row",
      background: "#0a0a0a", overflow: "hidden",
      fontFamily: "-apple-system, system-ui, sans-serif",
    }}>
      {/* SIDEBAR IZQUIERDO */}
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
          Grupos en campo
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {DEMO_GROUPS.map((g) => (
            <div key={g.id} style={{
              background: "#1a1a1a", border: `1px solid ${STATUS_COLOR[g.status]}33`,
              borderLeft: `4px solid ${STATUS_COLOR[g.status]}`,
              borderRadius: 6, padding: "8px 10px", marginBottom: 6,
            }}>
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
                <div style={{ fontSize: 10, color: "#9ca3af" }}>tee {g.tee}</div>
              </div>
              <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 4 }}>{g.detail}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid #222", fontSize: 10, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>Semáforo:</div>
          <Legend color="#10b981" label="En ritmo" />
          <Legend color="#3b82f6" label="Adelantado" />
          <Legend color="#ef4444" label="Atrasado" />
        </div>
      </aside>

      {/* MAPA */}
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        <RitmoMap groups={DEMO_GROUPS} />
      </div>
    </main>
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
