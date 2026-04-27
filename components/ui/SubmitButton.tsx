"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  className?: string;
  pendingClassName?: string;
  disabledClassName?: string;
};

export default function SubmitButton({
  children,
  pendingText = "Procesando...",
  disabled = false,
  name,
  value,
  className = "inline-flex min-h-6 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-gray-800",
  pendingClassName = "inline-flex min-h-6 cursor-wait items-center justify-center gap-1 rounded border border-gray-400 bg-gray-400 px-2 text-[10px] font-medium leading-none text-white",
  disabledClassName = "inline-flex min-h-6 cursor-not-allowed items-center justify-center rounded border border-gray-300 bg-gray-200 px-2 text-[10px] font-medium leading-none text-gray-400",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  if (disabled) {
    return (
      <button type="button" disabled className={disabledClassName}>
        {children}
      </button>
    );
  }

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={pending ? pendingClassName : className}
    >
      {pending ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/50 border-t-white" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}