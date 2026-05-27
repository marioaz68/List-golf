"use client";

import { useMemo, useState } from "react";
import {
  saveCaddieTelegramAction,
  verifyCaddieTelegramAction,
} from "./telegram-actions";

export type CaddiePendingLinkRow = {
  telegram_user_id: string;
  telegram_chat_id: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  last_seen_at: string;
};

type Copy = {
  title: string;
  migrationWarning: string;
  statusLinked: string;
  statusNotLinked: string;
  step1Title: string;
  step1BodyConfigured: string;
  step1BodyNotConfigured: string;
  openBotLink: string;
  botUsernameLabel: string;
  copyBotUsername: string;
  copied: string;
  step2Title: string;
  step2Body: string;
  pendingLinksTitle: string;
  pendingLinksHint: string;
  pendingLinksEmpty: string;
  pendingLinksUseId: string;
  step3Title: string;
  step3Body: string;
  formTitle: string;
  fieldUserId: string;
  fieldChatId: string;
  fieldChatHint: string;
  btnSave: string;
  btnClear: string;
  verifyTitle: string;
  verifyBody: string;
  btnVerify: string;
  savedBanner: string;
  verifiedBanner: string;
};

type Props = {
  tg: Copy;
  caddieId: string;
  caddieName: string;
  botUser: string;
  botUrl: string | null;
  linked: boolean;
  columnsAvailable: boolean;
  telegramUserId: string;
  telegramChatId: string;
  pendingLinks: CaddiePendingLinkRow[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function CaddieTelegramPanel({
  tg,
  caddieId,
  caddieName,
  botUser,
  botUrl,
  linked,
  columnsAvailable,
  telegramUserId,
  telegramChatId,
  pendingLinks,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [userIdField, setUserIdField] = useState(telegramUserId);
  const [chatIdField, setChatIdField] = useState(telegramChatId);

  const staffScript = useMemo(() => {
    const bot = botUser ? `@${botUser}` : "el bot del torneo";
    return `«${caddieName}: abre Telegram, busca ${bot}, pulsa Iniciar y escribe HOLA. Si el bot te reconoce, ya estamos enlazados; si no, copia tu ID numérico y se lo damos al comité en esta pantalla.»`;
  }, [botUser, caddieName]);

  async function copyBot() {
    if (!botUser) return;
    try {
      await navigator.clipboard.writeText(`@${botUser}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (!columnsAvailable) {
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <h2 className="font-semibold">{tg.title}</h2>
        <p className="mt-2">{tg.migrationWarning}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{tg.title}</h2>
        <p className="mt-1 text-xs text-slate-600">
          {linked ? (
            <span className="font-medium text-emerald-700">{tg.statusLinked}</span>
          ) : (
            <span className="font-medium text-amber-700">{tg.statusNotLinked}</span>
          )}
        </p>
      </div>

      <div className="rounded border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-semibold text-slate-800">{tg.botUsernameLabel}</div>
        {botUser ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1">@{botUser}</code>
            <button
              type="button"
              onClick={copyBot}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-100"
            >
              {copied ? tg.copied : tg.copyBotUsername}
            </button>
            {botUrl ? (
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline"
              >
                {tg.openBotLink}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-1">{tg.step1BodyNotConfigured}</p>
        )}
        <p className="mt-2 italic">{staffScript}</p>
      </div>

      <div>
        <h3 className="font-medium text-slate-900">{tg.step1Title}</h3>
        <p className="mt-1 text-xs text-slate-600">
          {botUser ? tg.step1BodyConfigured : tg.step1BodyNotConfigured}
        </p>
      </div>

      <div>
        <h3 className="font-medium text-slate-900">{tg.step2Title}</h3>
        <p className="mt-1 text-xs text-slate-600">{tg.step2Body}</p>
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs font-semibold text-slate-700">
            {tg.pendingLinksTitle}
          </div>
          <p className="text-[11px] text-slate-500">{tg.pendingLinksHint}</p>
          {pendingLinks.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">{tg.pendingLinksEmpty}</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {pendingLinks.map((row) => {
                const label = [row.first_name, row.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                const handle = row.username ? `@${row.username}` : "";
                return (
                  <li
                    key={row.telegram_user_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                  >
                    <span>
                      {label || handle || row.telegram_user_id}
                      {handle && label ? ` · ${handle}` : ""}
                      <span className="ml-1 text-slate-400">
                        {formatWhen(row.last_seen_at)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUserIdField(row.telegram_user_id);
                        setChatIdField(
                          row.telegram_chat_id?.trim() || row.telegram_user_id
                        );
                      }}
                      className="shrink-0 rounded border border-sky-700 bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-700"
                    >
                      {tg.pendingLinksUseId}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-medium text-slate-900">{tg.step3Title}</h3>
        <p className="mt-1 text-xs text-slate-600">{tg.step3Body}</p>
      </div>

      <form action={saveCaddieTelegramAction} className="space-y-3 border-t border-slate-100 pt-3">
        <p className="font-semibold text-slate-900">{tg.formTitle}</p>
        <input type="hidden" name="caddie_id" value={caddieId} />

        <label className="block text-xs font-medium text-slate-700">
          {tg.fieldUserId}
          <input
            name="telegram_user_id"
            value={userIdField}
            onChange={(e) => setUserIdField(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            placeholder="123456789"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          {tg.fieldChatId}
          <input
            name="telegram_chat_id"
            value={chatIdField}
            onChange={(e) => setChatIdField(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            inputMode="numeric"
            autoComplete="off"
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">
            {tg.fieldChatHint}
          </span>
        </label>

        <button
          type="submit"
          className="rounded border border-sky-900 bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
        >
          {tg.btnSave}
        </button>
      </form>

      <form action={saveCaddieTelegramAction} className="border-t border-slate-100 pt-2">
        <input type="hidden" name="caddie_id" value={caddieId} />
        <input type="hidden" name="clear_telegram" value="1" />
        <button
          type="submit"
          className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
        >
          {tg.btnClear}
        </button>
      </form>

      {linked ? (
        <div className="border-t border-slate-100 pt-3">
          <h3 className="font-medium text-slate-900">{tg.verifyTitle}</h3>
          <p className="mt-1 text-xs text-slate-600">{tg.verifyBody}</p>
          <form action={verifyCaddieTelegramAction} className="mt-2">
            <input type="hidden" name="caddie_id" value={caddieId} />
            <button
              type="submit"
              className="rounded border border-emerald-800 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {tg.btnVerify}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
