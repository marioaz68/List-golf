"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {
  ok: false,
  message: "",
};

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState
  );

  return (
    <div className="p-4 md:p-6">
      <form
        action={formAction}
        className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-gray-900">
          Nueva contraseña
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          Captura tu nueva contraseña para recuperar el acceso.
        </p>

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nueva contraseña
          </label>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="Nueva contraseña"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Confirmar contraseña
          </label>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="Confirmar contraseña"
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
          disabled={isPending || state.ok}
          className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar nueva contraseña"}
        </button>

        {state.ok && (
          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 underline hover:text-black"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}