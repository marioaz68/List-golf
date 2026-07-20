import ExpoModulesCore
import WatchConnectivity

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
  static let displayName = "displayName"
  static let authenticated = "authenticated"
}

public class ListgolfWatchSyncModule: Module {
  private let relay = WatchPhoneRelay.shared

  public func definition() -> ModuleDefinition {
    Name("ListgolfWatchSync")

    Events("onWatchEvent")

    OnCreate {
      self.relay.onEvent = { [weak self] payload in
        self?.sendEvent("onWatchEvent", payload)
      }
    }

    Function("activate") {
      self.relay.activate()
    }

    Function("pushAuthToWatch") { (displayName: String?) in
      self.relay.pushAuthContext(displayName: displayName)
    }

    Function("getPhoneStatus") { () -> [String: Bool] in
      let s = WCSession.default
      return [
        "reachable": s.isReachable,
        "paired": s.isPaired,
        "watchAppInstalled": s.isWatchAppInstalled,
      ]
    }
  }
}

/// Recibe mensajes del Watch y los reenvía a React Native.
final class WatchPhoneRelay: NSObject, WCSessionDelegate {
  static let shared = WatchPhoneRelay()

  var onEvent: (([String: Any]) -> Void)?

  private override init() {
    super.init()
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func pushAuthContext(displayName: String?) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }

    var ctx: [String: Any] = [
      WatchMessageKey.authenticated: true,
      WatchMessageKey.ts: Date().timeIntervalSince1970,
    ]
    if let name = displayName, !name.isEmpty {
      ctx[WatchMessageKey.displayName] = name
    }

    do {
      try session.updateApplicationContext(ctx)
    } catch {
      NSLog("ListGolf WatchSync context error: \(error.localizedDescription)")
    }
  }

  private func forwardPayload(_ payload: [String: Any]) {
    guard let type = payload[WatchMessageKey.type] as? String else { return }
    var out: [String: Any] = ["type": type]

    if let lat = payload[WatchMessageKey.lat] as? Double { out["lat"] = lat }
    if let lon = payload[WatchMessageKey.lon] as? Double { out["lon"] = lon }
    if let acc = payload[WatchMessageKey.accuracy] as? Double { out["accuracy"] = acc }
    if let swingNo = payload[WatchMessageKey.swingNo] as? Int {
      out["swingNo"] = swingNo
    } else if let swingNo = payload[WatchMessageKey.swingNo] as? Double {
      out["swingNo"] = Int(swingNo)
    }
    if let ts = payload[WatchMessageKey.ts] as? Double { out["ts"] = ts }
    for key in [
      WatchMessageKey.backswingVelocityDps,
      WatchMessageKey.forwardswingVelocityDps,
      WatchMessageKey.backswingClubDeg,
      WatchMessageKey.forwardClubDeg,
    ] {
      if let v = payload[key] as? Double { out[key] = v }
      else if let v = payload[key] as? Int { out[key] = Double(v) }
    }

    DispatchQueue.main.async { [weak self] in
      self?.onEvent?(out)
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    forwardPayload(message)
  }

  func session(
    _ session: WCSession,
    didReceiveUserInfo userInfo: [String: Any] = [:]
  ) {
    forwardPayload(userInfo)
  }
}
