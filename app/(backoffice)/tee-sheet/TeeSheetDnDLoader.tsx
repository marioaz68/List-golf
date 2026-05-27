"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type TeeSheetDnDType from "./TeeSheetDnD";

const TeeSheetDnD = dynamic(() => import("./TeeSheetDnD"), {
  ssr: false,
  loading: () => (
    <section className="rounded-lg border border-slate-300 bg-white p-6 text-sm text-slate-600 shadow-sm">
      Cargando vista de grupos…
    </section>
  ),
});

export default function TeeSheetDnDLoader(
  props: ComponentProps<typeof TeeSheetDnDType>
) {
  return <TeeSheetDnD {...props} />;
}
