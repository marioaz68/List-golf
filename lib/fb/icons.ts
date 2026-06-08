/**
 * Mapeo de emojis para items del menú F&B.
 *
 * Estrategia en cascada:
 *  1. Match por keyword del nombre — el PRIMER match en orden gana.
 *     Por eso los keywords más específicos están arriba (ej. "huevos
 *     rancheros" antes que "huevos").
 *  2. Si nada matchea, cae al emoji default de la categoría.
 *  3. Si ni eso, genérico 🍽️.
 *
 * El restaurante puede sobreescribir poniendo un emoji al inicio del
 * nombre del item desde /fb-admin (ej. "🌶️ Hamburguesa picosa").
 */

const CATEGORY_ICONS: Record<string, string> = {
  aguachiles_ceviches: "🦐",
  entradas: "🥑",
  tostadas: "🌮",
  hamburguesas: "🍔",
  alitas: "🍗",
  pokes: "🍣",
  pastas: "🍝",
  burritos: "🌯",
  ensaladas: "🥗",
  desayunos_huevos: "🍳",
  desayunos_bowls: "🥣",
  desayunos_extras: "🥞",
  tacos_guiso: "🌮",
  quesadillas: "🫓",
  sandwiches: "🥪",
  tortas: "🥖",
  platillos: "🍽️",
  postres: "🍰",
  bebidas_frias: "🥤",
  cervezas: "🍺",
  cocteles: "🍹",
  destilados: "🥃",
  cafe: "☕",
  snacks: "🍿",
};

/**
 * Lista ordenada de keyword → emoji. EL PRIMER MATCH GANA, así que los
 * patrones más específicos deben ir ANTES de los genéricos.
 *
 * Filosofía: si un item tiene un ingrediente icónico (camarón, chocolate,
 * chorizo, mango), usamos ese emoji; si no, caemos al emoji de la familia.
 */
