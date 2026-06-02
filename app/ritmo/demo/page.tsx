import { RitmoMap } from "./RitmoMap";
import { SidebarGroups } from "./SidebarGroups";

// Datos ficticios — no toca DB. Solo para visualización demo.
const DEMO_GROUPS = [
  {
    id: "G1", number: 1, lat: 20.56120, lon: -100.40860, hoyo: 5,
    status: "en_ritmo" as const, label: "Hoyo 5", detail: "✅ En ritmo", tee: "08:00",
    players: ["Mario Alvarez", "Luis Nava", "Carlos Alcocer", "Rodrigo Soto"],
  },
  {
    id: "G2", number: 2, lat: 20.56240, lon: -100.40760, hoyo: 8,
    status: "adelantado" as const, label: "Hoyo 8", detail: "🟢 Adelantado 6 min", tee: "08:10",
    players: ["Pablo Mendez", "Santiago Vazquez", "Mauricio Borja", "Juan Pablo Borja"],
  },
  {
    id: "G3", number: 3, lat: 20.55700, lon: -100.40720, hoyo: 12,
    status: "atrasado" as const, label: "Hoyo 12", detail: "⚠️ Atrasado 14 min", tee: "08:20",
    players: ["Emilio Hernandez", "Horacio Ovando", "Alfonso Suarez", "Jorge Vargas"],
  },
  {
    id: "G4", number: 4, lat: 20.55880, lon: -100.40460, hoyo: 16,
    status: "en_ritmo" as const, label: "Hoyo 16", detail: "✅ En ritmo", tee: "08:30",
    players: ["Rodrigo Urquiza", "Mario Urquiza", "Javier Urquiza", "Eduardo Carrillo"],
  },
];

export default function RitmoDemoPage() {
  return (
    <main style={{
      height: "100dvh", width: "100vw", display: "flex", flexDirection: "row",
      background: "#0a0a0a", overflow: "hidden",
      fontFamily: "-apple-system, system-ui, sans-serif",
    }}>
      <SidebarGroups groups={DEMO_GROUPS} />
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        <RitmoMap groups={DEMO_GROUPS} />
      </div>
    </main>
  );
}
