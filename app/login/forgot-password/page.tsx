"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = {
  ok: false,
  message: "",
};

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    forgotPasswordAction,
    initialState
  );

  return (
    <div className="p-4 md:p-6">
      <form
        action={formAction}
        className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-gray-900">
          Recuperar contraseña
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          Escribe tu correo y te enviaremos una liga para crear una nueva
          contraseña.
        </p>

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            name="email"
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="tu@email.com"
          />
        </div>

        {state.message && (
          <div
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              state.ok
                ? "border border-green-200 bg-green-50 text-green-800"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {isPending ? "Enviando..." : "Enviar liga"}
        </button>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-700 underline hover:text-black"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </form>
    </div>
  );
}