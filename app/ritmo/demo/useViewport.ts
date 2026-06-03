"use client";

import { useEffect, useState } from "react";

export type Layout = "desktop_landscape" | "mobile_portrait" | "mobile_landscape";

export interface ViewportInfo {
  width: number;
  height: number;
  layout: Layout;
  isMobile: boolean;
  isLandscape: boolean;
  /** true cuando conviene rotar el mapa 90° (landscape donde el campo entra mejor horizontal) */
  shouldRotateMap: boolean;
}

const MOBILE_BREAKPOINT = 768;

function computeViewport(): ViewportInfo {
  if (typeof window === "undefined") {
    // SSR fallback razonable
    return {
      width: 1280, height: 800,
      layout: "desktop_landscape", isMobile: false, isLandscape: true,
      shouldRotateMap: true,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = width < MOBILE_BREAKPOINT;
  const isLandscape = width >= height;

  let layout: Layout;
  if (isMobile && !isLandscape) layout = "mobile_portrait";
  else if (isMobile && isLandscape) layout = "mobile_landscape";
  else layout = "desktop_landscape";

  // Rotar mapa solo cuando el viewport es landscape (más ancho que alto).
  // En mobile portrait el campo (tall) ya entra natural, sin rotar.
  const shouldRotateMap = isLandscape;

  return { width, height, layout, isMobile, isLandscape, shouldRotateMap };
}

export function useViewport(): ViewportInfo {
  const [vp, setVp] = useState<ViewportInfo>(computeViewport);

  useEffect(() => {
    const onResize = () => setVp(computeViewport());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    onResize(); // ensure correct after hydration
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return vp;
}
