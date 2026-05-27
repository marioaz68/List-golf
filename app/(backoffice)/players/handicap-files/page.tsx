import Link from "next/link";
import HandicapFilesBulkUpload from "./HandicapFilesBulkUpload";

export const dynamic = "force-dynamic";

export default function HandicapFilesPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Archivos GHIN</h1>
          <p className="mt-1 text-sm text-slate-300">
            Sube reportes HTML (u otros formatos) nombrados con el GHIN. El
            comité los verá al votar desde el celular.
          </p>
        </div>
        <Link
          href="/players"
          className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
        >
          ← Jugadores
        </Link>
      </div>

      <HandicapFilesBulkUpload />
    </div>
  );
}
