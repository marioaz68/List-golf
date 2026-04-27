"use client";

import { useState } from "react";

type Props = {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  confirm?: string;
  disabled?: boolean;
  className?: string;
  pendingText?: string;
};

export default function ActionButton({
  children,
  onClick,
  confirm,
  disabled = false,
  className = "",
  pendingText = "Procesando...",
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (confirm) {
      const ok = window.confirm(confirm);
      if (!ok) return;
    }

    setLoading(true);

    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-1">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/50 border-t-white" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
