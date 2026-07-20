import SwiftUI

struct ContentView: View {
    @StateObject private var coordinator = RoundCoordinator()

    var body: some View {
        RoundView(coordinator: coordinator)
    }
}

#Preview {
    ContentView()
}
