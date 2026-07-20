import Foundation
import Combine

/// Orquesta todo: movimiento + GPS + detector de swing. En cada impacto calcula
/// las métricas y ENVÍA el evento al endpoint existente (/api/captura/watch/swing).
/// El backend detecta el hoyo y hace el merge a yardas; el reloj no calcula hoyos.
@MainActor
final class RoundRecorder: ObservableObject {

    let motion = MotionRecorder()
    let location = LocationManager()
    private let detector = SwingDetector()
    private let uploader = WatchSwingUploader()

    /// Identidad del jugador (del flujo de vinculación del bot). Al menos uno.
    var entryId: String?
    var caddieId: String?

    @Published var isRecording = false
    @Published var swingCount = 0
    @Published var lastMetrics: SwingMetrics?
    @Published var pendingUploads = 0
    @Published var statusText = "Listo"

    func prepare() async {
        await motion.requestAuthorization()
        location.requestAuthorization()
        location.start()
        motion.onSample = { [weak self] mag, ts in
            guard let self else { return }
            if self.detector.feed(magnitude: mag, timestamp: ts) {
                Task { @MainActor in await self.registerImpact() }
            }
        }
    }

    func startRound() async {
        swingCount = 0
        lastMetrics = nil
        detector.reset()
        await motion.start()
        isRecording = true
        statusText = "Grabando… pega tu tiro"
    }

    func stopRound() async {
        motion.stop()
        location.stop()
        isRecording = false
        _ = await uploader.flush()
        pendingUploads = await uploader.pendingCount
        statusText = pendingUploads == 0 ? "Ronda enviada ✓" : "Ronda detenida (\(pendingUploads) por enviar)"
    }

    /// Se llama cuando el detector marca un impacto.
    private func registerImpact() async {
        guard let pos = location.snapshot() else {
            statusText = "Esperando señal GPS…"
            return
        }
        guard let metrics = SwingAnalyzer.analyze(motion.snapshotMotionBuffer()) else {
            return // swing no analizable (ventana insuficiente)
        }

        swingCount += 1
        lastMetrics = metrics

        let event = WatchSwingEvent(
            entry_id: entryId,
            caddie_id: caddieId,
            lat: pos.lat,
            lon: pos.lon,
            swing_no: swingCount,
            detected_at: ISO8601DateFormatter().string(from: Date()),
            backswing_velocity_dps: metrics.backswingVelocityDps,
            forwardswing_velocity_dps: metrics.forwardSwingVelocityDps,
            backswing_club_deg: metrics.backswingClubDeg,
            forward_club_deg: metrics.forwardClubDeg
        )

        let ok = await uploader.send(event)
        pendingUploads = await uploader.pendingCount
        statusText = ok
            ? "Swing \(swingCount) enviado ✓"
            : "Swing \(swingCount) en cola (sin señal)"
    }
}
