"use client";

import { useMemo, useState } from "react";
import type {
  PrintableMatchPlayCard,
  PrintableScorecardsBundle,
  PrintableStrokeCard,
} from "@/lib/matchplay/loadPrintableMpScorecards";
import { ScorecardPrintPages } from "./ScorecardPrintSheets";

type CardKind = "all" | "main" | "consolation_mp" | "stroke_aggregate";

type Props = {
  bundle: PrintableScorecardsBundle;
};

function kindLabel(kind: PrintableMatchPlayCard["kind"] | "stroke") {
  if (kind === "main") return "Cuadro principal";
  if (kind === "consolation_mp") return "Consolación MP";
  return "Consolación Stroke Play";
}

export default function PrintableScorecardsClient({ bundle }: Props) {
  const [roundFilter, setRoundFilter] = useState<number | "all">("all");
  const [kindFilter, setKindFilter] = useState<CardKind>("all");
  const [selected, setSelected] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const c of bundle.matchPlayCards) ids.add(c.cardId);
    for (const c of bundle.strokeCards) ids.add(c.cardId);
    return ids;
  });

  const filteredMp = useMemo(() => {
    return bundle.matchPlayCards.filter((c) => {
      if (roundFilter !== "all" && c.roundNo !== roundFilter) return false;
      if (kindFilter === "stroke_aggregate") return false;
      if (kindFilter === "main" && c.kind !== "main") return false;
      if (kindFilter === "consolation_mp" && c.kind !== "consolation_mp")
        return false;
      return true;
    });
  }, [bundle.matchPlayCards, roundFilter, kindFilter]);

  const filteredStroke = useMemo(() => {
    if (kindFilter !== "all" && kindFilter !== "stroke_aggregate") return [];
    return bundle.strokeCards.filter((c) => {
      if (roundFilter !== "all" && c.roundNo !== roundFilter) return false;
      return true;
    });
  }, [bundle.strokeCards, roundFilter, kindFilter]);

  const allFiltered = useMemo(
    () => [...filteredMp, ...filteredStroke],
    [filteredMp, filteredStroke]
  );

  const printItems = useMemo(() => {
    const items: Array<
      | { type: "mp"; card: PrintableMatchPlayCard }
      | { type: "stroke"; card: PrintableStrokeCard }
    > = [];
    for (const c of filteredMp) {
      if (selected.has(c.cardId)) items.push({ type: "mp", card: c });
    }
    for (const c of filteredStroke) {
      if (selected.has(c.cardId)) items.push({ type: "stroke", card: c });
    }
    return items;
  }, [filteredMp, filteredStroke, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(allFiltered.map((c) => c.cardId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (!bundle.ok) {
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
        {bundle.message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden rounded-xl border border-white/10 bg-[#0c1728] p-4">
        <p className="text-[12px] text-slate-300">{bundle.message}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Formato: A4 horizontal, 2 tarjetas por hoja (mitad superior/inferior) ·
          campos en blanco para anotar a mano · HI/PH/tees preimpresos
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-slate-300">
            Ronda
            <select
              className="mt-1 block rounded border border-white/20 bg-[#0a1220] px-2 py-1.5 text-sm text-white"
              value={roundFilter === "all" ? "all" : String(roundFilter)}
              onChange={(e) =>
                setRoundFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
            >
              <option value="all">Todas</option>
              {bundle.roundNos.map((r) => (
                <option key={r} value={r}>
                  R{r}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-slate-300">
            Tipo
            <select
              className="mt-1 block rounded border border-white/20 bg-[#0a1220] px-2 py-1.5 text-sm text-white"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as CardKind)}
            >
              <option value="all">Todos</option>
              <option value="main">Cuadro principal</option>
              <option value="consolation_mp">Consolación MP</option>
              <option value="stroke_aggregate">Stroke agregado</option>
            </select>
          </label>

          <button
            type="button"
            onClick={selectAllVisible}
            className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/10"
          >
            Seleccionar visibles
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-white/10"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={printItems.length === 0}
            className="ml-auto rounded bg-cyan-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-cyan-500 disabled:opacity-40"
          >
            Imprimir ({printItems.length})
          </button>
        </div>
      </div>

      <div className="print:hidden space-y-2">
        {allFiltered.length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay tarjetas para los filtros seleccionados.
          </p>
        ) : (
          allFiltered.map((card) => {
            const isMp = "topLabel" in card;
            const id = card.cardId;
            const checked = selected.has(id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-[#0c1728] px-3 py-2 hover:border-cyan-500/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(id)}
                  className="h-4 w-4"
                />
                <div className="min-w-0 flex-1 text-[12px] text-slate-200">
                  {isMp ? (
                    <>
                      <span className="font-bold text-cyan-200">
                        {kindLabel((card as PrintableMatchPlayCard).kind)} · R
                        {(card as PrintableMatchPlayCard).roundNo} ·{" "}
                        {(card as PrintableMatchPlayCard).roundLabel}
                      </span>
                      <span className="text-slate-400">
                        {" "}
                        — G{(card as PrintableMatchPlayCard).groupNo} ·{" "}
                        {(card as PrintableMatchPlayCard).topLabel} vs{" "}
                        {(card as PrintableMatchPlayCard).bottomLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-emerald-200">
                        Consolación Stroke Play · R
                        {(card as PrintableStrokeCard).roundNo} · G
                        {(card as PrintableStrokeCard).groupNo}
                      </span>
                      <span className="text-slate-400">
                        {" "}
                        — {(card as PrintableStrokeCard).groupLabel} ·{" "}
                        {(card as PrintableStrokeCard).players.length} jugadores
                      </span>
                    </>
                  )}
                </div>
                {(card as { teeTime?: string | null }).teeTime ? (
                  <span className="text-[11px] text-amber-200">
                    {(card as { teeTime: string }).teeTime}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      {printItems.length > 0 ? (
        <ScorecardPrintPages meta={bundle} items={printItems} />
      ) : null}
    </div>
  );
}
