"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, Flag, Gauge, Ruler, Target, CircleDot,
  Timer, TrendingUp, Crosshair,
} from "lucide-react";
import {
  getPlayerStats,
  getClubShots,
  setShotExcluded,
  getHoleStats,
  getHoleDetail,
  setHoleExcluded,
  getShotLines,
  getHolePlan,
  getPuttStats,
  getPuttList,
  getGreenMap,
  getApproachStats,
  getApproachList,
  type PuttBucket,
  type PuttRow,
  type GreenMapData,
  type ApproachBucket,
  type ApproachRow,
  type ClubDistance,
  type ClubShot,
  type HoleStats,
  type HoleRow,
  type HolePlay,
  type HolePlan,
  type ShotLine,
  type Shot,
  type SwingStats,
} from "@/lib/playerStats";
import { getTelegramInitData } from "@/lib/telegram/miniapp";
import { loadLeaflet, addSatelliteLayers, readMapLayout, zoomToFitWaypoints } from "@/components/captura/mapRotation";
import { bearingDegrees } from "@/lib/distances/ccqGreens";

// Colores del tema de Telegram (con fallback oscuro legible).
const C = {
  text: "var(--tg-theme-text-color, #f2f2f7)",
  hint: "var(--tg-theme-hint-color, #a8a8b3)",
  card: "var(--tg-theme-secondary-bg-color, #1c1c22)",
  headerBg: "var(--tg-theme-secondary-bg-color, #26262e)",
  border: "rgba(255,255,255,0.14)",
  accent: "#34d399",
};

type View = "home" | "bastones" | "hoyos" | "tiros" | "putts" | "approach" | "clubDetail" | "holeDetail";
type SelectedClub = { club: string; swing: "full" | "three_quarter" };

// Etiquetas cortas para que quepan mejor en la tabla.
const CLUB_LABEL: Record<string, string> = {
  driver: "Driver",
  "3w": "M3", "5w": "M5", "7w": "M7", "9w": "M9",
  "2h": "H2", "3h": "H3", "4h": "H4", "5h": "H5", "6h": "H6",
  "3i": "3i", "4i": "4i", "5i": "5i", "6i": "6i", "7i": "7i", "8i": "8i", "9i": "9i",
  pw: "PW", gw: "GW", sw: "SW", lw: "LW", putter: "Putter",
  w48: "48°", w50: "50°", w52: "52°", w54: "54°", w56: "56°", w58: "58°", w60: "60°",
};
const clubLabel = (c: string | null) => (c ? CLUB_LABEL[c] ?? c.toUpperCase() : "—");

// Color específico por bastón (para las líneas de tiros en el mapa).
const CLUB_COLOR: Record<string, string> = {
  driver: "#ef4444", "3w": "#f97316", "5w": "#f59e0b", "7w": "#eab308", "9w": "#84cc16",
  "2h": "#22c55e", "3h": "#10b981", "4h": "#14b8a6", "5h": "#06b6d4", "6h": "#0ea5e9",
  "3i": "#3b82f6", "4i": "#6366f1", "5i": "#8b5cf6", "6i": "#a855f7", "7i": "#d946ef", "8i": "#ec4899", "9i": "#f43f5e",
  pw: "#fb7185", gw: "#fda4af", w48: "#fbbf24", w50: "#f59e0b", w52: "#facc15", w54: "#a3e635", sw: "#34d399", w58: "#22d3ee", lw: "#60a5fa",
  putter: "#94a3b8",
};
const clubColor = (c: string | null) => (c && CLUB_COLOR[c]) ? CLUB_COLOR[c] : "#34d399";
const dashFor = (style: string) => (style === "solid" ? undefined : style === "dashed" ? "12,8" : "2,8");

// Periodos disponibles. days=null => todo; days=-1 => última jugada.
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "last", label: "Última jugada", days: -1 },
  { key: "30", label: "30 días", days: 30 },
  { key: "90", label: "90 días", days: 90 },
  { key: "180", label: "180 días", days: 180 },
  { key: "365", label: "1 año", days: 365 },
  { key: "all", label: "Todo", days: null },
];
// Traduce el periodo elegido a opciones para getPlayerStats.
function fetchOptsFromKey(key: string): { range?: { from?: string }; last?: boolean } {
  const r = RANGES.find((x) => x.key === key);
  if (!r) return {};
  if (r.days === -1) return { last: true };       // última jugada
  if (r.days == null) return {};                  // todo
  const d = new Date();
  d.setDate(d.getDate() - r.days);
  return { range: { from: d.toISOString() } };
}

