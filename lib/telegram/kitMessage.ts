export type TelegramKitContent = {
  greeting_line: string;
  body_lines: string;
  footer_line: string;
};

const DEFAULT_CONTENT: TelegramKitContent = {
  greeting_line: "Hola {player_name},",
  body_lines:
    "Tu kit del torneo «{tournament_name}»:\n\n• Estás inscrito y vinculado a List.golf por Telegram.\n• Tras confirmar el kit, escribe GRUPO o INICIO para ver tu salida y enlace de captura.\n• Mantén activas las notificaciones de este chat.",
  footer_line:
    "Cuando hayas recibido el kit:\n• RECIBIDO — recibí todo\n• RECIBIDO PARCIAL — recibí algo pero aún me falta material del comité",
};

function applyTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

export function buildTelegramKitMessage(params: {
  playerName: string;
  tournamentName: string;
  extraNote?: string | null;
  pendingItems?: string | null;
  content?: TelegramKitContent | null;
}) {
  const name = params.playerName.trim() || "jugador";
  const tournament = params.tournamentName.trim() || "tu torneo";
  const note = params.extraNote?.trim();
  const pending = params.pendingItems?.trim();
  const c = params.content ?? DEFAULT_CONTENT;

  const vars = { player_name: name, tournament_name: tournament };

  const lines = [
    applyTemplate(c.greeting_line, vars),
    "",
    applyTemplate(c.body_lines, vars),
  ];

  if (pending) {
    lines.push(
      "",
      "⚠️ Entrega parcial — el comité indica que aún recibirás:",
      pending,
      "",
      "Puedes confirmar con RECIBIDO PARCIAL ahora y RECIBIDO cuando tengas todo."
    );
  }

  if (note) {
    lines.push("", note);
  }

  lines.push("", applyTemplate(c.footer_line, vars));

  return lines.join("\n");
}

export function isKitReceivedCommand(text: string) {
  const cmd = text.trim().toUpperCase();
  return (
    cmd === "RECIBIDO" ||
    cmd === "KIT RECIBIDO" ||
    cmd === "CONFIRMO" ||
    cmd === "CONFIRMO RECIBIDO" ||
    cmd === "RECIBI" ||
    cmd === "RECIBÍ" ||
    cmd === "RECIBIDO COMPLETO"
  );
}

export function isKitPartialReceivedCommand(text: string) {
  const cmd = text.trim().toUpperCase();
  return (
    cmd === "RECIBIDO PARCIAL" ||
    cmd === "PARCIAL" ||
    cmd === "RECIBI PARCIAL" ||
    cmd === "RECIBÍ PARCIAL"
  );
}

export function isGroupInfoCommand(command: string) {
  const c = command.trim().toUpperCase();
  return c === "INICIO" || c === "GRUPO" || c === "/GRUPO" || c === "/INICIO";
}
