import CoreMotion
import Foundation

/// Métricas de swing estimadas desde la muñeca (proxy del plano del bastón).
struct SwingMetrics: Equatable {
    var backswingVelocityDps: Double
    var forwardSwingVelocityDps: Double
    var backswingClubDeg: Double
    var forwardClubDeg: Double

    var asDictionary: [String: Any] {
        [
            "backswing_velocity_dps": backswingVelocityDps,
            "forwardswing_velocity_dps": forwardSwingVelocityDps,
            "backswing_club_deg": backswingClubDeg,
            "forward_club_deg": forwardClubDeg,
        ]
    }
}

struct MotionSample {
    let accelG: Double
    let rotMagRadS: Double
    let pitchRad: Double
    let rollRad: Double
}

enum SwingMotionAnalyzer {
    static let bufferSize = 55

    static func sample(from motion: CMDeviceMotion) -> MotionSample {
        let ua = motion.userAcceleration
        let accelG = sqrt(ua.x * ua.x + ua.y * ua.y + ua.z * ua.z)
        let rr = motion.rotationRate
        let rotMag = sqrt(rr.x * rr.x + rr.y * rr.y + rr.z * rr.z)
        let att = motion.attitude
        return MotionSample(
            accelG: accelG,
            rotMagRadS: rotMag,
            pitchRad: att.pitch,
            rollRad: att.roll
        )
    }

    static func analyze(buffer: [MotionSample], impactIndex: Int) -> SwingMetrics? {
        guard buffer.count >= 20,
              impactIndex >= 8,
              impactIndex < buffer.count else { return nil }

        let address = buffer[0]
        let impact = buffer[impactIndex]

        var topIdx = 0
        var topDelta = 0.0
        for i in 0..<impactIndex {
            let delta = abs(buffer[i].pitchRad - address.pitchRad)
            if delta > topDelta {
                topDelta = delta
                topIdx = i
            }
        }

        let top = buffer[topIdx]
        let backPhase = buffer[0..<max(topIdx, 1)]
        let forwardPhase = buffer[topIdx...impactIndex]

        let backVelRad = backPhase.map(\.rotMagRadS).max() ?? 0
        let fwdVelRad = forwardPhase.map(\.rotMagRadS).max() ?? impact.rotMagRadS

        let backAngle = abs(top.pitchRad - address.pitchRad) * 180 / .pi
        let fwdAngle = abs(impact.pitchRad - top.pitchRad) * 180 / .pi

        guard backVelRad > 0.5 || fwdVelRad > 0.5 else { return nil }

        return SwingMetrics(
            backswingVelocityDps: (backVelRad * 180 / .pi * 10).rounded() / 10,
            forwardSwingVelocityDps: (fwdVelRad * 180 / .pi * 10).rounded() / 10,
            backswingClubDeg: (backAngle * 10).rounded() / 10,
            forwardClubDeg: (fwdAngle * 10).rounded() / 10
        )
    }
}
