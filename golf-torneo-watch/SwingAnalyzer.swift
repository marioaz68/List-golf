import Foundation

/// Calcula las métricas del swing (alineadas al backend) desde la ventana de
/// movimiento previa al impacto.
///
/// Método (heurístico, punto de partida):
///  1. Impacto = pico de velocidad angular al final de la ventana.
///  2. Top del backswing = mínimo de velocidad angular antes del impacto
///     (la muñeca casi se detiene al cambiar de dirección).
///  3. Inicio del backswing = cuando el movimiento arranca.
///  → velocidades pico y grados recorridos (integral de la velocidad) por fase.
///
/// Además VALIDA la forma del swing: si el "impacto" no tiene un downswing con
/// suficiente velocidad y recorrido angular, se descarta (devuelve nil). Esto
/// filtra falsos positivos que pasaron el detector (topes, dejar el palo) pero
/// que no tienen la firma de un swing real.
///
/// Fiabilidad: velocidades (°/s) y grados son sólidos como referencia;
/// NO es velocidad de cabeza de palo (eso requiere launch monitor).
enum SwingAnalyzer {

    private static let RAD2DEG = 180.0 / Double.pi

    /// Velocidad angular pico mínima del downswing (°/s) para aceptar el swing.
    private static let minForwardPeakDps = 120.0
    /// Recorrido angular mínimo del downswing (grados) para aceptar el swing.
    private static let minForwardDeg = 20.0

    static func analyze(_ buffer: [MotionSample]) -> SwingMetrics? {
        guard buffer.count > 20 else { return nil }

        // 1) Impacto = índice del pico de velocidad angular.
        var impactIdx = 0
        var maxSpeed = 0.0
        for (i, s) in buffer.enumerated() where s.angularSpeed > maxSpeed {
            maxSpeed = s.angularSpeed; impactIdx = i
        }
        guard impactIdx > 5 else { return nil }

        // 2) Top del backswing = mínimo de velocidad angular antes del impacto.
        let searchStart = max(0, impactIdx - 400) // ~2 s como mucho
        var topIdx = searchStart
        var minSpeed = Double.greatestFiniteMagnitude
        for i in searchStart..<impactIdx where buffer[i].angularSpeed < minSpeed {
            minSpeed = buffer[i].angularSpeed; topIdx = i
        }

        // 3) Inicio del backswing = último punto (retrocediendo desde el top)
        //    con velocidad por debajo de un umbral bajo.
        let startThreshold = 0.5 // rad/s
        var startIdx = searchStart
        for i in stride(from: topIdx, through: searchStart, by: -1) {
            if buffer[i].angularSpeed < startThreshold { startIdx = i; break }
        }

        guard startIdx < topIdx, topIdx < impactIdx else { return nil }

        // Velocidades pico por fase (rad/s -> °/s).
        let peakBack = buffer[startIdx...topIdx].map { $0.angularSpeed }.max() ?? 0
        let peakFwd  = buffer[topIdx...impactIdx].map { $0.angularSpeed }.max() ?? 0

        // Grados recorridos por fase = integral de la velocidad angular en el tiempo.
        func degreesTraveled(_ lo: Int, _ hi: Int) -> Double {
            var rad = 0.0
            var prev = buffer[lo]
            for i in (lo + 1)...hi {
                let cur = buffer[i]
                let dt = cur.t - prev.t
                if dt > 0 && dt < 0.1 { // ignora saltos raros
                    rad += ((cur.angularSpeed + prev.angularSpeed) / 2) * dt
                }
                prev = cur
            }
            return rad * RAD2DEG
        }

        let backDps = (peakBack * RAD2DEG).rounded()
        let fwdDps  = (peakFwd  * RAD2DEG).rounded()
        let backDeg = degreesTraveled(startIdx, topIdx).rounded()
        let fwdDeg  = degreesTraveled(topIdx, impactIdx).rounded()

        // Validación de forma: sin un downswing con velocidad y recorrido
        // suficientes, NO es un swing real → se descarta.
        guard fwdDps >= minForwardPeakDps, fwdDeg >= minForwardDeg else { return nil }

        return SwingMetrics(
            backswingVelocityDps: backDps,
            forwardSwingVelocityDps: fwdDps,
            backswingClubDeg: backDeg,
            forwardClubDeg: fwdDeg
        )
    }
}
