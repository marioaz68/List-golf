"use client";

import { useState } from "react";
import { RitmoMap, GroupDot } from "./RitmoMap";
import { SidebarGroups, SidebarGroup } from "./SidebarGroups";

interface DemoViewProps {
  groups: (SidebarGroup & GroupDot)[];
}

export function DemoView({ groups }: DemoViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <main style={{
      height: "100dvh", width: "100vw", display: "flex", flexDirection: "row",
      background: "#0a0a0a", overflow: "hidden",
      fontFamily: "-apple-system, system-ui, sans-serif",
    }}>
      <SidebarGroups groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        <RitmoMap groups={groups} selectedId={selectedId} />
      </div>
    </main>
  );
}
