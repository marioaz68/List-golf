"use client";

import { useMemo, useState, useTransition } from "react";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import {
  sendCaptureLinkToGroupAction,
  sendCaptureLinkToAllGroupsAction,
  type SendResult,
} from "./actions";
import AuditCaptureModal from "./AuditCaptureModal";

export type MemberRow = {
  id: string;
  position: number | null;
  playerNumber: number | null;
  playerName: string;
  telegramLinked: boolean;
};

export type CaddieRow = {
  id: string;
  name: string;
  telegramLinked: boolean;
  role: string | null;
};

export type GroupRow = {
  id: string;
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  notes: string | null;
  members: MemberRow[];
  caddies: CaddieRow[];
  captureUrl: string;
};

type Feedback = {
  groupId: string;
  kind: "ok" | "warn" | "error";
  text: string;
};

function buildQrUrl(target: string, size = 360): string {
  const safe = encodeURIComponent(target);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${safe}`;
}

function formatRecipientResult(
  tpl: { ok: string; partial: string; empty: string; error: string },
  result: SendResult
): { kind: "ok" | "warn" | "error"; text: string } {
  if (!result.ok) {
    return { kind: "error", text: result.error || tpl.error };
  }
  const { sent, failed } = result;
  if (sent === 0 && failed === 0) {
    return { kind: "warn", text: tpl.empty };
  }
  if (failed > 0) {
    return {
      kind: "warn",
      text: tpl.partial
        .replace("{sent}", String(sent))
        .replace("{failed}", String(failed)),
    };
  }
  return {
    kind: "ok",
    text: tpl.ok.replace("{sent}", String(sent)),
  };
}

export default function CapturaTelegramPanel(props: {
  tournamentId: string;
  roundId: string;
  groups: GroupRow[];
}) {
  const { t } = useAppLocale();
  const tt = t.capturaTelegram;
  const [copied, setCopied] = useState<string | null>(null);
  const [qrGroupId, setQrGroupId] = useState<string | null>(null);
  const [auditGroupId, setAuditGroupId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<{
    kind: "ok" | "warn" | "error";
    text: string;
  } | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [, startTx] = useTransition();

  const sendTpl = useMemo(
    () => ({
      ok: tt.sendResultSuccess,
      partial: tt.sendResultPartial,
      empty: tt.sendResultEmpty,
      error: tt.sendResultError,
    }),
    [tt]
  );

  const qrGroup = qrGroupId
    ? props.groups.find((g) => g.id === qrGroupId) ?? null
    : null;

  async function handleCopy(url: string, groupId: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(groupId);
      setTimeout(() => {
        setCopied((cur) => (cur === groupId ? null : cur));
      }, 1500);
    } catch {
      // fallback silencioso si no hay permisos
    }
  }

  async function handleSendGroup(groupId: string) {
    setBusyGroupId(groupId);
    setFeedback(null);
    const fd = new FormData();
    fd.set("tournament_id", props.tournamentId);
    fd.set("round_id", props.roundId);
    fd.set("group_id", groupId);
    try {
      const result = await sendCaptureLinkToGroupAction(fd);
      const fb = formatRecipientResult(sendTpl, result);
      setFeedback({ groupId, ...fb });
    } catch {
      setFeedback({ groupId, kind: "error", text: tt.sendResultError });
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleSendAll() {
    if (!confirm(tt.btnSendAllConfirm)) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    const fd = new FormData();
    fd.set("tournament_id", props.tournamentId);
    fd.set("round_id", props.roundId);
    try {
      const result = await sendCaptureLinkToAllGroupsAction(fd);
      setBulkFeedback(formatRecipientResult(sendTpl, result));
    } catch {
      setBulkFeedback({ kind: "error", text: tt.sendResultError });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {props.groups.length} {tt.table.group.toLowerCase()}(s)
        </div>
        <button
          type="button"
          onClick={() => startTx(handleSendAll)}
          disabled={bulkBusy}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {bulkBusy ? tt.btnSending : tt.btnSendAll}
        </button>
      </div>

      {bulkFeedback ? (
        <div
          className={`mb-3 rounded border px-3 py-2 text-sm ${
            bulkFeedback.kind === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : bulkFeedback.kind === "warn"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {bulkFeedback.text}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">{tt.table.group}</th>
              <th className="px-3 py-2">{tt.table.hole}</th>
              <th className="px-3 py-2">{tt.table.teeTime}</th>
              <th className="px-3 py-2">{tt.table.players}</th>
              <th className="px-3 py-2">{tt.table.caddies}</th>
              <th className="px-3 py-2">{tt.table.link}</th>
              <th className="px-3 py-2">{tt.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {props.groups.map((g) => {
              const fb = feedback?.groupId === g.id ? feedback : null;
              const linkedCount =
                g.members.filter((m) => m.telegramLinked).length +
                g.caddies.filter((c) => c.telegramLinked).length;
              return (
                <tr key={g.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">
                    #{g.groupNo ?? "?"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {g.startingHole ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {g.teeTime ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5 text-xs">
                      {g.members.map((m) => (
                        <li key={m.id} className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-500">
                            {m.position ?? "-"}.
                          </span>
                          <span className="text-slate-900">
                            {m.playerNumber != null ? `#${m.playerNumber} ` : ""}
                            {m.playerName}
                          </span>
                          <span
                            className={`rounded px-1 text-[10px] ${
                              m.telegramLinked
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {m.telegramLinked ? tt.linkedYes : tt.linkedNo}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2">
                    {g.caddies.length === 0 ? (
                      <span className="text-xs italic text-slate-400">
                        {tt.table.noCaddies}
                      </span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {g.caddies.map((c) => (
                          <li key={c.id} className="flex items-center gap-1.5">
                            <span className="text-slate-900">{c.name}</span>
                            <span
                              className={`rounded px-1 text-[10px] ${
                                c.telegramLinked
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {c.telegramLinked ? tt.linkedYes : tt.linkedNo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="block max-w-xs overflow-hidden text-ellipsis whitespace-nowrap rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                      {g.captureUrl}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopy(g.captureUrl, g.id)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {copied === g.id ? tt.btnCopied : tt.btnCopy}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrGroupId(g.id)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {tt.btnQr}
                      </button>
                      <button
                        type="button"
                        disabled={busyGroupId === g.id || linkedCount === 0}
                        title={
                          linkedCount === 0
                            ? tt.sendResultEmpty
                            : undefined
                        }
                        onClick={() => startTx(() => handleSendGroup(g.id))}
                        className="rounded bg-sky-700 px-2 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                      >
                        {busyGroupId === g.id ? tt.btnSending : tt.btnSend}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditGroupId(g.id)}
                        title="Ver auditoría de captura del grupo"
                        className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        🔍 Auditoría
                      </button>
                    </div>
                    {fb ? (
                      <div
                        className={`mt-1 text-[11px] ${
                          fb.kind === "ok"
                            ? "text-emerald-700"
                            : fb.kind === "warn"
                              ? "text-amber-700"
                              : "text-red-700"
                        }`}
                      >
                        {fb.text}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {qrGroup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQrGroupId(null)}
        >
          <div
            className="max-w-md rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {tt.qrModalTitle} #{qrGroup.groupNo ?? "?"}
              </h3>
              <button
                type="button"
                onClick={() => setQrGroupId(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={tt.qrModalClose}
              >
                ×
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildQrUrl(qrGroup.captureUrl, 360)}
              alt={`QR ${qrGroup.captureUrl}`}
              className="mx-auto block h-72 w-72 sm:h-80 sm:w-80"
            />
            <p className="mt-2 text-center text-xs text-slate-600">
              {tt.qrModalHint}
            </p>
            <code className="mt-2 block break-all rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              {qrGroup.captureUrl}
            </code>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopy(qrGroup.captureUrl, qrGroup.id)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {copied === qrGroup.id ? tt.btnCopied : tt.btnCopy}
              </button>
              <button
                type="button"
                onClick={() => setQrGroupId(null)}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                {tt.qrModalClose}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {auditGroupId ? (
        <AuditCaptureModal
          groupId={auditGroupId}
          groupNo={
            props.groups.find((gg) => gg.id === auditGroupId)?.groupNo ?? null
          }
          onClose={() => setAuditGroupId(null)}
        />
      ) : null}
    </div>
  );
}
