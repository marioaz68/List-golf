/**
 * Mapeo de stock photos genéricas (Unsplash) por categoría y por keyword
 * del item del menú.
 *
 * Estrategia cascada:
 *  1. Si el nombre del item matchea un keyword específico → URL específica
 *  2. Si no, fallback a la URL de la categoría
 *  3. Si ni eso, devuelve null y el cliente cae al emoji
 *
 * Todas las URLs son de Unsplash con dimensiones forzadas (?w=600&q=80&auto=format&fit=crop)
 * para que carguen rápido y se vean bien en celular. Si una URL llegara a
 * fallar (404), el <img> dispara onError y el cliente cae al emoji.
 *
 * El restaurante puede sobreescribir item por item poniendo su propia foto
 * en image_url desde /fb-admin/emojis.
 */

const UNSPLASH = (id: string): string =>
  `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`;

const CATEGORY_PHOTOS: Record<string, string> = {
  aguachiles_ceviches: UNSPLASH("1559339352-11d035aa65de"),
  entradas: UNSPLASH("1541592106381-b31e9677c0e5"),
  tostadas: UNSPLASH("1565299585323-38d6b0865b47"),
  hamburguesas: UNSPLASH("1568901346375-23c9450c58cd"),
  alitas: UNSPLASH("1608039755401-742074f0548d"),
  pokes: UNSPLASH("1546069901-ba9599a7e63c"),
  pastas: UNSPLASH("1551183053-bf91a1d81141"),
  burritos: UNSPLASH("1626700051175-6818013e1d4f"),
  ensaladas: UNSPLASH("1512621776951-a57141f2eefd"),
  desayunos_huevos: UNSPLASH("1551504734-5ee1c4a1479b"),
  desayunos_bowls: UNSPLASH("1490645935967-10de6ba17061"),
  desayunos_extras: UNSPLASH("1528207776546-365bb710ee93"),
  tacos_guiso: UNSPLASH("1565299624946-b28f40a0ae38"),
  quesadillas: UNSPLASH("1618040996337-17c2f4ff3a51"),
  sandwiches: UNSPLASH("1567234669003-dce7a7a88821"),
  tortas: UNSPLASH("1481070555726-e2fe8357725c"),
  platillos: UNSPLASH("1546069901-ba9599a7e63c"),
  postres: UNSPLASH("1488477181946-6428a0291777"),
  bebidas_frias: UNSPLASH("1437418747212-8d9709afab22"),
  cervezas: UNSPLASH("1571613316887-6f8d5cbf7ef7"),
  cocteles: UNSPLASH("1551024709-8f23befc6f87"),
  destilados: UNSPLASH("1568644396922-5c3bfae12521"),
  cafe: UNSPLASH("1495474472287-4d71bcdd2085"),
  snacks: UNSPLASH("1566478989037-eec170784d0b"),
};

/**
 * Keywords específicos (más granular que la categoría). EL PRIMER MATCH GANA.
 * Solo defino lo que sí mejora significativamente vs. la categoría.
 */
