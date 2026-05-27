import { NextResponse } from "next/server";
import { streamPlayerHandicapReport } from "@/lib/player-files/handicapReportUrl";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ playerId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { playerId } = await context.params;
  if (!playerId?.trim()) {
    return NextResponse.json({ error: "Jugador inválido" }, { status: 400 });
  }

  return streamPlayerHandicapReport(playerId.trim());
}
