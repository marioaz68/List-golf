import type { PublicConvocatoriaSection } from "@/lib/convocatoria/formatPublicConvocatoria";

type Labels = {
  empty: string;
  readOnlyNote: string;
};

const DAY_REGEX =
  /^(LUNES|MARTES|MI[ÉE]RCOLES|JUEVES|VIERNES|S[ÁA]BADO|DOMINGO)\s+\d+\s+DE\s+\w+/i;

function bodyLines(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function isShortListBody(lines: string[]): boolean {
  if (lines.length < 3) return false;
  return lines.every((l) => l.length <= 80);
}

function ProgramByDays({ lines }: { lines: string[] }) {
  type Group = { day: string; items: string[] };
  const groups: Group[] = [];
  let pre: string[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (DAY_REGEX.test(line)) {
      if (current) groups.push(current);
      current = { day: line, items: [] };
      continue;
    }
    if (current) current.items.push(line);
    else pre.push(line);
  }
  if (current) groups.push(current);

  return (
    <div className="mt-3 space-y-3">
      {pre.length > 0 ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
          {pre.join("\n")}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g, idx) => (
          <div
            key={`${g.day}-${idx}`}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              {g.day}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-200">
              {g.items.map((item, i) => (
                <li key={i} className="border-l-2 border-cyan-400/30 pl-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShortList({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm leading-6 text-slate-200 sm:grid-cols-2">
      {lines.map((line, i) => (
        <li
          key={`${line}-${i}`}
          className="border-l-2 border-cyan-400/30 pl-2"
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

function ParagraphBody({ lines }: { lines: string[] }) {
  return (
    <div className="mt-3 space-y-2.5 text-sm leading-7 text-slate-200">
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

function renderSectionBody(heading: string, body: string) {
  if (!body) return null;
  const lines = bodyLines(body);
  if (lines.length === 0) return null;

  const upper = heading.toUpperCase();
  if (upper.includes("PROGRAMA DE EVENTOS")) {
    return <ProgramByDays lines={lines} />;
  }

  if (isShortListBody(lines)) {
    return <ShortList lines={lines} />;
  }

  return <ParagraphBody lines={lines} />;
}

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

  const titleSection = sections[0]?.body ? null : sections[0];
  const restSections = titleSection ? sections.slice(1) : sections;

  return (
    <article className="mx-auto w-full max-w-6xl">
      <p className="mb-4 text-xs text-slate-500">{labels.readOnlyNote}</p>
      {titleSection ? (
        <h1 className="mb-4 text-xl font-bold tracking-tight text-white sm:text-2xl">
          {titleSection.heading}
        </h1>
      ) : null}
      <div className="columns-1 gap-4 lg:columns-2 lg:gap-6 [&>*]:break-inside-avoid [&>*]:mb-4">
        {restSections.map((section, index) => {
          const isProgram = section.heading
            .toUpperCase()
            .includes("PROGRAMA DE EVENTOS");
          return (
            <section
              key={`${section.heading}-${index}`}
              className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${
                isProgram ? "lg:column-span-all" : ""
              }`}
            >
              {section.heading ? (
                <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  {section.heading}
                </h2>
              ) : null}
              {renderSectionBody(section.heading, section.body)}
            </section>
          );
        })}
      </div>
    </article>
  );
}