const KEYWORD_PHOTOS: ReadonlyArray<readonly [RegExp, string]> = [
  // Huevos / desayunos
  [/huevos?\s+rancheros/i, UNSPLASH("1551504734-5ee1c4a1479b")],
  [/huevos?\s+a\s+la\s+mexicana/i, UNSPLASH("1525351484163-7529414344d8")],
  [/huevos?\s+revueltos/i, UNSPLASH("1607103058027-4c5e2d8e6e1f")],
  [/huevos?\s+estrellados/i, UNSPLASH("1551185618-5d8e8b8a3d20")],
  [/omelette/i, UNSPLASH("1565299507177-b0ac66763828")],
  [/chilaquiles/i, UNSPLASH("1599974579688-8dbdd335c77f")],
  [/enchiladas/i, UNSPLASH("1565299543923-37dd37887442")],
  [/waffles/i, UNSPLASH("1562376552-0d160a2f238d")],
  [/avocado\s*toast/i, UNSPLASH("1525351484163-7529414344d8")],

  // Bowls
  [/acai/i, UNSPLASH("1490474418585-ba9bad8fd0ea")],
  [/bowl\s*de\s*frutas/i, UNSPLASH("1490474418585-ba9bad8fd0ea")],
  [/bowl\s*de\s*avena/i, UNSPLASH("1517673400267-0251440c45dc")],
  [/parfait/i, UNSPLASH("1488477181946-6428a0291777")],

  // Tacos / quesadillas
  [/taco\s+de\s+pescado|tacos?\s+de\s+camar/i, UNSPLASH("1599974579688-8dbdd335c77f")],
  [/taco\s+de\s+(carnitas|cochinita)/i, UNSPLASH("1582169296194-e4d644c48063")],
  [/quesadilla/i, UNSPLASH("1618040996337-17c2f4ff3a51")],

  // Mariscos
  [/aguachile/i, UNSPLASH("1559339352-11d035aa65de")],
  [/ceviche/i, UNSPLASH("1626200419199-391ae4be7a40")],
  [/coctel\s*de\s*camar/i, UNSPLASH("1559847844-1eb31330836b")],
  [/poke/i, UNSPLASH("1546069901-ba9599a7e63c")],
  [/tostada\s+de/i, UNSPLASH("1565299585323-38d6b0865b47")],

  // De la casa
  [/hamburguesa/i, UNSPLASH("1568901346375-23c9450c58cd")],
  [/papas\s+a\s+la\s+francesa|papas\s+mucho/i, UNSPLASH("1573080496219-bb080dd4f877")],
  [/aros\s+de\s+cebolla/i, UNSPLASH("1639024471283-03518883512d")],
  [/alitas/i, UNSPLASH("1608039755401-742074f0548d")],
  [/guacamole/i, UNSPLASH("1601247309268-c4c87a14f0c7")],

  // Pastas / burritos
  [/pasta\s+bolo[ñn]esa/i, UNSPLASH("1572441713132-51c75654db73")],
  [/pasta\s+alfredo/i, UNSPLASH("1645112411341-6c4fd023714a")],
  [/pasta/i, UNSPLASH("1551183053-bf91a1d81141")],
  [/burrito/i, UNSPLASH("1626700051175-6818013e1d4f")],

  // Tortas / sandwiches
  [/club\s+s[aá]ndwich/i, UNSPLASH("1567234669003-dce7a7a88821")],
  [/s[aá]ndwich/i, UNSPLASH("1528735602780-2552fd46c7af")],
  [/torta/i, UNSPLASH("1481070555726-e2fe8357725c")],

  // Ensaladas
  [/ensalada\s+de\s+at[uú]n/i, UNSPLASH("1604147706283-d7119b5b822c")],
  [/ensalada/i, UNSPLASH("1512621776951-a57141f2eefd")],

  // Bebidas frías
  [/coca-?cola|coca\s+zero|coca\s+light/i, UNSPLASH("1554866585-cd94860890b7")],
  [/sprite|fanta|manzanita/i, UNSPLASH("1622483767028-3f66f32aef97")],
  [/agua\s+mineral|topo\s*chico/i, UNSPLASH("1564675879675-9fd5a51c1e35")],
  [/agua\s+natural/i, UNSPLASH("1548839140-29a749e1cf4d")],
  [/gatorade|powerade/i, UNSPLASH("1583425220-6f6c1a4dba30")],
  [/red\s*bull/i, UNSPLASH("1622543925917-763c34d1a86e")],
  [/agua\s+de\s+jamaica/i, UNSPLASH("1603569283847-aa295f0d016a")],
  [/agua\s+de\s+horchata/i, UNSPLASH("1565299715200-e1e5b87cae04")],
  [/jugo\s+verde/i, UNSPLASH("1610970881699-44a5587cabec")],
  [/jugo\s+de\s+naranja/i, UNSPLASH("1614207851497-aedfd0fbf8e9")],
  [/limonada/i, UNSPLASH("1556679343-c1c1c9308e5e")],
  [/naranjada/i, UNSPLASH("1614207851497-aedfd0fbf8e9")],
  [/t[eé]\s*helado/i, UNSPLASH("1556881286-fc6915169721")],
  [/jugo/i, UNSPLASH("1610970881699-44a5587cabec")],

  // Cervezas
  [/michelada/i, UNSPLASH("1572451962041-8d8d3b1ff5e7")],
  [/chelada/i, UNSPLASH("1571613316887-6f8d5cbf7ef7")],
  [/corona|modelo|pac[ií]fico|victoria|tecate|heineken|stella|bohemia|xx|cerveza/i, UNSPLASH("1571613316887-6f8d5cbf7ef7")],

  // Destilados
  [/tequila|don\s*julio|clase\s*azul/i, UNSPLASH("1518675891466-3a04e2c4cc6e")],
  [/mezcal/i, UNSPLASH("1606767040091-d5a9c1f8b1ec")],
  [/whisky|whiskey|bourbon|chivas|buchanan/i, UNSPLASH("1568644396922-5c3bfae12521")],
  [/vodka|grey\s*goose/i, UNSPLASH("1607622750671-6cd9b3a0f7b1")],
  [/ron|bacardi/i, UNSPLASH("1569529465841-dfecdab7503b")],
  [/ginebra|tanqueray|hendrick/i, UNSPLASH("1601315580428-baf2e6a3a8e2")],

  // Cocteles
  [/margarita/i, UNSPLASH("1556679343-c1c1c9308e5e")],
  [/paloma|cantarito/i, UNSPLASH("1583425220-6f6c1a4dba30")],
  [/mojito/i, UNSPLASH("1551538827-9c037cb4f32a")],
  [/cuba\s+libre/i, UNSPLASH("1551538827-9c037cb4f32a")],
  [/bloody\s+mary/i, UNSPLASH("1571613316887-6f8d5cbf7ef7")],
  [/negroni|manhattan|old\s+fashioned/i, UNSPLASH("1551024709-8f23befc6f87")],
  [/copa\s+de\s+vino\s+tinto|botella\s+de\s+vino\s+tinto/i, UNSPLASH("1510812431401-41d2bd2722f3")],
  [/copa\s+de\s+vino\s+blanco|botella\s+de\s+vino\s+blanco/i, UNSPLASH("1566995541428-f63ad65d4d22")],
  [/copa\s+de\s+espumoso|prosecco|cava/i, UNSPLASH("1547595628-c61a29f496f0")],

  // Café
  [/caf[eé]\s+mocha/i, UNSPLASH("1572442388796-11668a67e53d")],
  [/caf[eé]\s+espresso/i, UNSPLASH("1610632380989-680fe40816c6")],
  [/caf[eé]\s+cappuccino/i, UNSPLASH("1572286258217-215cf8e667b1")],
  [/caf[eé]\s+latte/i, UNSPLASH("1561882468-9110e03e0f78")],
  [/caf[eé]\s+americano|caf[eé]\s+cortado|caf[eé]/i, UNSPLASH("1495474472287-4d71bcdd2085")],
  [/chocolate\s+caliente/i, UNSPLASH("1542990253-0b8be95e87cb")],
  [/t[eé]\s+chai/i, UNSPLASH("1597481499750-3e6b22637e12")],
  [/t[eé]\s+caliente/i, UNSPLASH("1564890369478-c89ca6d9cde9")],

  // Snacks
  [/sabritas|ruffles|chips/i, UNSPLASH("1566478989037-eec170784d0b")],
  [/doritos/i, UNSPLASH("1599490659213-e2b9527bd087")],
  [/cheetos/i, UNSPLASH("1621447504864-d8686e12698c")],
  [/cacahuat/i, UNSPLASH("1567892737950-30c4db37d05a")],
  [/pretzels/i, UNSPLASH("1599490659213-e2b9527bd087")],
  [/galleta|oreo|chokis/i, UNSPLASH("1499636136210-6f4ee915583e")],
  [/chocolate|snickers|kitkat|m&m/i, UNSPLASH("1623625434462-e5e42318ae49")],
  [/granola|barra/i, UNSPLASH("1571877227200-a0d98ea607e9")],
];

/**
 * Devuelve la URL de la foto sugerida para el item, o null si no hay match.
 * Si devuelve null, el cliente debe caer al emoji.
 */
export function stockPhotoForMenuItem(
  name: string,
  categoryCode?: string
): string | null {
  for (const [rx, url] of KEYWORD_PHOTOS) {
    if (rx.test(name)) return url;
  }
  if (categoryCode && CATEGORY_PHOTOS[categoryCode]) {
    return CATEGORY_PHOTOS[categoryCode];
  }
  return null;
}

export function stockPhotoForCategory(categoryCode?: string): string | null {
  if (!categoryCode) return null;
  return CATEGORY_PHOTOS[categoryCode] ?? null;
}
