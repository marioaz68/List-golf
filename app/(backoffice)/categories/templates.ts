export type CategoryTemplateKey =
  | "basic_men_ladies"
  | "flights_a_b_c"
  | "senior_championship"
  | "mixed_open";

export type CategoryTemplateItem = {
  code: string;
  name: string;
  gender: "M" | "F" | "X";
  category_group: "main" | "senior" | "ladies" | "super_senior" | "mixed";
  handicap_min: number;
  handicap_max: number;
  is_active: boolean;
};

export type CategoryTemplateDef = {
  key: CategoryTemplateKey;
  name: string;
  description: string;
  items: CategoryTemplateItem[];
};

export const CATEGORY_TEMPLATES: CategoryTemplateDef[] = [
  {
    key: "basic_men_ladies",
    name: "Básica Caballeros / Damas",
    description:
      "Modelo general para torneos normales con categorías de caballeros y damas.",
    items: [
      {
        code: "CAB_A",
        name: "Caballeros A",
        gender: "M",
        category_group: "main",
        handicap_min: -5,
        handicap_max: 9,
        is_active: true,
      },
      {
        code: "CAB_B",
        name: "Caballeros B",
        gender: "M",
        category_group: "main",
        handicap_min: 10,
        handicap_max: 18,
        is_active: true,
      },
      {
        code: "CAB_C",
        name: "Caballeros C",
        gender: "M",
        category_group: "main",
        handicap_min: 19,
        handicap_max: 54,
        is_active: true,
      },
      {
        code: "DAM_A",
        name: "Damas A",
        gender: "F",
        category_group: "ladies",
        handicap_min: -5,
        handicap_max: 18,
        is_active: true,
      },
      {
        code: "DAM_B",
        name: "Damas B",
        gender: "F",
        category_group: "ladies",
        handicap_min: 19,
        handicap_max: 54,
        is_active: true,
      },
    ],
  },
  {
    key: "flights_a_b_c",
    name: "Flights A / B / C",
    description:
      "Modelo compacto por flights, útil para eventos rápidos o torneos internos.",
    items: [
      {
        code: "FLT_A",
        name: "Flight A",
        gender: "X",
        category_group: "mixed",
        handicap_min: -5,
        handicap_max: 9,
        is_active: true,
      },
      {
        code: "FLT_B",
        name: "Flight B",
        gender: "X",
        category_group: "mixed",
        handicap_min: 10,
        handicap_max: 18,
        is_active: true,
      },
      {
        code: "FLT_C",
        name: "Flight C",
        gender: "X",
        category_group: "mixed",
        handicap_min: 19,
        handicap_max: 54,
        is_active: true,
      },
    ],
  },
  {
    key: "senior_championship",
    name: "Campeonato con Senior",
    description:
      "Modelo para campeonato principal agregando senior y super senior.",
    items: [
      {
        code: "CHAMP",
        name: "Campeonato",
        gender: "M",
        category_group: "main",
        handicap_min: -5,
        handicap_max: 8,
        is_active: true,
      },
      {
        code: "AA",
        name: "Caballeros AA",
        gender: "M",
        category_group: "main",
        handicap_min: 9,
        handicap_max: 15,
        is_active: true,
      },
      {
        code: "A",
        name: "Caballeros A",
        gender: "M",
        category_group: "main",
        handicap_min: 16,
        handicap_max: 22,
        is_active: true,
      },
      {
        code: "B",
        name: "Caballeros B",
        gender: "M",
        category_group: "main",
        handicap_min: 23,
        handicap_max: 54,
        is_active: true,
      },
      {
        code: "SR",
        name: "Senior",
        gender: "M",
        category_group: "senior",
        handicap_min: -5,
        handicap_max: 54,
        is_active: true,
      },
      {
        code: "SSR",
        name: "Super Senior",
        gender: "M",
        category_group: "super_senior",
        handicap_min: -5,
        handicap_max: 54,
        is_active: true,
      },
      {
        code: "DAM",
        name: "Damas",
        gender: "F",
        category_group: "ladies",
        handicap_min: -5,
        handicap_max: 54,
        is_active: true,
      },
    ],
  },
  {
    key: "mixed_open",
    name: "Abierto Mixto",
    description:
      "Modelo mixto simple para torneos abiertos con menos categorías.",
    items: [
      {
        code: "MIX_1",
        name: "Mixto 1",
        gender: "X",
        category_group: "mixed",
        handicap_min: -5,
        handicap_max: 14,
        is_active: true,
      },
      {
        code: "MIX_2",
        name: "Mixto 2",
        gender: "X",
        category_group: "mixed",
        handicap_min: 15,
        handicap_max: 24,
        is_active: true,
      },
      {
        code: "MIX_3",
        name: "Mixto 3",
        gender: "X",
        category_group: "mixed",
        handicap_min: 25,
        handicap_max: 54,
        is_active: true,
      },
    ],
  },
];

export function getCategoryTemplateByKey(key: string | null | undefined) {
  return CATEGORY_TEMPLATES.find((t) => t.key === key) ?? null;
}