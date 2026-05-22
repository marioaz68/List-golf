type Props = {
  title: string;
  body: string;
  detailMessage?: string;
  technicalLabel: string;
};

export default function PublicTournamentLoadError({
  title,
  body,
  detailMessage,
  technicalLabel,
}: Props) {
  return (
    <div className="bg-[#08111f] text-white min-h-screen">
      <section className="border-b border-white/10 bg-[#08111f]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
          {detailMessage ? (
            <details className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-cyan-300">
                {technicalLabel}
              </summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-400">
                {detailMessage}
              </pre>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}
