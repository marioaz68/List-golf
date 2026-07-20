import Foundation

/// Orquesta GPS + detección de swing + workout + relay al iPhone.
@MainActor
final class RoundCoordinator: ObservableObject {
    @Published private(set) var session = GolfSessionState()

    private lazy var locationTracker = LocationTracker(session: session)
    private lazy var swingDetector = SwingDetector(session: session)
    private let workout = WorkoutSessionManager()
    private let phone = PhoneRelay.shared
    private var phoneSyncTask: Task<Void, Never>?

    init() {
        phone.activate()
        phoneSyncTask = Task { @MainActor in
            while !Task.isCancelled {
                session.phoneReachable = phone.phoneReachable
                session.phoneAuthenticated = phone.phoneAuthenticated
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    deinit {
        phoneSyncTask?.cancel()
    }

    func startRound() async {
        guard !session.isRoundActive else { return }
        session.isRoundActive = true
        session.lastError = nil
        session.swingCount = 0
        session.lastSwingAt = nil

        locationTracker.onLocationAccepted = { [weak self] location in
            Task { @MainActor in
                self?.phone.sendPosition(
                    lat: location.coordinate.latitude,
                    lon: location.coordinate.longitude,
                    accuracy: location.horizontalAccuracy >= 0
                        ? location.horizontalAccuracy
                        : nil
                )
            }
        }

        swingDetector.onSwingDetected = { [weak self] swingNo, location, metrics in
            Task { @MainActor in
                guard let self else { return }
                let lat = location?.coordinate.latitude
                    ?? self.session.location?.coordinate.latitude
                let lon = location?.coordinate.longitude
                    ?? self.session.location?.coordinate.longitude
                guard let lat, let lon else { return }
                self.phone.sendSwing(
                    lat: lat,
                    lon: lon,
                    swingNo: swingNo,
                    metrics: metrics
                )
            }
        }

        do {
            try await workout.requestAuthorization()
            try await workout.start()
        } catch {
            session.lastError = "Workout: \(error.localizedDescription)"
        }

        phone.sendRoundStarted()
        locationTracker.start()
        swingDetector.start()
    }

    func stopRound() async {
        guard session.isRoundActive else { return }
        session.isRoundActive = false

        swingDetector.stop()
        locationTracker.stop()
        locationTracker.onLocationAccepted = nil
        swingDetector.onSwingDetected = nil
        await workout.stop()
        phone.sendRoundEnded()

        session.gpsStatus = .idle
        session.motionStatus = .idle
    }

    func resetSwingCount() {
        session.swingCount = 0
        session.lastSwingAt = nil
        session.lastSwingMetrics = nil
    }
}
