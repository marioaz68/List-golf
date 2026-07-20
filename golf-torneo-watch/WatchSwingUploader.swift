import Foundation

/// Envía cada swing detectado al endpoint EXISTENTE del sistema:
///   POST https://www.listgolf.club/api/captura/watch/swing
///
/// El backend detecta el hoyo por GPS y hace el merge a yardas; el reloj solo
/// manda posición + métricas. Identidad por entry_id o caddie_id (obtenidos del
/// flujo de vinculación del bot, /api/mobile/auth/redeem).
///
/// Cola simple en memoria: si falla el envío (sin señal), reintenta después.
actor WatchSwingUploader {

    private let baseURL: String
    private var queue: [WatchSwingEvent] = []

    init(baseURL: String = "https://www.listgolf.club") {
        self.baseURL = baseURL
    }

    /// Encola y trata de enviar. Devuelve true si se envió en el intento.
    @discardableResult
    func send(_ event: WatchSwingEvent) async -> Bool {
        queue.append(event)
        return await flush()
    }

    /// Intenta vaciar la cola. Deja en la cola lo que no se pudo enviar.
    @discardableResult
    func flush() async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/captura/watch/swing") else { return false }
        var pending: [WatchSwingEvent] = []
        var allOk = true
        for event in queue {
            do {
                var req = URLRequest(url: url)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = try JSONEncoder().encode(event)
                let (data, resp) = try await URLSession.shared.data(for: req)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if !(200...299).contains(code) {
                    _ = data
                    pending.append(event)   // reintentar luego
                    allOk = false
                }
            } catch {
                pending.append(event)
                allOk = false
            }
        }
        queue = pending
        return allOk
    }

    var pendingCount: Int { queue.count }
}
