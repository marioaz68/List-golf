import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";

export default async function DashboardPage() {
  const locale = await getLocale();
  const m = messages[locale].dashboard;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{m.title}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <div className="rounded-xl bg-white/5 p-6">
          <div className="text-sm text-white/60">{m.kpiActive}</div>

          <div className="mt-2 text-3xl font-semibold">3</div>
        </div>

        <div className="rounded-xl bg-white/5 p-6">
          <div className="text-sm text-white/60">{m.kpiPlayers}</div>

          <div className="mt-2 text-3xl font-semibold">248</div>
        </div>

        <div className="rounded-xl bg-white/5 p-6">
          <div className="text-sm text-white/60">{m.kpiLive}</div>

          <div className="mt-2 text-3xl font-semibold">96</div>
        </div>
      </div>
    </div>
  );
}
