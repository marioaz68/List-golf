// utils/phone.ts

// Normaliza cualquier input a formato E.164 base (SIN el 1 de WhatsApp)
export function normalizePhoneToE164(input: string, countryCode = "MX"): string {
  const digits = input.replace(/\D/g, "");

  // México: número local de 10 dígitos
  if (countryCode === "MX" && digits.length === 10) {
    return `+52${digits}`;
  }

  // México ya con 52
  if (countryCode === "MX" && digits.length === 12 && digits.startsWith("52")) {
    return `+${digits}`;
  }

  // Si ya viene con +
  if (input.trim().startsWith("+")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

// Convierte a formato requerido por WhatsApp/Twilio (AGREGA el 1 solo para MX)
export function toWhatsAppAddress(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");

  // México: +52 -> +521
  if (digits.startsWith("52") && digits.length === 12) {
    return `whatsapp:+521${digits.slice(2)}`;
  }

  // Si ya viene como 521
  if (digits.startsWith("521") && digits.length === 13) {
    return `whatsapp:+${digits}`;
  }

  return `whatsapp:+${digits}`;
}

// Convierte número entrante de WhatsApp a formato base (SIN el 1)
export function normalizeIncomingWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  // whatsapp:+521... -> +52...
  if (digits.startsWith("521") && digits.length === 13) {
    return `+52${digits.slice(3)}`;
  }

  // whatsapp:+52...
  if (digits.startsWith("52") && digits.length === 12) {
    return `+${digits}`;
  }

  return `+${digits}`;
}