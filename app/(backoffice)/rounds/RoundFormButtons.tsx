"use client";

import type { CSSProperties, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingText?: string;
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
  form?: string;
};

export function RoundSubmitButton({
  children,
  pendingText = "Guardando...",
  style,
  className,
  disabled = false,
  form,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      form={form}
      disabled={isDisabled}
      className={className}
      style={{
        ...style,
        opacity: isDisabled ? 0.68 : style?.opacity,
        cursor: isDisabled ? "wait" : "pointer",
        transform: pending ? "translateY(2px)" : undefined,
        boxShadow: pending ? "0 1px 0 #1f2937, 0 2px 5px rgba(0,0,0,0.18)" : style?.boxShadow,
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

type DeleteButtonProps = {
  style?: CSSProperties;
  className?: string;
  form?: string;
};

export function RoundDeleteButton({ style, className, form }: DeleteButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      className={className}
      style={{
        ...style,
        opacity: pending ? 0.68 : style?.opacity,
        cursor: pending ? "wait" : "pointer",
        transform: pending ? "translateY(2px)" : undefined,
        boxShadow: pending ? "0 1px 0 #7f1d1d, 0 2px 5px rgba(0,0,0,0.18)" : style?.boxShadow,
      }}
      onClick={(event) => {
        if (pending) return;

        const ok = window.confirm(
          "¿Borrar esta ronda? Si tiene grupos o scores relacionados, la base puede impedir el borrado."
        );

        if (!ok) event.preventDefault();
      }}
    >
      {pending ? "Borrando..." : "Borrar"}
    </button>
  );
}
