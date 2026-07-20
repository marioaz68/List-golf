import Foundation
import CoreLocation

/// GPS del reloj. Guarda siempre la última posición conocida para poder
/// "estampar" la ubicación en el instante en que se detecta un impacto.
@MainActor
final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {

    private let manager = CLLocationManager()

    @Published var current: GeoPoint?
    @Published var accuracyMeters: Double?
    @Published var authorized = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
    }

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func start() { manager.startUpdatingLocation() }
    func stop()  { manager.stopUpdatingLocation() }

    /// Copia inmutable de la posición en este instante (para el momento del impacto).
    func snapshot() -> GeoPoint? { current }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: authorized = true
        default: authorized = false
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        current = GeoPoint(lat: loc.coordinate.latitude, lon: loc.coordinate.longitude)
        accuracyMeters = loc.horizontalAccuracy
    }
}
