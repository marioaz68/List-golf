import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// IMPORTANTE: importar locationTask en el root layout asegura que
// TaskManager.defineTask se ejecuta antes de cualquier navegación, así el
// task de background está registrado cuando el OS despierta la app.
import "@/lib/locationTask";
import { startWatchSyncBridge } from "@/lib/watchSync";

startWatchSyncBridge();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0f172a" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="ritmo" />
      </Stack>
    </GestureHandlerRootView>
  );
}
