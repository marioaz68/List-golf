"use client";

import { useMemo, useState, useTransition } from "react";
import type { TelegramCoveragePerson } from "@/lib/telegram/coverageStatus";
import {
  statusChipClass,
  statusChipTitle,
  unreachableOnly,
} from "@/lib/telegram/coverageStatus";
import type { TelegramLinkStatus } from "@/lib/telegram/linkToken";

type GenerateLinkFn = (
  subject: { kind: "player" | "caddie"; id: string }
) => Promise<{ ok: true; deepLink: string } | { ok: false; error: string }>;

export function TelegramStatusChip({
  status,
  compact,
}: {
  status: TelegramLinkStatus;
  compact?: boolean;
}) {
  const label =
    status === "linked" ? "OK" : status === "invalid" ? "!" : "—";
  return (
    <span
      title={statusChipTitle(status)}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full ring-1",
        compact ? "h-4 min-w-4 px-0.5 text-[9px] font-bold" : "px-1.5 py-0.5 text-[10px] font-semibold",
        statusChipClass(status),
      ].join(" ")}
      aria-label={statusChipTitle(status)}
    >
      {compact ? label : status === "linked" ? "✈ OK" : status === "invalid" ? "✈ !" : "✈ —"}
    </span>
  );
}

export default function TelegramCoveragePanel({
  people,
  generateLink,
  title = "Telegram — cobertura de avisos",
}: {
  people: TelegramCoveragePerson[];
  generateLink: GenerateLinkFn;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unreachable = useMemo(() => unreachableOnly(people), [people]);
  const linkedCount = people.length - unreachable.length;

  async function copyLink(person: TelegramCoveragePerson) {
    setErr(null);
    startTransition(async () => {
      const res = await generateLink({
        kind: person.role,
        id: person.subjectId,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(res.deepLink);
        setCopiedId(person.id);
        setTimeout(() => setCopiedId(null), 1600);
      } catch {
        setErr("No pude copiar al portapapeles. Link: " + res.deepLink);
      }
    });
  }

  return (
    <div className="rounded border border-sky-200 bg-sky-50/60 p-2 text-[11px] text-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sky-900">{title}</span>
        <span className="text-slate-600">
          OK {linkedCount}/{people.length}
          {unreachable.length > 0 ? (
            <>
              {" "}
              · sin aviso:{" "}
              <span className="font-semibold text-red-700">
                {unreachable.length}
              </span>
            </>
          ) : null}
        </span>
        <button
          type="button"
          className="rounded border border-sky-400 bg-white px-2 py-0.5 font-semibold text-sky-900 hover:bg-sky-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open
            ? "Ocultar quiénes no reciben"
            : "Quiénes NO reciben el aviso"}
        </button>
      </div>

      {err ? (
        <div className="mt-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-red-800">
          {err}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-200 bg-white">
          {unreachable.length === 0 ? (
            <div className="p-2 text-emerald-800">
              Todos en esta ronda tienen Telegram usable.
            </div>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1 font-semibold">Rol</th>
                  <th className="px-2 py-1 font-semibold">Nombre</th>
                  <th className="px-2 py-1 font-semibold">G</th>
                  <th className="px-2 py-1 font-semibold">Estado</th>
                  <th className="px-2 py-1 font-semibold">Teléfono</th>
                  <th className="px-2 py-1 font-semibold">Link</th>
                </tr>
              </thead>
              <tbody>
                {unreachable.map((p) => (
                  <tr key={`${p.role}-${p.id}`} className="border-t border-slate-100">
                    <td className="px-2 py-1 capitalize text-slate-500">
                      {p.role === "caddie" ? "Caddie" : "Jugador"}
                    </td>
                    <td className="px-2 py-1 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-2 py-1 text-slate-600">
                      {p.groupNo != null ? `G${p.groupNo}` : "—"}
                      {p.teeTime ? ` · ${p.teeTime}` : ""}
                    </td>
                    <td className="px-2 py-1">
                      <TelegramStatusChip status={p.status} />
                    </td>
                    <td className="px-2 py-1 font-mono text-slate-800">
                      {p.phone || "—"}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => copyLink(p)}
                        className="rounded border px-1.5 py-0.5 font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                      >
                        {copiedId === p.id ? "Copiado" : "Copiar link"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
