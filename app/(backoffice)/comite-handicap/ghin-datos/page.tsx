import Link from "next/link";
import { requireGhinCommitteeAccess } from "@/lib/handicap-committee/requireGhinAccess";
import { formatDateEs } from "@/lib/ghin-report/formatDateEs";
import GhinDatosUploadClient from "./GhinDatosUploadClient";

export const dynamic = "force-dynamic";

export default async function GhinDatosPage() {
  const { supabase } = await requireGhinCommitteeAccess();

  const [
    { count: roundsCount },
    { count: revCount },
    { data: revMax },
    { data: roundMaxM },
    { data: roundMaxF },
    { data: logs },
    { count: playersM },
    { count: playersF },
  ] = await Promise.all([
    supabase.from("ghin_rounds").select("id", { count: "exact", head: true }),
    supabase
      .from("ghin_index_revisions")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("ghin_index_revisions")
      .select("revision_date")
      .order("revision_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ghin_rounds")
      .select("date_played")
      .eq("gender", "M")
      .order("date_played", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ghin_rounds")
      .select("date_played")
      .eq("gender", "F")
      .order("date_played", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ghin_import_log")
      .select(
        "id, source_file, gender, uploaded_at, rows_in_file, rows_inserted, rows_skipped, rows_date_conflict, date_min, date_max, status, notes"
      )
      .order("uploaded_at", { ascending: false })
      .limit(30),
    supabase
      .from("v_ghin_player_activity")
      .select("ghin_number", { count: "exact", head: true })
      .eq("gender", "M"),
    supabase
      .from("v_ghin_player_activity")
      .select("ghin_number", { count: "exact", head: true })
      .eq("gender", "F"),
  ]);

  const { count: roundsM } = await supabase
    .from("ghin_rounds")
    .select("id", { count: "exact", head: true })
    .eq("gender", "M");
  const { count: roundsF } = await supabase
    .from("ghin_rounds")
    .select("id", { count: "exact", head: true })
    .eq("gender", "F");

  // Distinct source_file: sample recent + ask for distinct via limit pages
  const { data: fileRows } = await supabase
    .from("ghin_rounds")
    .select("source_file, gender, date_played")
    .not("source_file", "is", null)
    .order("date_played", { ascending: false })
    .limit(5000);

  const fileMap = new Map<
    string,
    { gender: string; n: number; min: string; max: string }
  >();
  for (const row of fileRows ?? []) {
    const f = String((row as { source_file: string }).source_file);
    const d = String((row as { date_played: string }).date_played).slice(0, 10);
    const g = String((row as { gender: string }).gender ?? "?");
    const cur = fileMap.get(f);
    if (!cur) fileMap.set(f, { gender: g, n: 1, min: d, max: d });
    else {
      cur.n += 1;
      if (d < cur.min) cur.min = d;
      if (d > cur.max) cur.max = d;
    }
  }

  const revCutoff =
    revMax?.revision_date != null
      ? String(revMax.revision_date).slice(0, 10)
      : null;
  const maxM =
    roundMaxM?.date_played != null
      ? String(roundMaxM.date_played).slice(0, 10)
      : null;
  const maxF =
    roundMaxF?.date_played != null
      ? String(roundMaxF.date_played).slice(0, 10)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/comite-handicap" className="text-indigo-700 underline">
          ← Comité
        </Link>
        <Link
          href="/comite-handicap/seleccion"
          className="text-indigo-700 underline"
        >
          Selección jugadores
        </Link>
      </div>

      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">
          Administración de datos GHIN
        </h1>
        <p className="text-sm text-slate-600">
          Estado de cargas históricas e importación Hole by Hole con dry-run
          obligatorio.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card
          label="Rondas totales"
          value={(roundsCount ?? 0).toLocaleString()}
        />
        <Card
          label="Rondas M / F"
          value={`${(roundsM ?? 0).toLocaleString()} / ${(roundsF ?? 0).toLocaleString()}`}
        />
        <Card
          label="Jugadores act. M / F"
          value={`${playersM ?? 0} / ${playersF ?? 0}`}
        />
        <Card
          label="Revisiones HI"
          value={(revCount ?? 0).toLocaleString()}
        />
        <Card
          label="Corte revisiones"
          value={formatDateEs(revCutoff) ?? "—"}
        />
        <Card
          label="Corte rondas M / F"
          value={`${formatDateEs(maxM) ?? "—"} / ${formatDateEs(maxF) ?? "—"}`}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold">
          Archivos en muestra reciente (source_file)
        </h2>
        <p className="mb-2 text-[11px] text-slate-500">
          Agrupado sobre las {fileRows?.length ?? 0} rondas más recientes
          leídas; no es el total histórico por archivo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-2">source_file</th>
                <th className="py-1 pr-2">G</th>
                <th className="py-1 pr-2">n (muestra)</th>
                <th className="py-1">Rango</th>
              </tr>
            </thead>
            <tbody>
              {[...fileMap.entries()].map(([f, v]) => (
                <tr key={f} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-mono text-[10px]">{f}</td>
                  <td className="py-1 pr-2">{v.gender}</td>
                  <td className="py-1 pr-2 tabular-nums">{v.n}</td>
                  <td className="py-1 tabular-nums">
                    {v.min} → {v.max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <GhinDatosUploadClient />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold">Log de cargas (ghin_import_log)</h2>
        {!logs?.length ? (
          <p className="mt-2 text-xs text-slate-500">
            Vacío: las cargas previas no dejaron rastro. Las nuevas sí.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-2">Cuándo</th>
                  <th className="py-1 pr-2">Archivo</th>
                  <th className="py-1 pr-2">Estado</th>
                  <th className="py-1 pr-2">In/Ins/Skip/Conf</th>
                  <th className="py-1">Notas</th>
                </tr>
              </thead>
              <tbody>
                {(logs as Array<Record<string, unknown>>).map((l) => (
                  <tr key={String(l.id)} className="border-t border-slate-100">
                    <td className="whitespace-nowrap py-1 pr-2">
                      {String(l.uploaded_at).slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="py-1 pr-2 font-mono text-[10px]">
                      {String(l.source_file)}
                    </td>
                    <td className="py-1 pr-2">{String(l.status)}</td>
                    <td className="py-1 pr-2 tabular-nums">
                      {String(l.rows_in_file)}/{String(l.rows_inserted)}/
                      {String(l.rows_skipped)}/{String(l.rows_date_conflict)}
                    </td>
                    <td className="py-1 text-slate-600">
                      {l.notes != null ? String(l.notes) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase text-slate-500">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
