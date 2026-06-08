/**
 * Mapeo de emojis para items del menú F&B.
 *
 * Estrategia en cascada:
 *  1. Si el nombre del item matchea un keyword específico (ej. "Corona" →
 *     🍺, "Tequila" → 🥃), gana ese.
 *  2. Si no, cae al emoji default de la categoría (ej. todo lo de
 *     'pokes' → 🍣).
 *  3. Si ni eso, emoji genérico 🍽️.
 *
 * El restaurante puede sobreescribir poniendo el emoji directo al inicio
 * del nombre desde /fb-admin (ej. "🍔 Hamburguesa especial").
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

/** Keywords más específicos. Se evalúan en orden — el primero que matchee gana. */
const KEYWORD_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Bebidas frías
  [/red\s*bull/i, "🔋"],
  [/gatorade|powerade/i, "🥤"],
  [/coca|sprite|fanta|manzanita|t[eé]\s*helado|nestea/i, "🥤"],
  [/agua\s*mineral|topo/i, "🫧"],
  [/agua\s*natural|agua\s*\d/i, "💧"],
  [/agua\s*de\s*(jamaica|horchata|sabor)/i, "🍹"],
  [/jugo|jumex|naranjada|limonada/i, "🧃"],

  // Alcoholes
  [/michelada|chelada/i, "🍻"],
  [/corona|modelo|pac[ií]fico|victoria|tecate|heineken|stella|bohemia|cerveza|xx/i, "🍺"],
  [/tequila|mezcal|clase\s*azul|don\s*julio/i, "🥃"],
  [/vodka|whisky|whiskey|bourbon|ron|ginebra|brandy/i, "🥃"],
  [/vino\s*tinto/i, "🍷"],
  [/vino\s*blanco|prosecco|espumoso|cava|rosado/i, "🥂"],
  [/margarita|paloma|mojito|cantarito|aperol|negroni|spritz/i, "🍸"],
  [/cuba\s*libre|tom\s*collins|manhattan|old\s*fashioned|whisky\s*sour|carajillo|bloody/i, "🍹"],

  // Café y calientes
  [/caf[eé]|espresso|cappuccino|latte|mocha|cortado|americano/i, "☕"],
  [/chocolate\s*caliente|atole|leche/i, "🥛"],
  [/t[eé]\s*(caliente|chai|verde|negro|manzanilla)/i, "🍵"],

  // Snacks
  [/cacahuat/i, "🥜"],
  [/papas?\s+(sabritas|ruffles|naturales|francesa)/i, "🍟"],
  [/papas?\s+mucho/i, "🍟"],
  [/aros\s+de\s+cebolla/i, "🧅"],
  [/doritos|cheetos|chips|pretzels|tostitos|chicharrones|frituras/i, "🥨"],
  [/granola|barra/i, "🌾"],
  [/oreo|chokis|galleta/i, "🍪"],
  [/snickers|kitkat|m&m|chocolate/i, "🍫"],

  // Comida
  [/hamburguesa/i, "🍔"],
  [/pepito|club\s*sandwich|s[aá]ndwich/i, "🥪"],
  [/torta\s+(cubana|milanesa|cochinita|copete|carnitas|huevo|jam[oó]n|cubana|chori|changa)/i, "🥪"],
  [/alitas?/i, "🍗"],
  [/poke/i, "🍣"],
  [/tostada/i, "🌮"],
  [/aguachile|ceviche/i, "🦐"],
  [/coctel\s*de\s*camar/i, "🦐"],
  [/sushi|salm[oó]n|at[uú]n|camar[oó]n|pescado/i, "🐟"],
  [/tartar/i, "🐟"],
  [/carpaccio/i, "🐟"],
  [/pasta|bolo[ñn]esa|alfredo|burro|spaghetti/i, "🍝"],
  [/pizza/i, "🍕"],
  [/burrito/i, "🌯"],
  [/quesadilla/i, "🫓"],
  [/taco\s*de\s*(copete|carnitas|milanesa|chile|cochinita|guiso|arrachera|pollo|pescado)/i, "🌮"],
  [/^tacos?\b/i, "🌮"],
  [/ensalada/i, "🥗"],
  [/avocado\s*toast|salm[oó]n\s*toast|toast/i, "🍞"],
  [/huevos?\s+(revueltos|estrellados|rancheros|divorciados|mexicana|jam[oó]n|salchicha|chorizo|cocidos)/i, "🍳"],
  [/omelette/i, "🍳"],
  [/waffles/i, "🧇"],
  [/chilaquiles|enchiladas/i, "🌶️"],
  [/bowl\s*de\s*frutas|parfait|bowl\s*de\s*avena/i, "🍓"],
  [/acai/i, "🫐"],
  [/bowl/i, "🥣"],
  [/guacamole/i, "🥑"],
  [/arrachera|sirloin|pollo|pechuga|carnitas|cochinita|chori|tocino|cubana|extra/i, "🥩"],
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
