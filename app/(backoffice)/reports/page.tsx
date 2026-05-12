import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";

export default async function ReportsPage() {
  const locale = await getLocale();
  const m = messages[locale].reports;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{m.title}</h1>
    </div>
  );
}
