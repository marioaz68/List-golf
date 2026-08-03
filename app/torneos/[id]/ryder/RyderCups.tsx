"use client";

import { useState } from "react";
import type {
  RyderPublicData,
  RyderCup,
  RyderMatch,
  RyderSession,
} from "@/lib/ryder/loadRyderPublic";
import RyderMatchDetail from "./RyderMatchDetail";

/* Socios en blanco y Caddies en ambar: el color guardado de Socios (#0B3D2E)
   es casi el fondo del sitio (#065f46) y seria invisible. */
const HOME = { bg: "bg-white", fg: "text-emerald-950", tx: "text-white" };
const AWAY = { bg: "bg-amber-400", fg: "text-amber-950", tx: "text-amber-300" };

function pts(n: number | null): string {
  if (n === null) return "–";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function ventajaTxt(pct: number | null): string {
  if (pct === null) return "ventaja del torneo";
  if (pct === 0) return "scratch";
  return `${pct}%`;
}

function hora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

function formatoTxt(f: string): string {
  if (f === "low_high") return "Parejas · bola baja y bola alta";
  if (f === "singles") return "Individual";
  return f;
}

/* ------------------------------------------------------------- marcador --- */

function Scoreboard({ cup }: { cup: RyderCup }) {
  const home = cup.equipos.find((e) => e.side === "home");
  const away = cup.equipos.find((e) => e.side === "away");
  if (!home || !away) return null;

  const total = cup.puntos_totales || 1;

  return (
    <section className="rounded-xl border border-emerald-600/40 bg-emerald-900/60 p-4 sm:p-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-3 w-4 rounded-sm ${HOME.bg}`} />
            <span className="text-xs font-medium text-emerald-50">{home.equipo}</span>
          </div>
          <div className="mt-1 text-5xl font-bold leading-none text-white tabular-nums">
            {pts(home.puntos)}
          </div>
        </div>

        <div className="text-center">
          <div className="text-lg font-bold text-white tabular-nums">
            {pts(cup.puntos_para_ganar)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-200/70">
            para ganar
          </div>
          <div className="mt-2 text-[10px] text-emerald-200/60 tabular-nums">
            {cup.partidos_cerrados}/{cup.partidos_totales}
            <br />
            cerrados
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs font-medium text-emerald-50">{away.equipo}</span>
            <span className={`h-3 w-4 rounded-sm ${AWAY.bg}`} />
          </div>
          <div className="mt-1 text-5xl font-bold leading-none text-amber-300 tabular-nums">
            {pts(away.puntos)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-emerald-950/70">
        <div className={HOME.bg} style={{ width: `${(home.puntos / total) * 100}%` }} />
        <div className="flex-1" />
        <div className={AWAY.bg} style={{ width: `${(away.puntos / total) * 100}%` }} />
      </div>

      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-emerald-600/30 pt-3">
        <span
          className={`text-sm ${
            cup.resultado.estado === "definido"
              ? "font-semibold text-white"
              : cup.resultado.estado === "empate"
                ? "font-semibold text-amber-300"
                : "text-emerald-100"
          }`}
        >
          {cup.resultado.texto}
        </span>
        <span className="text-[11px] text-emerald-200/60">
          {cup.edition ? `${cup.edition}ª edición · ` : ""}serie {cup.serie.socios}–
          {cup.serie.caddies}
          {cup.serie.empates > 0 ? ` (${cup.serie.empates} empates)` : ""}
        </span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ match card --- */

function MatchCard({
  match,
  puntosPorPartido,
  onOpen,
}: {
  match: RyderMatch;
  puntosPorPartido: number;
  onOpen: () => void;
}) {
  const empezado = match.thru > 0 || match.puntos_arriba !== null;
  const cerrado =
    match.status === "completed" || Boolean(match.is_halved);
  const ganaHome = match.ventaja === "home";
  const ganaAway = match.ventaja === "away";

  return (
    <li className="overflow-hidden rounded-lg border border-emerald-600/40 bg-emerald-900/40">
      <button
        type="button"
        onClick={onOpen}
        className="w-full px-3 py-2.5 text-left hover:bg-emerald-800/40 focus-visible:bg-emerald-800/40 focus-visible:outline-none"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-emerald-200/60">
              Grupo {match.grupo}{" "}
              {match.is_halved
                ? "· Empate"
                : cerrado
                  ? "· Final"
                  : match.thru > 0
                    ? "· En juego"
                    : ""}
            </span>
            <div className="leading-none">
              <div className="text-[10px] uppercase tracking-wider text-emerald-200/60">
                HOYO
              </div>
              <div className="text-3xl font-bold text-white tabular-nums">
                {match.thru > 0 ? match.thru : "–"}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
              match.ventaja === "home"
                ? `${HOME.bg} ${HOME.fg}`
                : match.ventaja === "away"
                  ? `${AWAY.bg} ${AWAY.fg}`
                  : "bg-emerald-950/70 text-emerald-100"
            }`}
          >
            {match.estado}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${HOME.bg}`} />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              ganaHome ? "font-semibold text-white" : "text-emerald-50/90"
            }`}
          >
            {match.arriba}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${AWAY.bg}`} />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              ganaAway ? "font-semibold text-amber-200" : "text-amber-100/80"
            }`}
          >
            {match.abajo}
          </span>
        </div>

        {match.resultado_texto ? (
          <p className="mt-1.5 text-[12px] font-semibold text-emerald-100">
            {match.resultado_texto}
          </p>
        ) : (
          <p className="mt-1.5 text-[10px] text-emerald-200/50">
            {empezado
              ? "En juego"
              : `${puntosPorPartido} punto${puntosPorPartido === 1 ? "" : "s"} en juego`}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-emerald-300/70">
          Tocar para ver detalle hoyo por hoyo →
        </p>
      </button>
    </li>
  );
}

/* -------------------------------------------------------------- sesion ---- */

function SessionBlock({
  session,
  onOpenMatch,
}: {
  session: RyderSession;
  onOpenMatch: (match: RyderMatch, session: RyderSession) => void;
}) {
  return (
    <section className="mb-5">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-white">{session.nombre}</h3>
        <p className="text-[11px] text-emerald-200/70">
          {formatoTxt(session.scoring_format)} · {ventajaTxt(session.handicap_allowance_pct)}
          {session.start_tees?.length ? ` · hoyo ${session.start_tees[0]}` : ""} ·{" "}
          {session.puntos_por_partido} pt
          {session.puntos_por_partido === 1 ? "" : "s"} por partido
        </p>
      </header>
      {session.matches.length === 0 ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-900/40 px-3 py-3 text-[12px] text-emerald-200/60">
          Todavía no hay partidos publicados.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {session.matches.map((m) => (
            <MatchCard
              key={m.match_id}
              match={m}
              puntosPorPartido={session.puntos_por_partido}
              onOpen={() => onOpenMatch(m, session)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- salidas ---- */

function TeeSheet({ data }: { data: RyderPublicData }) {
  const bloques = data.copas
    .map((cup) => {
      const manana = cup.sesiones.find((s) => s.scoring_format === "low_high");
      if (!manana) return null;
      return { cup, manana, hoyo: manana.start_tees?.[0] ?? 99 };
    })
    .filter((b): b is { cup: RyderCup; manana: RyderSession; hoyo: number } => b !== null)
    .sort((a, b) => a.hoyo - b.hoyo);

  if (bloques.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-600/40 bg-emerald-900/40 px-3 py-3 text-[12px] text-emerald-200/60">
        Todavía no hay salidas publicadas.
      </p>
    );
  }

  return (
    <div>
      {bloques.map(({ cup, manana, hoyo }) => {
        const matches = [...manana.matches].sort((a, b) =>
          (a.tee_time ?? "").localeCompare(b.tee_time ?? "")
        );
        return (
          <section key={cup.category_id} className="mb-5">
            <header className="mb-2">
              <h3 className="text-sm font-semibold text-white">
                Hoyo {hoyo} · {cup.categoria}
              </h3>
              <p className="text-[11px] text-emerald-200/70">
                {matches.length} grupo{matches.length === 1 ? "" : "s"} ·{" "}
                {ventajaTxt(manana.handicap_allowance_pct)}
              </p>
            </header>
            {matches.length === 0 ? (
              <p className="rounded-lg border border-emerald-600/40 bg-emerald-900/40 px-3 py-3 text-[12px] text-emerald-200/60">
                Todavía no hay grupos publicados.
              </p>
            ) : (
              <ul className="space-y-2">
                {matches.map((match) => (
                  <li
                    key={match.match_id}
                    className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-900/40 px-3 py-2.5"
                  >
                    <span className="w-12 shrink-0 text-[13px] font-semibold text-white tabular-nums">
                      {hora(match.tee_time)}
                    </span>
                    <span className="w-7 shrink-0 text-[10px] text-emerald-200/60">
                      G{match.grupo ?? "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${HOME.bg}`} />
                        <span className="truncate text-[13px] text-white">
                          {match.arriba}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${AWAY.bg}`} />
                        <span className="truncate text-[13px] text-amber-100/80">
                          {match.abajo}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="rounded-lg border border-emerald-600/40 bg-emerald-900/40 px-3 py-3 text-[11px] leading-relaxed text-emerald-200/70">
        Por la tarde salen los mismos grupos en el mismo orden y por el mismo hoyo,
        conforme terminen la vuelta de la mañana. Los cuatro jugadores vuelven a salir
        juntos para disputar dos partidos individuales.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- pagina ---- */

export default function RyderCups({ data }: { data: RyderPublicData }) {
  const [cat, setCat] = useState(data.copas[0]?.categoria_code ?? "");
  const [vista, setVista] = useState<"marcador" | "salidas">("marcador");
  const [detail, setDetail] = useState<{
    matchId: string;
    headerLabel: string;
  } | null>(null);
  const activa = data.copas.find((c) => c.categoria_code === cat) ?? data.copas[0];

  const fecha = new Date(`${data.fecha}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const openMatch = (match: RyderMatch, session: RyderSession) => {
    const formato =
      session.scoring_format === "singles" ? "Individual" : "Parejas";
    setDetail({
      matchId: match.match_id,
      headerLabel: `Grupo ${match.grupo ?? "—"} · ${formato}`,
    });
  };

  return (
    <main className="report-printable mx-auto w-full max-w-3xl px-3 py-5 sm:px-5">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-bold tracking-wide text-white sm:text-2xl">
          {data.nombre}
        </h1>
        <p className="mt-1 text-xs capitalize text-emerald-200/80">{fecha}</p>
      </header>

      <nav className="mb-4 flex gap-2" aria-label="Categoría">
        {data.copas.map((c) => (
          <button
            key={c.category_id}
            type="button"
            onClick={() => setCat(c.categoria_code)}
            aria-pressed={c.categoria_code === activa?.categoria_code}
            className={`flex-1 text-xs ${
              c.categoria_code === activa?.categoria_code ? "btn3d btn3d-green" : "btn3d"
            }`}
          >
            {c.categoria}
          </button>
        ))}
      </nav>

      <nav className="mb-4 flex gap-2" aria-label="Vista">
        <button
          type="button"
          onClick={() => setVista("marcador")}
          aria-pressed={vista === "marcador"}
          className={`flex-1 text-xs ${
            vista === "marcador" ? "btn3d btn3d-green" : "btn3d"
          }`}
        >
          Marcador
        </button>
        <button
          type="button"
          onClick={() => setVista("salidas")}
          aria-pressed={vista === "salidas"}
          className={`flex-1 text-xs ${
            vista === "salidas" ? "btn3d btn3d-green" : "btn3d"
          }`}
        >
          Salidas
        </button>
      </nav>

      {vista === "salidas" ? (
        <TeeSheet data={data} />
      ) : (
        activa && (
          <>
            <div className="mb-5">
              <Scoreboard cup={activa} />
            </div>
            {activa.sesiones.map((s) => (
              <SessionBlock
                key={s.session_id}
                session={s}
                onOpenMatch={openMatch}
              />
            ))}
          </>
        )
      )}

      <footer className="mt-6 border-t border-emerald-600/30 pt-3 text-[11px] leading-relaxed text-emerald-200/60">
        <p className="mb-1.5 font-semibold text-emerald-100">Cómo leer el marcador</p>
        <p className="mb-1">
          El marcador suma en tiempo real el aporte de cada partido según quién
          va arriba en ese momento (cerrados e en juego).
        </p>
        <p className="mb-1">
          En los <b>individuales</b> cada partido vale 1 punto de copa.{" "}
          <b>3&amp;2</b> es tres arriba con dos por jugar; <b>AS</b> al 18 es empate
          y reparte <b>½</b> a cada lado.
        </p>
        <p className="mb-1">
          En las <b>parejas</b> cada partido vale 2 puntos de copa y cada hoyo
          reparte dos (bola baja neta y bola alta). Un AS al 18 da <b>1</b> punto
          de copa a cada equipo. Quien no termina el hoyo pierde el punto de bola
          alta de su pareja.
        </p>
        <p>
          Las dos copas son independientes y cada una se gana con{" "}
          {pts(activa?.puntos_para_ganar ?? 0)}. Si al final la serie queda empatada,
          se registra como <b>{activa?.tie_label ?? "Empate"}</b> y el trofeo se
          queda con su placa de esta edición.
        </p>
      </footer>

      <RyderMatchDetail
        open={detail != null}
        onClose={() => setDetail(null)}
        tournamentId={data.tournament_id}
        matchId={detail?.matchId ?? null}
        headerLabel={detail?.headerLabel}
      />
    </main>
  );
}
