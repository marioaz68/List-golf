import Foundation
import HealthKit

/// Sesión de workout tipo golf para mantener GPS y sensores activos durante la ronda.
@MainActor
final class WorkoutSessionManager: NSObject, ObservableObject {
    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    var isActive: Bool { session != nil }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        let types: Set<HKSampleType> = [
            HKObjectType.workoutType(),
        ]
        try await healthStore.requestAuthorization(toShare: types, read: types)
    }

    func start() async throws {
        guard session == nil else { return }

        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor

        let workoutSession = try HKWorkoutSession(
            healthStore: healthStore,
            configuration: config
        )
        let workoutBuilder = workoutSession.associatedWorkoutBuilder()
        workoutBuilder.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: config
        )

        workoutSession.delegate = self
        workoutBuilder.delegate = self

        session = workoutSession
        builder = workoutBuilder

        let startDate = Date()
        workoutSession.startActivity(with: startDate)
        try await workoutBuilder.beginCollection(at: startDate)
    }

    func stop() async {
        guard let workoutSession, let workoutBuilder = builder else { return }

        let endDate = Date()
        workoutSession.end()
        do {
            try await workoutBuilder.endCollection(at: endDate)
            try await workoutBuilder.finishWorkout()
        } catch {
            // No bloqueamos el cierre de ronda si HealthKit falla.
        }

        session = nil
        builder = nil
    }
}

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {}
}

extension WorkoutSessionManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {}

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
