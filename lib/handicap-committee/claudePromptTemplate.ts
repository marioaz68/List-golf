/**
 * Plantilla del instructivo para pedir reportes HTML a Claude.
 * Actualiza este archivo cuando cambie el instructivo en Obsidian
 * (Handicaps CCQ / 09 - Instructivo para pedir reportes de jugador.md).
 *
 * Placeholders dentro del prompt:
 *   [JUGADORES_AQUI]      → líneas "GHIN | Nombre | HI del Torneo"
 *   {{TOURNAMENT_NAME}}   → nombre del torneo
 *   {{GENERATED_AT}}      → fecha-hora de generación
 *   {{PLAYER_COUNT}}      → cantidad de jugadores marcados
 *   {{PLAYER_TABLE_ROWS}} → filas de la tabla resumen
 */

export const CLAUDE_PROMPT_PLACEHOLDER = "[JUGADORES_AQUI]";

export const CLAUDE_PROMPT_TEMPLATE = `# Instructivo para pedir reportes individuales de jugador

> Generado desde List.golf — torneo: {{TOURNAMENT_NAME}}
> Fecha: {{GENERATED_AT}}
> Jugadores en revisión de comité: {{PLAYER_COUNT}}

Copia este texto completo y pégalo en una conversación nueva con Claude. La lista de GHIN + nombre + HI del torneo ya viene poblada abajo.

---

## 📋 PROMPT PARA COPIAR Y PEGAR

\`\`\`
Necesito generar reportes individuales en HTML para los siguientes jugadores
del torneo: {{TOURNAMENT_NAME}}

Formato por cada jugador: GHIN | Nombre | HI del Torneo

Lista:

${CLAUDE_PROMPT_PLACEHOLDER}

Ejemplo del formato:

584513 | Mario Álvarez Zerecero | 1.9
11126992 | Gabriela Osornio Alvarez | 23.3
591602 | Alejandra Olvera Septien | 7.6

IMPORTANTE: el "HI del Torneo" es el HI fijo asignado al jugador para ese
torneo específico (el que aparece en el tablero oficial / Excel del Comité),
NO el HI de alta actual de GHIN. Este es el HI de referencia contra el cual
se compara el HI Solo Torneos para determinar si requiere revisión.

Por favor:

1. Extrae la información de mi vault de Obsidian en CEREBRO GALLO,
   específicamente del proyecto Handicaps CCQ que está en:
   /Users/marioalvarez/Dropbox/MARIO ALVAREZ ZERECERO/CEREBRO GALLO/Cerebro Gallo/Proyectos/Handicaps CCQ/

2. Usa los archivos Hole by Hole que están en:
   Archivos fuente/Hole by Hole/
   Recuerda aplicar forward-fill (ffill) al GHIN, nombre y demás
   columnas porque vienen agrupados (problema documentado en
   "08 - Problemas conocidos y validaciones obligatorias.md").

3. Usa también:
   - "Handicap Index History Report ultimos 12 meses mayo 26.xlsx"
     para el historial mensual de HI
   - "buro_data.json" (en outputs) para los perfiles detallados

4. Genera UN ARCHIVO HTML POR JUGADOR usando la plantilla:
   Jugadores en revision comite/_TEMPLATE_reporte_jugador.html
   Nombra cada archivo con el GHIN: {ghin}.html
   Guarda los archivos en la carpeta:
   /Users/marioalvarez/Dropbox/MARIO ALVAREZ ZERECERO/CEREBRO GALLO/Cerebro Gallo/Proyectos/Handicaps CCQ/Jugadores en revision comite/

5. CADA REPORTE debe incluir:

   📊 DATOS BÁSICOS (4 tarjetas arriba):
   - HI del TORNEO (el que viene en la lista — referencia fija)
   - HI Solo Torneos (WHS mejores 8 de 20)
   - CH del Campo 100% (calculado usando HI del Torneo, con tee y slope)
   - H 80% para Match Play (calculado a partir del CH 100%)

   NOTA: el HI Tablero oficial GHIN se ignora — usa SIEMPRE el HI del
   torneo que viene en la lista. Si no viene HI del torneo en la lista,
   pídeselo al usuario antes de proceder.

   🎯 CUADRO DE VEREDICTO Y AJUSTE:
   - Diferencia = HI del Torneo − HI Solo Torneos
   - Caso clasificado: NORMAL / REVISAR / BANDERA / INVERSO
   - Umbral Match Play: diferencia >1 stroke ya entra a revisión
   - Ajuste sugerido en strokes (sobre el HI del torneo)
   - HI final recomendado para el torneo
   - Vocabulario suavizado (sin "trampa", "sandbagger", "BANDERA ROJA")

   📈 GRÁFICA 1: Historial de HI Index (línea, últimos 12 meses)
   - Ancho mínimo 1400 px con scroll horizontal en móvil

   📊 GRÁFICA 2: Diferencial por Torneo
   - Ancho mínimo 1800 px (extrawide) por la cantidad de torneos
   - Scroll horizontal en móvil
   - Puntos rojos = cada torneo
   - Verdes = las 8 mejores (las que cuentan para HI Solo Torneos)
   - Línea naranja punteada = HI del TORNEO (referencia fija)
   - Línea verde punteada = HI Solo Torneos

   ⛳ GRÁFICA 3: Promedio BRUTO por Hoyo 2026 (barras coloreadas vs par)
   - Ancho mínimo 1400 px con scroll horizontal
   - Verde si bajo par
   - Gris si dentro de 0.5
   - Amarillo si hasta 1 sobre par
   - Rojo si más de 1 sobre par
   - LÍNEA NEGRA del par dibujada ENCIMA de las barras (order: 0)
   - Puntos del par con borde blanco y radio 6 para que se vea claro

   🎯 GRÁFICA 4: Promedio NETO por Hoyo 2026 (descontando H 80%)
   - Ancho mínimo 1400 px con scroll horizontal
   - Misma estructura que la gráfica 3 PERO con score neto
   - Para cada hoyo: NETO = BRUTO − strokes recibidos según H 80% y SI
   - Distribución de strokes: base = floor(H80/18), extra = H80%18 en los SI más bajos
   - Etiquetas del eje X muestran "Hoyo N (Par X) (-Y)" donde Y = strokes recibidos
   - Línea negra del par encima de las barras (igual que gráfica 3)
   - Tooltip muestra: Neto, Bruto − strokes recibidos
   - Colores iguales que gráfica 3 (verde/gris/amarillo/rojo vs par)

6. Mobile-friendly:
   - Meta viewport configurado
   - Layout responsive (1 columna en móvil)
   - Botones grandes para touch
   - Funciona en Safari iOS, Chrome Android, Samsung Internet
   - GRÁFICAS CON EJE Y FIJO Y SCROLL HORIZONTAL:
     * .chart-wrap usa display: flex (no overflow directo)
     * .y-axis-canvas: 60px de ancho, fijo a la izquierda, contiene
       el canvas yChart_X que muestra SOLO el eje Y con valores
     * .scroll-canvas: el resto del ancho, overflow-x: auto +
       -webkit-overflow-scrolling: touch
     * .chart-inner dentro de scroll-canvas: min-width 1400px (wide)
       o 1800px (extrawide)
     * El canvas principal (chartXxx) NO muestra ticks ni título del eje Y
       (display: false). El eje Y solo se muestra en yChart_X (canvas fijo).
     * AMBOS canvas usan los MISMOS yMin/yMax para que las escalas coincidan
       exactamente.
   - Helper JS makeYAxisOnlyChart(canvasId, type, yMin, yMax, yTitle):
     crea un chart "fantasma" con un dataset transparente que solo
     renderea el eje Y con la escala correcta
   - Debajo de cada gráfica un texto "← desliza para ver toda la gráfica →"
   - BOTÓN TOGGLE de ZOOM en cada gráfica:
     * Cada chart-section tiene un botón "📱 Ajustar" en la esquina
       superior derecha del título
     * Al hacer click: alterna clase \`.compact\` en el \`.chart-wrap\`
       - Modo expandido (default): gráfica con scroll horizontal, ancho 1400/1800
       - Modo ajustado (compact): chart-inner con \`min-width: 100% !important\`
         y overflow-x: hidden — la gráfica se ajusta al ancho del móvil
     * El icono y label cambian dinámicamente:
       - Modo expandido: 📱 + "Ajustar"
       - Modo compact: 🔍 + "Expandir"
     * En compact, el texto "← desliza" se oculta automáticamente
     * Función JS toggleZoom(btn) dispara también window.dispatchEvent('resize')
       para que Chart.js redibuje al nuevo ancho

7. Archivos AUTOCONTENIDOS:
   - Todos los datos del jugador embebidos en el HTML
   - Sin dependencias externas excepto Chart.js (vía CDN)
   - Se pueden compartir por WhatsApp, mail, AirDrop, Dropbox

8. Al terminar, dame:
   - Lista de archivos generados con su tamaño
   - Ruta de la carpeta donde quedaron
   - Links computer:// para abrir cada uno

CRÍTICO: aplica el ffill correctamente. El archivo Hole by Hole tiene
formato agrupado: el GHIN solo aparece en la primera fila de cada
jugador y las siguientes filas tienen GHIN vacío pero pertenecen al
mismo jugador. Sin ffill, los reportes salen incompletos.
\`\`\`

---

## 👥 Jugadores marcados para revisión ({{PLAYER_COUNT}})

| # | GHIN | Nombre | HI Torneo | Motivo |
|---|------|--------|-----------|--------|
{{PLAYER_TABLE_ROWS}}

---

## ✅ CHECKLIST QUE CLAUDE DEBE VERIFICAR

Al recibir tu petición, Claude debe:

- Aplicar ffill al cargar los archivos Hole by Hole
- Verificar que cada jugador tenga al menos 1 ronda de torneo (si no, avisar)
- Calcular HI Solo Torneos con mejores 8 de últimas 20
- USAR EL HI DEL TORNEO que viene en la lista del usuario, NO el hi_roster de buro_data.json. Si no viene HI del torneo, pedirlo.
- El HI del torneo es la referencia FIJA — todos los cálculos y comparaciones se hacen contra este valor, no contra el HI oficial
- Usar slopes correctos según tee (Rojas/Blancas/Azules/Doradas/Negras)
- Calcular CH del Campo (100%) usando HI_torneo × (Slope/113) + (CR − Par)
- Calcular H 80% Match Play = round(CH 100% × 0.80)
- Pasar \`h_80\` al \`data_json\` para que la gráfica 4 (NETO) lo use
- Distribuir strokes por hoyo: base = floor(H80/18), extra = H80%18 en SI más bajos
- Generar la diferencia (HI Torneo − HI Solo Torneos) para clasificar caso
- Aplicar vocabulario suavizado (sin "sandbagger", etc.)
- La línea naranja de la gráfica 2 = HI del Torneo (no el HI oficial)
- Verificar que las 4 gráficas se rendericen correctamente
- Confirmar que la línea del par esté ENCIMA de las barras (gráficas 3 y 4)
- Confirmar scroll horizontal en cada gráfica (wide / extrawide)
- Confirmar EJE Y FIJO a la izquierda — al deslizar el contenido, los valores numéricos del eje Y permanecen visibles
- Verificar que \`yMin\` / \`yMax\` sean idénticos entre el canvas de eje Y y el canvas principal (escalas alineadas)
- Verificar BOTÓN TOGGLE 📱/🔍 en cada gráfica funciona: alterna entre ancho expandido (con scroll) y ajustado a pantalla
- Sincronizar archivos a CEREBRO GALLO Y a la carpeta de proyecto

---

## 📁 UBICACIONES IMPORTANTES

| Qué | Dónde |
|-----|-------|
| Vault Obsidian | \`/Users/marioalvarez/Dropbox/MARIO ALVAREZ ZERECERO/CEREBRO GALLO/Cerebro Gallo/Proyectos/Handicaps CCQ/\` |
| Archivos Hole by Hole | \`Archivos fuente/Hole by Hole/\` |
| Plantilla del reporte | \`Jugadores en revision comite/_TEMPLATE_reporte_jugador.html\` |
| Reportes generados | \`Jugadores en revision comite/<GHIN>.html\` |
| Buró principal | \`Reportes/Buró de Handicap.html\` |
| Datos JSON | \`outputs/buro_data.json\` |
| Nota de problemas | \`08 - Problemas conocidos y validaciones obligatorias.md\` |

---

*Después de generar los HTML, súbelos en List.golf → Jugadores → Archivos GHIN (carga masiva por nombre \`{ghin}.html\`).*
`;

