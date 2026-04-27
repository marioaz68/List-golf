import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { applyCategoryTemplate, deleteCategoryTemplate } from "./actions";
import { redirect } from "next/navigation";
import CategoryTemplateEditor from "./Template-Editor";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type CategoryRow = {
  id: string;
  tournament_id: string;
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  category_group:
    | "main"
    | "senior"
    | "ladies"
    | "super_senior"
    | "mixed"
    | null;
  handicap_min: number | null;
  handicap_max: number | null;
  max_players: number | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type TemplateItemRow = {
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  category_group:
    | "main"
    | "senior"
    | "ladies"
    | "super_senior"
    | "mixed"
    | null;
  handicap_min: number | null;
  handicap_max: number | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type PreviewItem = {
  code: string;
  name: string;
  gender: "M" | "F" | "X";
  category_group: "main" | "senior" | "ladies" | "super_senior" | "mixed";
  handicap_min: number;
  handicap_max: number;
  is_active: boolean;
};

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
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

const redButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#ef4444, #b91c1c)",
  border: "1px solid #7f1d1d",
  boxShadow: "0 3px 0 #7f1d1d, 0 4px 8px rgba(0,0,0,0.22)",
};

const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  pointerEvents: "none",
};

const selectStyle: CSSProperties = {
  height: "28px",
  minWidth: "220px",
  borderRadius: "6px",
  border: "1px solid #9ca3af",
  background: "#f3f4f6",
  color: "#111827",
  padding: "0 8px",
  fontSize: "11px",
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.04)",
  padding: "10px 10px 16px",
};

