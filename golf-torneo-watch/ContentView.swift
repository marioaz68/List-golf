import SwiftUI

/// UI mínima del reloj: iniciar/detener la grabación de swings.
/// Cada swing se detecta, se mide (velocidad y grados de back/forward) y se
/// envía al endpoint del sistema, que detecta el hoyo y lo une a las yardas.
///
/// entryId debe venir del flujo de vinculación del bot (mobile_auth_codes).
/// Para pruebas puedes fijarlo aquí abajo.
struct ContentView: View {

    @StateObject private var recorder = RoundRecorder()

    // TODO: reemplazar por el entry_id real (guardado tras vincular con el bot).
    private let testEntryId = "f7154b41-b2cb-4999-bfab-455530cc28b9"   // Mario — Martes 28 Jul 2026, ronda 1 (salida 9:00 por hoyo 10)

    var body: some View {
        NavigationStack {
            if recorder.isRecording {
                recordingView
            } else {
                startView
            }
        }
        .task {
            recorder.entryId = testEntryId.isEmpty ? nil : testEntryId
            await recorder.prepare()
        }
    }

    private var startView: some View {
        VStack(spacing: 10) {
            Image(systemName: "figure.golf").font(.largeTitle)
            Text("Golf Torneo").font(.headline)
            Button {
                Task { await recorder.startRound() }
            } label: {
                Label("Iniciar ronda", systemImage: "play.fill")
            }
            // isSupported: aviso informativo (no bloquea; watchOS 26 puede dar falso negativo)

            if !MotionRecorder.isSupported {
                Text("Nota: este reloj reporta no soportar captura de alta frecuencia; se intentara igual.")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if recorder.entryId == nil {
                Text("Falta vincular tu cuenta (entry_id).")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 8)
        .navigationTitle("Golf Torneo")
    }

    private var recordingView: some View {
        VStack(spacing: 8) {
            Text(recorder.statusText).font(.subheadline).multilineTextAlignment(.center)
            Text("Swings: \(recorder.swingCount)").font(.title3).bold()

            if let m = recorder.lastMetrics {
                VStack(spacing: 2) {
                    Text(String(format: "Back %.0f° @ %.0f°/s", m.backswingClubDeg, m.backswingVelocityDps))
                    Text(String(format: "Fwd %.0f° @ %.0f°/s", m.forwardClubDeg, m.forwardSwingVelocityDps))
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            if let acc = recorder.location.accuracyMeters {
                Text(String(format: "GPS ±%.0f m", acc)).font(.caption2).foregroundStyle(.secondary)
            }
            if recorder.pendingUploads > 0 {
                Text("\(recorder.pendingUploads) por enviar").font(.caption2).foregroundStyle(.orange)
            }

            Button("Terminar", role: .destructive) {
                Task { await recorder.stopRound() }
            }
            .font(.caption)
        }
        .padding(.horizontal, 6)
    }
}

#Preview {
    ContentView()
}
