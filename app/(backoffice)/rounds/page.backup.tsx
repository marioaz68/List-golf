import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { createRound, updateRound, deleteRound } from "./actions";
import { RoundDeleteButton, RoundSubmitButton } from "./RoundFormButtons";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type Round = {
  id: string;
  tournament_id: string;
  round_no: number;
  round_date: string | null;
  start_type: "tee_time" | "shotgun";
  start_time: string | null;
  interval_minutes: number | null;
  category_id: string | null;
  wave: string | null;
  group_size: number | null;
};

function buildTimeOptions(startHour = 6, endHour = 18, stepMinutes = 5) {
  const options: string[] = [];

  for (let hh = startHour; hh <= endHour; hh++) {
    for (let mm = 0; mm < 60; mm += stepMinutes) {
      const value =
        String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");

      options.push(value);
    }
  }

  return options;
}

function normalizeTimeForSelect(value: string | null | undefined) {
  if (!value) return "";

  const s = String(value).trim();
  const m = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);

  if (m) {
    return `${m[1]}:${m[2]}`;
  }

  return s;
}

function categoryLabel(c: Category) {
  const code = (c.code ?? "").trim();
  const name = (c.name ?? "").trim();

  if (code && name) return `${code} - ${name}`;
  if (name) return name;
  if (code) return code;
  return c.id.slice(0, 8);
}

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "7px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  boxShadow: "0 3px 0 #1f2937, 0 4px 8px rgba(0,0,0,0.22)",
  whiteSpace: "nowrap",
};

const lightButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#f9fafb, #e5e7eb)",
  color: "#111827",
  border: "1px solid #9ca3af",
  boxShadow: "0 3px 0 #9ca3af, 0 4px 8px rgba(0,0,0,0.14)",
};

const redButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#ef4444, #b91c1c)",
  border: "1px solid #7f1d1d",
  boxShadow: "0 3px 0 #7f1d1d, 0 4px 8px rgba(0,0,0,0.22)",
};

const fieldClass =
  "h-8 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-normal text-black";
const compactTableFieldClass =
  "h-8 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-normal text-black";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.04em] leading-none text-gray-700";
const cardClass =
  "space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2.5 shadow-sm";
const fieldWrapClass = "grid gap-1 min-w-[150px]";
const newRoundGridClass =
  "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[90px_220px_145px_110px_130px_115px_115px_auto] xl:items-end";

function HeaderBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <HeaderBar title={title} actions={actions} />
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export default async function RoundsPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const timeOptions = buildTimeOptions(6, 18, 5);

  const { data: tData, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Rounds</h1>
        <p className="text-[11px] leading-snug text-red-200">
          Error cargando torneos: {tErr.message}
        </p>
      </div>
    );
  }

  const tournaments: Tournament[] = (tData ?? []) as any[];

  const effectiveTournamentId = tournamentId || (tournaments[0]?.id ?? "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/rounds?tournament_id=${effectiveTournamentId}`);
  }

  await requireTournamentAccess({
    tournamentId: effectiveTournamentId,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
    ],
  });

  const { data: cData, error: cErr } = effectiveTournamentId
    ? await supabase
        .from("categories")
        .select("id, code, name, sort_order")
        .eq("tournament_id", effectiveTournamentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (cErr) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Rounds</h1>
        <p className="text-[11px] leading-snug text-red-200">
          Error cargando categorías: {cErr.message}
        </p>
      </div>
    );
  }

  const categories: Category[] = ((cData ?? []) as any[]).map((c) => ({
    id: c.id,
    code: c.code ?? null,
    name: c.name ?? null,
    sort_order: c.sort_order === null ? null : Number(c.sort_order),
  }));

  const { data: rData, error: rErr } = effectiveTournamentId
    ? await supabase
        .from("rounds")
        .select(
          "id, tournament_id, round_no, round_date, start_type, start_time, interval_minutes, category_id, wave, group_size"
        )
        .eq("tournament_id", effectiveTournamentId)
        .order("round_no", { ascending: true })
        .order("round_date", { ascending: true })
        .order("wave", { ascending: true })
    : { data: [], error: null };

  if (rErr) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Rounds</h1>
        <p className="text-[11px] leading-snug text-red-200">
          Error cargando rounds: {rErr.message}
        </p>
      </div>
    );
  }

  const rounds: Round[] = (rData ?? []).map((r: any) => ({
    ...r,
    round_no: Number(r.round_no),
    start_type: r.start_type === "shotgun" ? "shotgun" : "tee_time",
    interval_minutes:
      r.interval_minutes === null ? null : Number(r.interval_minutes),
    category_id: r.category_id ?? null,
    wave: r.wave ?? null,
    group_size: r.group_size === null ? null : Number(r.group_size),
  }));

  const tournamentLabel = (t: Tournament) =>
    (t.name ?? "").trim() || `Torneo ${t.id.slice(0, 8)}`;

  return (
    <div className="space-y-2 p-2 md:p-3">
      <header className="space-y-1">
        <h1 className="text-lg font-bold text-white">Rounds</h1>
        <p className="text-[11px] leading-snug text-white/85">
          Crea y configura rondas por torneo, categoría, día, turno y tipo de salida.
        </p>
      </header>

      <form method="GET" action="/rounds" className="space-y-2">
        <HeaderBlock
          title="TORNEO"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <button style={buttonStyle}>Cambiar</button>
              <a href="/tournaments/new" style={lightButtonStyle}>
                + Nuevo torneo
              </a>
              <a href={`/cut-rules?tournament_id=${effectiveTournamentId}`} style={lightButtonStyle}>
                Reglas corte
              </a>
            </div>
          }
        >
          {tournaments.length === 0 ? (
            <div className="text-[11px] leading-snug text-red-200">
              No hay torneos. Crea uno primero.
            </div>
          ) : (
            <div className="min-w-0">
              <select
                name="tournament_id"
                defaultValue={effectiveTournamentId}
                className={fieldClass}
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tournamentLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </HeaderBlock>
      </form>

      <section className={cardClass}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] leading-none text-gray-700">
          Nueva ronda
        </div>

        {categories.length === 0 ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
            Este torneo todavía no tiene categorías activas. Primero crea categorías para poder
            crear rondas por categoría.
          </div>
        ) : null}

        <form action={createRound} className={newRoundGridClass}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="round_no">
              Ronda
            </label>
            <input
              id="round_no"
              name="round_no"
              type="number"
              min="1"
              placeholder="Ronda #"
              className={fieldClass}
              required
            />
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="category_id">
              Categoría
            </label>
            <select
              id="category_id"
              name="category_id"
              className={fieldClass}
              required
              disabled={categories.length === 0}
            >
              <option value="">Selecciona categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="round_date">
              Fecha
            </label>
            <input
              id="round_date"
              name="round_date"
              type="date"
              className={fieldClass}
            />
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="wave">
              Turno
            </label>
            <select id="wave" name="wave" defaultValue="AM" className={fieldClass}>
              <option value="">Sin turno</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="start_type">
              Tipo salida
            </label>
            <select
              id="start_type"
              name="start_type"
              defaultValue="tee_time"
              className={fieldClass}
            >
              <option value="tee_time">Tee time</option>
              <option value="shotgun">Shotgun</option>
            </select>
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="start_time">
              Hora inicio
            </label>
            <select
              id="start_time"
              name="start_time"
              defaultValue="07:30"
              className={fieldClass}
            >
              <option value="">Sin hora</option>
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="interval_minutes">
              Intervalo
            </label>
            <select
              id="interval_minutes"
              name="interval_minutes"
              defaultValue="8"
              className={fieldClass}
            >
              <option value="">Sin intervalo</option>
              <option value="7">7 min</option>
              <option value="8">8 min</option>
              <option value="9">9 min</option>
              <option value="10">10 min</option>
              <option value="12">12 min</option>
            </select>
          </div>

          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="group_size">
              Grupo
            </label>
            <select
              id="group_size"
              name="group_size"
              defaultValue="4"
              className={fieldClass}
            >
              <option value="3">3 jug.</option>
              <option value="4">4 jug.</option>
            </select>
          </div>

          <div className="flex items-end">
            <RoundSubmitButton
              pendingText="Creando..."
              style={buttonStyle}
              disabled={categories.length === 0}
            >
              Crear
            </RoundSubmitButton>
          </div>
        </form>
      </section>

      <section className={cardClass}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] leading-none text-gray-700">
          Listado
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="w-full min-w-[1280px] border-collapse text-[11px] text-black">
            <thead>
              <tr className="bg-gray-200 text-left text-gray-900">
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Ronda
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Categoría
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Fecha
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Turno
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Tipo
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Hora
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Intervalo
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Grupo
                </th>
                <th className="border border-gray-300 px-1.5 py-1.5 font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {rounds.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    No hay rondas todavía.
                  </td>
                </tr>
              ) : (
                rounds.map((r) => {
                  const formId = `row-${r.id}`;
                  const startTimeValue = normalizeTimeForSelect(r.start_time);

                  return (
                    <tr key={r.id} className="bg-white align-middle">
                      <td className="border border-gray-300 px-1.5 py-1.5 w-[90px]">
                        <form id={formId} action={updateRound}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="tournament_id" value={r.tournament_id} />
                        </form>

                        <input
                          form={formId}
                          name="round_no"
                          type="number"
                          defaultValue={r.round_no}
                          className={compactTableFieldClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[210px]">
                        <select
                          form={formId}
                          name="category_id"
                          defaultValue={r.category_id ?? ""}
                          className={compactTableFieldClass}
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {categoryLabel(c)}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 w-[145px]">
                        <input
                          form={formId}
                          name="round_date"
                          type="date"
                          defaultValue={r.round_date ?? ""}
                          className={compactTableFieldClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[95px]">
                        <select
                          form={formId}
                          name="wave"
                          defaultValue={r.wave ?? ""}
                          className={compactTableFieldClass}
                        >
                          <option value="">Sin turno</option>
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[120px]">
                        <select
                          form={formId}
                          name="start_type"
                          defaultValue={r.start_type}
                          className={compactTableFieldClass}
                        >
                          <option value="tee_time">tee_time</option>
                          <option value="shotgun">shotgun</option>
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[115px]">
                        <select
                          form={formId}
                          name="start_time"
                          defaultValue={startTimeValue}
                          className={compactTableFieldClass}
                        >
                          <option value="">Sin hora</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[115px]">
                        <select
                          form={formId}
                          name="interval_minutes"
                          defaultValue={r.interval_minutes ?? ""}
                          className={compactTableFieldClass}
                        >
                          <option value="">Sin intervalo</option>
                          <option value="7">7</option>
                          <option value="8">8</option>
                          <option value="9">9</option>
                          <option value="10">10</option>
                          <option value="12">12</option>
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5 min-w-[95px]">
                        <select
                          form={formId}
                          name="group_size"
                          defaultValue={r.group_size ?? 4}
                          className={compactTableFieldClass}
                        >
                          <option value="3">3</option>
                          <option value="4">4</option>
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <RoundSubmitButton
                            form={formId}
                            pendingText="Guardando..."
                            style={buttonStyle}
                          >
                            Guardar
                          </RoundSubmitButton>

                          <form action={deleteRound}>
                            <input type="hidden" name="id" value={r.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={effectiveTournamentId}
                            />
                            <RoundDeleteButton style={redButtonStyle} />
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
