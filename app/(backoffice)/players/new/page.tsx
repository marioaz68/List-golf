import NewPlayerForm from "../NewPlayerForm";

export const dynamic = "force-dynamic";

type SP = {
  returnTournament?: string;
};

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = searchParams ? await searchParams : {};
  const returnTournament =
    typeof sp?.returnTournament === "string" ? sp.returnTournament : "";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Nuevo jugador</h1>

      <NewPlayerForm returnTournament={returnTournament} />
    </div>
  );
}