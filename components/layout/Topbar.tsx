"use client";

export default function Topbar() {
  return (
    <header className="h-16 border-b border-white/10 bg-[#1C252D] flex items-center justify-between px-6">

      <div className="text-sm text-white/70">
        list.golf Tournament Management
      </div>

      <div className="flex items-center gap-4">

        <div className="text-sm text-white/60">
          Admin
        </div>

      </div>

    </header>
  );
}