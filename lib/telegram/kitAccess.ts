/** El jugador ya confirmó kit (parcial o completo) y puede pedir GRUPO/INICIO. */
export function canAccessGroupInfo(entry: {
  telegram_kit_received_at?: string | null;
  telegram_kit_partial_received_at?: string | null;
}) {
  return Boolean(
    entry.telegram_kit_received_at?.trim() ||
      entry.telegram_kit_partial_received_at?.trim()
  );
}
