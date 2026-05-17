"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  deliverTelegramKit,
  savePlayerTelegramFromKit,
  verifyTelegramLinkFromKit,
} from "../actions";
import { buildTelegramKitMessage } from "@/lib/telegram/kitMessage";

type KitCopy = {
  botUsernameLabel: string;
  botUsernameHint: string;
  copyBotUsername: string;
  copied: string;
  staffScriptTitle: string;
  staffScript: string;
  phaseConnect: string;
  phaseVerify: string;
  phaseDeliver: string;
  statusLinked: string;
  statusNotLinked: string;
  statusKitSent: string;
  statusKitReceived: string;
  step1Title: string;
  step1BodyConfigured: string;
  step1BodyNotConfigured: string;
  openBotLink: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
  verifyTitle: string;
  verifyBody: string;
  btnVerify: string;
  deliverTitle: string;
  deliverBody: string;
  kitPreviewLabel: string;
  kitExtraNote: string;
  btnDeliverKit: string;
  formTitle: string;
  fieldUserId: string;
  fieldChatId: string;
  fieldChatHint: string;
  btnSave: string;
  btnClear: string;
  pendingLinksTitle: string;
  pendingLinksHint: string;
  pendingLinksEmpty: string;
  pendingLinksUseId: string;
  openUserinfobot: string;
  partialDeliveryLabel: string;
  partialPendingPlaceholder: string;
  partialPendingHint: string;
  statusKitPartial: string;
  linkKitContent: string;
  statusKitPendingItems: string;
};

export type TelegramPendingLinkRow = {
  telegram_user_id: string;
  telegram_chat_id: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  last_seen_at: string;
};

type Props = {
  tk: KitCopy;
  tournamentId: string;
  playerId: string;
  playerName: string;
  tournamentName: string;
  botUser: string;
  botUrl: string | null;
  linked: boolean;
  telegramUserId: string;
  telegramChatId: string;
  kitSentAt: string | null;
  kitReceivedAt: string | null;
  kitPartialAt: string | null;
  kitPendingItems: string | null;
  pendingLinks: TelegramPendingLinkRow[];
};