export default function PlayerStats({ initData }: { initData?: string }) {
  const [view, setView] = useState<View>("home");
  const [clubs, setClubs] = useState<ClubDistance[]>([]);
  const [swing, setSwing] = useState<SwingStats | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [totalShots, setTotalShots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<string>("all");
  const [selectedClub, setSelectedClub] = useState<SelectedClub | null>(null);
  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // fuerza recálculo de promedios tras excluir

  const idata = initData ?? getTelegramInitData();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!idata) throw new Error("Abre esta pantalla desde Telegram para ver tus estadísticas.");
        const r = await getPlayerStats(idata, { recent: true, ...fetchOptsFromKey(rangeKey) });
        if (!active) return;
        setClubs(r.clubDistances);
        setSwing(r.swingStats);
        setShots(r.recentShots);
        setTotalShots(r.totalShots);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar estadísticas");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [idata, rangeKey, reloadKey]);

  const putts = shots.filter((s) => s.club === "putter").length;

  // ---------- HOME: menú de títulos ----------
  if (view === "home") {
    return (
      <div className="space-y-3" style={{ color: C.text }}>
        <RangeSelector rangeKey={rangeKey} onChange={setRangeKey} />
        <MenuRow icon={<Ruler className="h-5 w-5" />} title="Bastones"
          subtitle={loading ? "…" : `${new Set(clubs.map((c) => c.club)).size} bastones (Full y ¾)`} onClick={() => setView("bastones")} />
        <MenuRow icon={<Flag className="h-5 w-5" />} title="Hoyos"
          subtitle="Rendimiento por hoyo" onClick={() => setView("hoyos")} />
        <MenuRow icon={<Target className="h-5 w-5" />} title="Tiros"
          subtitle={loading ? "…" : `${totalShots} tiros`} onClick={() => setView("tiros")} />
        <MenuRow icon={<CircleDot className="h-5 w-5" />} title="Putts"
          subtitle={loading ? "…" : `${putts} putts`} onClick={() => setView("putts")} />
        <MenuRow icon={<Crosshair className="h-5 w-5" />} title="Approach"
          subtitle="Tiros de menos de 60 yardas" onClick={() => setView("approach")} />
      </div>
    );
  }

  // ---------- DETALLE DE UN BASTÓN (tiros + exclusión) ----------
  if (view === "clubDetail" && selectedClub && idata) {
    return (
      <ClubShotsDetail
        initData={idata}
        club={selectedClub.club}
        swing={selectedClub.swing}
        onBack={() => setView("bastones")}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  // ---------- DETALLE DE UN HOYO (jugadas + exclusión) ----------
  if (view === "holeDetail" && selectedHole != null && idata) {
    return (
      <HoleDetail
        initData={idata}
        hole={selectedHole}
        rangeKey={rangeKey}
        onBack={() => setView("hoyos")}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  // ---------- DETALLE DE MÓDULO ----------
  const titles: Record<"bastones" | "hoyos" | "tiros" | "putts" | "approach", string> = {
    bastones: "Bastones", hoyos: "Hoyos", tiros: "Tiros", putts: "Putts", approach: "Approach",
  };
  const moduleView = view as "bastones" | "hoyos" | "tiros" | "putts" | "approach";

  return (
    <div className="space-y-4" style={{ color: C.text }}>
      <button onClick={() => setView("home")} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>{titles[moduleView]}</h2>

      <RangeSelector rangeKey={rangeKey} onChange={setRangeKey} />

      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : (
        <>
          {view === "bastones" && (
            <BastonesDetail
              clubs={clubs}
              swing={swing}
              onSelectClub={(c) => { setSelectedClub(c); setView("clubDetail"); }}
            />
          )}
          {view === "tiros" && idata && <TirosModule initData={idata} rangeKey={rangeKey} />}
          {view === "hoyos" && idata && (
            <HoyosDetail
              initData={idata}
              rangeKey={rangeKey}
              reloadKey={reloadKey}
              onSelectHole={(h) => { setSelectedHole(h); setView("holeDetail"); }}
            />
          )}
          {view === "putts" && idata && <PuttsModule initData={idata} rangeKey={rangeKey} />}
          {view === "approach" && idata && <ApproachModule initData={idata} rangeKey={rangeKey} />}
        </>
      )}
    </div>
  );
}

// ---------- Componentes de menú y detalle ----------

function MenuRow({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border p-4 text-left"
      style={{ background: C.card, borderColor: C.border }}>
      <span style={{ color: C.accent }}>{icon}</span>
      <span className="flex-1">
        <span className="block text-base font-semibold" style={{ color: C.text }}>{title}</span>
        <span className="block text-xs" style={{ color: C.hint }}>{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5" style={{ color: C.hint }} />
    </button>
  );
}

function RangeSelector({ rangeKey, onChange }: { rangeKey: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {RANGES.map((r) => {
        const on = r.key === rangeKey;
        return (
          <button key={r.key} onClick={() => onChange(r.key)}
            className="rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap"
            style={{ background: on ? C.accent : C.card, color: on ? "#0a2e1e" : C.text, border: `1px solid ${on ? C.accent : C.border}` }}>
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function BastonesDetail({ clubs, swing, onSelectClub }: {
  clubs: ClubDistance[];
  swing: SwingStats | null;
  onSelectClub: (c: SelectedClub) => void;
}) {
  const hasClubs = clubs.length > 0;
  const hasSwing = swing && swing.swings_measured > 0;
  const cellBorder: CSSProperties = { borderColor: C.border };
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle icon={<Gauge className="h-4 w-4" style={{ color: C.accent }} />}>Swing</SectionTitle>
        {hasSwing ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Vel. back" value={fmt(swing!.avg_backswing_velocity_dps, "°/s")} />
            <StatCard icon={<Timer className="h-4 w-4" />} label="Grados back" value={fmt(swing!.avg_backswing_club_deg, "°")} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Vel. follow" value={fmt(swing!.avg_forwardswing_velocity_dps, "°/s")} />
            <StatCard icon={<Target className="h-4 w-4" />} label="Grados follow" value={fmt(swing!.avg_forward_club_deg, "°")} />
          </div>
        ) : (
          <EmptyNote>Aún no hay métricas de swing. Se llenarán cuando uses el Apple Watch.</EmptyNote>
        )}
      </section>

      <section>
        <SectionTitle icon={<Ruler className="h-4 w-4" style={{ color: C.accent }} />}>Distancias por palo</SectionTitle>
        {hasClubs ? (
          <div className="overflow-hidden rounded-lg border" style={cellBorder}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
                <tr>
                  <th className="px-2 py-2">Bastón</th>
                  <th className="px-2 py-2 text-right">Plan<span className="block text-[9px] font-normal normal-case opacity-70">yds</span></th>
                  <th className="px-2 py-2 text-right">Prom<span className="block text-[9px] font-normal normal-case opacity-70">yds</span></th>
                  <th className="px-2 py-2 text-right">vs<br/>plan</th>
                  <th className="px-2 py-2 text-right">Tiros</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr key={c.club + "-" + c.swing} className="cursor-pointer border-t"
                    style={cellBorder}
                    onClick={() => onSelectClub({ club: c.club, swing: c.swing })}>
                    <td className="px-2 py-2 font-medium">
                      {clubLabel(c.club)}
                      {c.swing === "three_quarter" && (
                        <span className="ml-1 text-xs" style={{ color: C.accent }}>¾</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{fmt(c.avg_planned)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(c.avg_yards)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: vsPlanColor(c.avg_vs_plan) }}>
                      {c.avg_vs_plan != null ? `${c.avg_vs_plan}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{c.shots}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyNote>Tu bolsa está vacía. Da de alta tus bastones para verlos aquí.</EmptyNote>
        )}
        {hasClubs && (
          <p className="mt-2 text-xs" style={{ color: C.hint }}>
            Toca un bastón para ver sus tiros y excluir golpes malos. &ldquo;Planeado&rdquo; = promedio de lo que seleccionas antes de pegar (o la yarda configurada si aún no hay tiros). &ldquo;Promedio&rdquo; = real medido por GPS. &ldquo;vs plan&rdquo; = real ÷ planeado. ¾ = tres cuartos.
          </p>
        )}
      </section>
    </div>
  );
}

const STROKE_LABEL: Record<number, string> = {
  1: "Salida (1er golpe)", 2: "2º golpe", 3: "3er golpe", 4: "4º golpe", 5: "5º golpe",
};

function TirosModule({ initData, rangeKey }: { initData: string; rangeKey: string }) {
  const [holes, setHoles] = useState<HoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hole, setHole] = useState<HoleRow | null>(null);
  const [stroke, setStroke] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getHoleStats(initData, fetchOptsFromKey(rangeKey));
        if (active) setHoles(d.holes);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar hoyos");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, rangeKey]);

  // Nivel 3: mapa con las líneas del tiro
  if (hole && stroke != null) {
    return (
      <div className="space-y-3" style={{ color: C.text }}>
        <button onClick={() => setStroke(null)} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
          <ChevronLeft className="h-4 w-4" /> Golpes
        </button>
        <h3 className="text-base font-semibold" style={{ color: C.text }}>
          Hoyo {hole.hole} · {STROKE_LABEL[stroke] ?? `Golpe ${stroke}`}
        </h3>
        <ShotLinesMap initData={initData} hole={hole.hole} stroke={stroke} rangeKey={rangeKey} />
      </div>
    );
  }

  // Nivel 2: elegir golpe (salida / 2º / 3º según par)
  if (hole) {
    const par = hole.par ?? 5;
    const maxStroke = Math.max(1, par - 2); // par3→1, par4→2, par5→3
    return (
      <div className="space-y-3" style={{ color: C.text }}>
        <button onClick={() => setHole(null)} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
          <ChevronLeft className="h-4 w-4" /> Hoyos
        </button>
        <h3 className="text-base font-semibold" style={{ color: C.text }}>
          Hoyo {hole.hole}{hole.par != null ? ` · par ${hole.par}` : ""}
        </h3>
        <HolePlanCard initData={initData} hole={hole.hole} rangeKey={rangeKey} />
        <div className="space-y-2">
          {Array.from({ length: maxStroke }, (_, i) => i + 1).map((s) => (
            <button key={s} onClick={() => setStroke(s)}
              className="flex w-full items-center gap-3 rounded-xl border p-4 text-left"
              style={{ background: C.card, borderColor: C.border }}>
              <Target className="h-5 w-5" style={{ color: C.accent }} />
              <span className="flex-1 font-semibold" style={{ color: C.text }}>{STROKE_LABEL[s] ?? `Golpe ${s}`}</span>
              <ChevronRight className="h-5 w-5" style={{ color: C.hint }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Nivel 1: hoyos 1-18
  if (loading) return <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>;
  if (error) return <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>;
  const cellBorder: CSSProperties = { borderColor: C.border };
  return (
    <div className="overflow-hidden rounded-lg border" style={cellBorder}>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
          <tr>
            <th className="px-3 py-2">Hoyo</th>
            <th className="px-3 py-2 text-right">Par</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => (
            <tr key={h.hole} className="cursor-pointer border-t" style={cellBorder} onClick={() => setHole(h)}>
              <td className="px-3 py-2 font-medium">{h.hole}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.hint }}>{h.par ?? "—"}</td>
              <td className="px-2 py-2 text-right"><ChevronRight className="inline h-4 w-4" style={{ color: C.hint }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HolePlanCard({ initData, hole, rangeKey }: { initData: string; hole: number; rangeKey: string }) {
  const [plan, setPlan] = useState<HolePlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const p = await getHolePlan(initData, hole, fetchOptsFromKey(rangeKey));
        if (active) setPlan(p);
      } catch {
        if (active) setPlan(null);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, hole, rangeKey]);

  if (loading) return <div className="text-xs" style={{ color: C.hint }}>Calculando plan…</div>;
  if (!plan || plan.distance == null || plan.plan.length === 0) {
    return <div className="text-xs" style={{ color: C.hint }}>Sin datos suficientes para el plan de este hoyo.</div>;
  }
  const target = plan.targetType === "flag" ? "bandera del día" : "centro del green";
  return (
    <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
      <div className="text-xs" style={{ color: C.hint }}>
        A la {target}: <span className="font-semibold" style={{ color: C.text }}>{plan.distance} yds</span>
        {plan.par != null ? ` · par ${plan.par}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {plan.plan.map((step, i) => (
          <span key={step.stroke} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-4 w-4" style={{ color: C.hint }} />}
            <span className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ background: "rgba(52,211,153,0.15)", color: C.accent, border: `1px solid ${C.accent}` }}>
              {clubLabel(step.club)} · {step.yards} yd
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1 text-xs" style={{ color: C.hint }}>
        Suma del plan: {plan.planTotal} yds (objetivo {plan.distance}). Sugerido según tus yardas y el bastón más constante en la salida.
      </div>
    </div>
  );
}

function GreenMap({ initData, hole, rangeKey, onBack }: {
  initData: string; hole: number; rangeKey: string; onBack: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<GreenMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getGreenMap(initData, hole, fetchOptsFromKey(rangeKey));
        if (active) setData(d);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar el green");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, hole, rangeKey]);

  useEffect(() => {
    if (loading || error || !data || !mapDivRef.current) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !mapDivRef.current) return;
      const m = L.map(mapDivRef.current, {
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        touchZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0, maxZoom: 21,
      });
      map = m;
      addSatelliteLayers(m, L);
      const g = data.green;
      const greenPts: { lat: number; lon: number }[] = [];
      if (g.center) {
        L.circle([g.center.lat, g.center.lon], { radius: 14, color: "#4ade80", weight: 2, fillColor: "#22c55e", fillOpacity: 0.14 }).addTo(m);
        greenPts.push(g.center);
      }
      if (g.front) greenPts.push(g.front);
      if (g.back) greenPts.push(g.back);
      for (const b of data.balls) {
        L.circleMarker([b.lat, b.lon], {
          radius: 5, color: "#ffffff", weight: 1,
          fillColor: b.gir ? "#34d399" : "#fbbf24", fillOpacity: 0.95,
        }).addTo(m);
      }
      // Rota el mapa para que el FONDO del green (back) quede arriba, como el mapa de hoyos.
      const center = g.center ?? g.front ?? g.back ?? null;
      const back = g.back ?? null;
      const bearing = center && back ? bearingDegrees(center.lat, center.lon, back.lat, back.lon) : 0;
      if (rotatorRef.current) rotatorRef.current.style.transform = `rotate(${-bearing}deg)`;
      const { viewportW, viewportH } = readMapLayout(viewportRef.current, mapDivRef.current);
      const c = center ?? { lat: 19.4, lon: -99.1 };
      let zoom = 19;
      if (greenPts.length > 1 && viewportW && viewportH) {
        zoom = Math.max(17, Math.min(21, zoomToFitWaypoints(greenPts, bearing, viewportW, viewportH)));
      }
      m.setView([c.lat, c.lon], center ? zoom : 3);
      m.invalidateSize();
    })();
    return () => { cancelled = true; if (map) map.remove(); };
  }, [loading, error, data]);

  return (
    <div className="space-y-3" style={{ color: C.text }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Hoyos
      </button>
      <h3 className="text-base font-semibold">Green · Hoyo {hole}{data?.par != null ? ` · par ${data.par}` : ""}</h3>
      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando green…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : !data || data.balls.length === 0 ? (
        <EmptyNote>No hay tiros de approach registrados en este hoyo.</EmptyNote>
      ) : (
        <>
          <div ref={viewportRef} style={{ position: "relative", height: "60vh", minHeight: 320, borderRadius: 12, overflow: "hidden" }}>
            <div ref={rotatorRef} style={{ position: "absolute", inset: 0, transformOrigin: "center center" }}>
              <div ref={mapDivRef} style={{ position: "absolute", top: "-27.5%", left: "-27.5%", width: "155%", height: "155%" }} />
            </div>
          </div>
          <p className="text-xs" style={{ color: C.hint }}>
            Fondo del green arriba · {data.balls.length} approach(es) · verde = green en regulación, ámbar = fuera. Círculo verde = green.
          </p>
        </>
      )}
    </div>
  );
}

function ShotLinesMap({ initData, hole, stroke, rangeKey }: {
  initData: string; hole: number; stroke: number; rangeKey: string;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState<ShotLine[]>([]);
  const [suggestedClub, setSuggestedClub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getShotLines(initData, hole, stroke, fetchOptsFromKey(rangeKey));
        if (active) { setLines(d.shots); setSuggestedClub(d.suggestedClub); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar tiros");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, hole, stroke, rangeKey]);

  useEffect(() => {
    if (loading || error || !mapDivRef.current) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !mapDivRef.current) return;
      const m = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false });
      map = m;
      addSatelliteLayers(m, L);
      const pts: [number, number][] = [];
      for (const s of lines) {
        if (s.from_lat == null || s.from_lon == null || s.to_lat == null || s.to_lon == null) continue;
        const a: [number, number] = [s.from_lat, s.from_lon];
        const b: [number, number] = [s.to_lat, s.to_lon];
        pts.push(a, b);
        const color = s.excluded ? "#8a8a8a" : clubColor(s.club);
        L.polyline([a, b], {
          color, weight: 3, opacity: s.excluded ? 0.4 : 0.95,
          dashArray: dashFor(s.style), lineCap: s.style === "dotted" ? "round" : "butt",
        }).addTo(m);
        L.circleMarker(a, { radius: 4, color: "#ffffff", fillColor: color, fillOpacity: 1, weight: 1 }).addTo(m);
        L.circleMarker(b, { radius: 3, color, fillColor: "#ffffff", fillOpacity: 1, weight: 2 }).addTo(m);
      }
      if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
      else m.setView([19.4, -99.1], 3);
    })();
    return () => { cancelled = true; if (map) map.remove(); };
  }, [loading, error, lines]);

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando mapa…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : lines.length === 0 ? (
        <EmptyNote>No hay tiros registrados de este golpe en el hoyo.</EmptyNote>
      ) : (
        <>
          {suggestedClub && (
            <div className="flex items-center gap-2 rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
              <Target className="h-4 w-4" style={{ color: C.accent }} />
              <span className="text-sm" style={{ color: C.hint }}>Bastón más constante aquí:</span>
              <span className="rounded-full px-3 py-1 text-sm font-semibold"
                style={{ background: "rgba(52,211,153,0.15)", color: C.accent, border: `1px solid ${C.accent}` }}>
                {clubLabel(suggestedClub)}
              </span>
            </div>
          )}
          <div ref={mapDivRef} style={{ height: "60vh", minHeight: 320, borderRadius: 12, overflow: "hidden" }} />
          <div className="space-y-1 text-xs" style={{ color: C.hint }}>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Array.from(new Set(lines.map((l) => l.club).filter(Boolean) as string[])).map((c) => (
                <span key={c} className="flex items-center gap-1">
                  <span style={{ width: 14, height: 3, background: clubColor(c), display: "inline-block", borderRadius: 2 }} />
                  {clubLabel(c)}
                </span>
              ))}
            </div>
            <div>Sólida = ≥95% + buen lie · raya = ≥85% · punteada = peor. Punto blanco = donde quedó la bola. ({lines.length} tiros)</div>
          </div>
        </>
      )}
    </div>
  );
}

const PUTT_BUCKETS: { key: string; min: number; max: number | null }[] = [
  { key: "0-5", min: 0, max: 5 },
  { key: "6-10", min: 6, max: 10 },
  { key: "11-15", min: 11, max: 15 },
  { key: "16-20", min: 16, max: 20 },
  { key: "21-25", min: 21, max: 25 },
  { key: ">25", min: 26, max: null },
];

function PuttsModule({ initData, rangeKey }: { initData: string; rangeKey: string }) {
  const [buckets, setBuckets] = useState<PuttBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ key: string; min: number; max: number | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [greenMode, setGreenMode] = useState(false);
  const [greenHole, setGreenHole] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getPuttStats(initData, fetchOptsFromKey(rangeKey));
        if (active) setBuckets(d);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar putts");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, rangeKey, reloadKey]);

  // Mapa del green: primero elige hoyo, luego muestra el green.
  if (greenMode) {
    if (greenHole != null) {
      return <GreenMap initData={initData} hole={greenHole} rangeKey={rangeKey} onBack={() => setGreenHole(null)} />;
    }
    return (
      <div className="space-y-3" style={{ color: C.text }}>
        <button onClick={() => setGreenMode(false)} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
          <ChevronLeft className="h-4 w-4" /> Putts
        </button>
        <h3 className="text-base font-semibold">Elige un hoyo</h3>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
            <button key={h} onClick={() => setGreenHole(h)}
              className="rounded-lg border py-3 text-sm font-semibold"
              style={{ background: C.card, borderColor: C.border, color: C.text }}>
              {h}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (sel) {
    return (
      <PuttListDetail
        initData={initData} min={sel.min} max={sel.max} label={sel.key} rangeKey={rangeKey}
        onBack={() => setSel(null)} onChanged={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  if (loading) return <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>;
  if (error) return <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>;
  const cellBorder: CSSProperties = { borderColor: C.border };
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  return (
    <div className="space-y-2">
      <button onClick={() => setGreenMode(true)}
        className="flex w-full items-center gap-3 rounded-xl border p-3 text-left"
        style={{ background: C.card, borderColor: C.border }}>
        <Flag className="h-5 w-5" style={{ color: C.accent }} />
        <span className="flex-1 font-semibold" style={{ color: C.text }}>Ver green · posiciones de approach</span>
        <ChevronRight className="h-5 w-5" style={{ color: C.hint }} />
      </button>
      <div className="overflow-hidden rounded-lg border" style={cellBorder}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
            <tr>
              <th className="px-2 py-2">Dist (yd)</th>
              <th className="px-2 py-2 text-right">% metidos</th>
              <th className="px-2 py-2 text-right">% 3-putts</th>
              <th className="px-2 py-2 text-right">Putts</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {PUTT_BUCKETS.map((bk) => {
              const b = byKey.get(bk.key);
              return (
                <tr key={bk.key} className="cursor-pointer border-t" style={cellBorder} onClick={() => setSel(bk)}>
                  <td className="px-2 py-2 font-medium">{bk.key}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{b?.made_pct != null ? `${b.made_pct}%` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: b?.three_putt_pct != null && b.three_putt_pct > 0 ? "#f87171" : C.hint }}>
                    {b?.three_putt_pct != null ? `${b.three_putt_pct}%` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{b?.attempts ?? 0}</td>
                  <td className="px-2 py-2 text-right"><ChevronRight className="inline h-4 w-4" style={{ color: C.hint }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: C.hint }}>
        &ldquo;% metidos&rdquo; = putts holados desde esa distancia. &ldquo;% 3-putts&rdquo; = hoyos cuyo primer putt fue de esa distancia y acabaron en 3+. Toca un rango para ver y depurar putts.
      </p>
    </div>
  );
}

function PuttListDetail({ initData, min, max, label, rangeKey, onBack, onChanged }: {
  initData: string; min: number; max: number | null; label: string; rangeKey: string;
  onBack: () => void; onChanged: () => void;
}) {
  const [putts, setPutts] = useState<PuttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const p = await getPuttList(initData, min, max, fetchOptsFromKey(rangeKey));
        if (active) setPutts(p);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar putts");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, min, max, rangeKey]);

  const incl = putts.filter((p) => !p.excluded);
  const madePct = incl.length ? Math.round((incl.filter((p) => p.made).length / incl.length) * 100) : null;

  async function toggle(p: PuttRow) {
    const next = !p.excluded;
    setBusy(p.shot_id);
    setPutts((prev) => prev.map((x) => (x.shot_id === p.shot_id ? { ...x, excluded: next } : x)));
    try {
      await setShotExcluded(initData, p.shot_id, next);
      onChanged();
    } catch {
      setPutts((prev) => prev.map((x) => (x.shot_id === p.shot_id ? { ...x, excluded: !next } : x)));
    } finally { setBusy(null); }
  }

  const cellBorder: CSSProperties = { borderColor: C.border };
  return (
    <div className="space-y-4" style={{ color: C.text }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Putts
      </button>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>Putts {label} yds</h2>

      <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.hint }}>% metidos (sin excluidos)</div>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: C.text }}>{madePct != null ? `${madePct}%` : "—"}</div>
        <div className="text-xs" style={{ color: C.hint }}>{incl.length} de {putts.length} putts cuentan</div>
      </div>

      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : putts.length === 0 ? (
        <EmptyNote>No hay putts en este rango.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={cellBorder}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
              <tr>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2 text-right">Hoyo</th>
                <th className="px-2 py-2 text-right">Dist</th>
                <th className="px-2 py-2 text-center">Metió</th>
                <th className="px-2 py-2 text-center">Excl.</th>
              </tr>
            </thead>
            <tbody>
              {putts.map((p) => (
                <tr key={p.shot_id} className="border-t" style={{ borderColor: C.border, opacity: p.excluded ? 0.45 : 1 }}>
                  <td className="px-2 py-2" style={{ color: C.hint }}>{fmtDate(p.date)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.hole}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.distance} yd</td>
                  <td className="px-2 py-2 text-center" style={{ color: p.made ? "#34d399" : "#f87171" }}>{p.made ? "✓" : "✗"}</td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={p.excluded} disabled={busy === p.shot_id}
                      onChange={() => toggle(p)} style={{ accentColor: "#f87171", width: 18, height: 18 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: C.hint }}>Marca la casilla para excluir putts que no tienen sentido; dejan de contar en los promedios.</p>
    </div>
  );
}

function HoyosDetail({ initData, rangeKey, reloadKey, onSelectHole }: {
  initData: string;
  rangeKey: string;
  reloadKey: number;
  onSelectHole: (hole: number) => void;
}) {
  const [data, setData] = useState<HoleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getHoleStats(initData, fetchOptsFromKey(rangeKey));
        if (active) setData(d);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar hoyos");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, rangeKey, reloadKey]);

  if (loading) return <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>;
  if (error) return <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>;
  if (!data) return null;

  const cellBorder: CSSProperties = { borderColor: C.border };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<CircleDot className="h-4 w-4" />} label="Putts/ronda" value={fmt(data.avg_putts)} />
        <StatCard icon={<Target className="h-4 w-4" />} label="GIR/ronda" value={fmt(data.avg_gir)} />
        <StatCard icon={<Flag className="h-4 w-4" />} label="Fairways/ronda" value={fmt(data.avg_fairways)} />
        <StatCard icon={<Target className="h-4 w-4" />} label="Penal./ronda" value={fmt(data.avg_penalties)} />
      </div>
      <p className="text-xs" style={{ color: C.hint }}>
        Promedios sobre {data.rounds} ronda(s). GIR = green en par-2 o menos · Fairways = drives en calle (par 4/5). Toca un hoyo para ver y depurar sus jugadas.
      </p>

      <div className="overflow-hidden rounded-lg border" style={cellBorder}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
            <tr>
              <th className="px-3 py-2">Hoyo</th>
              <th className="px-3 py-2 text-right">Par</th>
              <th className="px-3 py-2 text-right">Golpes prom.</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.holes.map((h) => (
              <tr key={h.hole} className="cursor-pointer border-t" style={cellBorder} onClick={() => onSelectHole(h.hole)}>
                <td className="px-3 py-2 font-medium">{h.hole}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.hint }}>{h.par ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{h.avg_score ?? "—"}</td>
                <td className="px-2 py-2 text-right"><ChevronRight className="inline h-4 w-4" style={{ color: C.hint }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoleDetail({ initData, hole, rangeKey, onBack, onChanged }: {
  initData: string;
  hole: number;
  rangeKey: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [plays, setPlays] = useState<HolePlay[]>([]);
  const [suggested, setSuggested] = useState<{ stroke: number; club: string }[]>([]);
  const [par, setPar] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await getHoleDetail(initData, hole, fetchOptsFromKey(rangeKey));
        if (active) { setPlays(r.plays); setSuggested(r.suggested); setPar(r.par); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar el hoyo");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, hole, rangeKey]);

  const included = plays.filter((p) => !p.excluded);
  const avgStrokes = included.length ? (included.reduce((a, b) => a + b.strokes, 0) / included.length).toFixed(1) : "—";

  async function toggle(p: HolePlay) {
    const next = !p.excluded;
    setBusy(p.round_key);
    setPlays((prev) => prev.map((x) => (x.round_key === p.round_key ? { ...x, excluded: next } : x)));
    try {
      await setHoleExcluded(initData, p.round_key, hole, next);
      onChanged();
    } catch {
      setPlays((prev) => prev.map((x) => (x.round_key === p.round_key ? { ...x, excluded: !next } : x)));
    } finally { setBusy(null); }
  }

  const yn = (v: boolean | null) => (v === null ? "—" : v ? "✓" : "✗");
  const ynColor = (v: boolean | null) => (v === null ? C.hint : v ? "#34d399" : "#f87171");
  const cellBorder: CSSProperties = { borderColor: C.border };

  return (
    <div className="space-y-4" style={{ color: C.text }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Hoyos
      </button>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>Hoyo {hole}</h2>

      <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.hint }}>Golpes promedio (sin excluidas)</div>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: C.text }}>{avgStrokes}</div>
        <div className="text-xs" style={{ color: C.hint }}>{included.length} de {plays.length} jugadas cuentan</div>
      </div>

      {suggested.length > 0 && (
        <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
          <div className="text-xs" style={{ color: C.hint }}>
            Bastones sugeridos{par != null ? ` · par ${par}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {suggested.map((s, i) => (
              <span key={s.stroke} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-4 w-4" style={{ color: C.hint }} />}
                <span className="rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ background: "rgba(52,211,153,0.15)", color: C.accent, border: `1px solid ${C.accent}` }}>
                  {clubLabel(s.club)}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-1 text-xs" style={{ color: C.hint }}>Según los bastones que mejor te han funcionado aquí.</div>
        </div>
      )}

      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : plays.length === 0 ? (
        <EmptyNote>Aún no hay jugadas registradas de este hoyo.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={cellBorder}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
              <tr>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2 text-right">Golpes</th>
                <th className="px-2 py-2 text-center">Fw</th>
                <th className="px-2 py-2 text-center">GIR</th>
                <th className="px-2 py-2 text-right">Putts</th>
                <th className="px-2 py-2 text-center">Excl.</th>
              </tr>
            </thead>
            <tbody>
              {plays.map((p) => (
                <tr key={p.round_key} className="border-t" style={{ borderColor: C.border, opacity: p.excluded ? 0.45 : 1 }}>
                  <td className="px-2 py-2" style={{ color: C.hint }}>{fmtDate(p.date)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{p.strokes}</td>
                  <td className="px-2 py-2 text-center" style={{ color: ynColor(p.fairway) }}>{yn(p.fairway)}</td>
                  <td className="px-2 py-2 text-center" style={{ color: ynColor(p.gir) }}>{yn(p.gir)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{p.putts}</td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={p.excluded} disabled={busy === p.round_key}
                      onChange={() => toggle(p)} style={{ accentColor: "#f87171", width: 18, height: 18 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: C.hint }}>
        Fw = drive en calle · GIR = green en regulación. Marca la casilla para excluir una jugada mala de los promedios.
      </p>
    </div>
  );
}

function ClubShotsDetail({ initData, club, swing, onBack, onChanged }: {
  initData: string;
  club: string;
  swing: "full" | "three_quarter";
  onBack: () => void;
  onChanged: () => void;
}) {
  const [shots, setShots] = useState<ClubShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const s = await getClubShots(initData, club, swing);
        if (active) setShots(s);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar tiros");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, club, swing]);

  const included = shots.filter((s) => !s.excluded && s.actual_yards != null).map((s) => s.actual_yards as number);
  const avgIncluded = included.length ? Math.round(included.reduce((a, b) => a + b, 0) / included.length) : null;

  async function toggle(shot: ClubShot) {
    const next = !shot.excluded;
    setBusy(shot.shot_id);
    setShots((prev) => prev.map((s) => (s.shot_id === shot.shot_id ? { ...s, excluded: next } : s)));
    try {
      await setShotExcluded(initData, shot.shot_id, next);
      onChanged();
    } catch {
      setShots((prev) => prev.map((s) => (s.shot_id === shot.shot_id ? { ...s, excluded: !next } : s)));
    } finally {
      setBusy(null);
    }
  }

  const title = clubLabel(club) + (swing === "three_quarter" ? " ¾" : "");

  return (
    <div className="space-y-4" style={{ color: C.text }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Bastones
      </button>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>{title}</h2>

      <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.hint }}>Promedio real (sin excluidos)</div>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: C.text }}>{avgIncluded != null ? `${avgIncluded} yd` : "—"}</div>
        <div className="text-xs" style={{ color: C.hint }}>{included.length} de {shots.length} tiros cuentan</div>
      </div>

      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : shots.length === 0 ? (
        <EmptyNote>Aún no hay tiros con este bastón.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: C.border }}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
              <tr>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2 text-right">Hoyo</th>
                <th className="px-2 py-2 text-right">Plan</th>
                <th className="px-2 py-2 text-right">Real</th>
                <th className="px-2 py-2 text-center">Excluir</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((s) => (
                <tr key={s.shot_id} className="border-t" style={{ borderColor: C.border, opacity: s.excluded ? 0.45 : 1 }}>
                  <td className="px-2 py-2" style={{ color: C.hint }}>{fmtDate(s.completed_at)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.hole}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{fmt(s.planned_yards)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(s.actual_yards)}</td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={s.excluded} disabled={busy === s.shot_id}
                      onChange={() => toggle(s)} style={{ accentColor: "#f87171", width: 18, height: 18 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: C.hint }}>
        Marca la casilla para excluir un golpe malo: deja de contar en el promedio. Puedes reincluirlo cuando quieras.
      </p>
    </div>
  );
}

const APPROACH_BUCKETS: { key: string; min: number; max: number | null }[] = [
  { key: "0-10", min: 0, max: 10 },
  { key: "11-20", min: 11, max: 20 },
  { key: "21-30", min: 21, max: 30 },
  { key: "31-40", min: 31, max: 40 },
  { key: "41-50", min: 41, max: 50 },
  { key: "51-60", min: 51, max: 60 },
];

function ApproachModule({ initData, rangeKey }: { initData: string; rangeKey: string }) {
  const [buckets, setBuckets] = useState<ApproachBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ key: string; min: number; max: number | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const d = await getApproachStats(initData, fetchOptsFromKey(rangeKey));
        if (active) setBuckets(d);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar approach");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, rangeKey, reloadKey]);

  if (sel) {
    return (
      <ApproachListDetail
        initData={initData} min={sel.min} max={sel.max} label={sel.key} rangeKey={rangeKey}
        onBack={() => setSel(null)} onChanged={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  if (loading) return <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>;
  if (error) return <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>;
  const cellBorder: CSSProperties = { borderColor: C.border };
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border" style={cellBorder}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
            <tr>
              <th className="px-2 py-2">Dist plan (yd)</th>
              <th className="px-2 py-2 text-right">% vs plan</th>
              <th className="px-2 py-2 text-right">Prom real</th>
              <th className="px-2 py-2 text-right">Tiros</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {APPROACH_BUCKETS.map((bk) => {
              const b = byKey.get(bk.key);
              return (
                <tr key={bk.key} className="cursor-pointer border-t" style={cellBorder} onClick={() => setSel(bk)}>
                  <td className="px-2 py-2 font-medium">{bk.key}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium" style={{ color: vsPlanColor(b?.avg_vs_plan ?? null) }}>
                    {b?.avg_vs_plan != null ? `${b.avg_vs_plan}%` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{b?.avg_yards != null ? `${b.avg_yards} yd` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{b?.shots ?? 0}</td>
                  <td className="px-2 py-2 text-right"><ChevronRight className="inline h-4 w-4" style={{ color: C.hint }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: C.hint }}>
        Solo tiros de menos de 60 yardas planeadas (sin putts). &ldquo;% vs plan&rdquo; = real ÷ planeado promedio (100 = clavaste la distancia). &ldquo;Prom real&rdquo; = yardas reales promedio. Toca un rango para ver y depurar los tiros.
      </p>
    </div>
  );
}

function ApproachListDetail({ initData, min, max, label, rangeKey, onBack, onChanged }: {
  initData: string; min: number; max: number | null; label: string; rangeKey: string;
  onBack: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<ApproachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await getApproachList(initData, min, max, fetchOptsFromKey(rangeKey));
        if (active) setRows(r);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar approach");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initData, min, max, rangeKey]);

  const incl = rows.filter((p) => !p.excluded && p.vs_plan != null).map((p) => p.vs_plan as number);
  const avgVs = incl.length ? Math.round(incl.reduce((a, b) => a + b, 0) / incl.length) : null;

  async function toggle(p: ApproachRow) {
    const next = !p.excluded;
    setBusy(p.shot_id);
    setRows((prev) => prev.map((x) => (x.shot_id === p.shot_id ? { ...x, excluded: next } : x)));
    try {
      await setShotExcluded(initData, p.shot_id, next);
      onChanged();
    } catch {
      setRows((prev) => prev.map((x) => (x.shot_id === p.shot_id ? { ...x, excluded: !next } : x)));
    } finally { setBusy(null); }
  }

  const cellBorder: CSSProperties = { borderColor: C.border };
  return (
    <div className="space-y-4" style={{ color: C.text }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: C.accent }}>
        <ChevronLeft className="h-4 w-4" /> Approach
      </button>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>Approach {label} yds</h2>

      <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-xs" style={{ color: C.hint }}>% vs plan (sin excluidos)</div>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: C.text }}>{avgVs != null ? `${avgVs}%` : "—"}</div>
        <div className="text-xs" style={{ color: C.hint }}>{incl.length} de {rows.length} tiros cuentan</div>
      </div>

      {loading ? (
        <div className="p-4 text-sm" style={{ color: C.hint }}>Cargando…</div>
      ) : error ? (
        <div className="p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
      ) : rows.length === 0 ? (
        <EmptyNote>No hay approaches en este rango.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={cellBorder}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide" style={{ background: C.headerBg, color: C.hint }}>
              <tr>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2 text-right">Hoyo</th>
                <th className="px-2 py-2 text-right">Plan</th>
                <th className="px-2 py-2 text-right">Real</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-2 py-2 text-center">Excl.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.shot_id} className="border-t" style={{ borderColor: C.border, opacity: p.excluded ? 0.45 : 1 }}>
                  <td className="px-2 py-2" style={{ color: C.hint }}>{fmtDate(p.date)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.hole}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: C.hint }}>{p.planned} yd</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{p.actual != null ? `${p.actual} yd` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: vsPlanColor(p.vs_plan) }}>{p.vs_plan != null ? `${p.vs_plan}%` : "—"}</td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={p.excluded} disabled={busy === p.shot_id}
                      onChange={() => toggle(p)} style={{ accentColor: "#f87171", width: 18, height: 18 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: C.hint }}>Marca la casilla para excluir un approach malo; deja de contar en los promedios.</p>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <h3 className="mb-3 flex items-center gap-2 text-base font-semibold" style={{ color: C.text }}>{icon} {children}</h3>;
}
function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: C.hint }}>
        <span style={{ color: C.accent }}>{icon}</span>{label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: C.text }}>{value}</div>
    </div>
  );
}
function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-4 text-sm" style={{ borderColor: C.border, color: C.hint }}>{children}</div>;
}

const fmt = (v: number | null, unit = "") => (v == null ? "—" : `${v}${unit}`);
const vsPlanColor = (v: number | null) => {
  if (v == null) return C.hint;
  const diff = Math.abs(v - 100);
  if (diff <= 5) return "#34d399";
  if (diff <= 15) return "#fbbf24";
  return "#f87171";
};
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};
