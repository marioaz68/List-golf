import Foundation

/// Detector de swing/impacto por heurística (Fase 2 "ligera", todavía sin Core ML).
///
/// Mejoras vs. el umbral simple original:
///  - Detección del PICO real con histéresis, en lugar de disparar en el primer
///    cruce del umbral: así el timestamp corresponde al impacto, no a su inicio.
///  - Validación de que hubo SWING antes del impacto (actividad elevada en la
///    ventana previa), para descartar golpes secos (dejar el reloj/palo, un tope).
///  - Prominencia mínima sobre la línea base reciente (transitorio brusco).
///  - Duración máxima del pico: un impacto real es brevísimo.
///  - Tiempo muerto (refractory) para no duplicar el mismo golpe.
///
/// Sigue recibiendo solo la magnitud de aceleración (g) del acelerómetro (800 Hz).
/// SIGUIENTE PASO (Fase 2 completa): sustituir por un modelo Core ML entrenado
/// con rondas reales para afinar aún más los falsos positivos.
final class SwingDetector {

    // MARK: - Parámetros (ajustables con datos reales)

    /// Umbral de disparo del pico de impacto (g).
    var thresholdG: Double = 6.0
    /// Umbral de "liberación": el pico se cierra al bajar de aquí (histéresis).
    var releaseG: Double = 3.0
    /// Tiempo mínimo entre impactos (s) para no duplicar el mismo golpe.
    var refractory: TimeInterval = 2.0
    /// Ventana previa al impacto donde buscamos evidencia de swing (s).
    var preWindow: TimeInterval = 0.6
    /// Actividad media mínima (g por encima del reposo de 1g) en la ventana
    /// previa para aceptar que hubo un swing y no un golpe seco aislado.
    var minPreActivityG: Double = 0.35
    /// El pico debe superar a la línea base reciente por al menos esto (g).
    var minProminenceG: Double = 4.0
    /// Duración máxima que puede durar el pico por encima del umbral (s).
    var maxPeakDuration: TimeInterval = 0.15

    // MARK: - Estado interno

    private struct Sample { let t: TimeInterval; let m: Double }
    private var ring: [Sample] = []
    private let ringSpan: TimeInterval = 1.2   // ~1.2 s de historia

    private var lastImpactTime: TimeInterval = -.greatestFiniteMagnitude

    // Seguimiento del pico en curso.
    private var inPeak = false
    private var peakStart: TimeInterval = 0
    private var peakValue: Double = 0
    private var peakTime: TimeInterval = 0

    /// Timestamp del último impacto confirmado (por si el analizador lo quiere usar).
    private(set) var lastImpactTimestamp: TimeInterval = 0

    // MARK: - API

    /// Se llama por cada muestra de aceleración. Devuelve true al confirmar un impacto nuevo.
    func feed(magnitude m: Double, timestamp t: TimeInterval) -> Bool {
        // Historia reciente (para línea base y ventana previa).
        ring.append(Sample(t: t, m: m))
        while let first = ring.first, t - first.t > ringSpan {
            ring.removeFirst()
        }

        if !inPeak {
            if m >= thresholdG {
                inPeak = true
                peakStart = t
                peakValue = m
                peakTime = t
            }
            return false
        }

        // Estamos siguiendo un pico.
        if m > peakValue {
            peakValue = m
            peakTime = t
        }
        // El pico continúa mientras siga alto y no se pase de largo.
        if m > releaseG && (t - peakStart) <= maxPeakDuration {
            return false
        }

        // Pico cerrado: evaluamos.
        inPeak = false
        let duration = t - peakStart
        let candidateTime = peakTime

        if duration > maxPeakDuration { return false }
        if candidateTime - lastImpactTime < refractory { return false }
        if !hasProminence(peak: peakValue, at: candidateTime) { return false }
        if !hadPreSwing(before: candidateTime) { return false }

        lastImpactTime = candidateTime
        lastImpactTimestamp = candidateTime
        return true
    }

    func reset() {
        ring.removeAll(keepingCapacity: true)
        lastImpactTime = -.greatestFiniteMagnitude
        inPeak = false
        peakValue = 0
    }

    // MARK: - Heurísticas

    /// El pico debe destacar sobre la línea base reciente (antes de la ventana de swing).
    private func hasProminence(peak: Double, at t: TimeInterval) -> Bool {
        let lo = t - ringSpan
        let hi = t - preWindow
        let base = ring.filter { $0.t >= lo && $0.t <= hi }
        guard !base.isEmpty else { return true } // sin datos suficientes, no bloqueamos
        let avg = base.reduce(0.0) { $0 + $1.m } / Double(base.count)
        return (peak - avg) >= minProminenceG
    }

    /// ¿Hubo actividad elevada (swing) en la ventana previa al impacto?
    private func hadPreSwing(before t: TimeInterval) -> Bool {
        let lo = t - preWindow
        let hi = t - 0.03
        guard let first = ring.first else { return false }
        if first.t > lo { return true } // arranque sin ventana completa: no bloqueamos
        let win = ring.filter { $0.t >= lo && $0.t <= hi }
        guard win.count >= 5 else { return true }
        let activity = win.reduce(0.0) { $0 + abs($1.m - 1.0) } / Double(win.count)
        return activity >= minPreActivityG
    }
}
