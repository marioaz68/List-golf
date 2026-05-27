/**
 * Instructivo informativo para actualización mensual de la base de datos
 * que alimenta los reportes GHIN del comité de handicap.
 *
 * Fuente: Obsidian / Handicaps CCQ / "10 - Actualización mensual de la base de datos.md"
 * Última sincronización: 2026-05-27
 */

export const MONTHLY_DB_UPDATE_TITLE =
  "Actualización mensual de la base de datos — Handicaps CCQ";

/** Resumen corto para mostrar arriba del modal. */
export const MONTHLY_DB_UPDATE_SUMMARY =
  "Esta actualización se hace una vez al mes (idealmente el día 20 para tener data del mes completo). Si quieres reportes individuales actualizados, primero hay que refrescar estos archivos.";

/** Pasos rápidos (TL;DR) para el modal informativo. */
export const MONTHLY_DB_UPDATE_QUICK_STEPS: string[] = [
  "Abre USGA Admin Portal → usuario CCQ.",
  "Re-exporta los 7 reportes obligatorios.",
  "Reemplaza los archivos en Archivos fuente/ y Archivos fuente/Hole by Hole/.",
  "Borra los archivos viejos para evitar confusión.",
  "Avísale a Claude que actualizaste + a qué jugadores quieres reportes.",
  "Claude regenera el Buró y los reportes individuales.",
];

/** Lista de archivos obligatorios con su ruta destino. */
export type MonthlyDbFileSpec = {
  order: number;
  title: string;
  filename: string;
  destination: string;
  notes: string[];
};

export const MONTHLY_DB_FILES: MonthlyDbFileSpec[] = [
  {
    order: 1,
    title: "Hole by Hole Score Reports (LO MÁS IMPORTANTE)",
    filename:
      "Hole by Hole Scores Report Damas / Hombres ene <mes> 26.xlsx",
    destination: "Archivos fuente/Hole by Hole/",
    notes: [
      "Date Range 01/01/2026 → hoy. Gender: Female y luego Male.",
      "Status Active. NO filtres por torneo ni por tee.",
      "Si tiene paginación, exportar TODAS las páginas (Export all).",
      "El archivo debe tener al menos 10,000 filas (5 meses × ~450 hombres × ~5 rondas).",
      "GHIN solo en la primera fila de cada jugador es NORMAL (formato agrupado).",
    ],
  },
  {
    order: 2,
    title: "Handicap Index History Report (HI mensual)",
    filename:
      "Handicap Index History Report ultimos 12 meses <mes> 26.xlsx",
    destination: "Archivos fuente/",
    notes: ["Period: Last 12 months. Status Active.", "Reemplaza el viejo."],
  },
  {
    order: 3,
    title: "Played / Posted Report (Patrón 4)",
    filename:
      "Played _ Posted Report (Player Rounds) 2021 a <mes> <día> 26.xlsx",
    destination: "Archivos fuente/",
    notes: [
      "Date Range 01/01/2021 → hoy. Status Active.",
      "Sirve para ver % posteado el mismo día por jugador.",
    ],
  },
  {
    order: 4,
    title: "Low Handicap Index Report",
    filename: "Low Handicap Index Report 21 26.xlsx",
    destination: "Archivos fuente/",
    notes: [
      "Período 2021-2026.",
      "HI más bajo en últimos 3 / 6 / 12 meses por jugador.",
    ],
  },
  {
    order: 5,
    title: "Exceptional Score Reduction Report (ESR)",
    filename: "Exceptional Score Reduction Report 21 26.xlsx",
    destination: "Archivos fuente/",
    notes: [
      "Período amplio (2021-actual).",
      "Reducciones automáticas que USGA aplicó por scores excepcionales.",
    ],
  },
  {
    order: 6,
    title: "Most Improved Golfer Report",
    filename: "Most Improved Golfer Report 21 26.xlsx",
    destination: "Archivos fuente/",
    notes: ["Período 2021-actual.", "Jugadores que más mejoraron su HI."],
  },
  {
    order: 7,
    title: "Roster del club (GHIN golfistas activos)",
    filename: "Ghin golfistas activos ccq.xlsx",
    destination: "Archivos fuente/",
    notes: ["Admin Portal → Members / Golfers List. Filter Status Active."],
  },
];

export const MONTHLY_DB_CHECKLIST: string[] = [
  "Mes: ___________________",
  "Hole by Hole Damas año actual (carpeta /Hole by Hole/)",
  "Hole by Hole Hombres año actual (carpeta /Hole by Hole/)",
  "Handicap Index History (12 meses)",
  "Played / Posted Report",
  "Low Handicap Index Report",
  "Exceptional Score Reduction Report",
  "Most Improved Golfer Report",
  "Roster Ghin golfistas activos",
  "Verificar tamaños (Hole by Hole > 10K filas)",
  "Avisar a Claude que regenere pipeline",
];

export type MonthlyDbCommonError = {
  title: string;
  symptom: string;
  cause: string;
  fix: string;
};

export const MONTHLY_DB_COMMON_ERRORS: MonthlyDbCommonError[] = [
  {
    title: "Reporte truncado / paginado",
    symptom:
      "El archivo Hole by Hole tiene ~600 filas cuando debería tener 10,000+.",
    cause:
      "GHIN Admin Portal pagina los reportes y a veces solo exporta la primera página.",
    fix: "Buscar 'Export All Pages' o 'Show All'. Si no existe, bajar por trimestre y combinar. Hombres año completo ≈ 2.6 MB; año en curso (5 meses) ≈ 1.4 MB.",
  },
  {
    title: "Archivo de bloqueo ~$...",
    symptom: "Aparecen DOS archivos con el mismo nombre, uno empieza con ~$.",
    cause: "Tienes el archivo abierto en Excel. ~$ es un lock file, no datos.",
    fix: "Cierra Excel antes de borrar o sincronizar. Claude ignora ~$ automáticamente.",
  },
  {
    title: "Filtro fantasma",
    symptom: "Aparecen muy pocos jugadores (ej. 81 damas vs 200+ esperados).",
    cause: "Quedó un filtro activo de la sesión previa.",
    fix: "Antes de exportar dar 'Clear filters' o resetear todos los filtros.",
  },
  {
    title: "Formato agrupado del Hole by Hole",
    symptom:
      "El GHIN solo aparece en la primera fila de cada jugador; las siguientes están vacías en la columna A.",
    cause: "Es como GHIN exporta el reporte. NO es error.",
    fix: "Claude aplica forward-fill (ffill) en el procesamiento. Déjalo así.",
  },
];

export const MONTHLY_DB_CLAUDE_MESSAGE = `Ya actualicé los archivos de mes ____. Regenera:

1. El Buró de Handicap completo
2. Los reportes individuales de los siguientes jugadores:
   - GHIN ____
   - GHIN ____

Aplica ffill correctamente (ver nota 08).`;
