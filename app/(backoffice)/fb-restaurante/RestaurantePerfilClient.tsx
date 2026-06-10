"use client";

import { useState, useTransition } from "react";
import { saveBusinessProfile } from "@/lib/fb/businessProfileActions";
import type {
  BusinessProfile,
  BusinessProfileInput,
} from "@/lib/fb/businessProfile";

interface Props {
  initialProfile: BusinessProfile;
}

const labelClass =
  "block text-[11px] font-bold uppercase tracking-wider text-white/50";
const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-[#0c1728] px-3 py-2 text-sm text-white placeholder:text-white/30";

export default function RestaurantePerfilClient({ initialProfile }: Props) {
  const [form, setForm] = useState<BusinessProfileInput>({
    businessName: initialProfile.businessName,
    legalName: initialProfile.legalName ?? "",
    contactEmail: initialProfile.contactEmail ?? "",
    contactPhone: initialProfile.contactPhone ?? "",
    whatsapp: initialProfile.whatsapp ?? "",
    address: initialProfile.address ?? "",
    intro: initialProfile.intro ?? "",
    refundPolicy: initialProfile.refundPolicy ?? "",
    isPublished: initialProfile.isPublished,
  });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof BusinessProfileInput>(
    key: K,
    value: BusinessProfileInput[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveBusinessProfile(form);
      if (res.ok) {
        setMsg({ ok: true, text: "Guardado. La página pública ya está actualizada." });
      } else {
        setMsg({ ok: false, text: res.error ?? "No se pudo guardar." });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-white">🍴 Perfil del restaurante</h1>
        <p className="text-sm text-white/50">
          Estos datos se muestran en la página pública{" "}
          <a
            href="/restaurante"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 underline"
          >
            listgolf.club/restaurante
          </a>{" "}
          (la que pide Stripe). Edítalos cuando quieras.
        </p>
      </header>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <label className={labelClass}>Nombre del negocio *</label>
          <input
            className={inputClass}
            value={form.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="Restaurante Hoyo 6"
          />
        </div>

        <div>
          <label className={labelClass}>Razón social / nombre fiscal (opcional)</label>
          <input
            className={inputClass}
            value={form.legalName ?? ""}
            onChange={(e) => set("legalName", e.target.value)}
            placeholder="Como aparece en tu RFC"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Correo de contacto</label>
            <input
              className={inputClass}
              type="email"
              value={form.contactEmail ?? ""}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="contacto@tudominio.com"
            />
          </div>
          <div>
            <label className={labelClass}>Teléfono</label>
            <input
              className={inputClass}
              value={form.contactPhone ?? ""}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="+52 442 123 4567"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>WhatsApp (opcional)</label>
            <input
              className={inputClass}
              value={form.whatsapp ?? ""}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="+52 442 123 4567"
            />
          </div>
          <div>
            <label className={labelClass}>Domicilio / ciudad</label>
            <input
              className={inputClass}
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Querétaro, México"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Descripción (texto del encabezado)</label>
          <textarea
            className={inputClass}
            rows={3}
            value={form.intro ?? ""}
            onChange={(e) => set("intro", e.target.value)}
            placeholder="Comida, bebidas y snacks del club…"
          />
        </div>

        <div>
          <label className={labelClass}>Política de cancelación / reembolso</label>
          <textarea
            className={inputClass}
            rows={5}
            value={form.refundPolicy ?? ""}
            onChange={(e) => set("refundPolicy", e.target.value)}
            placeholder="Describe cómo se manejan cancelaciones y reembolsos…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => set("isPublished", e.target.checked)}
            className="h-4 w-4"
          />
          Página pública visible
        </label>

        {msg ? (
          <div
            className={[
              "rounded-md border p-2 text-[12px]",
              msg.ok
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/30 bg-red-400/10 text-red-200",
            ].join(" ")}
          >
            {msg.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-cyan-400 px-5 py-2 text-sm font-bold text-[#08111f] transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