export type FlaggedPlayerForPrompt = {
  ghin: string | null;
  fullName: string;
  reason: string | null;
  /** HI asignado al jugador para este torneo (handicap_index de la inscripción). */
  hiTorneo: number | null;
};

function formatHi(hi: number | null | undefined): string {
  if (hi == null || !Number.isFinite(hi)) return "—";
  return hi.toFixed(1);
}

export function formatPlayerLine(p: FlaggedPlayerForPrompt): string {
  const ghin = (p.ghin ?? "").trim() || "SIN_GHIN";
  const name = p.fullName.trim() || "Sin nombre";
  const hi = formatHi(p.hiTorneo);
  return `${ghin} | ${name} | ${hi}`;
}

/** Bloque GHIN | Nombre | HI del Torneo para el prompt (una línea por jugador). */
export function formatPlayerListForPrompt(
  players: FlaggedPlayerForPrompt[]
): string {
  if (players.length === 0) return "(ningún jugador marcado)";
  return players.map(formatPlayerLine).join("\n");
}

export function formatPlayerTableRows(players: FlaggedPlayerForPrompt[]): string {
  if (players.length === 0) {
    return "| — | — | — | — | — |";
  }
  return players
    .map((p, i) => {
      const ghin = (p.ghin ?? "").trim() || "—";
      const name = p.fullName.trim() || "—";
      const hi = formatHi(p.hiTorneo);
      const reason = (p.reason ?? "").trim() || "—";
      return `| ${i + 1} | ${ghin} | ${name} | ${hi} | ${reason} |`;
    })
    .join("\n");
}

export function buildClaudePromptMarkdown(params: {
  tournamentName: string;
  players: FlaggedPlayerForPrompt[];
  generatedAt?: Date;
}): string {
  const { tournamentName, players } = params;
  const generatedAt =
    params.generatedAt?.toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }) ?? new Date().toLocaleString("es-MX");

  const playersBlock = formatPlayerListForPrompt(players);

  return CLAUDE_PROMPT_TEMPLATE.replace(/\{\{TOURNAMENT_NAME\}\}/g, tournamentName)
    .replace(/\{\{GENERATED_AT\}\}/g, generatedAt)
    .replace(/\{\{PLAYER_COUNT\}\}/g, String(players.length))
    .replace(/\{\{PLAYER_TABLE_ROWS\}\}/g, formatPlayerTableRows(players))
    .replace(CLAUDE_PROMPT_PLACEHOLDER, playersBlock);
}

export function slugifyForFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase() || "torneo";
}

export function buildPromptDownloadFilename(
  tournamentName: string,
  generatedAt = new Date()
): string {
  const slug = slugifyForFilename(tournamentName);
  const stamp = generatedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .slice(0, 15);
  return `prompt-comite-${slug}-${stamp}.doc`;
}
