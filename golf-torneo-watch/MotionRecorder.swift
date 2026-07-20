import Foundation
import CoreMotion
import HealthKit

/// Captura movimiento de ALTA FRECUENCIA en el Apple Watch (800 Hz acelerómetro).
///
/// Requisitos (confirmados con la documentación de Apple):
///  - Solo funciona en Apple Watch Series 8, Ultra o posteriores.
///  - CMBatchedSensorManager exige una sesión de HealthKit (HKWorkoutSession) ACTIVA.
///  - Necesita permiso de Motion (NSMotionUsageDescription) y de HealthKit.
@MainActor
final class MotionRecorder: NSObject, ObservableObject {

    private let batched = CMBatchedSensorManager()
    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?

    /// Callback con la magnitud de aceleración (g) y su timestamp, para el detector de swing.
    var onSample: ((_ magnitude: Double, _ timestamp: TimeInterval) -> Void)?

    /// Buffer circular de movimiento (200 Hz, ~3 s) para analizar el swing tras el impacto.
    private(set) var motionBuffer: [MotionSample] = []
    private let bufferCapacity = 600   // 200 Hz * 3 s

    @Published var isRunning = false
    @Published var lastError: String?

    /// ¿El reloj soporta la API de alta frecuencia?
    static var isSupported: Bool {
        CMBatchedSensorManager.isAccelerometerSupported
    }

    func requestAuthorization() async {
        // HealthKit: necesitamos poder iniciar un workout.
        let types: Set = [HKObjectType.workoutType()]
        do {
            try await healthStore.requestAuthorization(toShare: types, read: types)
        } catch {
            lastError = "HealthKit: \(error.localizedDescription)"
        }
    }

    /// Inicia la sesión de workout + el streaming de acelerómetro.
    func start() async {
        guard Self.isSupported else {
            lastError = "Este reloj no soporta captura de alta frecuencia (requiere Series 8 / Ultra)."
            return
        }
        await startWorkout()
        do {
            try batched.startAccelerometerUpdates()
            try batched.startDeviceMotionUpdates()
            isRunning = true
            Task { await streamAccelerometer() }
            Task { await streamDeviceMotion() }
        } catch {
            lastError = "No se pudo iniciar el acelerómetro: \(error.localizedDescription)"
        }
    }

    func stop() {
        batched.stopAccelerometerUpdates()
        batched.stopDeviceMotionUpdates()
        session?.end()
        isRunning = false
    }

    /// Copia del buffer de movimiento en este instante (para analizar el swing).
    func snapshotMotionBuffer() -> [MotionSample] { motionBuffer }

    // MARK: - Interno

    private func startWorkout() async {
        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            session = s
            s.startActivity(with: Date())
        } catch {
            lastError = "No se pudo iniciar el workout: \(error.localizedDescription)"
        }
    }

    /// Consume los lotes de datos (async/await) y entrega la magnitud al detector.
    private func streamAccelerometer() async {
        do {
            for try await batch in batched.accelerometerUpdates() {
                for sample in batch {
                    let a = sample.acceleration
                    let m = sqrt(a.x*a.x + a.y*a.y + a.z*a.z)
                    onSample?(m, sample.timestamp)
                }
            }
        } catch {
            await MainActor.run { self.lastError = "Stream: \(error.localizedDescription)" }
        }
    }

    /// Consume device motion (200 Hz) y lo guarda en el buffer circular para el analizador de swing.
    private func streamDeviceMotion() async {
        do {
            for try await batch in batched.deviceMotionUpdates() {
                for dm in batch {
                    let s = MotionSample(
                        t: dm.timestamp,
                        rotX: dm.rotationRate.x, rotY: dm.rotationRate.y, rotZ: dm.rotationRate.z,
                        pitch: dm.attitude.pitch, roll: dm.attitude.roll, yaw: dm.attitude.yaw,
                        accX: dm.userAcceleration.x, accY: dm.userAcceleration.y, accZ: dm.userAcceleration.z
                    )
                    motionBuffer.append(s)
                    if motionBuffer.count > bufferCapacity {
                        motionBuffer.removeFirst(motionBuffer.count - bufferCapacity)
                    }
                }
            }
        } catch {
            await MainActor.run { self.lastError = "DeviceMotion: \(error.localizedDescription)" }
        }
    }
}

/// Una muestra de movimiento (giroscopio + actitud + aceleración de usuario).
struct MotionSample {
    let t: TimeInterval
    let rotX, rotY, rotZ: Double      // velocidad angular (rad/s)
    let pitch, roll, yaw: Double      // actitud (rad)
    let accX, accY, accZ: Double      // aceleración de usuario (g)

    /// Magnitud de la velocidad angular en rad/s.
    var angularSpeed: Double { sqrt(rotX*rotX + rotY*rotY + rotZ*rotZ) }
}
