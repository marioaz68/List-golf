"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BackofficeNav = {
  open: boolean;
  setOpen: (value: boolean) => void;
};

const BackofficeNavContext = createContext<BackofficeNav | null>(null);

export function BackofficeNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <BackofficeNavContext.Provider value={value}>
      {children}
    </BackofficeNavContext.Provider>
  );
}

export function useBackofficeNav(): BackofficeNav {
  const ctx = useContext(BackofficeNavContext);
  if (!ctx) {
    throw new Error("useBackofficeNav must be used within BackofficeNavProvider");
  }
  return ctx;
}
