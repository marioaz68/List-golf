/**
 * Cliente del backend de List.Golf. La app pega a los mismos endpoints que
 * la web — no hay un backend separado.
 */

import { API_BASE_URL } from "./config";

export interface RedeemCodeResponse {
  ok: boolean;
  caddieId?: string | null;
  entryId?: string | null;
  displayName?: string | null;
  error?: string;
}

export async function redeemCode(code: string): Promise<RedeemCodeResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/mobile/auth/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return (await res.json()) as RedeemCodeResponse;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Red caída" };
  }
}

export interface SendPositionInput {
  caddieId: string | null;
  entryId: string | null;
  lat: number;
  lon: number;
  accuracy: number | null;
}

export interface SendPositionResponse {
  ok: boolean;
  hoyo?: number | null;
  group_id?: string | null;
  error?: string;
}

export async function sendPosition(
  input: SendPositionInput
): Promise<SendPositionResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/captura/position`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caddie_id: input.caddieId,
        entry_id: input.entryId,
        lat: input.lat,
        lon: input.lon,
        accuracy: input.accuracy,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return (await res.json()) as SendPositionResponse;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Red caída" };
  }
}