function formatWhen(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function TelegramKitPanel({
  tk,
  tournamentId,
  playerId,
  playerName,
  tournamentName,
  botUser,
  botUrl,
  linked,
  telegramUserId,
  telegramChatId,
  kitSentAt,
  kitReceivedAt,
  kitPartialAt,
  kitPendingItems,
  pendingLinks,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [extraNote, setExtraNote] = useState("");
  const [partialDelivery, setPartialDelivery] = useState(
    Boolean(kitPendingItems?.trim())
  );
  const [pendingItemsField, setPendingItemsField] = useState(
    kitPendingItems ?? ""
  );
  const [userIdField, setUserIdField] = useState(telegramUserId);
  const [chatIdField, setChatIdField] = useState(telegramChatId);

  const botAt = botUser ? `@${botUser}` : "";
  const staffScript = tk.staffScript.replace("{bot}", botUser || "…");

  const kitPreview = useMemo(
    () =>
      buildTelegramKitMessage({
        playerName,
        tournamentName,
        extraNote: extraNote || null,
        pendingItems:
          partialDelivery && pendingItemsField.trim()
            ? pendingItemsField.trim()
            : null,
      }),
    [playerName, tournamentName, extraNote, partialDelivery, pendingItemsField]
  );

  const kitReceived = Boolean(kitReceivedAt?.trim());
  const kitPartial = Boolean(kitPartialAt?.trim()) && !kitReceived;
  const kitSent = Boolean(kitSentAt?.trim());

  async function copyBotUsername() {
    if (!botAt) return;
    try {
      await navigator.clipboard.writeText(botAt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia el usuario del bot:", botAt);
    }
  }

  return (
    <>
      <section className="rounded-lg border-2 border-sky-200 bg-sky-50 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
          {tk.botUsernameLabel}
        </p>
        {botUser ? (
          <>
            <p className="mt-2 font-mono text-2xl font-bold text-sky-950">{botAt}</p>
            <p className="mt-2 text-sm text-sky-900/80">{tk.botUsernameHint}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {botUrl ? (
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded border border-sky-900 bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                >
                  {tk.openBotLink}
                </a>
              ) : null}
              <button
                type="button"
                onClick={copyBotUsername}
                className="mt-3 inline-flex rounded border border-sky-800 bg-white px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 sm:ml-2"
              >
                {copied ? tk.copied : tk.copyBotUsername}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-amber-900">{tk.step1BodyNotConfigured}</p>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold text-sky-950">{tk.staffScriptTitle}</p>
          <p className="mt-1 rounded border border-sky-200 bg-white/80 p-3 text-sm italic text-gray-800">
            {staffScript}
          </p>
        </div>
      </section>

      <section className="flex flex-wrap gap-2 text-xs">
        <StatusPill
          ok={linked}
          label={linked ? tk.statusLinked : tk.statusNotLinked}
        />
        {kitSent ? (
          <StatusPill ok={!kitReceived} label={tk.statusKitSent} />
        ) : null}
        {kitPartial ? <StatusPill ok={false} label={tk.statusKitPartial} /> : null}
        {kitReceived ? <StatusPill ok label={tk.statusKitReceived} /> : null}
      </section>

      {kitPendingItems?.trim() && !kitReceived ? (
        <p className="text-xs text-amber-900">
          {tk.statusKitPendingItems} {kitPendingItems}
        </p>
      ) : null}

      {kitSentAt ? (
        <p className="text-xs text-gray-600">
          Kit enviado: {formatWhen(kitSentAt)}
          {kitReceivedAt ? ` · Recibido: ${formatWhen(kitReceivedAt)}` : ""}
        </p>
      ) : null}

      <section className="space-y-4 rounded border border-gray-200 bg-white p-4 shadow-sm text-sm">
        <h2 className="font-semibold text-gray-900">{tk.phaseConnect}</h2>

        <div>
          <h3 className="font-medium text-gray-800">{tk.step1Title}</h3>
          <p className="mt-1 text-gray-700">
            {botUser ? tk.step1BodyConfigured : tk.step1BodyNotConfigured}
          </p>
        </div>

        <div>
          <h3 className="font-medium text-gray-800">{tk.step2Title}</h3>
          <p className="mt-1 text-gray-700">{tk.step2Body}</p>
          <a
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-semibold text-sky-800 underline"
          >
            {tk.openUserinfobot} ↗
          </a>
        </div>

        {!linked ? (
          <div className="rounded border border-sky-200 bg-sky-50/60 p-3">
            <p className="text-xs font-semibold text-sky-950">{tk.pendingLinksTitle}</p>
            <p className="mt-1 text-[11px] text-sky-900/90">{tk.pendingLinksHint}</p>
            {pendingLinks.length === 0 ? (
              <p className="mt-2 text-xs text-gray-600">{tk.pendingLinksEmpty}</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {pendingLinks.map((row) => {
                  const name =
                    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                    (row.username ? `@${row.username}` : "Sin nombre");
                  return (
                    <li
                      key={row.telegram_user_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-100 bg-white px-2 py-1.5 text-xs"
                    >
                      <span>
                        <span className="font-medium text-gray-900">{name}</span>
                        <span className="ml-2 font-mono text-sky-800">
                          {row.telegram_user_id}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setUserIdField(row.telegram_user_id);
                          if (row.telegram_chat_id) {
                            setChatIdField(row.telegram_chat_id);
                          }
                        }}
                        className="shrink-0 rounded border border-sky-700 bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-700"
                      >
                        {tk.pendingLinksUseId}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div>
          <h3 className="font-medium text-gray-800">{tk.step3Title}</h3>
          <p className="mt-1 text-gray-700">{tk.step3Body}</p>
        </div>

        <form
          action={savePlayerTelegramFromKit}
          className="space-y-3 border-t border-gray-100 pt-4"
        >
          <p className="font-semibold text-gray-900">{tk.formTitle}</p>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="player_id" value={playerId} />

          <label className="block text-xs font-medium text-gray-700">
            {tk.fieldUserId}
            <input
              name="telegram_user_id"
              value={userIdField}
              onChange={(e) =>
                setUserIdField(e.target.value.replace(/\D/g, ""))
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
              placeholder="123456789"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          <label className="block text-xs font-medium text-gray-700">
            {tk.fieldChatId}
            <input
              name="telegram_chat_id"
              value={chatIdField}
              onChange={(e) =>
                setChatIdField(e.target.value.replace(/\D/g, ""))
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
              inputMode="numeric"
              autoComplete="off"
            />
            <span className="mt-1 block text-[11px] font-normal text-gray-500">
              {tk.fieldChatHint}
            </span>
          </label>

          <button
            type="submit"
            className="rounded border border-sky-900 bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            {tk.btnSave}
          </button>
        </form>

        <form action={savePlayerTelegramFromKit} className="border-t border-gray-100 pt-3">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="player_id" value={playerId} />
          <input type="hidden" name="clear_telegram" value="1" />
          <button
            type="submit"
            className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200"
          >
            {tk.btnClear}
          </button>
        </form>
      </section>

      {linked ? (
        <section className="space-y-3 rounded border border-gray-200 bg-white p-4 shadow-sm text-sm">
          <h2 className="font-semibold text-gray-900">{tk.phaseVerify}</h2>
          <h3 className="font-medium text-gray-800">{tk.verifyTitle}</h3>
          <p className="text-gray-700">{tk.verifyBody}</p>
          <form action={verifyTelegramLinkFromKit}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="player_id" value={playerId} />
            <button
              type="submit"
              className="rounded border border-emerald-800 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {tk.btnVerify}
            </button>
          </form>
        </section>
      ) : null}

      {linked ? (
        <section className="space-y-3 rounded border border-amber-200 bg-amber-50/50 p-4 shadow-sm text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">{tk.phaseDeliver}</h2>
            <Link
              href={`/entries/telegram-kit-content?tournament_id=${encodeURIComponent(tournamentId)}`}
              className="text-xs font-semibold text-sky-800 underline"
            >
              {tk.linkKitContent}
            </Link>
          </div>
          <h3 className="font-medium text-gray-800">{tk.deliverTitle}</h3>
          <p className="text-gray-700">{tk.deliverBody}</p>

          <label className="flex items-start gap-2 text-xs text-gray-800">
            <input
              type="checkbox"
              checked={partialDelivery}
              onChange={(e) => setPartialDelivery(e.target.checked)}
              className="mt-0.5"
            />
            <span>{tk.partialDeliveryLabel}</span>
          </label>

          {partialDelivery ? (
            <label className="block text-xs font-medium text-gray-700">
              {tk.statusKitPendingItems}
              <textarea
                value={pendingItemsField}
                onChange={(e) => setPendingItemsField(e.target.value)}
                rows={2}
                placeholder={tk.partialPendingPlaceholder}
                className="mt-1 w-full rounded border border-amber-300 px-2 py-1.5 text-sm text-black"
              />
              <span className="mt-1 block font-normal text-gray-500">
                {tk.partialPendingHint}
              </span>
            </label>
          ) : null}

          <label className="block text-xs font-medium text-gray-700">
            {tk.kitExtraNote}
            <textarea
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
              placeholder="Ej. horario de práctica, dress code, punto de encuentro…"
            />
          </label>

          <div>
            <p className="text-xs font-semibold text-gray-700">{tk.kitPreviewLabel}</p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-3 text-xs text-gray-800">
              {kitPreview}
            </pre>
          </div>

          <form action={deliverTelegramKit}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="player_id" value={playerId} />
            <input type="hidden" name="kit_extra_note" value={extraNote} />
            <input
              type="hidden"
              name="kit_partial_delivery"
              value={partialDelivery ? "1" : "0"}
            />
            {partialDelivery ? (
              <input
                type="hidden"
                name="kit_pending_items"
                value={pendingItemsField}
              />
            ) : null}
            <button
              type="submit"
              className="rounded border border-amber-900 bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              {kitSent && !kitReceived
                ? `${tk.btnDeliverKit} (reenviar)`
                : tk.btnDeliverKit}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-medium ${
        ok ? "bg-emerald-100 text-emerald-900" : "bg-gray-100 text-gray-700"
      }`}
    >
      {label}
    </span>
  );
}
