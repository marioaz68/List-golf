/**
 * Pantalla principal de tracking de ritmo.
 *
 * Muestra el estado del GPS de background (activo / inactivo), el último
 * hoyo detectado y un botón grande para encender/apagar. El caddie/jugador
 * puede minimizar la app, bloquear pantalla, abrir WhatsApp — la app sigue
 * mandando GPS al servidor mientras el foreground service esté corriendo.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { clearSession, loadSession, type MobileSession } from "@/lib/auth";
import {
  isBackgroundTrackingActive,
  startBackgroundTracking,
  stopBackgroundTracking,
  syncSessionToBackgroundStorage,
} from "@/lib/locationTask";

type ChipState = "off" | "starting" | "on" | "error";

export default function RitmoScreen() {
  // Mantiene la pantalla encendida mientras esta vista está visible. Si el
  // usuario minimiza, el OS la apaga y el foreground service se queda
  // corriendo gracias al permiso de background.
  useKeepAwake();

  const [session, setSession] = useState<MobileSession | null>(null);
  const [state, setState] = useState<ChipState>("off");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar sesión + estado inicial del tracking
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const s = await loadSession();
      if (cancelled) return;
      if (!s.caddieId && !s.entryId) {
        router.replace("/");
        return;
      }
      // El task de background lee credenciales de AsyncStorage, no SecureStore.
      // Si el usuario ya tenía sesión guardada, hay que re-sincronizar o los
      // pings se descartan silenciosamente aunque el chip diga "GPS ACTIVO".
      await syncSessionToBackgroundStorage({
        caddieId: s.caddieId,
        entryId: s.entryId,
      });
      setSession(s);
      const running = await isBackgroundTrackingActive();
      if (!cancelled) setState(running ? "on" : "off");
    }
    void pull();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(async () => {
    if (state === "on") {
      await stopBackgroundTracking();
      setState("off");
      setErrorMsg(null);
      return;
    }
    setState("starting");
    setErrorMsg(null);
    if (session) {
      await syncSessionToBackgroundStorage({
        caddieId: session.caddieId,
        entryId: session.entryId,
      });
    }
    const result = await startBackgroundTracking();
    if (!result.ok) {
      setState("error");
      setErrorMsg(result.error ?? "Error desconocido");
      Alert.alert(
        "No se pudo activar GPS",
        (result.error ?? "Error") +
          "\n\nVe a Ajustes → Apps → List.Golf → Permisos → Ubicación → Permitir siempre."
      );
      return;
    }
    setState("on");
  }, [state, session]);

  const onLogout = useCallback(async () => {
    Alert.alert("Cerrar sesión", "¿Seguro? Tendrás que meter un código nuevo del bot.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          await stopBackgroundTracking();
          await syncSessionToBackgroundStorage({ caddieId: null, entryId: null });
          await clearSession();
          router.replace("/");
        },
      },
    ]);
  }, []);

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#94a3b8" />
      </View>
    );
  }

  const isOn = state === "on";
  const isStarting = state === "starting";
  const accent = isOn ? "#22c55e" : state === "error" ? "#ef4444" : "#475569";
  const labelText = isOn
    ? "GPS ACTIVO"
    : isStarting
      ? "ACTIVANDO..."
      : state === "error"
        ? "ERROR"
        : "GPS APAGADO";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      contentContainerStyle={{ padding: 20, paddingTop: 60 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <View>
          <Text style={{ color: "#94a3b8", fontSize: 12 }}>Conectado como</Text>
          <Text style={{ color: "#f1f5f9", fontSize: 18, fontWeight: "700" }}>
            {session.displayName ?? (session.caddieId ? "Caddie" : "Jugador")}
          </Text>
        </View>
        <Pressable onPress={onLogout} hitSlop={10}>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>Salir</Text>
        </Pressable>
      </View>

      <View
        style={{
          alignItems: "center",
          marginVertical: 30,
        }}
      >
        <View
          style={{
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: accent + "20",
            borderColor: accent,
            borderWidth: 3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isStarting ? (
            <ActivityIndicator color={accent} size="large" />
          ) : (
            <Text style={{ fontSize: 56 }}>{isOn ? "📡" : "⭘"}</Text>
          )}
        </View>
        <Text
          style={{
            color: accent,
            fontSize: 14,
            fontWeight: "700",
            letterSpacing: 2,
            marginTop: 14,
          }}
        >
          {labelText}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        disabled={isStarting}
        style={{
          backgroundColor: isOn ? "#7f1d1d" : "#22c55e",
          borderRadius: 12,
          paddingVertical: 18,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
          {isOn ? "Apagar GPS" : "Activar GPS"}
        </Text>
      </TouchableOpacity>

      {errorMsg ? (
        <View
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            borderColor: "#ef4444",
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#fca5a5", fontSize: 12 }}>{errorMsg}</Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: "rgba(99,102,241,0.10)",
          borderColor: "rgba(99,102,241,0.4)",
          borderWidth: 1,
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#c7d2fe", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
          ¿Cómo funciona?
        </Text>
        <Text style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 18 }}>
          • Cuando GPS está activo, tu posición llega al ritmo del campo aunque cierres esta app, bloquees pantalla o uses otra app.{"\n"}
          • Verás un aviso del sistema "List.Golf usando ubicación" en la barra de notificaciones — eso significa que está funcionando.{"\n"}
          • Apaga el GPS al terminar la ronda para no gastar batería.
        </Text>
      </View>

      <Pressable
        onPress={() => Linking.openURL("https://www.listgolf.club/ritmo")}
        style={{ alignSelf: "center", marginTop: 10 }}
      >
        <Text style={{ color: "#64748b", fontSize: 12 }}>
          Ver mapa del campo →
        </Text>
      </Pressable>
    </ScrollView>
  );
}
