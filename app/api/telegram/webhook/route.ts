import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TELEGRAM WEBHOOK UPDATE:", JSON.stringify(body, null, 2));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "telegram webhook",
  });
}