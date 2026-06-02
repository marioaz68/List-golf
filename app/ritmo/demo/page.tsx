import { RitmoMap } from "./RitmoMap";

// Datos ficticios — no toca DB. Solo para visualización demo.
const DEMO_GROUPS = [
  { id: "G1", number: 1, lat: 20.56120, lon: -100.40860, hoyo: 5,  status: "en_ritmo"   as const, label: "G1 · Hoyo 5 · ✅ En ritmo" },
  { id: "G2", number: 2, lat: 20.56240, lon: -100.40760, hoyo: 8,  status: "adelantado" as const, label: "G2 · Hoyo 8 · 🟢 Adelantado 6 min" },
  { id: "G3", number: 3, lat: 20.55700, lon: -100.40720, hoyo: 12, status: "atrasado"   as const, label: "G3 · Hoyo 12 · ⚠️ Atrasado 14 min" },
  { id: "G4", number: 4, lat: 20.55880, lon: -100.40460, hoyo: 16, status: "en_ritmo"   as const, label: "G4 · Hoyo 16 · ✅ En ritmo" },
];

export default function RitmoDemoPage() {
  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#111" }}>
      <header style={{
        background: "#1a1a1a", color: "#fff", padding: "10px 16px",
        borderBottom: "1px solid #333", fontFamily: "-apple-system, system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ fontSize: 16 }}>CCQ · Ritmo de juego — DEMO</strong>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              Datos ficticios. Cuando los jugadores compartan Live Location, aquí van a aparecer en tiempo real.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <Legend color="#10b981" label="En ritmo" />
            <Legend color="#3b82f6" label="Adelantado" />
            <Legend color="#ef4444" label="Atrasado" />
          </div>
        </div>
      </header>
      <RitmoMap groups={DEMO_GROUPS} />
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#d1d5db" }}>
      <span style={{
        width: 10, height: 10, borderRadius: "50%", background: color,
        border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
      }} />
      {label}
    </span>
  );
}
