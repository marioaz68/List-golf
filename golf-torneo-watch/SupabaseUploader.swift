//  SupabaseUploader.swift — OBSOLETO
//
//  El reloj ya NO escribe directo a Supabase. Ahora envía cada swing al
//  endpoint existente del sistema (POST /api/captura/watch/swing), que:
//    - detecta el hoyo por GPS,
//    - hace el merge a yardas,
//    - guarda en la tabla watch_swing_events.
//
//  Ver WatchSwingUploader.swift. Este archivo se deja vacío a propósito;
//  puedes borrarlo del proyecto en Xcode.
