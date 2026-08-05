/**
 * Plantillas de torneo: Anual, Calcuta mixto, Ryder.
 * Se resuelven al torneo fuente más reciente de cada tipo (o env override).
 */

export type TemplateRole = "anual" | "calcuta_mixto" | "ryder";

export type TemplatePreset = {
  key: TemplateRole | "blank" | "other";
  label: string;
  description: string;
};

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "anual",
    label: "Torneo Anual",
    description:
      "Stroke play por rondas y categorías. Copia convocatoria, premios, cortes, tees y hoyos del Anual de referencia.",
  },
  {
    key: "calcuta_mixto",
    label: "Calcuta mixto",
    description:
      "Match play con subasta / calcuta. Copia reglas de parejas, consolación y calcuta del torneo Mixto de referencia.",
  },
  {
    key: "ryder",
    label: "Ryder (parejas e individual)",
    description:
      "Copa Ryder: sesiones, foursomes/fourball y singles. Copia la configuración del torneo Ryder de referencia.",
  },
  {
    key: "blank",
    label: "Crear desde cero",
    description:
      "Torneo en blanco: solo nombre, club y formato base. Configuras reglas después.",
  },
  {
    key: "other",
    label: "Otro torneo…",
    description:
      "Elige cualquier torneo previo y clona todas sus reglas (no inscripciones ni resultados).",
  },
];

export type TournamentLiteForTemplate = {
  id: string;
  name: string | null;
  short_name?: string | null;
  start_date?: string | null;
  settings?: unknown;
  is_archived?: boolean | null;
  kind?: string | null;
};

function formatType(settings: unknown): string {
  if (!settings || typeof settings !== "object") return "stroke";
  const fmt = (settings as { format?: { format_type?: unknown } }).format;
  return String(fmt?.format_type ?? "stroke").toLowerCase();
}

function matchplayVariant(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null;
  const v = (settings as { format?: { matchplay_variant?: unknown } }).format
    ?.matchplay_variant;
  if (v == null) return null;
  return String(v).toLowerCase();
}

function templateRoleInSettings(settings: unknown): TemplateRole | null {
  if (!settings || typeof settings !== "object") return null;
  const role = (settings as { template_role?: unknown }).template_role;
  if (role === "anual" || role === "calcuta_mixto" || role === "ryder") {
    return role;
  }
  return null;
}

function nameHintsRole(name: string | null | undefined): TemplateRole | null {
  const n = String(name ?? "").toLowerCase();
  if (!n) return null;
  if (/\bryder\b|copa\s*ryder/.test(n)) return "ryder";
  if (/calcuta|calcutta|mixto/.test(n)) return "calcuta_mixto";
  if (/anual/.test(n)) return "anual";
  return null;
}

/** Clasifica un torneo ya creado en una de las 3 plantillas operativas. */
export function classifyTournamentTemplate(
  t: TournamentLiteForTemplate
): TemplateRole | null {
  const fromSettings = templateRoleInSettings(t.settings);
  if (fromSettings) return fromSettings;

  const variant = matchplayVariant(t.settings);
  if (variant === "ryder") return "ryder";

  const ft = formatType(t.settings);
  if (ft === "matchplay") return "calcuta_mixto";
  if (ft === "stroke" || ft === "stableford") {
    return nameHintsRole(t.name) ?? nameHintsRole(t.short_name) ?? "anual";
  }
  return nameHintsRole(t.name) ?? nameHintsRole(t.short_name);
}

function envTemplateId(role: TemplateRole): string | null {
  const map: Record<TemplateRole, string | undefined> = {
    anual: process.env.TOURNAMENT_TEMPLATE_ANUAL_ID,
    calcuta_mixto: process.env.TOURNAMENT_TEMPLATE_CALCUTA_ID,
    ryder: process.env.TOURNAMENT_TEMPLATE_RYDER_ID,
  };
  const v = String(map[role] ?? "").trim();
  return v || null;
}

/**
 * Elige el torneo fuente de cada rol: env > marcar template_role >
 * clasificación de formato/nombre (más reciente primero).
 */
export function pickTemplateSourceIds(
  tournaments: TournamentLiteForTemplate[]
): Record<TemplateRole, string | null> {
  const live = tournaments.filter(
    (t) =>
      !t.is_archived &&
      t.kind !== "daily_round" &&
      t.kind !== "practice"
  );

  // Prefer explicit template_role, then by recency within class.
  const byRole: Record<TemplateRole, TournamentLiteForTemplate[]> = {
    anual: [],
    calcuta_mixto: [],
    ryder: [],
  };

  for (const t of live) {
    const role = classifyTournamentTemplate(t);
    if (role) byRole[role].push(t);
  }

  const pick = (role: TemplateRole): string | null => {
    const envId = envTemplateId(role);
    if (envId && live.some((t) => t.id === envId)) return envId;

    const explicit = byRole[role].filter(
      (t) => templateRoleInSettings(t.settings) === role
    );
    if (explicit[0]) return explicit[0].id;

    return byRole[role][0]?.id ?? null;
  };

  return {
    anual: pick("anual"),
    calcuta_mixto: pick("calcuta_mixto"),
    ryder: pick("ryder"),
  };
}

/** Defaults de settings/formato al crear desde plantilla sin fuente. */
export function defaultSettingsForTemplateRole(
  role: TemplateRole | "blank"
): Record<string, unknown> {
  if (role === "ryder") {
    return {
      template_role: "ryder",
      format: {
        format_type: "matchplay",
        matchplay_variant: "ryder",
        round_count: 3,
        holes: 18,
        scoring_mode: "gross",
      },
      matchplay: { match_type: "pairs", bracket_main_pairs: null },
    };
  }
  if (role === "calcuta_mixto") {
    return {
      template_role: "calcuta_mixto",
      format: {
        format_type: "matchplay",
        round_count: 4,
        holes: 18,
        scoring_mode: "gross",
      },
      matchplay: { match_type: "pairs", bracket_main_pairs: 16 },
    };
  }
  if (role === "anual") {
    return {
      template_role: "anual",
      format: {
        format_type: "stroke",
        round_count: 3,
        holes: 18,
      },
    };
  }
  return {
    format: {
      format_type: "stroke",
      round_count: 1,
      holes: 18,
    },
  };
}
