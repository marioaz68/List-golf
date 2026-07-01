"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  computeFlagPosition,
  type FlagColor,
  type FlagSide,
} from "@/lib/flags/pinSheetGeometry";
import { normalizeGreenDiagram } from "@/lib/flags/greenDiagram";

interface Props {
  tg: string;
  keeperName: string;
  initialHole: number;
}

type LL = { lat: number; lon: number };
interface HoleData {
  greenCenter: LL | null;
  greenFront: LL | null;
  greenBack: LL | null;
  greenRing: LL[] | null;
  flag: {
    lat: number;
    lon: number;
    color: string | null;
    side: string | null;
    depth_yards: number | null;
    edge_yards: number | null;
    valid_until: string | null;
  } | null;
}

const COLORS: { code: FlagColor; label: string; dot: string; zona: string }[] = [
  { code: "roja", label: "Roja", dot: "#ef4444", zona: "adelante" },
  { code: "blanca", label: "Blanca", dot: "#e5e7eb", zona: "medio" },
  { code: "azul", label: "Azul", dot: "#3b82f6", zona: "atrás" },
];

const VIEW_W = 260;
const VIEW_H = 320;

export default function BanderasClient({ tg, keeperName, initialHole }: Props) {
  const [hole, setHole] = useState<number>(initialHole);
  const [data, setData] = useState<HoleData | null>(null);
  const [color, setColor] = useState<FlagColor | null>(null);
  const [side, setSide] = useState<FlagSide | null>(null);
  const [depthYards, setDepthYards] = useState<string>("");
  const [edgeYards, setEdgeYards] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const loadHole = useCallback(
    async (h: number) => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(
          `/api/captura/banderas?tg=${encodeURIComponent(tg)}&hole=${h}`,
          { cache: "no-store" }
        );
        const d = (await res.json()) as HoleData & { ok: boolean; error?: string };
        if (!d.ok) {
          setMsg(d.error || "No pude cargar el hoyo.");
          setData(null);
          return;
        }
        setData({
          greenCenter: d.greenCenter,
          greenFront: d.greenFront,
          greenBack: d.greenBack,
          greenRing: d.greenRing,
          flag: d.flag,
        });
        // Precargar con la bandera vigente si existe.
        if (d.flag) {
          setColor((d.flag.color as FlagColor) ?? null);
          setSide((d.flag.side as FlagSide) ?? null);
          setDepthYards(d.flag.depth_yards != null ? String(d.flag.depth_yards) : "");
          setEdgeYards(d.flag.edge_yards != null ? String(d.flag.edge_yards) : "");
          setValidUntil(d.flag.valid_until ?? "");
        } else {
          setColor(null);
          setSide(null);
          setDepthYards("");
          setEdgeYards("");
          setValidUntil("");
        }
      } catch {
        setMsg("Error de red al cargar el hoyo.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [tg]
  );

  useEffect(() => {
    void loadHole(hole);
  }, [hole, loadHole]);

  const depthNum = Number(depthYards);
  const edgeNum = Number(edgeYards);
  const inputsReady =
    !!color &&
    !!side &&
    Number.isFinite(depthNum) &&
    depthNum >= 0 &&
    Number.isFinite(edgeNum) &&
    edgeNum >= 0 &&
    depthYards.trim() !== "" &&
    edgeYards.trim() !== "";

  // Preview de la bandera con las yardas actuales.
  const previewFlag = useMemo(() => {
    if (!data?.greenFront || !data.greenBack || !data.greenCenter) return null;
    if (!inputsReady || !color || !side) return null;
    return computeFlagPosition(
      {
        front: data.greenFront,
        back: data.greenBack,
        center: data.greenCenter,
        ring: data.greenRing,
      },
      { color, side, depthYards: depthNum, edgeYards: edgeNum }
    );
  }, [data, inputsReady, color, side, depthNum, edgeNum]);

  const diagram = useMemo(() => {
    if (!data?.greenFront || !data.greenBack || !data.greenCenter) return null;
    const flagLL =
      previewFlag ?? (data.flag ? { lat: data.flag.lat, lon: data.flag.lon } : null);
    return normalizeGreenDiagram({
      front: data.greenFront,
      back: data.greenBack,
      center: data.greenCenter,
      ring: data.greenRing,
      flag: flagLL,
      width: VIEW_W,
      height: VIEW_H,
    });
  }, [data, previewFlag]);

  const save = useCallback(async () => {
    if (!inputsReady || !color || !side) {
      setMsg("Elige color, lado y las 2 yardas.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/captura/banderas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg,
          hole,
          color,
          side,
          depth_yards: depthNum,
          edge_yards: edgeNum,
          valid_until: validUntil || null,
        }),
      });
      const d = (await res.json()) as { ok: boolean; error?: string };
      if (d.ok) {
        setMsg(`✅ Bandera del hoyo ${hole} guardada.`);
        void loadHole(hole);
      } else {
        setMsg(d.error || "No pude guardar.");
      }
    } catch {
      setMsg("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }, [inputsReady, color, side, tg, hole, depthNum, edgeNum, validUntil, loadHole]);

  const prev = () => setHole((h) => (h <= 1 ? 18 : h - 1));
  const next = () => setHole((h) => (h >= 18 ? 1 : h + 1));

  const flagColorDot =
    COLORS.find((c) => c.code === color)?.dot ?? "#f59e0b";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-amber-200">
            🚩 Banderas — {keeperName}
          </div>
          <div className="text-[11px] text-slate-400">
            Captura por yardas · frente abajo, atrás arriba
          </div>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs">
          Salir
        </Link>
      </header>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button onClick={prev} className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold" aria-label="Hoyo anterior">‹</button>
        <div className="text-center">
          <div className="text-xs text-slate-400">Hoyo</div>
          <div className="text-2xl font-black tabular-nums">{hole}</div>
          <div className="text-[11px] text-slate-400">{data?.flag ? "Registrada" : "Sin registrar"}</div>
        </div>
        <button onClick={next} className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold" aria-label="Siguiente hoyo">›</button>
      </div>

      {/* Diagrama del green (orientación fija) */}
      <div className="flex justify-center px-3">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full max-w-[280px]" role="img" aria-label="Diagrama del green">
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#0b1220" rx="12" />
          {diagram?.ok && diagram.ringPoints ? (
            <polygon points={diagram.ringPoints} fill="#14532d" stroke="#4ade80" strokeWidth="2" />
          ) : (
            <ellipse cx={VIEW_W / 2} cy={VIEW_H / 2} rx={VIEW_W / 3} ry={VIEW_H / 3} fill="#14532d" stroke="#4ade80" strokeWidth="2" />
          )}
          {/* etiquetas frente/atrás */}
          <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="bold">FRENTE (entrada)</text>
          <text x={VIEW_W / 2} y={14} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="bold">ATRÁS</text>
          {/* bandera */}
          {diagram?.flag ? (
            <g>
              <circle cx={diagram.flag.x} cy={diagram.flag.y} r="6" fill={flagColorDot} stroke="#000" strokeWidth="1" />
              <line x1={diagram.flag.x} y1={diagram.flag.y} x2={diagram.flag.x} y2={diagram.flag.y - 16} stroke="#000" strokeWidth="1.5" />
              <polygon points={`${diagram.flag.x},${diagram.flag.y - 16} ${diagram.flag.x + 10},${diagram.flag.y - 13} ${diagram.flag.x},${diagram.flag.y - 10}`} fill={flagColorDot} />
            </g>
          ) : null}
        </svg>
      </div>

      <div className="space-y-3 px-3 py-2">
        {/* Color */}
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Color de bandera (zona)</div>
          <div className="grid grid-cols-3 gap-2">
            {COLORS.map((c) => (
              <button
                key={c.code}
                onClick={() => setColor(c.code)}
                className={[
                  "rounded-lg border px-2 py-2 text-xs font-black",
                  color === c.code ? "border-amber-400 ring-2 ring-amber-400/70" : "border-slate-700",
                ].join(" ")}
              >
                <span className="mr-1 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.dot }} />
                {c.label}
                <div className="text-[9px] font-normal text-slate-400">{c.zona}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Lado */}
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Lado (respecto al centro)</div>
          <div className="grid grid-cols-2 gap-2">
            {([["left", "Izquierda"], ["right", "Derecha"]] as const).map(([code, label]) => (
              <button
                key={code}
                onClick={() => setSide(code)}
                className={[
                  "rounded-lg border px-2 py-2 text-xs font-black",
                  side === code ? "border-amber-400 ring-2 ring-amber-400/70" : "border-slate-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Yardas */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-300">
            {color === "azul" ? "Yds desde ATRÁS" : "Yds desde el FRENTE"}
            <input
              type="number"
              inputMode="decimal"
              value={depthYards}
              onChange={(e) => setDepthYards(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-base"
              placeholder="ej. 8"
            />
          </label>
          <label className="text-xs text-slate-300">
            Yds a la orilla {side === "left" ? "izq" : side === "right" ? "der" : ""}
            <input
              type="number"
              inputMode="decimal"
              value={edgeYards}
              onChange={(e) => setEdgeYards(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-base"
              placeholder="ej. 4"
            />
          </label>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span>Válida hasta (opcional):</span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {msg && <div className="px-3 pb-1 text-center text-sm text-amber-200">{msg}</div>}
      {loading && <div className="px-3 pb-1 text-center text-xs text-slate-400">Cargando hoyo {hole}…</div>}

      <div className="border-t border-slate-800 px-3 py-3">
        <button
          onClick={save}
          disabled={saving || !inputsReady}
          className="w-full rounded-lg bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-40"
        >
          {saving ? "Guardando…" : `Guardar bandera del hoyo ${hole}`}
        </button>
      </div>
    </div>
  );
}
