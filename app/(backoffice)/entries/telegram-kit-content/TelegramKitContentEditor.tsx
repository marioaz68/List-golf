"use client";

import { saveTelegramKitContent } from "./actions";

type Props = {
  tournamentId: string;
  greetingLine: string;
  bodyLines: string;
  footerLine: string;
  labels: {
    greeting: string;
    body: string;
    footer: string;
    placeholders: string;
    save: string;
  };
};

export default function TelegramKitContentEditor({
  tournamentId,
  greetingLine,
  bodyLines,
  footerLine,
  labels,
}: Props) {
  return (
    <form action={saveTelegramKitContent} className="space-y-4">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <p className="text-xs text-gray-600">{labels.placeholders}</p>

      <label className="block text-sm font-medium text-gray-800">
        {labels.greeting}
        <input
          name="greeting_line"
          defaultValue={greetingLine}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
        />
      </label>

      <label className="block text-sm font-medium text-gray-800">
        {labels.body}
        <textarea
          name="body_lines"
          defaultValue={bodyLines}
          rows={12}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm text-black"
        />
      </label>

      <label className="block text-sm font-medium text-gray-800">
        {labels.footer}
        <textarea
          name="footer_line"
          defaultValue={footerLine}
          rows={4}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-black"
        />
      </label>

      <button
        type="submit"
        className="rounded border border-sky-900 bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
      >
        {labels.save}
      </button>
    </form>
  );
}
