"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PartnerCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender?: "M" | "F" | "X" | null;
  handicap_index?: number | null;
  club_label?: string | null;
  enrolled?: boolean;
};

type Props = {
  candidates: PartnerCandidate[];
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputName?: string;
};

function fullName(p: PartnerCandidate) {
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim();
}

export default function PartnerPicker({
  candidates,
  value,
  onSelect,
  placeholder = "Buscar pareja...",
  disabled = false,
  inputName,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = value
    ? candidates.find((c) => c.id === value) ?? null
    : null;

  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 12);
    return candidates
      .filter((c) => {
        const name = fullName(c).toLowerCase();
        const club = (c.club_label ?? "").toLowerCase();
        return name.includes(q) || club.includes(q);
      })
      .slice(0, 12);
  }, [candidates, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex min-w-[160px] max-w-[220px] items-center gap-1 rounded border border-emerald-400 bg-emerald-50 px-2 py-[3px] text-[11px] text-emerald-900">
          <span className="truncate font-semibold">{fullName(selected)}</span>
          {selected.gender ? (
            <span className="text-[10px] opacity-70">{selected.gender}</span>
          ) : null}
          {!selected.enrolled ? (
            <span className="text-[10px] italic opacity-70">(nuevo)</span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onSelect("");
            setQuery("");
          }}
          className="inline-flex h-6 items-center justify-center rounded border border-gray-300 bg-white px-1.5 text-[10px] text-gray-700 hover:bg-gray-50"
        >
          ×
        </button>
        {inputName ? (
          <input type="hidden" name={inputName} value={selected.id} />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-[200px]">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-[11px] text-black disabled:cursor-wait disabled:bg-gray-100"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
      />
      {open && filtered.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded border border-gray-300 bg-white shadow-md">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-2 py-1 text-left text-[11px] text-black hover:bg-emerald-50"
              >
                <span className="flex-1 truncate font-semibold">
                  {fullName(c)}
                </span>
                {c.gender ? (
                  <span className="text-[10px] text-gray-500">{c.gender}</span>
                ) : null}
                {c.handicap_index != null ? (
                  <span className="text-[10px] text-gray-500">
                    HI {c.handicap_index}
                  </span>
                ) : null}
                {c.club_label ? (
                  <span className="hidden text-[10px] text-gray-500 sm:inline">
                    {c.club_label}
                  </span>
                ) : null}
                <span className="text-[10px] text-gray-500">
                  {c.enrolled ? "✓" : "nuevo"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && filtered.length === 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 shadow-md">
          Sin coincidencias.
        </div>
      ) : null}
    </div>
  );
}
