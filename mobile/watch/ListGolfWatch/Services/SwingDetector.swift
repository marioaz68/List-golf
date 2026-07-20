import CoreMotion
import CoreLocation
import Foundation
#if os(watchOS)
import WatchKit
#endif

struct SwingDetectorConfig {
    var accelThresholdG: Double = 3.2
    var rotationThresholdRadS: Double = 5.0
    var cooldownSeconds: TimeInterval = 5.0
    var confirmSamples: Int = 3
    var sampleRateHz: Double = 50.0
}

@MainActor
final class SwingDetector: ObservableObject {
    private let motion = CMMotionManager()
    private weak var session: GolfSessionState?
    private var queue = OperationQueue()
    private var config = SwingDetectorConfig()

    private var lastSwingTime: Date?
    private var highAccelStreak = 0
    private var isRunning = false
    private var sampleBuffer: [MotionSample] = []

    var onSwingDetected: ((Int, CLLocation?, SwingMetrics?) -> Void)?

    init(session: GolfSessionState) {
        self.session = session
        queue.name = "club.listgolf.watch.swing"
        queue.maxConcurrentOperationCount = 1
    }

    func start() {
        guard motion.isDeviceMotionAvailable else {
            session?.motionStatus = .unavailable
            session?.lastError = "Device motion no disponible en este Watch."
            return
        }
        guard !isRunning else { return }

        isRunning = true
        session?.motionStatus = .calibrating
        highAccelStreak = 0
        sampleBuffer.removeAll(keepingCapacity: true)

        motion.deviceMotionUpdateInterval = 1.0 / config.sampleRateHz
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, error in
            guard let self else { return }
            if let error {
                Task { @MainActor in
                    self.session?.lastError = error.localizedDescription
                }
                return
            }
            guard let data else { return }
            Task { @MainActor in
                self.processSample(data)
            }
        }

        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 800_000_000)
            if isRunning {
                session?.motionStatus = .listening
            }
        }
    }

    func stop() {
        isRunning = false
        motion.stopDeviceMotionUpdates()
        highAccelStreak = 0
        sampleBuffer.removeAll(keepingCapacity: false)
        session?.motionStatus = .idle
    }

    private func appendSample(_ motion: CMDeviceMotion) {
        sampleBuffer.append(SwingMotionAnalyzer.sample(from: motion))
        if sampleBuffer.count > SwingMotionAnalyzer.bufferSize {
            sampleBuffer.removeFirst(sampleBuffer.count - SwingMotionAnalyzer.bufferSize)
        }
    }

    private func processSample(_ motion: CMDeviceMotion) {
        appendSample(motion)

        let ua = motion.userAcceleration
        let accelG = sqrt(ua.x * ua.x + ua.y * ua.y + ua.z * ua.z)
        let rr = motion.rotationRate
        let rot = sqrt(rr.x * rr.x + rr.y * rr.y + rr.z * rr.z)

        if accelG >= config.accelThresholdG && rot >= config.rotationThresholdRadS {
            highAccelStreak += 1
        } else {
            highAccelStreak = 0
            return
        }

        guard highAccelStreak >= config.confirmSamples else { return }

        let now = Date()
        if let last = lastSwingTime, now.timeIntervalSince(last) < config.cooldownSeconds {
            return
        }

        lastSwingTime = now
        highAccelStreak = 0

        let impactIndex = sampleBuffer.count - 1
        let metrics = SwingMotionAnalyzer.analyze(
            buffer: sampleBuffer,
            impactIndex: impactIndex
        )

        session?.swingCount += 1
        session?.lastSwingAt = now
        session?.lastSwingMetrics = metrics
        onSwingDetected?(session?.swingCount ?? 1, session?.location, metrics)
        #if os(watchOS)
        WKInterfaceDevice.current().play(.success)
        #endif
    }
}
