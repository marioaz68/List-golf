"use client";

import { useFormStatus } from "react-dom";

const buttonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #1f2937",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
};

export default function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={pending ? disabledButtonStyle : buttonStyle}
    >
      {pending ? "Guardando..." : "Guardar caddie"}
    </button>
  );
}