"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
  type Plugin,
} from "chart.js";
import { CCQ_HOLE_PAR } from "@/lib/ghin-report/ccqCourse";
import {
  formatDateEs,
  formatDateRangeEs,
  formatRevisionHistorySub,
} from "@/lib/ghin-report/formatDateEs";
import { colorVsPar } from "@/lib/ghin-report/handicapMath";
import type { GhinLiveReportData } from "@/lib/ghin-report/types";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

const BG = "#0f1720";
const CARD = "#16202b";
const TEXT = "#e8eef6";
const MUTED = "#8fa3b8";

/** Etiquetas de valor inline (Chart.js no trae datalabels). */
const valueLabelsPlugin: Plugin = {
  id: "ghinValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      const isHorizontal = chart.options.indexAxis === "y";
      // No etiquetar la barra blanca angosta (mejores 10) ni la línea de par
      const label = String(dataset.label ?? "");
      if (label.includes("mejores 10") || label === "Par") return;
      // Series con muchos puntos: no etiquetar
      if (!isHorizontal && (dataset.data?.length ?? 0) > 24) return;

      meta.data.forEach((element, index) => {
        try {
          const raw = dataset.data[index];
          const value = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isFinite(value)) return;
          const pos = element.tooltipPosition(true);
          const x = pos.x;
          const y = pos.y;
          if (x == null || y == null) return;
          ctx.save();
          ctx.fillStyle = TEXT;
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.textAlign = isHorizontal ? "left" : "center";
          ctx.textBaseline = isHorizontal ? "middle" : "bottom";
          const text = Number.isInteger(value)
            ? String(value)
            : value.toFixed(1);
          if (isHorizontal) {
            ctx.fillText(text, x + 6, y);
          } else {
            ctx.fillText(text, x, y - 4);
          }
          ctx.restore();
        } catch {
          /* una etiqueta no tumba la gráfica */
        }
      });
    });
  },
};

Chart.register(valueLabelsPlugin);

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return n.toFixed(digits);
}

function deltaClass(d: number | null): string {
  if (d == null || d === 0) return "text-[#8fa3b8]";
  if (d < 0) return "text-[#2ecc71]";
  return "text-[#e74c3c]";
}

function deltaText(d: number | null): string {
  if (d == null) return "—";
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : String(d);
}

const EMPTY_CHART_MSG = "Sin datos suficientes para esta gráfica";

function asFinite(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function finiteList(vals: unknown[]): number[] | null {
  if (!vals.length) return null;
  const out: number[] = [];
  for (const v of vals) {
    const n = asFinite(v);
    if (n == null) return null;
    out.push(n);
  }
  return out;
}

class ChartSectionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error) {
    console.error("[ghin-report] section", err);
  }

  render() {
    if (this.state.failed) {
      return <p className="text-sm text-slate-400">{EMPTY_CHART_MSG}</p>;
    }
    return this.props.children;
  }
}

