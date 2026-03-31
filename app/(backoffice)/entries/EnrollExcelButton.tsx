import { enrollExcelPlayersToTournament } from "./actions";

export default function EnrollExcelButton({
  tournament_id,
}: {
  tournament_id: string;
}) {
  return (
    <form
      action={enrollExcelPlayersToTournament}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="tournament_id" value={tournament_id} />

      <input
        type="number"
        name="limit"
        min={1}
        defaultValue={30}
        className="h-8 w-20 rounded border border-gray-300 px-2 text-sm text-black"
      />

      <button
        type="submit"
        className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"
      >
        Importar del Excel
      </button>
    </form>
  );
}