const KEYWORD_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  // ============ DESAYUNOS HUEVOS (específicos antes que genéricos) ============
  [/huevos?\s+rancheros|chilaquiles\s+rojos/i, "🌶️"],
  [/huevos?\s+a\s+la\s+mexicana/i, "🌶️"],
  [/huevos?\s+divorciados/i, "🍳"],
  [/huevos?\s+con\s+chorizo/i, "🌶️"],
  [/huevos?\s+con\s+salchicha/i, "🌭"],
  [/huevos?\s+con\s+jam[oó]n/i, "🥓"],
  [/huevos?\s+estrellados/i, "🍳"],
  [/huevos?\s+revueltos/i, "🍳"],
  [/huevos?\s+cocidos/i, "🥚"],
  [/omelette.*tocino/i, "🥓"],
  [/omelette.*espinaca|omelette.*verdura/i, "🥦"],
  [/omelette.*queso|omelette.*jam[oó]n/i, "🧀"],
  [/omelette/i, "🍳"],

  // ============ DESAYUNOS BOWLS ============
  [/acai/i, "🫐"],
  [/bowl\s*de\s*frutas/i, "🍓"],
  [/bowl\s*de\s*avena/i, "🌾"],
  [/parfait/i, "🍨"],
  [/avocado\s*toast/i, "🥑"],
  [/salm[oó]n\s*toast/i, "🐟"],
  [/^toast/i, "🍞"],

  // ============ CHILAQUILES Y ENCHILADAS ============
  [/chilaquiles\s+verdes/i, "🌿"],
  [/chilaquiles/i, "🌶️"],
  [/enchiladas\s+verdes/i, "🌿"],
  [/enchiladas/i, "🌶️"],
  [/waffles/i, "🧇"],

  // ============ TACOS Y QUESADILLAS ============
  [/taco\s+de\s+chile\s+relleno|taco\s+de\s+chile\s+negro/i, "🌶️"],
  [/taco\s+de\s+carnitas|taco\s+de\s+cochinita/i, "🐖"],
  [/taco\s+de\s+milanesa/i, "🍖"],
  [/taco\s+de\s+copete/i, "🥩"],
  [/tacos?\s+de\s+pescado|taco\s+de\s+atun/i, "🐟"],
  [/tacos?\s+de\s+camar[oó]n/i, "🦐"],
  [/tacos?\s+de\s+arrachera|^tacos?\s/i, "🌮"],
  [/quesadilla.*guiso/i, "🧀"],
  [/quesadilla/i, "🧀"],

  // ============ AGUACHILES / CEVICHES / MARISCOS ============
  [/aguachile\s+rojo/i, "🌶️"],
  [/aguachile\s+verde/i, "🥬"],
  [/aguachile/i, "🦐"],
  [/coctel\s*de\s*camar/i, "🦐"],
  [/ceviche\s+mixto/i, "🦐"],
  [/ceviche\s+(mexicano|la\s+palapa)/i, "🐟"],
  [/tostada\s+de\s+camar/i, "🦐"],
  [/tostada\s+de\s+aguachile/i, "🌶️"],
  [/tostada\s+de\s+(atun|pescado|salm[oó]n)/i, "🐟"],
  [/tartar\s+de\s+atun/i, "🐟"],
  [/carpaccio\s+de\s+salm/i, "🐟"],

  // ============ POKES ============
  [/poke\s+at[uú]n/i, "🐟"],
  [/poke\s+salm[oó]n/i, "🐟"],
  [/poke\s+camar/i, "🦐"],
  [/poke\s+vegetariano/i, "🥗"],
  [/poke/i, "🍣"],

  // ============ DE LA CASA ============
  [/hamburguesa/i, "🍔"],
  [/pepito\s+de\s+arrachera/i, "🥪"],

  // ============ ALITAS ============
  [/alitas?/i, "🍗"],

  // ============ ENTRADAS ============
  [/guacamole/i, "🥑"],
  [/aros\s+de\s+cebolla/i, "🧅"],
  [/papas?\s+a\s+la\s+francesa|papas?\s+mucho/i, "🍟"],

  // ============ PASTAS / PIZZAS ============
  [/pasta\s+bolo[ñn]esa/i, "🍝"],
  [/pasta\s+alfredo/i, "🍝"],
  [/pasta\s+(al\s+)?burro/i, "🍝"],
  [/extra\s+pollo/i, "🍗"],
  [/extra\s+tocino/i, "🥓"],
  [/extra\s+camar/i, "🦐"],
  [/pasta/i, "🍝"],
  [/pizza/i, "🍕"],

  // ============ BURRITOS ============
  [/burrito\s+de\s+arrachera/i, "🥩"],
  [/burrito\s+de\s+pollo/i, "🍗"],
  [/burrito/i, "🌯"],

  // ============ ENSALADAS ============
  [/ensalada\s+de\s+at[uú]n/i, "🐟"],
  [/ensalada/i, "🥗"],

  // ============ TORTAS ============
  [/torta\s+(de\s+)?cubana/i, "🥪"],
  [/torta\s+milanesa/i, "🍖"],
  [/torta.*chorizo/i, "🌶️"],
  [/torta\s+(de\s+)?jam[oó]n\s+con\s+queso/i, "🧀"],
  [/torta\s+(de\s+)?cochinita|torta\s+(de\s+)?carnitas/i, "🐖"],
  [/torta\s+(de\s+)?copete/i, "🥩"],
  [/torta\s+chori/i, "🌶️"],
  [/torta.*salchicha/i, "🌭"],
  [/torta.*huevo/i, "🍳"],
  [/torta\s+changa/i, "🥪"],
  [/torta/i, "🥖"],

  // ============ SÁNDWICHES ============
  [/club\s+s[aá]ndwich/i, "🥪"],
  [/s[aá]ndwich\s+de\s+pavo/i, "🦃"],
  [/s[aá]ndwich\s+de\s+at[uú]n/i, "🐟"],
  [/s[aá]ndwich/i, "🥪"],

  // ============ BEBIDAS FRÍAS (específicas primero) ============
  [/red\s*bull/i, "🔋"],
  [/gatorade|powerade/i, "🥤"],
  [/agua\s+mineral|topo\s*chico/i, "🫧"],
  [/agua\s+natural|agua\s+\d/i, "💧"],
  [/agua\s+de\s+jamaica/i, "🌺"],
  [/agua\s+de\s+horchata/i, "🥛"],
  [/limonada\s+mineral/i, "🫧"],
  [/limonada/i, "🍋"],
  [/naranjada/i, "🍊"],
  [/jugo\s+verde/i, "🥬"],
  [/jugo\s+de\s+naranja/i, "🍊"],
  [/jugo\s+jumex|jugo/i, "🧃"],
  [/t[eé]\s*helado|nestea/i, "🧊"],
  [/coca-?cola|coca\s+zero|coca\s+light/i, "🥤"],
  [/sprite|fanta|manzanita/i, "🥤"],

  // ============ CERVEZAS ============
  [/michelada/i, "🍻"],
  [/chelada/i, "🍺"],
  [/corona|modelo|pac[ií]fico|victoria|tecate|heineken|stella|bohemia|xx\s+(lager|ambar)|cerveza/i, "🍺"],

  // ============ DESTILADOS (todos comparten emoji 🥃) ============
  [/tequila|don\s*julio|centenario|clase\s*azul/i, "🥃"],
  [/mezcal/i, "🥃"],
  [/vodka|grey\s*goose|belvedere|absolut/i, "🥃"],
  [/whisky|whiskey|bourbon|buchanan|chivas|jim\s*beam/i, "🥃"],
  [/ron|bacardi/i, "🥃"],
  [/ginebra|tanqueray|hendrick|beefeater/i, "🥃"],
  [/brandy|torres/i, "🥃"],

  // ============ COCTELES Y VINOS ============
  [/margarita\s+de\s+mango/i, "🥭"],
  [/margarita\s+de\s+frutos\s+rojos/i, "🍓"],
  [/margarita/i, "🍸"],
  [/paloma|cantarito/i, "🍊"],
  [/mojito/i, "🌿"],
  [/cuba\s+libre/i, "🥃"],
  [/bloody\s+mary/i, "🍅"],
  [/tom\s+collins/i, "🍋"],
  [/aperol\s+spritz/i, "🥂"],
  [/negroni|manhattan|old\s+fashioned/i, "🍸"],
  [/whisky\s+sour/i, "🥃"],
  [/carajillo/i, "☕"],
  [/copa\s+de\s+vino\s+tinto|botella\s+de\s+vino\s+tinto/i, "🍷"],
  [/copa\s+de\s+vino\s+blanco|botella\s+de\s+vino\s+blanco/i, "🥂"],
  [/copa\s+de\s+vino\s+rosado/i, "🥂"],
  [/copa\s+de\s+espumoso|prosecco|cava/i, "🍾"],

  // ============ CAFÉ Y CALIENTES ============
  [/caf[eé]\s+mocha/i, "🍫"],
  [/caf[eé]\s+espresso|caf[eé]\s+doble\s+espresso/i, "☕"],
  [/caf[eé]\s+(americano|cappuccino|latte|cortado)/i, "☕"],
  [/chocolate\s+caliente/i, "🍫"],
  [/t[eé]\s+chai/i, "🍵"],
  [/t[eé]\s+caliente/i, "🍵"],
  [/leche\s+con\s+chocolate/i, "🍫"],
  [/atole/i, "🍵"],

  // ============ SNACKS ============
  [/m&m.*cacahuate/i, "🥜"],
  [/m&m/i, "🍫"],
  [/snickers|kitkat|chocolate/i, "🍫"],
  [/oreo|chokis|galleta/i, "🍪"],
  [/cacahuate/i, "🥜"],
  // Sabores específicos primero (para que ganen al regex genérico)
  [/papas?\s+sabritas\s+naturales/i, "🥔"],
  [/papas?\s+ruffles\s+queso/i, "🧀"],
  [/doritos\s+dinamita/i, "🌶️"],
  // Genéricos después
  [/papas?\s+sabritas|papas?\s+ruffles/i, "🍟"],
  [/doritos/i, "🌽"],
  [/cheetos/i, "🧀"],
  [/chips\s+de\s+pl[aá]tano/i, "🍌"],
  [/pretzels/i, "🥨"],
  [/tostitos|guacamole/i, "🥑"],
  [/chicharrones/i, "🌽"],
  [/granola|barra/i, "🌾"],
];

const DEFAULT_ICON = "🍽️";

/** Devuelve un emoji apropiado para el item del menú. */
export function iconForMenuItem(name: string, categoryCode?: string): string {
  for (const [rx, icon] of KEYWORD_ICONS) {
    if (rx.test(name)) return icon;
  }
  if (categoryCode && CATEGORY_ICONS[categoryCode]) {
    return CATEGORY_ICONS[categoryCode];
  }
  return DEFAULT_ICON;
}

/** Emoji solo por categoría (para títulos de sección). */
export function iconForCategory(categoryCode?: string): string {
  return (categoryCode && CATEGORY_ICONS[categoryCode]) || DEFAULT_ICON;
}
