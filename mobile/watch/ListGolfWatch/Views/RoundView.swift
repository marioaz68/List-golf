import SwiftUI

struct RoundView: View {
    @ObservedObject var coordinator: RoundCoordinator
    private var session: GolfSessionState { coordinator.session }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                header
                metrics
                gpsBlock
                swingBlock
                if let err = session.lastError {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                actionButton
            }
            .padding(.horizontal, 4)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("List.Golf")
                .font(.headline)
            Text("Yardas · Watch")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var metrics: some View {
        HStack {
            metricCard(title: "Golpes", value: "\(session.swingCount)")
            metricCard(
                title: "GPS",
                value: session.gpsStatus == .tracking ? "OK" : "—"
            )
        }
    }

    private func metricCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private var gpsBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(session.gpsStatus.rawValue, systemImage: "location.fill")
                .font(.caption)
            Text(session.coordinateText)
                .font(.system(.caption2, design: .monospaced))
            Text(session.accuracyText)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var swingBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(session.motionStatus.rawValue, systemImage: "figure.golf")
                .font(.caption)
            Label(session.phoneSyncText, systemImage: "iphone")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let t = session.lastSwingAt {
                Text("Último: \(t.formatted(date: .omitted, time: .standard))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let m = session.lastSwingMetrics {
                Text(String(format: "Back %.0f° @ %.0f°/s", m.backswingClubDeg, m.backswingVelocityDps))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(String(format: "Fwd %.0f° @ %.0f°/s", m.forwardClubDeg, m.forwardSwingVelocityDps))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var actionButton: some View {
        VStack(spacing: 8) {
            Button {
                Task {
                    if session.isRoundActive {
                        await coordinator.stopRound()
                    } else {
                        await coordinator.startRound()
                    }
                }
            } label: {
                Text(session.isRoundActive ? "Terminar ronda" : "Iniciar ronda")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(session.isRoundActive ? .red : .green)

            if session.isRoundActive && session.swingCount > 0 {
                Button("Reiniciar conteo") {
                    coordinator.resetSwingCount()
                }
                .font(.caption2)
            }
        }
        .padding(.top, 4)
    }
}

#Preview {
    RoundView(coordinator: RoundCoordinator())
}
