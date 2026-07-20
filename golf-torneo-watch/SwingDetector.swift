import Foundation

/// Detector de swing/impacto MUY BÁSICO (punto de partida, no ML todavía).
///
/// Estrategia inicial por umbral: un golpe de golf produce un pico de aceleración
/// muy alto y breve. Detectamos cuando la magnitud supera un umbral y aplicamos un
/// "tiempo muerto" (refractory) para no contar el mismo golpe varias veces.
///
/// SIGUIENTE PASO (Fase 2 del documento): sustituir esto por un modelo Core ML
/// entrenado con rondas reales para distinguir swings de falsos positivos
/// (dejar el palo, swing de práctica, caminar). Este umbral solo valida el pipeline.
final class SwingDetector {

    /// Umbral en g. El impacto real ronda valores altos; ajústalo con datos reales.
    var thresholdG: Double = 6.0
    /// Tiempo mínimo entre impactos (segundos) para no duplicar.
    var refractory: TimeInterval = 2.0

    private var lastImpactTime: TimeInterval = -.greatestFiniteMagnitude

    /// Se llama por cada muestra de aceleración. Devuelve true si detecta un impacto nuevo.
    func feed(magnitude: Double, timestamp: TimeInterval) -> Bool {
        guard magnitude >= thresholdG else { return false }
        guard timestamp - lastImpactTime >= refractory else { return false }
        lastImpactTime = timestamp
        return true
    }

    func reset() { lastImpactTime = -.greatestFiniteMagnitude }
}
