"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("Validando sesión...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setMessage(
          "Liga inválida o expirada. Solicita una nueva liga para cambiar tu contraseña."
        );
        return;
      }

      setReady(true);
      setMessage("");
    }

    checkSession();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setMessage("Guardando...");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white/10 border border-white/15 p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Cambiar contraseña</h1>

        <input
          type="password"
          required
          minLength={6}
          disabled={!ready}
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-black disabled:opacity-60"
        />

        <input
          type="password"
          required
          minLength={6}
          disabled={!ready}
          placeholder="Confirmar contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-black disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!ready}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Guardar nueva contraseña
        </button>

        {message ? <p className="text-sm text-slate-200">{message}</p> : null}

        <Link
          href="/login"
          className="block text-center text-sm text-slate-200 underline"
        >
          Volver a iniciar sesión
        </Link>
      </form>
    </main>
  );
}