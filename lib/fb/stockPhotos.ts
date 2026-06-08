/**
 * DESACTIVADO. El usuario decidió no usar stock photos genéricas.
 *
 * El menú ahora usa cascada:
 *  1. image_url del item (foto subida manual por el restaurante) → muestra foto
 *  2. Si no hay → emoji (manual o helper iconForMenuItem)
 *
 * Mantengo el archivo por si en el futuro se quiere reactivar.
 */
export function stockPhotoForMenuItem(
  _name: string,
  _categoryCode?: string
): string | null {
  return null;
}

export function stockPhotoForCategory(_categoryCode?: string): string | null {
  return null;
}
