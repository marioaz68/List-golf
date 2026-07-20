import CoreLocation
import Foundation

/// Estado observable de la ronda en el Watch.
@MainActor
final class GolfSessionState: ObservableObject {
    @Published var isRoundActive = false
    @Published var swingCount = 0
    @Published var lastSwingAt: Date?
    @Published var location: CLLocation?
    @Published var horizontalAccuracy: CLLocationAccuracy?
    @Published var gpsStatus: GpsStatus = .idle
    @Published var motionStatus: MotionStatus = .idle
    @Published var lastError: String?
    @Published var phoneReachable = false
    @Published var phoneAuthenticated = false
    @Published var lastSwingMetrics: SwingMetrics?

    enum GpsStatus: String {
        case idle = "GPS apagado"
        case searching = "Buscando señal…"
        case tracking = "GPS activo"
        case denied = "Sin permiso GPS"
    }

    enum MotionStatus: String {
        case idle = "Swing apagado"
        case calibrating = "Calibrando…"
        case listening = "Escuchando swings"
        case unavailable = "Sensores no disponibles"
    }

    enum PhoneSyncStatus: String {
        case offline = "iPhone sin sesión"
        case waiting = "Esperando iPhone…"
        case linked = "Sincronizando con iPhone"
    }

    var phoneSyncText: String {
        if phoneAuthenticated && phoneReachable { return PhoneSyncStatus.linked.rawValue }
        if phoneAuthenticated { return PhoneSyncStatus.waiting.rawValue }
        return PhoneSyncStatus.offline.rawValue
    }

    var coordinateText: String {
        guard let loc = location else { return "—" }
        return String(format: "%.5f, %.5f", loc.coordinate.latitude, loc.coordinate.longitude)
    }

    var accuracyText: String {
        guard let acc = horizontalAccuracy, acc >= 0 else { return "—" }
        return String(format: "±%.0f m", acc)
    }
}
