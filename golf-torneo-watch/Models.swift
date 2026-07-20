import Foundation

// MARK: - Modelos que replican EXACTAMENTE el payload de yardage_shot_logs
// Estructura observada en la base de datos golf-torneo:
// payload = { byHole: { "1": [Shot, ...] }, version, updatedAt, teeMarkByHole }

struct GeoPoint: Codable, Equatable {
    let lat: Double
    let lon: Double
}

/// Métricas del swing — nombres alineados al backend existente
/// (watch_swing_events / endpoint /api/captura/watch/swing).
///
/// IMPORTANTE (expectativas realistas desde la muñeca):
///  - Velocidades ANGULARES (°/s) y grados de recorrido son medibles con buena fiabilidad.
///  - NO es velocidad de cabeza de palo real (eso requiere launch monitor);
///    es la rotación de la muñeca, útil para comparar swings.
struct SwingMetrics: Codable {
    var backswingVelocityDps: Double     // velocidad angular pico del backswing (°/s)
    var forwardSwingVelocityDps: Double  // velocidad angular pico del downswing (°/s)
    var backswingClubDeg: Double         // grados recorridos en el backswing
    var forwardClubDeg: Double           // grados recorridos en el downswing
}

/// Evento de swing que se envía al endpoint /api/captura/watch/swing.
/// El backend detecta el hoyo por GPS y hace el merge a yardas; el reloj
/// solo manda posición + métricas. Las llaves coinciden con el body del endpoint.
struct WatchSwingEvent: Codable {
    let entry_id: String?
    let caddie_id: String?
    let lat: Double
    let lon: Double
    let swing_no: Int?
    let detected_at: String            // ISO 8601
    let backswing_velocity_dps: Double
    let forwardswing_velocity_dps: Double
    let backswing_club_deg: Double
    let forward_club_deg: Double
}

/// Modo de la ronda elegido por el jugador antes de salir.
enum RoundMode: String, Codable, CaseIterable {
    case golpes      // llevar el score (golpes)
    case distancias  // solo medir distancias

    var titulo: String {
        switch self {
        case .golpes: return "Llevar golpes"
        case .distancias: return "Solo distancias"
        }
    }
}

// MARK: - Utilidades geográficas

enum Geo {
    /// Distancia entre dos puntos en YARDAS (haversine).
    static func yards(_ a: GeoPoint, _ b: GeoPoint) -> Int {
        let R = 6_371_000.0 // radio terrestre en metros
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLon = (b.lon - a.lon) * .pi / 180
        let la1 = a.lat * .pi / 180
        let la2 = b.lat * .pi / 180
        let h = sin(dLat/2) * sin(dLat/2) +
                cos(la1) * cos(la2) * sin(dLon/2) * sin(dLon/2)
        let meters = 2 * R * asin(min(1, sqrt(h)))
        return Int((meters * 1.09361).rounded()) // metros -> yardas
    }
}

func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
