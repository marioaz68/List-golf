import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import {
  createTemplate,
  deleteTemplate,
  updateTemplateHeader,
} from "./actions";
import { redirect } from "next/navigation";
import HeaderBar from "@/components/ui/HeaderBar";
import TemplateItemsEditor from "./TemplateItemsEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  is_active: boolean | null;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  category_group: "main" | "senior" | "ladies" | "super_senior" | "mixed" | null;
  handicap_min: number | null;
  handicap_max: number | null;
  handicap_percent_override: number | null;
  allow_multiple_prizes_per_player: boolean | null;
  default_prize_count: number | null;
  sort_order: number | null;
  is_active: boolean | null;
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

const inputStyle: CSSProperties = {
  height: "28px",
  minWidth: "220px",
  borderRadius: "6px",
  border: "1px solid #9ca3af",
  background: "#f3f4f6",
  color: "#111827",
  padding: "0 8px",
  fontSize: "11px",
};

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

export default async function CategoryTemplatesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const templateId =
    typeof sp.template_id === "string" ? sp.template_id : "";

  const { data: templates, error: templatesError } = await supabase
    .from("category_templates")
    .select("id,name,description,is_active")
    .order("name", { ascending: true });

  if (templatesError) throw new Error(templatesError.message);

  const effectiveTemplateId =
    templateId || (templates && templates.length > 0 ? templates[0].id : "");

  if (templates && templates.length > 0 && !templateId && effectiveTemplateId) {
    redirect(`/category-templates?template_id=${effectiveTemplateId}`);
  }

  const selectedTemplate = ((templates ?? []) as TemplateRow[]).find(
    (t) => t.id === effectiveTemplateId
  );

  const { data: templateItemsRaw, error: itemsError } = effectiveTemplateId
    ? await supabase
        .from("category_template_items")
        .select(
          "id, template_id, code, name, gender, category_group, handicap_min, handicap_max, handicap_percent_override, allow_multiple_prizes_per_player, default_prize_count, sort_order, is_active"
        )
        .eq("template_id", effectiveTemplateId)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true })
    : { data: [], error: null as { message?: string } | null };

  if (itemsError) throw new Error(itemsError.message);

  const templateItems = ((templateItemsRaw ?? []) as TemplateItemRow[]).map(
    (r, idx) => ({
      id: r.id,
      template_id: r.template_id,
      code: r.code ?? "",
      name: r.name ?? "",
      gender: r.gender ?? "X",
      category_group: r.category_group ?? "main",
      handicap_min: Number(r.handicap_min ?? 0),
      handicap_max: Number(r.handicap_max ?? 0),
      handicap_percent_override:
        r.handicap_percent_override === null
          ? null
          : Number(r.handicap_percent_override),
      allow_multiple_prizes_per_player:
        r.allow_multiple_prizes_per_player ?? false,
      default_prize_count:
        r.default_prize_count === null ? null : Number(r.default_prize_count),
      sort_order: r.sort_order ?? idx + 1,
      is_active: r.is_active ?? true,
    })
  );

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">
        Plantillas de categorías
      </h1>

      <form method="GET" action="/category-templates" className="space-y-2">
        <HeaderBlock
          title="PLANTILLA"
          actions={
            <button type="submit" style={buttonStyle}>
              Cambiar
            </button>
          }
        >
          <div className="min-w-0">
            <select
              name="template_id"
              defaultValue={effectiveTemplateId}
              style={selectStyle}
              className="w-full"
            >
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <form action={createTemplate} className="space-y-2">
        <HeaderBlock
          title="NUEVA PLANTILLA"
          actions={
            <button type="submit" style={buttonStyle}>
              Crear
            </button>
          }
        >
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row">
            <input
              name="name"
              placeholder="Nombre de plantilla"
              style={inputStyle}
              required
            />
            <input
              name="description"
              placeholder="Descripción"
              style={inputStyle}
            />
            <label className="flex items-center gap-1 text-[11px] text-white">
              <input type="checkbox" name="is_active" defaultChecked />
              Activa
            </label>
          </div>
        </HeaderBlock>
      </form>

      {selectedTemplate ? (
        <>
          <form action={updateTemplateHeader}>
            <div className="rounded-lg border border-gray-300 bg-white/95 p-2 shadow-sm">
              <div className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={selectedTemplate.id} />

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-700">Nombre</label>
                  <input
                    name="name"
                    defaultValue={selectedTemplate.name ?? ""}
                    style={inputStyle}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-700">Descripción</label>
                  <input
                    name="description"
                    defaultValue={selectedTemplate.description ?? ""}
                    style={inputStyle}
                  />
                </div>

                <label className="flex items-center gap-1 text-[11px] text-gray-800 pb-1">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={selectedTemplate.is_active ?? true}
                  />
                  Activa
                </label>

                <button type="submit" style={buttonStyle}>
                  Guardar encabezado
                </button>
              </div>
            </div>
          </form>

          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={selectedTemplate.id} />
            <button type="submit" style={redButtonStyle}>
              Borrar plantilla
            </button>
          </form>

          <TemplateItemsEditor
            templateId={selectedTemplate.id}
            rows={templateItems}
          />
        </>
      ) : (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-blue-900">
          <div className="text-[11px] leading-snug">
            No hay plantillas todavía. Crea una nueva plantilla manual.
          </div>
        </div>
      )}
    </div>
  );
}