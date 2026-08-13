"use client";

import { useEffect, useMemo, useRef } from "react";
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
import { formatDateEs } from "@/lib/ghin-report/formatDateEs";
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
        const raw = dataset.data[index];
        const value = typeof raw === "number" ? raw : null;
        if (value == null || !Number.isFinite(value)) return;
        const pos = element.tooltipPosition(true);
        const x = pos.x;
        const y = pos.y;
        if (x == null || y == null) return;
        ctx.save();
        ctx.fillStyle = TEXT;
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.textAlign = isHorizontal ? "left" : "center";
        ctx.textBaseline = isHorizontal ? "middle" : "bottom";
        const text =
          Number.isInteger(value) ? String(value) : value.toFixed(1);
        if (isHorizontal) {
          ctx.fillText(text, x + 6, y);
        } else {
          ctx.fillText(text, x, y - 4);
        }
        ctx.restore();
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

type Props = { data: GhinLiveReportData };

export default function GhinLiveReport({ data }: Props) {
  const scenariosRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<HTMLCanvasElement | null>(null);
  const grossRef = useRef<HTMLCanvasElement | null>(null);
  const netRef = useRef<HTMLCanvasElement | null>(null);

  const charts = useRef<Chart[]>([]);

  const hiRef = data.hiTorneo;

  const scenarioChartData = useMemo(() => {
    const rows = data.scenarios.filter((s) => s.index != null);
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

  useEffect(() => {
    charts.current.forEach((c) => c.destroy());
    charts.current = [];

    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      color: TEXT,
      font: { family: "system-ui, sans-serif" },
    };

    // 1. Escenarios horizontales
    if (scenariosRef.current && scenarioChartData.values.length) {
      const vals = scenarioChartData.values;
      const min = Math.min(...vals, hiRef ?? vals[0]!);
      const max = Math.max(...vals, hiRef ?? vals[0]!);
      const pad = Math.max(0.8, (max - min) * 0.25);
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
              min: Math.floor((min - pad) * 2) / 2,
              max: Math.ceil((max + pad) * 2) / 2,
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
              if (hiRef == null) return;
              const x = chart.scales.x.getPixelForValue(hiRef);
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
      charts.current.push(new Chart(scenariosRef.current, cfg));
    }

    // 2. Historial HI
    if (historyRef.current && data.monthlyHi.length) {
      const his = data.monthlyHi;
      const vals = his.map((p) => p.hi);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const pad = Math.max(0.5, (max - min) * 0.3);
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
              tension: 0.25,
              pointRadius: 4,
              pointBackgroundColor: "#4a9eff",
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              min: Math.floor((min - pad) * 2) / 2,
              max: Math.ceil((max + pad) * 2) / 2,
              grid: { color: "#243041" },
              ticks: { color: MUTED },
            },
            x: {
              grid: { display: false },
              ticks: { color: MUTED },
            },
          },
        },
      };
      charts.current.push(new Chart(historyRef.current, cfg));
    }

    // 3. Bruto por hoyo
    if (grossRef.current && data.holes.length) {
      const holes = data.holes;
      const pars = holes.map((h) => CCQ_HOLE_PAR[h.hoyo - 1] ?? 4);
      const avgs = holes.map((h) => h.promedio);
      const best10 = holes.map((h) => h.promedio_mejores10);
      const colors = holes.map((h, i) => colorVsPar(h.promedio, pars[i]!));
      const yMax = Math.ceil(Math.max(...avgs, ...pars) + 0.5);
      const cfg: ChartConfiguration = {
        type: "bar",
        data: {
          labels: holes.map((h) => `H${h.hoyo}`),
          datasets: [
            {
              label: "Promedio",
              data: avgs,
              backgroundColor: colors,
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
      charts.current.push(new Chart(grossRef.current, cfg));
    }

    // 4. Neto por hoyo
    if (netRef.current && data.holes.length) {
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
      const colors = avgs.map((a, i) => colorVsPar(a, pars[i]!));
      const yMax = Math.ceil(Math.max(...avgs, ...pars) + 0.5);
      const cfg: ChartConfiguration = {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Neto",
              data: avgs,
              backgroundColor: colors,
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
      charts.current.push(new Chart(netRef.current, cfg));
    }

    return () => {
      charts.current.forEach((c) => c.destroy());
      charts.current = [];
    };
  }, [data, scenarioChartData, hiRef]);

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
      className="min-h-full overflow-y-auto px-3 py-3 sm:px-4"
      style={{ background: BG, color: TEXT }}
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
        <div className="relative h-[320px] w-full">
          <canvas ref={scenariosRef} />
        </div>
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
          data.dataCutoffs.revisions
            ? `Últimos 12 meses hasta ${formatDateEs(data.dataCutoffs.revisions)}`
            : "Sin corte de revisiones"
        }
      >
        {data.monthlyHi.length ? (
          <div className="relative h-[260px] w-full">
            <canvas ref={historyRef} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Sin revisiones de índice en el periodo (tabla desde 2026-05-01).
          </p>
        )}
      </Section>

      <Section
        title="3. Promedio bruto por hoyo"
        sub={
          data.holesHistorico
            ? `Histórico · ${data.holesPeriod ?? ""}`
            : data.holes[0]
              ? `${data.holes[0].n_rondas} rondas`
              : undefined
        }
      >
        {data.holes.length ? (
          <div className="relative h-[280px] w-full overflow-x-auto">
            <div className="relative h-full min-w-[700px]">
              <canvas ref={grossRef} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin rondas para promedios.</p>
        )}
      </Section>

      <Section
        title="4. Promedio neto por hoyo"
        sub={
          data.hp80 != null
            ? `Descontando HP ${data.hp80} · tee ${data.teeCode}`
            : undefined
        }
      >
        {data.holes.length ? (
          <div className="relative h-[300px] w-full overflow-x-auto">
            <div className="relative h-full min-w-[900px]">
              <canvas ref={netRef} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin rondas para promedios.</p>
        )}
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
