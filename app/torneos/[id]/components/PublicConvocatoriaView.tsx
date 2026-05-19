import type { PublicConvocatoriaSection } from "@/lib/convocatoria/formatPublicConvocatoria";

type Labels = {
  empty: string;
  readOnlyNote: string;
};

export default function PublicConvocatoriaView({
  sections,
  labels,
}: {
  sections: PublicConvocatoriaSection[];
  labels: Labels;
}) {
  if (sections.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
        {labels.empty}
      </p>
    );
  }

  return (
    <article className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <p className="mb-8 text-xs text-slate-500">{labels.readOnlyNote}</p>
      <div className="space-y-8">
        {sections.map((section, index) => (
          <section
            key={`${section.heading}-${index}`}
            className="border-b border-white/5 pb-8 last:border-0 last:pb-0"
          >
            {section.heading ? (
              <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                {section.heading}
              </h2>
            ) : null}
            {section.body ? (
              <p
                className={`whitespace-pre-wrap text-sm leading-7 text-slate-200 sm:text-base ${
                  section.heading ? "mt-3" : ""
                }`}
              >
                {section.body}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