function yBounds(
  vals: number[],
  padFloor: number
): { min: number; max: number } | null {
  const nums = finiteList(vals);
  if (!nums) return null;
  const lo0 = Math.min(...nums);
  const hi0 = Math.max(...nums);
  if (!Number.isFinite(lo0) || !Number.isFinite(hi0)) return null;
  const pad = Math.max(padFloor, (hi0 - lo0) * 0.25);
  const min = Math.floor((lo0 - pad) * 2) / 2;
  const max = Math.ceil((hi0 + pad) * 2) / 2;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function mountChart(
  canvas: HTMLCanvasElement | null,
  cfg: ChartConfiguration | null,
  bag: Chart[]
): boolean {
  if (!canvas || !cfg) return false;
  try {
    bag.push(new Chart(canvas, cfg));
    return true;
  } catch (err) {
    console.error("[ghin-report] Chart.js", err);
    return false;
  }
}

type Props = { data: GhinLiveReportData };

export default function GhinLiveReport({ data }: Props) {
  const scenariosRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<HTMLCanvasElement | null>(null);
  const grossRef = useRef<HTMLCanvasElement | null>(null);
  const netRef = useRef<HTMLCanvasElement | null>(null);

  const charts = useRef<Chart[]>([]);
  const [chartFail, setChartFail] = useState<Record<string, boolean>>({});

  const hiRef = data.hiTorneo;

  const scenarioChartData = useMemo(() => {
    const rows = data.scenarios.filter(
      (s) => s.index != null && Number.isFinite(s.index)
    );
    return {
      labels: rows.map((s) => {
        const hp = s.hp != null ? ` / HP ${s.hp}` : "";
        const hist = s.esHistorico ? " ★" : "";
        return `${s.label}${hist}: ${fmt(s.index)}${hp}`;
      }),
      values: rows.map((s) => s.index as number),
      colors: rows.map((s) => s.color),
      historico: rows.map((s) => s.esHistorico),
    };
  }, [data.scenarios]);

  const scenarioVals = finiteList(scenarioChartData.values);
  const historyVals = finiteList(data.monthlyHi.map((p) => p.hi));
  const grossAvgs = finiteList(data.holes.map((h) => h.promedio));
  const grossBest = finiteList(data.holes.map((h) => h.promedio_mejores10));
  const netAvgs = finiteList(data.netAvgs);
  const netBest = finiteList(data.netBest10);

  const canScenarios = Boolean(scenarioVals);
  const canHistory = Boolean(historyVals && historyVals.length >= 1);
  const canGross = Boolean(grossAvgs && grossBest);
  const canNet = Boolean(canGross && netAvgs && netBest);

  useEffect(() => {
    charts.current.forEach((c) => c.destroy());
    charts.current = [];

    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      color: TEXT,
      font: { family: "system-ui, sans-serif" },
    };

    const failed: Record<string, boolean> = {};

    const trySection = (key: string, fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.error(`[ghin-report] ${key}`, err);
        failed[key] = true;
      }
    };

    // 1. Escenarios horizontales
    trySection("scenarios", () => {
    if (scenariosRef.current && canScenarios) {
      const vals = scenarioChartData.values;
      const boundVals =
        hiRef != null && Number.isFinite(hiRef) ? [...vals, hiRef] : vals;
      const bounds = yBounds(boundVals, 0.8);
      if (!bounds) {
        failed.scenarios = true;
      } else {
        const cfg: ChartConfiguration<"bar"> = {
          type: "bar",
          data: {
            labels: scenarioChartData.labels,
            datasets: [
              {
                data: vals,
                backgroundColor: scenarioChartData.colors.map((c, i) =>
                  scenarioChartData.historico[i] ? `${c}99` : c
                ),
                borderColor: scenarioChartData.historico.map((h, i) =>
                  h ? "#f5a623" : scenarioChartData.colors[i]!
                ),
                borderWidth: scenarioChartData.historico.map((h) => (h ? 2 : 0)),
                borderSkipped: false,
                barThickness: 22,
              },
            ],
          },
          options: {
            ...commonOpts,
            indexAxis: "y",
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `Índice ${fmt(Number(ctx.raw))}`,
                },
              },
            },
            scales: {
              x: {
                min: bounds.min,
                max: bounds.max,
                grid: { color: "#243041" },
                ticks: { color: MUTED },
              },
              y: {
                grid: { display: false },
                ticks: { color: TEXT, font: { size: 11 } },
              },
            },
          },
          plugins: [
            {
              id: "hiTorneoLine",
              afterDraw(chart) {
                if (hiRef == null || !Number.isFinite(hiRef)) return;
                const x = chart.scales.x.getPixelForValue(hiRef);
                if (!Number.isFinite(x)) return;
                const { top, bottom } = chart.chartArea;
                const ctx = chart.ctx;
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = "#f0932b";
                ctx.lineWidth = 1.5;
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.stroke();
                ctx.restore();
              },
            },
          ],
        };
        if (!mountChart(scenariosRef.current, cfg, charts.current)) {
          failed.scenarios = true;
        }
      }
    }
    });

    // 2. Historial HI — una revisión = un punto (sin agrupar por mes)
    trySection("history", () => {
    if (historyRef.current && canHistory) {
      const his = data.monthlyHi;
      const vals = his.map((p) => p.hi);
      const bounds = yBounds(vals, 0.5);
      if (!bounds) {
        failed.history = true;
      } else {
        const n = vals.length;
        const cfg: ChartConfiguration<"line"> = {
          type: "line",
          data: {
            labels: his.map((p) => p.label),
            datasets: [
              {
                data: vals,
                borderColor: "#4a9eff",
                backgroundColor: "rgba(74,158,255,0.15)",
                fill: true,
                tension: 0.2,
                pointRadius: n > 40 ? 2.5 : 3.5,
                pointHoverRadius: 6,
                pointBackgroundColor: "#4a9eff",
              },
            ],
          },
          options: {
            ...commonOpts,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const i = items[0]?.dataIndex ?? 0;
                    const d = his[i]?.date;
                    return d ? (formatDateEs(d) ?? d) : "";
                  },
                  label: (ctx) => `HI ${fmt(Number(ctx.raw))}`,
                },
              },
            },
            scales: {
              y: {
                min: bounds.min,
                max: bounds.max,
                grid: { color: "#243041" },
                ticks: { color: MUTED },
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: MUTED,
                  font: { size: 10 },
                  maxRotation: 50,
                  minRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 12,
                },
              },
            },
          },
          plugins: [
            {
              id: "historyExtremaLabels",
              afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                if (!vals.length || !meta.data.length) return;
                let iMax = 0;
                let iMin = 0;
                for (let i = 1; i < vals.length; i++) {
                  if (vals[i]! > vals[iMax]!) iMax = i;
                  if (vals[i]! < vals[iMin]!) iMin = i;
                }
                const { ctx } = chart;
                for (const i of new Set([iMax, iMin])) {
                  const el = meta.data[i];
                  const v = vals[i];
                  if (!el || v == null || !Number.isFinite(v)) continue;
                  const pos = el.tooltipPosition(true);
                  const x = pos.x;
                  const y = pos.y;
                  if (x == null || y == null) continue;
                  ctx.save();
                  ctx.fillStyle = TEXT;
                  ctx.font = "600 11px system-ui, sans-serif";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "bottom";
                  ctx.fillText(v.toFixed(1), x, y - 4);
                  ctx.restore();
                }
              },
            },
          ],
        };
        if (!mountChart(historyRef.current, cfg, charts.current)) {
          failed.history = true;
        }
      }
    }
    });

    // 3. Bruto por hoyo
    trySection("gross", () => {
    if (grossRef.current && canGross) {
      const holes = data.holes;
      const pars = holes.map((h) => CCQ_HOLE_PAR[h.hoyo - 1] ?? 4);
      const avgs = holes.map((h) => h.promedio) as number[];
      const best10 = holes.map((h) => h.promedio_mejores10) as number[];
      const yMax = Math.ceil(Math.max(...avgs, ...pars) + 0.5);
      if (!Number.isFinite(yMax) || yMax <= 2) {
        failed.gross = true;
      } else {
        const cfg: ChartConfiguration = {
          type: "bar",
          data: {
            labels: holes.map((h) => `H${h.hoyo}`),
            datasets: [
              {
                label: "Promedio",
                data: avgs,
                backgroundColor: holes.map((h, i) =>
                  colorVsPar(h.promedio as number, pars[i]!)
                ),
                barPercentage: 0.9,
                order: 2,
              },
              {
                label: "mejores 10",
                data: best10,
                backgroundColor: "#ffffff",
                barPercentage: 0.42,
                order: 1,
              },
              {
                type: "line",
                label: "Par",
                data: pars,
                borderColor: "#000000",
                backgroundColor: "#000000",
                pointRadius: 5,
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                showLine: true,
                order: 0,
              },
            ],
          },
          options: {
            ...commonOpts,
            datasets: {
              bar: { grouped: false },
            },
            plugins: {
              legend: {
                labels: { color: MUTED, boxWidth: 12 },
              },
            },
            scales: {
              y: {
                min: 2,
                max: yMax,
                grid: { color: "#243041" },
                ticks: { color: MUTED },
              },
              x: {
                grid: { display: false },
                ticks: { color: MUTED, font: { size: 10 } },
              },
            },
          },
        };
        if (!mountChart(grossRef.current, cfg, charts.current)) {
          failed.gross = true;
        }
      }
    }
    });

    // 4. Neto por hoyo
    trySection("net", () => {
    if (netRef.current && canNet) {
      const holes = data.holes;
      const pars = holes.map((h) => CCQ_HOLE_PAR[h.hoyo - 1] ?? 4);
      const labels = holes.map((h, i) => {
        const s = data.strokesByHole[i] ?? 0;
        const par = pars[i]!;
        return s > 0
          ? `Hoyo ${h.hoyo} (Par ${par}) (-${s})`
          : `Hoyo ${h.hoyo} (Par ${par})`;
      });
      const avgs = data.netAvgs;
      const best10 = data.netBest10;
      const yMax = Math.ceil(Math.max(...avgs, ...pars) + 0.5);
      if (!Number.isFinite(yMax) || yMax <= 2) {
        failed.net = true;
      } else {
        const cfg: ChartConfiguration = {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Neto",
                data: avgs,
                backgroundColor: avgs.map((a, i) => colorVsPar(a, pars[i]!)),
                barPercentage: 0.9,
                order: 2,
              },
              {
                label: "mejores 10",
                data: best10,
                backgroundColor: "#ffffff",
                barPercentage: 0.42,
                order: 1,
              },
              {
                type: "line",
                label: "Par",
                data: pars,
                borderColor: "#000000",
                backgroundColor: "#000000",
                pointRadius: 5,
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                showLine: true,
                order: 0,
              },
            ],
          },
          options: {
            ...commonOpts,
            datasets: {
              bar: { grouped: false },
            },
            plugins: {
              legend: {
                labels: { color: MUTED, boxWidth: 12 },
              },
            },
            scales: {
              y: {
                min: 2,
                max: yMax,
                grid: { color: "#243041" },
                ticks: { color: MUTED },
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: MUTED,
                  font: { size: 9 },
                  maxRotation: 60,
                  minRotation: 40,
                },
              },
            },
          },
        };
        if (!mountChart(netRef.current, cfg, charts.current)) {
          failed.net = true;
        }
      }
    }
    });

    setChartFail(failed);

    return () => {
      charts.current.forEach((c) => c.destroy());
      charts.current = [];
    };
  }, [data, scenarioChartData, hiRef, canScenarios, canHistory, canGross, canNet]);

  const verdictStyles: Record<string, string> = {
    normal: "border-[#2ecc71] bg-[#2ecc71]/15 text-[#2ecc71]",
    revisar: "border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]",
    sin_datos: "border-[#8fa3b8] bg-[#8fa3b8]/15 text-[#8fa3b8]",
  };
  const verdictLabel =
    data.verdict === "normal"
      ? "Normal"
      : data.verdict === "revisar"
        ? "Revisar"
        : "Sin datos suficientes";

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4"
      style={{
        background: BG,
        color: TEXT,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {(data.anyHistorico ||
        data.provisional ||
        data.minIndexFallbackUsed ||
        data.caps.evaluability !== "full") && (
        <div className="mb-3 space-y-2">
          {data.anyHistorico ? (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-200">
              Dato histórico: el cálculo usó rondas de años anteriores porque
              el año en curso no alcanzó el mínimo. El comité decide; no se
              silencia la señal.
            </div>
          ) : null}
          {data.provisional ? (
            <div className="rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
              Socio no inscrito en este torneo — CH/HP provisionales (tee{" "}
              {data.teeCode}, corte índice {TEE_NOTE}).
            </div>
          ) : null}
          {data.minIndexFallbackUsed ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
              <span className="font-semibold">HI provisional:</span>{" "}
              f_ghin_min_index no devolvió valor en la ventana del torneo; se
              muestra players.handicap_index. No es Low HI con respaldo de 365
              días.
            </div>
          ) : null}
          {data.caps.evaluability === "not_evaluable" && data.caps.note ? (
            <div className="rounded-lg border-2 border-rose-400 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100">
              {data.caps.note}
            </div>
          ) : null}
          {data.caps.evaluability === "partial" && data.caps.note ? (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-100">
              {data.caps.note}
            </div>
          ) : null}
        </div>
      )}

      <div
        className={`mb-3 rounded-lg border-2 px-3 py-2 text-sm font-bold ${verdictStyles[data.verdict]}`}
      >
        Veredicto: {verdictLabel}
        {data.verdictNote ? (
          <span className="mt-0.5 block text-xs font-medium opacity-90">
            {data.verdictNote}
          </span>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="HI del torneo"
          value={fmt(data.hiTorneo)}
          color="#f0932b"
          sub={data.minIndexFallbackUsed ? "provisional" : undefined}
        />
        <Kpi
          label="HI oficial WHS"
          value={fmt(data.hiWhsOfficial)}
          color="#2ecc71"
          sub="mejores 8 / 20"
        />
        <Kpi
          label="Mejores 10 del año"
          value={fmt(data.hiBest10Year)}
          color="#e74c3c"
          sub={data.hiBest10Historico ? "histórico" : undefined}
        />
        <Kpi
          label="HI solo torneos"
          value={
            data.hiSoloTorneosNd
              ? `n/d (n=${data.hiSoloTorneosN})`
              : fmt(data.hiSoloTorneos)
          }
          color="#8fa3b8"
        />
        <Kpi
          label="CH 100 %"
          value={data.ch100 != null ? String(data.ch100) : "n/d"}
          color="#4a9eff"
          sub={data.provisional ? "provisional" : data.teeCode}
        />
        <Kpi
          label="HP 80 %"
          value={data.hp80 != null ? String(data.hp80) : "n/d"}
          color="#a29bfe"
          sub={data.provisional ? "provisional" : undefined}
        />
      </div>

      {/* Low HI + Soft/Hard: fuera del promedio si no evaluable */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Kpi
          label="Low HI (365 d)"
          value={
            data.caps.lowHiDisplay != null
              ? fmt(data.caps.lowHiDisplay)
              : "n/d"
          }
          color="#f0932b"
          sub={
            data.caps.lowHiProvisional
              ? "provisional — sin histórico"
              : data.caps.evaluability === "partial"
                ? `parcial · ${data.caps.historyDaysAvailable} d`
                : `${data.caps.historyDaysAvailable} d`
          }
        />
        {data.caps.evaluability === "not_evaluable" ? (
          <div
            className="rounded-lg border-2 border-rose-400/60 px-2.5 py-2 sm:col-span-2"
            style={{ background: CARD }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">
              Soft / Hard Cap
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-rose-100">
              {data.caps.note ??
                `Sin histórico suficiente de índice — soft/hard cap no evaluable (se requieren 365 días, disponibles ${data.caps.historyDaysAvailable})`}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Excluido de conteos y promedios de soft/hard cap.
            </p>
          </div>
        ) : (
          <>
            <Kpi
              label="Soft Cap (+3)"
              value={fmt(data.caps.softCap)}
              color="#f5a623"
              sub={
                data.caps.evaluability === "partial"
                  ? "ventana parcial — no definitivo"
                  : "Low HI + 3.0"
              }
            />
            <Kpi
              label="Hard Cap (+5)"
              value={fmt(data.caps.hardCap)}
              color="#e74c3c"
              sub={
                data.caps.evaluability === "partial"
                  ? "ventana parcial — no definitivo"
                  : "Low HI + 5.0"
              }
            />
          </>
        )}
      </div>

      {data.activity ? (
        <p className="mb-3 text-xs text-slate-400">
          {data.activity.rondasAnio} rondas este año ·{" "}
          {data.activity.rondas3Anios} en 3 años ·{" "}
          {data.activity.rondasTotal} totales
          {data.tournamentName ? ` · ${data.tournamentName}` : ""}
        </p>
      ) : null}

      {(data.dataCutoffs.revisions || data.dataCutoffs.rounds) && (
        <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100">
          <span className="font-semibold">Cortes de datos (no unificar):</span>
          {data.dataCutoffs.revisions
            ? ` revisiones HI al ${formatDateEs(data.dataCutoffs.revisions)}`
            : ""}
          {data.dataCutoffs.revisions && data.dataCutoffs.rounds ? " ·" : ""}
          {data.dataCutoffs.rounds
            ? ` rondas de este jugador al ${formatDateEs(data.dataCutoffs.rounds)}`
            : ""}
          . El historial de índice y las rondas pueden desfasarse.
        </p>
      )}

      <Section title="1. Escenarios de índice">
        <ChartSectionBoundary>
        {canScenarios && !chartFail.scenarios ? (
          <div className="relative h-[320px] w-full">
            <canvas ref={scenariosRef} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">{EMPTY_CHART_MSG}</p>
        )}
        </ChartSectionBoundary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-1.5 pr-2 font-semibold">Escenario</th>
                <th className="py-1.5 pr-2 font-semibold">Rondas</th>
                <th className="py-1.5 pr-2 font-semibold">Índice</th>
                <th className="py-1.5 pr-2 font-semibold">CH 100 %</th>
                <th className="py-1.5 pr-2 font-semibold">HP 80 %</th>
                <th className="py-1.5 pr-2 font-semibold">Δ HI</th>
                <th className="py-1.5 font-semibold">Δ HP</th>
              </tr>
            </thead>
            <tbody>
              {data.scenarioTable.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-white/5"
                  style={{
                    opacity: row.esHistorico ? 0.95 : 1,
                    boxShadow: row.esHistorico
                      ? "inset 3px 0 0 #f5a623"
                      : undefined,
                  }}
                >
                  <td className="py-1.5 pr-2 font-medium">
                    {row.label}
                    {row.esHistorico ? (
                      <span className="ml-1 text-[10px] text-amber-300">
                        histórico
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-300">
                    {row.nUsed != null && row.nUniverse != null
                      ? `${row.nUsed} de ${row.nUniverse}`
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-2">{fmt(row.index)}</td>
                  <td className="py-1.5 pr-2">
                    {row.ch != null ? row.ch : "—"}
                  </td>
                  <td className="py-1.5 pr-2 font-semibold">
                    {row.hp != null ? row.hp : "—"}
                  </td>
                  <td className={`py-1.5 pr-2 font-semibold ${deltaClass(row.deltaHi)}`}>
                    {deltaText(row.deltaHi)}
                  </td>
                  <td className={`py-1.5 font-semibold ${deltaClass(row.deltaHp)}`}>
                    {deltaText(row.deltaHp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="2. Historial de HI"
        sub={
          data.monthlyHi.length
            ? formatRevisionHistorySub(
                data.monthlyHi[0]!.date,
                data.monthlyHi[data.monthlyHi.length - 1]!.date,
                data.monthlyHi.length
              )
            : "Sin revisiones de índice (tabla desde 2026-05-01)"
        }
      >
        <ChartSectionBoundary>
        {canHistory && !chartFail.history ? (
          <div className="relative h-[280px] w-full">
            <canvas ref={historyRef} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {data.monthlyHi.length
              ? EMPTY_CHART_MSG
              : "Sin revisiones de índice en el periodo (tabla desde 2026-05-01)."}
          </p>
        )}
        </ChartSectionBoundary>
      </Section>

      <Section
        title="3. Promedio bruto por hoyo"
        sub={
          data.holes[0]
            ? [
                data.holesHistorico ? "Histórico" : null,
                formatDateRangeEs(data.holes[0].desde, data.holes[0].hasta),
                `${data.holes[0].n_rondas} rondas`,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      >
        <ChartSectionBoundary>
        {canGross && !chartFail.gross ? (
          <div className="relative h-[280px] w-full overflow-x-auto">
            <div className="relative h-full min-w-[700px]">
              <canvas ref={grossRef} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {data.holes.length ? EMPTY_CHART_MSG : "Sin rondas para promedios."}
          </p>
        )}
        </ChartSectionBoundary>
      </Section>

      <Section
        title="4. Promedio neto por hoyo"
        sub={
          data.hp80 != null
            ? `Descontando HP ${data.hp80} · tee ${data.teeCode}`
            : undefined
        }
      >
        <ChartSectionBoundary>
        {canNet && !chartFail.net ? (
          <div className="relative h-[300px] w-full overflow-x-auto">
            <div className="relative h-full min-w-[900px]">
              <canvas ref={netRef} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {data.holes.length ? EMPTY_CHART_MSG : "Sin rondas para promedios."}
          </p>
        )}
        </ChartSectionBoundary>
      </Section>
    </div>
  );
}

const TEE_NOTE = "6.9 / 7.0";

function Kpi({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg border border-white/5 px-2.5 py-2"
      style={{ background: CARD }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-4 rounded-xl border border-white/5 p-3"
      style={{ background: CARD }}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {sub ? <span className="text-[11px] text-slate-400">{sub}</span> : null}
      </div>
      {children}
    </section>
  );
}
