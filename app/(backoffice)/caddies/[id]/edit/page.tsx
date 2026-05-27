import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { isMissingCaddieTelegramColumnsError } from "@/lib/caddies/telegramColumns";
import { getTelegramBotUrl, getTelegramBotUsername } from "@/lib/telegram/sendMessage";
import { updateCaddieAction } from "./actions";
import CaddieTelegramPanel, {
  type CaddiePendingLinkRow,
} from "./CaddieTelegramPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active?: boolean | null;
};

type CaddieRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp_phone: string | null;
  whatsapp_phone_e164: string | null;
  email: string | null;
  club_id: string | null;
  level: string | null;
  notes: string | null;
  is_active: boolean | null;
};

const pageWrap: React.CSSProperties = {
  padding: "16px 20px",
  display: "grid",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const cardHeader: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: 0,
  color: "#0f172a",
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  margin: "2px 0 0 0",
};

const formStyle: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 12,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 10,
};

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  minWidth: 0,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 88,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  resize: "vertical",
};

const buttonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #1f2937",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const ghostButtonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};


const antiSafariInputProps = {
  autoComplete: "section-listgolf-caddies one-time-code",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
} as const;

function displayClubName(c: ClubRow) {
  return c.short_name?.trim() || c.name || "Club";
}

export default async function EditCaddiePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const actionError =
    typeof sp.err === "string" ? decodeURIComponent(sp.err.trim()) : "";
  const saved = sp.saved === "1";
  const verified = sp.verified === "1";

  const locale = await getLocale();
  const tgCopy = messages[locale].caddies.telegramLink;

  const supabase = await createClient();
  const admin = createAdminClient();

  const caddieSelectWithTg =
    "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, level, notes, is_active, telegram_user_id, telegram_chat_id";
  const caddieSelectBasic =
    "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, level, notes, is_active";

  let columnsAvailable = true;
  let caddieRes = await admin
    .from("caddies")
    .select(caddieSelectWithTg)
    .eq("id", id)
    .single();

  if (caddieRes.error && isMissingCaddieTelegramColumnsError(caddieRes.error.message)) {
    columnsAvailable = false;
    caddieRes = await admin
      .from("caddies")
      .select(caddieSelectBasic)
      .eq("id", id)
      .single();
  }

  const [{ data: caddieData, error: caddieError }, { data: clubsData, error: clubsError }] =
    await Promise.all([
      Promise.resolve(caddieRes),
      supabase
        .from("clubs")
        .select("id, name, short_name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (caddieError) {
    if (caddieError.code === "PGRST116") {
      notFound();
    }
    throw new Error(`Error leyendo caddie: ${caddieError.message}`);
  }

  if (clubsError) {
    throw new Error(`Error leyendo clubs: ${clubsError.message}`);
  }

  const caddie = caddieData as CaddieRow | null;
  const clubs = (clubsData ?? []) as ClubRow[];

  if (!caddie) {
    notFound();
  }

  const caddieRow = caddie as CaddieRow & {
    telegram_user_id?: string | null;
    telegram_chat_id?: string | null;
  };
  const caddieName =
    [caddieRow.first_name, caddieRow.last_name].filter(Boolean).join(" ").trim() ||
    "Caddie";
  const telegramUserId = String(caddieRow.telegram_user_id ?? "").trim();
  const telegramChatId = String(caddieRow.telegram_chat_id ?? "").trim();
  const linked = Boolean(telegramUserId);

  let pendingLinks: CaddiePendingLinkRow[] = [];
  if (columnsAvailable) {
    const { data: pendingRows } = await admin
      .from("telegram_pending_links")
      .select(
        "telegram_user_id, telegram_chat_id, first_name, last_name, username, last_seen_at"
      )
      .order("last_seen_at", { ascending: false })
      .limit(12);
    pendingLinks = (pendingRows ?? []) as CaddiePendingLinkRow[];
  }

  const botUser = getTelegramBotUsername();
  const botUrl = getTelegramBotUrl();

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>EDITAR CADDIE</h1>
            <p style={subStyle}>Actualiza datos operativos del caddie</p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/caddies" style={ghostButtonStyle}>
              Volver a caddies
            </Link>
          </div>
        </div>

        <form action={updateCaddieAction} style={formStyle} autoComplete="off" spellCheck={false}>
          <input type="hidden" name="id" value={caddie.id} />

          <div style={gridStyle}>
            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="first_name" style={labelStyle}>
                Nombre
              </label>
              <input
                id="first_name"
                name="first_name"
                required
                defaultValue={caddie.first_name ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="Nombre"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="last_name" style={labelStyle}>
                Apellido
              </label>
              <input
                id="last_name"
                name="last_name"
                required
                defaultValue={caddie.last_name ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="Apellido"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="nickname" style={labelStyle}>
                Apodo / Nickname
              </label>
              <input
                id="nickname"
                name="nickname"
                defaultValue={caddie.nickname ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="Ej. Chino / Flaco / Junior"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="level" style={labelStyle}>
                Nivel
              </label>
              <select
                id="level"
                name="level"
                defaultValue={caddie.level ?? ""}
                style={fieldStyle}
              >
                <option value="">Sin nivel</option>
                <option value="advanced">Avanzado</option>
                <option value="intermediate">Intermedio</option>
                <option value="beginner">Principiante</option>
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="phone" style={labelStyle}>
                Teléfono
              </label>
              <input
                id="phone"
                name="phone"
                inputMode="tel"
                defaultValue={caddie.phone ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="telegram" style={labelStyle}>
                Telegram
              </label>
              <input
                id="telegram"
                name="telegram"
                inputMode="tel"
                defaultValue={caddie.telegram ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="@usuario o teléfono"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="whatsapp_phone" style={labelStyle}>
                WhatsApp
              </label>
              <input
                id="whatsapp_phone"
                name="whatsapp_phone"
                inputMode="tel"
                defaultValue={caddie.whatsapp_phone ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="whatsapp_phone_e164" style={labelStyle}>
                WhatsApp E164
              </label>
              <input
                id="whatsapp_phone_e164"
                name="whatsapp_phone_e164"
                inputMode="tel"
                defaultValue={caddie.whatsapp_phone_e164 ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="+52442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="email" style={labelStyle}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="text"
                inputMode="email"
                defaultValue={caddie.email ?? ""}
                style={fieldStyle}
                {...antiSafariInputProps}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="club_id" style={labelStyle}>
                Club
              </label>
              <select
                id="club_id"
                name="club_id"
                defaultValue={caddie.club_id ?? ""}
                style={fieldStyle}
              >
                <option value="">Sin club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {displayClubName(club)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="is_active" style={labelStyle}>
                Activo
              </label>
              <select
                id="is_active"
                name="is_active"
                defaultValue={caddie.is_active === false ? "false" : "true"}
                style={fieldStyle}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 12" }}>
              <label htmlFor="notes" style={labelStyle}>
                Notas
              </label>
              <textarea
                id="notes"
                name="notes"
                defaultValue={caddie.notes ?? ""}
                style={textareaStyle}
                {...antiSafariInputProps}
                placeholder="Notas operativas del caddie"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle}>
              Guardar cambios
            </button>

            <Link href="/caddies" style={ghostButtonStyle}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>

      {saved ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {tgCopy.savedBanner}
        </div>
      ) : null}
      {verified ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {tgCopy.verifiedBanner}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {actionError}
        </div>
      ) : null}

      <CaddieTelegramPanel
        tg={tgCopy}
        caddieId={caddie.id}
        caddieName={caddieName}
        botUser={botUser}
        botUrl={botUrl}
        linked={linked}
        columnsAvailable={columnsAvailable}
        telegramUserId={telegramUserId}
        telegramChatId={telegramChatId}
        pendingLinks={pendingLinks}
      />
    </div>
  );
}