import CoreLocation
import Foundation

/// GPS de alta precisión para Apple Watch Ultra (dual-frequency cuando el SO lo permite).
@MainActor
final class LocationTracker: NSObject, ObservableObject {
    private let manager = CLLocationManager()
    private weak var session: GolfSessionState?

    /// Callback al aceptar una lectura GPS (para relay al iPhone).
    var onLocationAccepted: ((CLLocation) -> Void)?

    /// Mínimo metros entre callbacks útiles (evita micro-jitter como en la mini-app web).
    private let minDistanceM: CLLocationDistance = 3
    private var lastAccepted: CLLocation?

    init(session: GolfSessionState) {
        self.session = session
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = minDistanceM
        manager.activityType = .fitness
        manager.allowsBackgroundLocationUpdates = false
        manager.pausesLocationUpdatesAutomatically = false
    }

    func start() {
        guard CLLocationManager.locationServicesEnabled() else {
            session?.gpsStatus = .denied
            session?.lastError = "Servicios de ubicación desactivados."
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            session?.gpsStatus = .searching
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            beginUpdates()
        case .denied, .restricted:
            session?.gpsStatus = .denied
            session?.lastError = "Permiso de ubicación denegado en el Watch."
        @unknown default:
            session?.gpsStatus = .denied
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        session?.gpsStatus = .idle
        lastAccepted = nil
    }

    private func beginUpdates() {
        session?.gpsStatus = .searching
        manager.startUpdatingLocation()
    }

    private func accept(_ location: CLLocation) -> Bool {
        guard location.horizontalAccuracy >= 0 else { return false }
        // Descartar lecturas muy imprecisas (>25 m) en campo abierto.
        guard location.horizontalAccuracy <= 25 else { return false }

        if let prev = lastAccepted {
            let moved = location.distance(from: prev)
            if moved < minDistanceM { return false }
        }

        lastAccepted = location
        return true
    }
}

extension LocationTracker: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                if session?.isRoundActive == true {
                    beginUpdates()
                }
            case .denied, .restricted:
                session?.gpsStatus = .denied
            default:
                break
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let latest = locations.last else { return }
        Task { @MainActor in
            guard accept(latest) else { return }
            session?.location = latest
            session?.horizontalAccuracy = latest.horizontalAccuracy
            session?.gpsStatus = .tracking
            onLocationAccepted?(latest)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            session?.lastError = error.localizedDescription
        }
    }
}
