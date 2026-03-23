export default function DashboardPage() {
  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-semibold">
        Dashboard
      </h1>

      <div className="grid grid-cols-3 gap-6">

        <div className="bg-white/5 rounded-xl p-6">
          <div className="text-sm text-white/60">
            Active Tournaments
          </div>

          <div className="text-3xl font-semibold mt-2">
            3
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-6">
          <div className="text-sm text-white/60">
            Total Players
          </div>

          <div className="text-3xl font-semibold mt-2">
            248
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-6">
          <div className="text-sm text-white/60">
            Live Scores
          </div>

          <div className="text-3xl font-semibold mt-2">
            96
          </div>
        </div>

      </div>

    </div>
  );
}