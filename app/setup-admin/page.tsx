"use client";

import { useActionState } from "react";
import { setupAdminAction, type SetupAdminState } from "./actions";

const initialState: SetupAdminState = {
  ok: false,
  message: "",
};

export default function SetupAdminPage() {
  const [state, formAction, isPending] = useActionState(
    setupAdminAction,
    initialState
  );

  const adminAlreadyCreated =
    state.message ===
    "El admin inicial ya fue creado. Esta página ya no debe usarse.";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-gray-900">
          Crear Admin Inicial
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          Página temporal para crear tu primer usuario administrador.
        </p>

        {adminAlreadyCreated ? (
          <div className="mt-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
            El administrador inicial ya fue creado.  
            Esta página ya no debe utilizarse.
          </div>
        ) : (
          <form action={formAction} className="mt-4">
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Secreto
              </label>
              <input
                name="secret"
                type="password"
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="GolfAdmin2026"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Nombre
              </label>
              <input
                name="full_name"
                defaultValue="Mario Alvarez"
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                name="email"
                type="email"
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                name="password"
                type="password"
                className="mt-1 w-full rounded border px-3 py-2"
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
              className="mt-6 w-full rounded bg-black py-2 font-semibold text-white disabled:opacity-60"
            >
              {isPending ? "Creando..." : "Crear Admin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}