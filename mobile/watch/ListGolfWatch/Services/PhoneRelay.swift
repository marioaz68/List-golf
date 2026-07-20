import Foundation
import WatchConnectivity

/// Claves compartidas con el iPhone (`ListgolfWatchSyncModule.swift`).
private enum WatchMessageKey {
    static let type = "type"
    static let lat = "lat"
    static let lon = "lon"
    static let accuracy = "accuracy"
    static let swingNo = "swing_no"
    static let ts = "ts"
    static let backswingVelocityDps = "backswing_velocity_dps"
    static let forwardswingVelocityDps = "forwardswing_velocity_dps"
    static let backswingClubDeg = "backswing_club_deg"
    static let forwardClubDeg = "forward_club_deg"
    static let authenticated = "authenticated"
    static let displayName = "displayName"
}

/// Envía GPS y swings al iPhone vía WatchConnectivity.
@MainActor
final class PhoneRelay: NSObject, ObservableObject {
    static let shared = PhoneRelay()

    @Published private(set) var phoneReachable = false
    @Published private(set) var phoneAuthenticated = false
    @Published private(set) var displayName: String?

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func sendPosition(lat: Double, lon: Double, accuracy: Double?) {
        var payload: [String: Any] = [
            WatchMessageKey.type: "position",
            WatchMessageKey.lat: lat,
            WatchMessageKey.lon: lon,
            WatchMessageKey.ts: Date().timeIntervalSince1970,
        ]
        if let accuracy {
            payload[WatchMessageKey.accuracy] = accuracy
        }
        transmit(payload)
    }

    func sendSwing(
        lat: Double,
        lon: Double,
        swingNo: Int,
        metrics: SwingMetrics? = nil
    ) {
        var payload: [String: Any] = [
            WatchMessageKey.type: "swing",
            WatchMessageKey.lat: lat,
            WatchMessageKey.lon: lon,
            WatchMessageKey.swingNo: swingNo,
            WatchMessageKey.ts: Date().timeIntervalSince1970,
        ]
        if let metrics {
            payload.merge(metrics.asDictionary) { _, new in new }
        }
        transmit(payload)
    }

    func sendRoundStarted() {
        transmit([
            WatchMessageKey.type: "round_started",
            WatchMessageKey.ts: Date().timeIntervalSince1970,
        ])
    }

    func sendRoundEnded() {
        transmit([
            WatchMessageKey.type: "round_ended",
            WatchMessageKey.ts: Date().timeIntervalSince1970,
        ])
    }

    private func transmit(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { error in
                NSLog("ListGolf Watch sendMessage error: \(error.localizedDescription)")
                session.transferUserInfo(payload)
            }
        } else {
            session.transferUserInfo(payload)
        }
    }

    private func applyContext(_ context: [String: Any]) {
        phoneAuthenticated = (context[WatchMessageKey.authenticated] as? Bool) == true
        displayName = context[WatchMessageKey.displayName] as? String
    }
}

extension PhoneRelay: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            phoneReachable = session.isReachable
            applyContext(session.receivedApplicationContext)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            phoneReachable = session.isReachable
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in
            applyContext(applicationContext)
        }
    }
}