function firstOf(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function normalizeItem(row: TemplateItemRow): PreviewItem {
  return {
    code: String(row.code ?? "").trim(),
    name: String(row.name ?? "").trim(),
    gender: (row.gender ?? "X") as "M" | "F" | "X",
    category_group: (row.category_group ?? "main") as
      | "main"
      | "senior"
      | "ladies"
      | "super_senior"
      | "mixed",
    handicap_min: Number(row.handicap_min ?? 0),
    handicap_max: Number(row.handicap_max ?? 0),
    is_active: row.is_active ?? true,
  };
}

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

export default async function CategoriesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId = firstOf(sp.tournament_id) ?? "";
  const currentTab = firstOf(sp.tab) ?? "template";
  const templateId = firstOf(sp.template_id) ?? "";

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id,name")
    .order("created_at", { ascending: false });

  if (tournamentsError) {
    throw new Error(tournamentsError.message);
  }

  const effectiveTournamentId =
    tournamentId || (tournaments && tournaments.length > 0 ? tournaments[0].id : "");

  if (!tournaments || tournaments.length === 0) {
    return (
      <div className="space-y-2 p-2 pb-5 md:p-3 md:pb-6">
        <h1 className="text-lg font-bold leading-none text-white">Categorías</h1>

        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-900">
          <div className="text-sm font-semibold leading-none">
            Primero necesitas crear un torneo
          </div>

          <div className="mt-1.5 text-[11px] leading-snug">
            Todavía no existe ningún torneo. Crea uno primero y después podrás
            aplicar una plantilla o capturar categorías.
          </div>

          <div className="mt-2">
            <a href="/tournaments/new" style={buttonStyle}>
              Ir a Nuevo torneo
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { data: templatesRaw, error: templatesError } = await supabase
    .from("category_templates")
    .select("id, name, description, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (templatesError) {
    throw new Error(templatesError.message);
  }

  const templates = (templatesRaw ?? []) as TemplateRow[];
  const effectiveTemplateId = templateId || templates[0]?.id || "";

  if (!tournamentId && effectiveTournamentId) {
    const q = new URLSearchParams({
      tournament_id: effectiveTournamentId,
      tab: "template",
    });
    if (effectiveTemplateId) q.set("template_id", effectiveTemplateId);
    redirect(`/categories?${q.toString()}`);
  }

  const { data: rawCategories, error: categoriesError } = await supabase
    .from("categories")
    .select(
      "id, tournament_id, code, name, gender, category_group, handicap_min, handicap_max, max_players, sort_order, is_active"
    )
    .eq("tournament_id", effectiveTournamentId)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const categories = ((rawCategories ?? []) as CategoryRow[]).map((c, idx) => ({
    id: c.id,
    tournament_id: c.tournament_id,
    gender: c.gender ?? "X",
    category_group: c.category_group ?? "main",
    code: c.code ?? "",
    name: c.name ?? "",
    handicap_min: Number(c.handicap_min ?? 0),
    handicap_max: Number(c.handicap_max ?? 0),
    max_players: c.max_players ?? null,
    sort_order: c.sort_order ?? idx + 1,
    is_active: c.is_active ?? true,
  }));

  const selectedTemplate =
    templates.find((t) => t.id === effectiveTemplateId) ?? null;

  let previewItems: PreviewItem[] = [];
  if (selectedTemplate?.id) {
    const { data: previewRaw, error: previewError } = await supabase
      .from("category_template_items")
      .select(
        "code, name, gender, category_group, handicap_min, handicap_max, is_active, sort_order"
      )
      .eq("template_id", selectedTemplate.id)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (previewError) {
      throw new Error(previewError.message);
    }

    previewItems = ((previewRaw ?? []) as TemplateItemRow[]).map(normalizeItem);
  }

  return (
    <div className="space-y-2 p-2 pb-5 md:p-3 md:pb-6">
      <h1 className="text-lg font-bold leading-none text-white">Categorías</h1>

      <div className="flex flex-wrap gap-1.5">
        <a
          href={`/tee-sets?tournament_id=${effectiveTournamentId}`}
          style={effectiveTournamentId ? buttonStyle : buttonDisabledStyle}
        >
          Salidas
        </a>

        <a
          href={`/category-tee-rules?tournament_id=${effectiveTournamentId}`}
          style={effectiveTournamentId ? buttonStyle : buttonDisabledStyle}
        >
          Reglas de Salidas
        </a>
      </div>

      <form method="GET" action="/categories" className="space-y-2">
        <HeaderBlock
          title="TORNEO"
          actions={<button style={buttonStyle}>Cambiar</button>}
        >
          <input type="hidden" name="tab" value={currentTab} />
          {effectiveTemplateId ? (
            <input type="hidden" name="template_id" value={effectiveTemplateId} />
          ) : null}

          <div className="min-w-0">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              style={selectStyle}
              className="w-full"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <form method="GET" action="/categories" className="space-y-2">
        <HeaderBlock
          title="PLANTILLA DE CATEGORÍAS"
          actions={<button style={buttonStyle}>Ver</button>}
        >
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="tab" value="template" />

          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
            <label className="text-[11px] leading-none whitespace-nowrap text-white">
              Plantilla
            </label>

            <select
              name="template_id"
              defaultValue={effectiveTemplateId}
              style={selectStyle}
              className="min-w-0"
            >
              {templates.length === 0 ? (
                <option value="">No hay plantillas</option>
              ) : (
                templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <div style={cardStyle}>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Vista previa
            </div>

            <div className="mt-1 text-sm font-semibold text-white">
              {selectedTemplate?.name ?? "Sin plantilla seleccionada"}
            </div>

            <div className="mt-1 text-[11px] leading-snug text-white/75">
              {selectedTemplate?.description ?? "Selecciona una plantilla guardada."}
            </div>

            <div className="mt-1 text-[11px] leading-snug text-white/60">
              Dar de baja una plantilla no afecta categorías ya copiadas a torneos.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <form action={applyCategoryTemplate}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="template_id" value={effectiveTemplateId} />
              <button
                style={templates.length > 0 ? buttonStyle : buttonDisabledStyle}
                disabled={templates.length === 0}
              >
                Aplicar plantilla
              </button>
            </form>

            <form action={deleteCategoryTemplate}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="template_id" value={effectiveTemplateId} />
              <button
                style={templates.length > 0 ? redButtonStyle : buttonDisabledStyle}
                disabled={templates.length === 0}
              >
                Dar de baja plantilla
              </button>
            </form>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="min-w-max pb-3">
            <table className="min-w-full text-[11px] text-white">
              <thead>
                <tr className="border-b border-white/10 text-white/60">
                  <th className="px-2 py-1 text-left font-semibold">Código</th>
                  <th className="px-2 py-1 text-left font-semibold">Nombre</th>
                  <th className="px-2 py-1 text-left font-semibold">Género</th>
                  <th className="px-2 py-1 text-left font-semibold">Grupo</th>
                  <th className="px-2 py-1 text-left font-semibold">Hcp min</th>
                  <th className="px-2 py-1 text-left font-semibold">Hcp max</th>
                </tr>
              </thead>

              <tbody>
                {previewItems.length > 0 ? (
                  previewItems.map((item, idx) => (
                    <tr key={`${item.code}-${idx}`} className="border-b border-white/5">
                      <td className="px-2 py-1.5">{item.code}</td>
                      <td className="px-2 py-1.5">{item.name}</td>
                      <td className="px-2 py-1.5">{item.gender}</td>
                      <td className="px-2 py-1.5">{item.category_group}</td>
                      <td className="px-2 py-1.5">{item.handicap_min}</td>
                      <td className="px-2 py-1.5">{item.handicap_max}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-2 py-2 text-white/70" colSpan={6}>
                      {templates.length === 0
                        ? "No hay plantillas guardadas todavía."
                        : "Esta plantilla no tiene categorías capturadas todavía."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {categories.length === 0 && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-blue-900">
          <div className="text-[11px] leading-snug">
            Este torneo todavía no tiene categorías. Primero aplica una plantilla
            y después abajo podrás modificarlas, agregar nuevas o eliminar con checkbox.
          </div>
        </div>
      )}

      <HeaderBlock
        title="CATEGORÍAS DEL TORNEO"
        actions={
          <div className="flex gap-1.5">
            <a
              href={`/categories?tournament_id=${effectiveTournamentId}&tab=template${
                effectiveTemplateId ? `&template_id=${effectiveTemplateId}` : ""
              }`}
              style={buttonStyle}
            >
              Plantillas
            </a>
            <a
              href={`/categories?tournament_id=${effectiveTournamentId}&tab=editor${
                effectiveTemplateId ? `&template_id=${effectiveTemplateId}` : ""
              }`}
              style={buttonStyle}
            >
              Editar
            </a>
          </div>
        }
      >
        <div className="text-[11px] leading-snug text-white/90">
          Las categorías del torneo siguen siendo editables y ahora también las
          puedes guardar como plantilla.
        </div>
      </HeaderBlock>

      <div className="pb-4">
        <CategoryTemplateEditor
          tournamentId={effectiveTournamentId}
          categories={categories}
        />
      </div>
    </div>
  );
}