"use client";

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
};

export default function PlayersTable({ players }: { players: Player[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-300 bg-white/95 p-1.5 shadow-sm">
      <table className="w-full border-collapse text-[11px] leading-none">
        <thead>
          <tr className="bg-gray-200 text-left text-gray-900">
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">Nombre</th>
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">
              Handicap Index
            </th>
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">
              Handicap Torneo
            </th>
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">Teléfono</th>
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">Email</th>
            <th className="border border-gray-300 px-1.5 py-1 font-semibold">Club</th>
          </tr>
        </thead>

        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="bg-white">
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"}
              </td>
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {p.handicap_index ?? "—"}
              </td>
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {p.handicap_torneo ?? "—"}
              </td>
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {p.phone ?? "—"}
              </td>
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {p.email ?? "—"}
              </td>
              <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                {p.club ?? "—"}
              </td>
            </tr>
          ))}

          {players.length === 0 ? (
            <tr>
              <td
                className="border border-gray-300 px-2 py-2 text-[11px] text-black"
                colSpan={6}
              >
                Sin resultados
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
