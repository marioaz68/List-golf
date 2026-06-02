import { DemoView } from "./DemoView";

/**
 * Demo con 6 grupos que ilustra los 3 escenarios reales de ritmo:
 *  1. Grupo en ritmo o adelantado (verde / azul)
 *  2. Grupo "atrasado vs reloj" pero EN RITMO DEL CAMPO (sigue al de enfrente con gap normal)
 *  3. Grupo verdaderamente lento (bloqueador) + víctimas pegadas detrás
 */
// Coordenadas verificadas dentro del polígono real de cada hoyo del CCQ
// (calculadas con sampling y point-in-polygon contra ccq_holes.geojson).
const DEMO_GROUPS = [
  {
    id: "G1", number: 1, lat: 20.55604, lon: -100.40946, hoyo: 14,
    status: "en_ritmo" as const, label: "Hoyo 14", detail: "✅ En ritmo (primer grupo)", tee: "08:00",
    players: ["Mario Alvarez", "Luis Nava", "Carlos Alcocer", "Rodrigo Soto"],
    role: "normal" as const,
  },
  {
    id: "G2", number: 2, lat: 20.55768, lon: -100.40520, hoyo: 15,
    status: "adelantado" as const, label: "Hoyo 15", detail: "🟢 Adelantado · va rápido", tee: "08:10",
    players: ["Pablo Mendez", "Santiago Vazquez", "Mauricio Borja", "Juan Pablo Borja"],
    role: "normal" as const,
  },
  {
    id: "G3", number: 3, lat: 20.55590, lon: -100.40915, hoyo: 14,
    status: "en_ritmo" as const, label: "Hoyo 14",
    detail: "✅ En ritmo del campo · sigue a G2 (gap normal)", tee: "08:20",
    players: ["Emilio Hernandez", "Horacio Ovando", "Alfonso Suarez", "Jorge Vargas"],
    role: "normal" as const,
  },
  {
    id: "G4", number: 4, lat: 20.56464, lon: -100.40637, hoyo: 10,
    status: "atrasado" as const, label: "Hoyo 10",
    detail: "🚦 Lento real · 4 hoyos detrás de G3 · BLOQUEA AL FIELD", tee: "08:30",
    players: ["Rodrigo Urquiza", "Mario Urquiza", "Javier Urquiza", "Eduardo Carrillo"],
    role: "blocker" as const,
  },
  {
    id: "G5", number: 5, lat: 20.56410, lon: -100.40675, hoyo: 10,
    status: "atrasado" as const, label: "Hoyo 10",
    detail: "↑ Pegado a G4 (no es su culpa)", tee: "08:40",
    players: ["Manuel Ochoa", "Manuel Ramirez", "Israel Pacheco", "Rogelio Molina"],
    role: "blocked" as const, blockedBy: 4,
  },
  {
    id: "G6", number: 6, lat: 20.56425, lon: -100.40720, hoyo: 9,
    status: "atrasado" as const, label: "Hoyo 9",
    detail: "↑ Pegado a G4 (no es su culpa)", tee: "08:50",
    players: ["Juan Reyes", "Eduardo Urbiola", "Faro Niembro", "Oscar Vazquez"],
    role: "blocked" as const, blockedBy: 4,
  },
];

export default function RitmoDemoPage() {
  return <DemoView groups={DEMO_GROUPS} />;
}
