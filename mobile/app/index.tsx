/**
 * Pantalla de login.
 *
 * El caddie/jugador escribe `/codigo` al bot @ListGolfBot en Telegram, el
 * bot le manda un número de 6 dígitos válido 10 min. Lo escribe aquí y
 * queda autenticado en la app.
 *
 * Por qué este flujo (y no email+password):
 *  - Los caddies a menudo no tienen email registrado
 *  - El comité ya da de alta a cada caddie en Telegram con su número
 *  - El código es de un solo uso, expira rápido, y no requiere contraseña
 *  - Reusa la identidad que el bot ya tiene (caddies.telegram / players.telegram_user_id)
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { redeemCode } from "@/lib/api";
import {
  isAuthenticated,
  loadSession,
  saveSession,
  type MobileSession,
} from "@/lib/auth";
import { syncSessionToBackgroundStorage } from "@/lib/locationTask";

export default function LoginScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Si ya hay sesión guardada, saltar directo a ritmo.
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const session = await loadSession();
      if (cancelled) return;
      if (isAuthenticated(session)) {
        router.replace("/ritmo");
      } else {
        setChecking(false);
      }
    }
    void pull();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useCallback(async () => {
    const clean = code.trim();
    if (!/^\d{4,8}$/.test(clean)) {
      Alert.alert(
        "Código inválido",
        "Escribe el número que te dio el bot (4 a 8 dígitos)."
      );
      return;
    }
    setLoading(true);
    Keyboard.dismiss();
    try {
      const res = await redeemCode(clean);
      if (!res.ok) {
        Alert.alert(
          "No se pudo validar",
          res.error ?? "El código no es válido o expiró. Pide uno nuevo al bot."
        );
        return;
      }
      const session: MobileSession = {
        caddieId: res.caddieId ?? null,
        entryId: res.entryId ?? null,
        displayName: res.displayName ?? null,
      };
      if (!isAuthenticated(session)) {
        Alert.alert("No se pudo identificar", "El código no está vinculado a ningún caddie/jugador.");
        return;
      }
      await saveSession(session);
      await syncSessionToBackgroundStorage({
        caddieId: session.caddieId,
        entryId: session.entryId,
      });
      router.replace("/ritmo");
    } finally {
      setLoading(false);
    }
  }, [code]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#94a3b8" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flex: 1,
          padding: 24,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#f1f5f9",
            fontSize: 28,
            fontWeight: "700",
            marginBottom: 4,
          }}
        >
          List.Golf
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 32 }}>
          Ritmo del campo · App caddies y jugadores
        </Text>

        <View
          style={{
            backgroundColor: "rgba(99,102,241,0.12)",
            borderColor: "#6366f1",
            borderWidth: 1,
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 20 }}>
            1. Abre <Text style={{ fontWeight: "700" }}>@ListGolfBot</Text> en Telegram
          </Text>
          <Text style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 20 }}>
            2. Escribe <Text style={{ fontWeight: "700" }}>/codigo</Text>
          </Text>
          <Text style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 20 }}>
            3. Mete aquí el número que te mande
          </Text>
        </View>

        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
          placeholder="000000"
          placeholderTextColor="#475569"
          keyboardType="number-pad"
          maxLength={8}
          autoFocus
          editable={!loading}
          style={{
            backgroundColor: "#1e293b",
            borderColor: "#334155",
            borderWidth: 1,
            borderRadius: 10,
            color: "#f1f5f9",
            fontSize: 28,
            letterSpacing: 8,
            textAlign: "center",
            paddingVertical: 16,
            marginBottom: 16,
          }}
        />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onSubmit}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#475569" : "#22c55e",
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
              Entrar
            </Text>
          )}
        </TouchableOpacity>

        <Pressable
          onPress={() =>
            Alert.alert(
              "¿Y si no tengo Telegram?",
              "Pide al comité del club que te dé de alta en Telegram para que el bot pueda generar tu código."
            )
          }
          style={{ marginTop: 20, alignSelf: "center" }}
        >
          <Text style={{ color: "#64748b", fontSize: 12 }}>
            ¿Problemas con el código?
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
