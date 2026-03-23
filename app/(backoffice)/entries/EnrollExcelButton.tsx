import { enrollExcelPlayersToTournament } from "./actions";

export default function EnrollExcelButton({ tournament_id }: { tournament_id: string }) {
  return (
    <form action={enrollExcelPlayersToTournament}>
      <input type="hidden" name="tournament_id" value={tournament_id} />
      <button
        type="submit"
        className="rounded bg-black px-3 py-2 text-sm text-white hover:opacity-90"
      >
        Inscribir 30 del Excel
      </button>
    </form>
  );
}